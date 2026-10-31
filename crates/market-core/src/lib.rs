//! Host-testable accounting transitions for the MoniMkt market.
//!
//! The script layer loads cells, checks authorization, and verifies token/vault
//! deltas. This crate owns the pure balance-sheet math: accrual, supply,
//! withdraw, and the principal/total splits. Keeping it pure makes the rules
//! testable without CKB syscalls.

#![no_std]
#![forbid(unsafe_code)]

use monimkt_math::{
    absorb as absorb_math, accrue_indices, is_borrow_collateralized, present_value,
    present_value_borrow, present_value_supply, principal_value, utilization, AbsorbCollateral,
    AbsorbResult, Collateral, MathError, RateCurve,
};
use monimkt_schemas::{MarketConfig, MarketState, Principal, UserPosition};

/// Errors from a market transition.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CoreError {
    Math(MathError),
    /// The action amount is zero or otherwise invalid.
    InvalidAmount,
    /// A withdrawal would exceed the supplier's balance in the M3
    /// (no-collateral) market.
    InsufficientBalance,
    /// A collateral withdrawal would exceed the position's collateral.
    InsufficientCollateral,
    /// The borrow would leave the account under-collateralized.
    NotCollateralized,
    /// The resulting borrow is below the market's minimum.
    BorrowTooSmall,
    /// The supplied timestamp is older than the last accrual.
    InvalidTime,
    /// The resulting state violates a basic invariant.
    InvalidState,
}

impl From<MathError> for CoreError {
    fn from(value: MathError) -> Self {
        Self::Math(value)
    }
}

impl From<monimkt_schemas::CodecError> for CoreError {
    fn from(_: monimkt_schemas::CodecError) -> Self {
        Self::InvalidState
    }
}

/// Builds the supply curve from the market configuration.
pub fn supply_curve(config: &MarketConfig) -> Result<RateCurve, CoreError> {
    Ok(RateCurve::from_per_year(
        config.supply_kink as u128,
        config.supply_base as u128,
        config.supply_slope_low as u128,
        config.supply_slope_high as u128,
    )?)
}

/// Builds the borrow curve from the market configuration.
pub fn borrow_curve(config: &MarketConfig) -> Result<RateCurve, CoreError> {
    Ok(RateCurve::from_per_year(
        config.borrow_kink as u128,
        config.borrow_base as u128,
        config.borrow_slope_low as u128,
        config.borrow_slope_high as u128,
    )?)
}

/// Present supply and borrow values at the state's current indices.
pub fn present_totals(state: &MarketState) -> Result<(u128, u128), CoreError> {
    Ok((
        present_value_supply(state.supply_index, state.total_supply_principal)?,
        present_value_borrow(state.borrow_index, state.total_borrow_principal)?,
    ))
}

/// Accrues interest from `last_accrual_time` to `now`.
///
/// This does not change `total_supply_principal`, `total_borrow_principal`, or
/// `total_cash`; it only rolls the indices forward and updates the timestamp.
/// The script must call this before any principal-changing transition.
pub fn accrue(
    state: &MarketState,
    config: &MarketConfig,
    now: u64,
) -> Result<MarketState, CoreError> {
    if now < state.last_accrual_time {
        return Err(CoreError::InvalidTime);
    }

    let mut next = *state;
    let dt = now - state.last_accrual_time;
    if dt == 0 {
        return Ok(next);
    }

    // A genesis state with last_accrual_time == 0 is treated as "start now".
    if state.last_accrual_time == 0 {
        next.last_accrual_time = now;
        return Ok(next);
    }

    let (total_supply_present, total_borrow_present) = present_totals(state)?;
    let utilization = utilization(total_supply_present, total_borrow_present)?;
    let supply_rate = supply_curve(config)?.rate_at(utilization)?;
    let borrow_rate = borrow_curve(config)?.rate_at(utilization)?;
    let (supply_index, borrow_index) = accrue_indices(
        state.supply_index,
        state.borrow_index,
        supply_rate,
        borrow_rate,
        dt,
    )?;

    next.supply_index = supply_index;
    next.borrow_index = borrow_index;
    next.last_accrual_time = now;
    Ok(next)
}

/// Splits a principal change into (repay, supply) amounts, matching index model.
fn repay_and_supply(old_principal: i128, new_principal: i128) -> (u128, u128) {
    if new_principal < old_principal {
        return (0, 0);
    }
    if new_principal <= 0 {
        ((new_principal - old_principal) as u128, 0)
    } else if old_principal >= 0 {
        (0, new_principal as u128 - old_principal as u128)
    } else {
        (old_principal.unsigned_abs(), new_principal as u128)
    }
}

/// Splits a principal change into (withdraw, borrow) amounts, matching index model.
fn withdraw_and_borrow(old_principal: i128, new_principal: i128) -> (u128, u128) {
    if new_principal > old_principal {
        return (0, 0);
    }
    if new_principal >= 0 {
        (old_principal as u128 - new_principal as u128, 0)
    } else if old_principal <= 0 {
        (
            0,
            new_principal.unsigned_abs() - old_principal.unsigned_abs(),
        )
    } else {
        (old_principal as u128, new_principal.unsigned_abs())
    }
}

/// Supplies base asset to a position.
///
/// `amount` is the amount actually received by the market (the script must
/// measure the token/vault delta). The state must already be accrued.
pub fn supply_base(
    state: &MarketState,
    position: &UserPosition,
    amount: u128,
) -> Result<(MarketState, UserPosition), CoreError> {
    if amount == 0 {
        return Err(CoreError::InvalidAmount);
    }
    if state.total_cash.checked_add(amount).is_none() {
        return Err(CoreError::InvalidState);
    }

    let amount_i = i128::try_from(amount).map_err(|_| CoreError::InvalidAmount)?;
    let old_principal = position.principal.to_i128()?;
    let old_present = present_value(state.supply_index, state.borrow_index, old_principal)?;
    let new_present = old_present
        .checked_add(amount_i)
        .ok_or(CoreError::InvalidState)?;
    let new_principal = principal_value(state.supply_index, state.borrow_index, new_present)?;

    let (repay, supply) = repay_and_supply(old_principal, new_principal);
    let mut next_state = *state;
    next_state.total_supply_principal = next_state
        .total_supply_principal
        .checked_add(supply)
        .ok_or(CoreError::InvalidState)?;
    next_state.total_borrow_principal = next_state
        .total_borrow_principal
        .checked_sub(repay)
        .ok_or(CoreError::InvalidState)?;
    next_state.total_cash = next_state
        .total_cash
        .checked_add(amount)
        .ok_or(CoreError::InvalidState)?;

    let mut next_position = *position;
    next_position.principal = Principal::from_i128(new_principal);

    Ok((next_state, next_position))
}

/// Withdraws base asset from a position.
///
/// This is the M3 no-collateral path: it cannot make the principal negative.
/// `amount` is the amount paid out; the script must verify the vault delta.
pub fn withdraw_base(
    state: &MarketState,
    position: &UserPosition,
    amount: u128,
) -> Result<(MarketState, UserPosition), CoreError> {
    if amount == 0 {
        return Err(CoreError::InvalidAmount);
    }

    let amount_i = i128::try_from(amount).map_err(|_| CoreError::InvalidAmount)?;
    let old_principal = position.principal.to_i128()?;
    let old_present = present_value(state.supply_index, state.borrow_index, old_principal)?;
    if amount_i > old_present {
        return Err(CoreError::InsufficientBalance);
    }
    let new_present = old_present - amount_i;
    let new_principal = principal_value(state.supply_index, state.borrow_index, new_present)?;

    let (withdraw, borrow) = withdraw_and_borrow(old_principal, new_principal);
    if borrow != 0 {
        // M3 has no collateral, so borrowing is not allowed yet.
        return Err(CoreError::InsufficientBalance);
    }

    let mut next_state = *state;
    next_state.total_supply_principal = next_state
        .total_supply_principal
        .checked_sub(withdraw)
        .ok_or(CoreError::InvalidState)?;
    next_state.total_cash = next_state
        .total_cash
        .checked_sub(amount)
        .ok_or(CoreError::InvalidState)?;

    let mut next_position = *position;
    next_position.principal = Principal::from_i128(new_principal);

    Ok((next_state, next_position))
}

/// Repays base asset to a position (alias for `supply_base`).
pub fn repay_base(
    state: &MarketState,
    position: &UserPosition,
    amount: u128,
) -> Result<(MarketState, UserPosition), CoreError> {
    supply_base(state, position, amount)
}

/// Borrows base asset against the supplied collateral.
///
/// `collaterals` must contain the position's active collateral with current
/// prices and the **borrow** collateral factors. The state must already be
/// accrued.
pub fn borrow_base(
    state: &MarketState,
    position: &UserPosition,
    amount: u128,
    collaterals: &[Collateral],
    base_borrow_min: u128,
) -> Result<(MarketState, UserPosition), CoreError> {
    if amount == 0 {
        return Err(CoreError::InvalidAmount);
    }
    let amount_i = i128::try_from(amount).map_err(|_| CoreError::InvalidAmount)?;
    let old_principal = position.principal.to_i128()?;
    let old_present = present_value(state.supply_index, state.borrow_index, old_principal)?;
    let new_present = old_present
        .checked_sub(amount_i)
        .ok_or(CoreError::InvalidState)?;
    let new_principal = principal_value(state.supply_index, state.borrow_index, new_present)?;

    if new_principal < 0 {
        if new_principal.unsigned_abs() < base_borrow_min {
            return Err(CoreError::BorrowTooSmall);
        }
        if !is_borrow_collateralized(new_principal, collaterals)? {
            return Err(CoreError::NotCollateralized);
        }
    }

    let (withdraw, borrow) = withdraw_and_borrow(old_principal, new_principal);
    let mut next_state = *state;
    next_state.total_supply_principal = next_state
        .total_supply_principal
        .checked_sub(withdraw)
        .ok_or(CoreError::InvalidState)?;
    next_state.total_borrow_principal = next_state
        .total_borrow_principal
        .checked_add(borrow)
        .ok_or(CoreError::InvalidState)?;
    next_state.total_cash = next_state
        .total_cash
        .checked_sub(amount)
        .ok_or(CoreError::InvalidState)?;

    let mut next_position = *position;
    next_position.principal = Principal::from_i128(new_principal);
    Ok((next_state, next_position))
}

/// Adds collateral to a position slot.
pub fn supply_collateral(
    position: &mut UserPosition,
    index: usize,
    amount: u128,
) -> Result<(), CoreError> {
    if amount == 0 || index >= position.collateral.len() {
        return Err(CoreError::InvalidAmount);
    }
    position.collateral[index] = position.collateral[index]
        .checked_add(amount)
        .ok_or(CoreError::InvalidState)?;
    position.assets_in |= 1u32 << index;
    Ok(())
}

/// Removes collateral from a position slot.
pub fn withdraw_collateral(
    position: &mut UserPosition,
    index: usize,
    amount: u128,
) -> Result<(), CoreError> {
    if amount == 0 || index >= position.collateral.len() {
        return Err(CoreError::InvalidAmount);
    }
    let current = position.collateral[index];
    if amount > current {
        return Err(CoreError::InsufficientCollateral);
    }
    position.collateral[index] = current - amount;
    if position.collateral[index] == 0 {
        position.assets_in &= !(1u32 << index);
    }
    Ok(())
}

/// Absorbs an underwater borrow position.
///
/// All collateral is seized, the debt is wiped, and the residual (if any) is
/// credited to the borrower as a positive base supply position. `total_cash`
/// does not change; reserves absorb the cost.
pub fn absorb(
    state: &MarketState,
    position: &UserPosition,
    collaterals: &[AbsorbCollateral],
) -> Result<(MarketState, UserPosition, AbsorbResult), CoreError> {
    let principal = position.principal.to_i128()?;
    if principal >= 0 {
        return Err(CoreError::InvalidAmount);
    }

    let result = absorb_math(principal, collaterals)?;
    let residual = i128::try_from(result.residual).map_err(|_| CoreError::InvalidState)?;

    let mut next_state = *state;
    next_state.total_borrow_principal = next_state
        .total_borrow_principal
        .checked_sub(result.debt)
        .ok_or(CoreError::InvalidState)?;
    next_state.total_supply_principal = next_state
        .total_supply_principal
        .checked_add(result.residual)
        .ok_or(CoreError::InvalidState)?;

    let mut next_position = *position;
    next_position.principal = Principal::from_i128(residual);
    next_position.collateral = [0u128; 8];
    next_position.assets_in = 0;

    Ok((next_state, next_position, result))
}

/// Basic invariants for a single-position M3 market.
pub fn validate_m3(state: &MarketState, position: &UserPosition) -> Result<(), CoreError> {
    let principal = position.principal.to_i128()?;
    if principal < 0 {
        return Err(CoreError::InvalidState);
    }
    if state.total_borrow_principal != 0 {
        return Err(CoreError::InvalidState);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use monimkt_schemas::*;

    const RUSD: u128 = 100_000_000; // 1e8
    const INDEX: u128 = 1_000_000_000_000_000; // 1e15

    fn config() -> MarketConfig {
        MarketConfig {
            version: SCHEMA_VERSION,
            market_id: [1u8; 32],
            supply_kink: 800_000_000_000_000_000,
            borrow_kink: 800_000_000_000_000_000,
            supply_slope_low: 35_000_000_000_000_000,
            supply_slope_high: 400_000_000_000_000_000,
            supply_base: 0,
            borrow_slope_low: 40_000_000_000_000_000,
            borrow_slope_high: 500_000_000_000_000_000,
            borrow_base: 0,
            store_front: 500_000_000_000_000_000,
            base_borrow_min: RUSD,
            target_reserves: 10_000 * RUSD,
            base_min_for_rewards: 0,
            tracking_index_scale: INDEX as u64,
            base_tracking_supply_speed: 0,
            base_tracking_borrow_speed: 0,
            max_oracle_age: 3600,
            max_price_deviation: 100_000_000_000_000_000,
            reserved: [0u8; 32],
        }
    }

    fn genesis(now: u64) -> MarketState {
        MarketState {
            version: SCHEMA_VERSION,
            market_id: [1u8; 32],
            base_asset_id: [2u8; 32],
            base_decimals: 8,
            supply_index: INDEX,
            borrow_index: INDEX,
            tracking_supply_index: 0,
            tracking_borrow_index: 0,
            total_supply_principal: 0,
            total_borrow_principal: 0,
            total_cash: 0,
            last_accrual_time: now,
            pause_flags: 0,
            asset_count: 0,
            config_hash: [0u8; 32],
            reserved: [0u8; 32],
        }
    }

    fn position() -> UserPosition {
        UserPosition {
            version: SCHEMA_VERSION,
            market_id: [1u8; 32],
            owner_lock_hash: [4u8; 32],
            principal: Principal::ZERO,
            tracking_index: 0,
            tracking_accrued: 0,
            reward_claimed: 0,
            nonce: 0,
            assets_in: 0,
            collateral: [0u128; 8],
            reserved: [0u8; 32],
        }
    }

    #[test]
    fn supply_updates_principal_totals_and_cash() {
        let state = genesis(1_700_000_000);
        let (next, pos) = supply_base(&state, &position(), 100 * RUSD).unwrap();
        assert_eq!(pos.principal.to_i128().unwrap(), 100 * RUSD as i128);
        assert_eq!(next.total_supply_principal, 100 * RUSD);
        assert_eq!(next.total_cash, 100 * RUSD);
        validate_m3(&next, &pos).unwrap();
    }

    #[test]
    fn withdraw_reduces_principal_totals_and_cash() {
        let state = genesis(1_700_000_000);
        let (state, pos) = supply_base(&state, &position(), 100 * RUSD).unwrap();
        let (state, pos) = withdraw_base(&state, &pos, 50 * RUSD).unwrap();
        assert_eq!(pos.principal.to_i128().unwrap(), 50 * RUSD as i128);
        assert_eq!(state.total_supply_principal, 50 * RUSD);
        assert_eq!(state.total_cash, 50 * RUSD);
        validate_m3(&state, &pos).unwrap();
    }

    #[test]
    fn over_withdraw_is_rejected() {
        let state = genesis(1_700_000_000);
        let (state, pos) = supply_base(&state, &position(), 100 * RUSD).unwrap();
        assert_eq!(
            withdraw_base(&state, &pos, 101 * RUSD),
            Err(CoreError::InsufficientBalance)
        );
    }

    #[test]
    fn zero_amount_is_rejected() {
        let state = genesis(1_700_000_000);
        assert_eq!(
            supply_base(&state, &position(), 0),
            Err(CoreError::InvalidAmount)
        );
    }

    #[test]
    fn accrual_grows_indices_and_balance() {
        let state = genesis(1_700_000_000);
        let (state, pos) = supply_base(&state, &position(), 100 * RUSD).unwrap();

        // At zero utilization the normal curve has a zero supply rate, so use
        // a synthetic base rate to exercise the accrual math.
        let mut accrual_config = config();
        accrual_config.supply_base = 10_000_000_000_000_000; // 1%

        let after = accrue(&state, &accrual_config, 1_700_000_000 + 31_536_000).unwrap();
        assert!(after.supply_index > state.supply_index);

        let before = present_value_supply(state.supply_index, 100 * RUSD).unwrap();
        let now = present_value_supply(after.supply_index, 100 * RUSD).unwrap();
        assert!(now > before);
        assert_eq!(after.total_cash, state.total_cash);
        assert_eq!(after.total_supply_principal, state.total_supply_principal);
        validate_m3(&after, &pos).unwrap();
    }

    #[test]
    fn accrual_does_not_change_principal_totals() {
        let state = genesis(1_700_000_000);
        let (state, _) = supply_base(&state, &position(), 100 * RUSD).unwrap();
        let after = accrue(&state, &config(), 1_700_000_000 + 1_000).unwrap();
        assert_eq!(after.total_supply_principal, state.total_supply_principal);
        assert_eq!(after.total_borrow_principal, state.total_borrow_principal);
        assert_eq!(after.total_cash, state.total_cash);
    }

    #[test]
    fn time_cannot_go_backwards() {
        let state = genesis(1_700_000_000);
        assert_eq!(
            accrue(&state, &config(), 1_699_999_999),
            Err(CoreError::InvalidTime)
        );
    }

    #[test]
    fn supply_then_withdraw_never_mints() {
        let state = genesis(1_700_000_000);
        let (state, pos) = supply_base(&state, &position(), 100 * RUSD).unwrap();
        let (state, pos) = withdraw_base(&state, &pos, 100 * RUSD).unwrap();
        assert_eq!(pos.principal.to_i128().unwrap(), 0);
        assert_eq!(state.total_supply_principal, 0);
        assert_eq!(state.total_cash, 0);
    }

    fn ckb_collateral(price: u128) -> Collateral {
        Collateral {
            amount: 10_000 * 100_000_000, // 10,000 CKB
            price,
            scale: 100_000_000,
            borrow_cf: 500_000_000_000_000_000,
            liquidate_cf: 600_000_000_000_000_000,
        }
    }

    fn funded_state(now: u64) -> MarketState {
        let mut state = genesis(now);
        state.total_supply_principal = 100 * RUSD;
        state.total_cash = 100 * RUSD;
        state
    }

    #[test]
    fn borrow_updates_state_and_totals() {
        let state = funded_state(1_700_000_000);
        let (next, pos) = borrow_base(
            &state,
            &position(),
            6 * RUSD,
            &[ckb_collateral(120_000)],
            RUSD,
        )
        .unwrap();
        assert_eq!(pos.principal.to_i128().unwrap(), -(6 * RUSD as i128));
        assert_eq!(next.total_borrow_principal, 6 * RUSD);
        assert_eq!(next.total_cash, 94 * RUSD);
        assert_eq!(next.total_supply_principal, 100 * RUSD);
    }

    #[test]
    fn borrow_beyond_collateral_factor_is_rejected() {
        let state = funded_state(1_700_000_000);
        assert_eq!(
            borrow_base(
                &state,
                &position(),
                7 * RUSD,
                &[ckb_collateral(120_000)],
                RUSD,
            ),
            Err(CoreError::NotCollateralized)
        );
    }

    #[test]
    fn borrow_below_minimum_is_rejected() {
        let state = funded_state(1_700_000_000);
        assert_eq!(
            borrow_base(
                &state,
                &position(),
                RUSD / 2,
                &[ckb_collateral(120_000)],
                RUSD,
            ),
            Err(CoreError::BorrowTooSmall)
        );
    }

    #[test]
    fn price_drop_blocks_new_borrow() {
        let state = funded_state(1_700_000_000);
        // 10,000 CKB at 0.0008 = 8 RUSD; 50% CF = 4 RUSD.
        assert_eq!(
            borrow_base(
                &state,
                &position(),
                5 * RUSD,
                &[ckb_collateral(80_000)],
                RUSD,
            ),
            Err(CoreError::NotCollateralized)
        );
    }

    #[test]
    fn repay_reduces_borrow() {
        let state = funded_state(1_700_000_000);
        let (state, pos) = borrow_base(
            &state,
            &position(),
            6 * RUSD,
            &[ckb_collateral(120_000)],
            RUSD,
        )
        .unwrap();
        let (state, pos) = repay_base(&state, &pos, 3 * RUSD).unwrap();
        assert_eq!(pos.principal.to_i128().unwrap(), -(3 * RUSD as i128));
        assert_eq!(state.total_borrow_principal, 3 * RUSD);
        assert_eq!(state.total_cash, 97 * RUSD);
    }

    #[test]
    fn collateral_add_remove_tracks_assets_in() {
        let mut pos = position();
        supply_collateral(&mut pos, 0, 10_000 * 100_000_000).unwrap();
        assert_eq!(pos.collateral[0], 10_000 * 100_000_000);
        assert_eq!(pos.assets_in & 1, 1);

        withdraw_collateral(&mut pos, 0, 4_000 * 100_000_000).unwrap();
        assert_eq!(pos.collateral[0], 6_000 * 100_000_000);
        assert_eq!(pos.assets_in & 1, 1);

        withdraw_collateral(&mut pos, 0, 6_000 * 100_000_000).unwrap();
        assert_eq!(pos.collateral[0], 0);
        assert_eq!(pos.assets_in & 1, 0);
    }

    #[test]
    fn over_withdraw_collateral_is_rejected() {
        let mut pos = position();
        supply_collateral(&mut pos, 0, 1_000).unwrap();
        assert_eq!(
            withdraw_collateral(&mut pos, 0, 1_001),
            Err(CoreError::InsufficientCollateral)
        );
    }

    fn absorb_collateral(price: u128) -> AbsorbCollateral {
        AbsorbCollateral {
            amount: 10_000 * 100_000_000,
            price,
            scale: 100_000_000,
            liquidation_factor: 900_000_000_000_000_000,
        }
    }

    fn borrowed_state() -> (MarketState, UserPosition) {
        let mut state = funded_state(1_700_000_000);
        state.total_borrow_principal = 6 * RUSD;
        state.total_cash = 94 * RUSD;

        let mut pos = position();
        pos.principal = Principal::from_i128(-(6 * RUSD as i128));
        pos.collateral[0] = 10_000 * 100_000_000;
        pos.assets_in = 1;
        (state, pos)
    }

    #[test]
    fn absorb_wipes_debt_and_clears_collateral() {
        let (state, pos) = borrowed_state();
        let (next_state, next_pos, result) =
            absorb(&state, &pos, &[absorb_collateral(50_000)]).unwrap();
        assert_eq!(result.debt, 6 * RUSD);
        assert_eq!(result.residual, 0);
        assert_eq!(next_state.total_borrow_principal, 0);
        assert_eq!(next_state.total_supply_principal, 100 * RUSD);
        assert_eq!(next_state.total_cash, 94 * RUSD);
        assert_eq!(next_pos.principal.to_i128().unwrap(), 0);
        assert_eq!(next_pos.collateral, [0u128; 8]);
        assert_eq!(next_pos.assets_in, 0);
    }

    #[test]
    fn absorb_credits_residual() {
        let (state, pos) = borrowed_state();
        let (next_state, next_pos, result) =
            absorb(&state, &pos, &[absorb_collateral(80_000)]).unwrap();
        assert_eq!(result.delta_value, 72 * RUSD / 10);
        assert_eq!(result.residual, 12 * RUSD / 10);
        assert_eq!(next_state.total_borrow_principal, 0);
        assert_eq!(
            next_state.total_supply_principal,
            100 * RUSD + 12 * RUSD / 10
        );
        assert_eq!(
            next_pos.principal.to_i128().unwrap(),
            (12 * RUSD / 10) as i128
        );
    }

    #[test]
    fn absorb_rejects_supplier() {
        let state = funded_state(1_700_000_000);
        assert_eq!(
            absorb(&state, &position(), &[]),
            Err(CoreError::InvalidAmount)
        );
    }

    #[test]
    fn interest_accrues_with_borrowers() {
        let now = 1_700_000_000;
        let mut state = funded_state(now);
        state.total_supply_principal = 100 * RUSD;
        state.total_borrow_principal = 50 * RUSD;
        state.total_cash = 50 * RUSD;

        let after = accrue(&state, &config(), now + 31_536_000).unwrap();
        assert!(after.supply_index > state.supply_index);
        assert!(after.borrow_index > state.borrow_index);
        assert_eq!(after.last_accrual_time, now + 31_536_000);
        assert_eq!(after.total_supply_principal, state.total_supply_principal);
        assert_eq!(after.total_borrow_principal, state.total_borrow_principal);

        let supply_before =
            present_value_supply(state.supply_index, state.total_supply_principal).unwrap();
        let supply_after =
            present_value_supply(after.supply_index, after.total_supply_principal).unwrap();
        let borrow_before =
            present_value_borrow(state.borrow_index, state.total_borrow_principal).unwrap();
        let borrow_after =
            present_value_borrow(after.borrow_index, after.total_borrow_principal).unwrap();

        assert!(supply_after > supply_before);
        assert!(borrow_after > borrow_before);
        // At 50% utilization the borrow curve is above the supply curve.
        // Compare per-unit growth: borrow_after/borrow_before >
        // supply_after/supply_before.
        assert!(borrow_after * supply_before > supply_after * borrow_before);
    }

    #[test]
    fn principal_split_helpers() {
        assert_eq!(repay_and_supply(-100, -40), (60, 0));
        assert_eq!(repay_and_supply(-100, 30), (100, 30));
        assert_eq!(repay_and_supply(10, 40), (0, 30));
        assert_eq!(repay_and_supply(40, 10), (0, 0));

        assert_eq!(withdraw_and_borrow(100, 40), (60, 0));
        assert_eq!(withdraw_and_borrow(100, -30), (100, 30));
        assert_eq!(withdraw_and_borrow(-10, -40), (0, 30));
        assert_eq!(withdraw_and_borrow(-40, -10), (0, 0));
    }
}
