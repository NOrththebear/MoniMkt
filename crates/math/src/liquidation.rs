//! Absorb and collateral-sale math.
//!
//! the liquidation engine is two-step:
//!
//! 1. `absorb` seizes all collateral and credits the borrower with
//!    `max(0, collateral_value * liquidation_factor - debt)` in base.
//! 2. `buyCollateral` sells seized collateral at a discount derived from
//!    `store_front * (1 - liquidation_factor)`.
//!
//! The helpers below are intentionally independent of the cell layer.

use crate::error::{MathError, MathResult};
use crate::math::{mul_div, mul_factor, mul_price};
use crate::FACTOR_SCALE;

/// One collateral asset being absorbed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AbsorbCollateral {
    pub amount: u128,
    /// Base-denominated price, scaled by `1e8`.
    pub price: u128,
    /// `10^asset_decimals`.
    pub scale: u128,
    /// Liquidation factor, scaled by `1e18`.
    pub liquidation_factor: u128,
}

/// Result of the absorb math.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AbsorbResult {
    /// Debt wiped, in base units.
    pub debt: u128,
    /// Sum of collateral values times liquidation factors, in base units.
    pub delta_value: u128,
    /// Residual credited to the borrower, in base units. Zero if bad debt.
    pub residual: u128,
    /// Protocol cost: `debt + residual`, in base units.
    pub cost: u128,
}

/// Computes the absorb result for a borrower.
///
/// `principal` must be negative (a borrow position).
pub fn absorb(principal: i128, collaterals: &[AbsorbCollateral]) -> MathResult<AbsorbResult> {
    if principal >= 0 {
        return Err(MathError::InvalidAmount);
    }
    let debt = principal.unsigned_abs();

    let mut delta_value = 0u128;
    for collateral in collaterals {
        if collateral.scale == 0 {
            return Err(MathError::InvalidDecimals);
        }
        if collateral.price == 0 {
            return Err(MathError::InvalidPrice);
        }
        if collateral.liquidation_factor > FACTOR_SCALE {
            return Err(MathError::InvalidFactor);
        }
        let value = mul_price(collateral.amount, collateral.price, collateral.scale)?;
        delta_value = delta_value
            .checked_add(mul_factor(value, collateral.liquidation_factor)?)
            .ok_or(MathError::Overflow)?;
    }

    let new_balance = principal
        .checked_add(i128::try_from(delta_value).map_err(|_| MathError::Overflow)?)
        .ok_or(MathError::Overflow)?;
    let residual = if new_balance > 0 {
        new_balance as u128
    } else {
        0
    };
    let cost = debt.checked_add(residual).ok_or(MathError::Overflow)?;

    Ok(AbsorbResult {
        debt,
        delta_value,
        residual,
        cost,
    })
}

/// Discount applied to seized collateral:
/// `store_front * (1e18 - liquidation_factor) / 1e18`.
pub fn collateral_discount(liquidation_factor: u128, store_front: u128) -> MathResult<u128> {
    if liquidation_factor > FACTOR_SCALE || store_front > FACTOR_SCALE {
        return Err(MathError::InvalidFactor);
    }
    mul_factor(store_front, FACTOR_SCALE - liquidation_factor)
}

/// Collateral received for `base_amount` at the discounted price.
///
/// `base_price` and `base_scale` describe the base asset; for a base-denominated
/// market pass `PRICE_SCALE` and `10^base_decimals`.
#[allow(clippy::too_many_arguments)]
pub fn quote_collateral(
    base_amount: u128,
    base_price: u128,
    base_scale: u128,
    asset_price: u128,
    asset_scale: u128,
    liquidation_factor: u128,
    store_front: u128,
) -> MathResult<u128> {
    if base_scale == 0 || asset_scale == 0 {
        return Err(MathError::InvalidDecimals);
    }
    if base_price == 0 || asset_price == 0 {
        return Err(MathError::InvalidPrice);
    }
    let discount = collateral_discount(liquidation_factor, store_front)?;
    let discounted_price = mul_factor(asset_price, FACTOR_SCALE - discount)?;
    if discounted_price == 0 {
        return Err(MathError::InvalidPrice);
    }

    // value = base_price * base_amount / base_scale  (common price units)
    // out   = value * asset_scale / discounted_price
    let value = mul_div(base_price, base_amount, base_scale)?;
    mul_div(value, asset_scale, discounted_price)
}

/// Proceeds from selling seized collateral at the storefront discount.
pub fn sale_proceeds(
    collateral_value: u128,
    liquidation_factor: u128,
    store_front: u128,
) -> MathResult<u128> {
    let discount = collateral_discount(liquidation_factor, store_front)?;
    mul_factor(collateral_value, FACTOR_SCALE - discount)
}

/// Protocol PnL from an absorb followed by a sale.
///
/// `collateral_value` is the full value of the seized collateral (not multiplied
/// by the liquidation factor). Returns a signed base amount.
pub fn protocol_pnl(
    collateral_value: u128,
    debt: u128,
    liquidation_factor: u128,
    store_front: u128,
) -> MathResult<i128> {
    let proceeds = sale_proceeds(collateral_value, liquidation_factor, store_front)?;
    let delta_value = mul_factor(collateral_value, liquidation_factor)?;
    let residual = delta_value.saturating_sub(debt);
    let cost = debt.checked_add(residual).ok_or(MathError::Overflow)?;
    let pnl = proceeds as i128 - cost as i128;
    Ok(pnl)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{PRICE_SCALE, SECONDS_PER_YEAR};

    const RUSD_SCALE: u128 = 100_000_000; // 1e8
    const CKB_SCALE: u128 = 100_000_000; // 1e8 shannons per CKB

    #[test]
    fn absorb_with_residual() {
        // 10,000 CKB at 0.0008 RUSD/CKB = 8 RUSD value.
        // Debt 6 RUSD, liquidation factor 90% -> 7.2 RUSD delta, 1.2 residual.
        let collateral = AbsorbCollateral {
            amount: 10_000 * CKB_SCALE,
            price: 80_000,
            scale: CKB_SCALE,
            liquidation_factor: 900_000_000_000_000_000,
        };
        let result = absorb(-600_000_000, &[collateral]).unwrap();
        assert_eq!(result.debt, 600_000_000);
        assert_eq!(result.delta_value, 720_000_000);
        assert_eq!(result.residual, 120_000_000);
        assert_eq!(result.cost, 720_000_000);
    }

    #[test]
    fn absorb_with_bad_debt() {
        // 10,000 CKB at 0.0005 RUSD/CKB = 5 RUSD value.
        // Debt 6 RUSD, 90% -> 4.5 RUSD, no residual, cost 6 RUSD.
        let collateral = AbsorbCollateral {
            amount: 10_000 * CKB_SCALE,
            price: 50_000,
            scale: CKB_SCALE,
            liquidation_factor: 900_000_000_000_000_000,
        };
        let result = absorb(-600_000_000, &[collateral]).unwrap();
        assert_eq!(result.debt, 600_000_000);
        assert_eq!(result.delta_value, 450_000_000);
        assert_eq!(result.residual, 0);
        assert_eq!(result.cost, 600_000_000);
    }

    #[test]
    fn quote_at_five_percent_discount() {
        // 10,000 CKB at 0.0008, LF 90%, store front 50% -> 5% discount.
        // 7.6 RUSD buys 10,000 CKB.
        let out = quote_collateral(
            760_000_000,
            PRICE_SCALE,
            RUSD_SCALE,
            80_000,
            CKB_SCALE,
            900_000_000_000_000_000,
            500_000_000_000_000_000,
        )
        .unwrap();
        assert_eq!(out, 10_000 * CKB_SCALE);
    }

    #[test]
    fn protocol_pnl_positive_when_sale_covers_cost() {
        // Collateral 8 RUSD, debt 6 RUSD, LF 90%, SF 50% -> +0.4 RUSD.
        let pnl = protocol_pnl(
            800_000_000,
            600_000_000,
            900_000_000_000_000_000,
            500_000_000_000_000_000,
        )
        .unwrap();
        assert_eq!(pnl, 40_000_000);
    }

    #[test]
    fn protocol_pnl_negative_on_bad_debt() {
        // Collateral 5 RUSD, debt 6 RUSD, LF 90%, SF 50% -> -1.25 RUSD.
        let pnl = protocol_pnl(
            500_000_000,
            600_000_000,
            900_000_000_000_000_000,
            500_000_000_000_000_000,
        )
        .unwrap();
        assert_eq!(pnl, -125_000_000);
    }

    #[test]
    fn absorb_rejects_non_borrower() {
        assert_eq!(absorb(1, &[]), Err(MathError::InvalidAmount));
    }

    #[test]
    fn yearly_seconds_constant_is_used_by_rates() {
        assert_eq!(SECONDS_PER_YEAR, 31_536_000);
    }
}
