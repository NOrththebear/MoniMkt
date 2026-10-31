//! Indexer view layer.
//!
//! Converts a snapshot of market cells into the values a UI needs: supply,
//! borrow, utilization, APR, reserves, collateral value, health factor, and
//! liquidation status.

#![no_std]
#![forbid(unsafe_code)]

extern crate alloc;
#[cfg(test)]
extern crate std;

use alloc::vec::Vec;
use monimkt_math::{
    health_factor, is_liquidatable, present_value_borrow, present_value_supply, utilization,
    Collateral, MathError, RateCurve,
};
use monimkt_schemas::{
    AssetConfig, AssetTotals, MarketConfig, MarketState, Oracle, UserPosition, Vault,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PositionView {
    pub owner_lock_hash: [u8; 32],
    pub principal: i128,
    pub collateral: u128,
    pub health_factor: Option<u128>,
    pub liquidatable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarketView {
    pub supply_present: u128,
    pub borrow_present: u128,
    pub utilization: u128,
    pub supply_apr: u128,
    pub borrow_apr: u128,
    pub reserves: i128,
    pub available_liquidity: u128,
    pub collateral_value: u128,
    pub positions: Vec<PositionView>,
}

/// Inputs required to build a view.
#[derive(Debug, Clone, Copy)]
pub struct Snapshot {
    pub config: MarketConfig,
    pub state: MarketState,
    pub base_vault: Vault,
    pub asset_config: AssetConfig,
    pub asset_totals: AssetTotals,
    pub oracle: Oracle,
}

pub fn build_view(
    snapshot: &Snapshot,
    positions: &[UserPosition],
) -> Result<MarketView, MathError> {
    let supply_present = present_value_supply(
        snapshot.state.supply_index,
        snapshot.state.total_supply_principal,
    )?;
    let borrow_present = present_value_borrow(
        snapshot.state.borrow_index,
        snapshot.state.total_borrow_principal,
    )?;
    let utilization = utilization(supply_present, borrow_present)?;

    let supply_curve = RateCurve::from_per_year(
        snapshot.config.supply_kink as u128,
        snapshot.config.supply_base as u128,
        snapshot.config.supply_slope_low as u128,
        snapshot.config.supply_slope_high as u128,
    )?;
    let borrow_curve = RateCurve::from_per_year(
        snapshot.config.borrow_kink as u128,
        snapshot.config.borrow_base as u128,
        snapshot.config.borrow_slope_low as u128,
        snapshot.config.borrow_slope_high as u128,
    )?;

    let mut collateral_value = 0u128;
    let mut position_views = Vec::with_capacity(positions.len());
    for position in positions {
        let principal = position
            .principal
            .to_i128()
            .map_err(|_| MathError::Overflow)?;
        let collateral = Collateral {
            amount: position.collateral[0],
            price: snapshot.oracle.price,
            scale: snapshot.asset_config.scale as u128,
            borrow_cf: snapshot.asset_config.borrow_cf as u128,
            liquidate_cf: snapshot.asset_config.liquidate_cf as u128,
        };
        let value = monimkt_math::collateral_value(&collateral)?;
        collateral_value = collateral_value
            .checked_add(value)
            .ok_or(MathError::Overflow)?;
        let hf = health_factor(principal, &[collateral])?;
        let liquidatable = is_liquidatable(principal, &[collateral])?;
        position_views.push(PositionView {
            owner_lock_hash: position.owner_lock_hash,
            principal,
            collateral: position.collateral[0],
            health_factor: hf,
            liquidatable,
        });
    }

    Ok(MarketView {
        supply_present,
        borrow_present,
        utilization,
        supply_apr: supply_curve.annual_rate_at(utilization)?,
        borrow_apr: borrow_curve.annual_rate_at(utilization)?,
        reserves: snapshot.base_vault.amount as i128 - supply_present as i128
            + borrow_present as i128,
        available_liquidity: snapshot.base_vault.amount,
        collateral_value,
        positions: position_views,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use monimkt_schemas::{asset_kind, Principal, SCHEMA_VERSION};

    fn snapshot() -> Snapshot {
        Snapshot {
            config: MarketConfig {
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
                base_borrow_min: 100_000_000,
                target_reserves: 10_000_000_000,
                base_min_for_rewards: 0,
                tracking_index_scale: 1_000_000_000_000_000,
                base_tracking_supply_speed: 0,
                base_tracking_borrow_speed: 0,
                max_oracle_age: 3600,
                max_price_deviation: 100_000_000_000_000_000,
                reserved: [0u8; 32],
            },
            state: MarketState {
                version: SCHEMA_VERSION,
                market_id: [1u8; 32],
                base_asset_id: [4u8; 32],
                base_decimals: 8,
                supply_index: 1_000_000_000_000_000,
                borrow_index: 1_000_000_000_000_000,
                tracking_supply_index: 0,
                tracking_borrow_index: 0,
                total_supply_principal: 10_000_000_000,
                total_borrow_principal: 5_000_000_000,
                total_cash: 5_000_000_000,
                last_accrual_time: 1_700_000_000,
                pause_flags: 0,
                asset_count: 1,
                config_hash: [0u8; 32],
                reserved: [0u8; 32],
            },
            base_vault: Vault {
                version: SCHEMA_VERSION,
                market_id: [1u8; 32],
                asset_id: [4u8; 32],
                amount: 5_000_000_000,
                reserved: [0u8; 32],
            },
            asset_config: AssetConfig {
                version: SCHEMA_VERSION,
                market_id: [1u8; 32],
                asset_id: [2u8; 32],
                price_feed_id: [3u8; 32],
                kind: asset_kind::CKB,
                scale: 100_000_000,
                borrow_cf: 500_000_000_000_000_000,
                liquidate_cf: 600_000_000_000_000_000,
                liquidation_factor: 900_000_000_000_000_000,
                supply_cap: 50_000_000_000_000_000,
                reserved: [0u8; 32],
            },
            asset_totals: AssetTotals {
                version: SCHEMA_VERSION,
                market_id: [1u8; 32],
                asset_id: [2u8; 32],
                total_supplied: 10_000_000_000_000,
                reserved: [0u8; 32],
            },
            oracle: Oracle {
                version: SCHEMA_VERSION,
                asset_id: [2u8; 32],
                price: 120_000,
                exponent: -8,
                timestamp: 1_700_000_000,
                confidence: 0,
                publisher_set_hash: [6u8; 32],
                reserved: [0u8; 32],
            },
        }
    }

    fn position(principal: i128, collateral: u128) -> UserPosition {
        UserPosition {
            version: SCHEMA_VERSION,
            market_id: [1u8; 32],
            owner_lock_hash: [5u8; 32],
            principal: Principal::from_i128(principal),
            tracking_index: 0,
            tracking_accrued: 0,
            reward_claimed: 0,
            nonce: 0,
            assets_in: 1,
            collateral: [collateral, 0, 0, 0, 0, 0, 0, 0],
            reserved: [0u8; 32],
        }
    }

    #[test]
    fn view_reports_market_metrics() {
        let view = build_view(&snapshot(), &[position(-600_000_000, 10_000_000_000_000)]).unwrap();
        assert_eq!(view.supply_present, 10_000_000_000);
        assert_eq!(view.borrow_present, 5_000_000_000);
        assert_eq!(view.utilization, 500_000_000_000_000_000);
        assert_eq!(view.reserves, 0);
        assert_eq!(view.available_liquidity, 5_000_000_000);
        assert_eq!(view.collateral_value, 12_000_000_000);
        assert_eq!(view.positions.len(), 1);
        assert!(!view.positions[0].liquidatable);
        assert!(view.supply_apr > 0);
        assert!(view.borrow_apr > view.supply_apr);
    }

    #[test]
    fn underwater_position_is_flagged() {
        let mut snap = snapshot();
        snap.oracle.price = 1_000; // 100,000 CKB = 1 RUSD, debt 6
        let view = build_view(&snap, &[position(-600_000_000, 10_000_000_000_000)]).unwrap();
        assert!(view.positions[0].liquidatable);
    }
}
