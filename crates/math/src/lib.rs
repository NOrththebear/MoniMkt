//! Pure Rust reference math for the MoniMkt CKB lending market.
//!
//! The crate is `no_std` so the same module can be compiled into CKB scripts.
//! It contains no cell/script logic; it is the accounting engine only.

#![no_std]
#![forbid(unsafe_code)]

pub mod error;
pub mod health;
pub mod liquidation;
pub mod math;
pub mod principal;
pub mod rate;

pub use error::{MathError, MathResult};
pub use health::{
    collateral_value, health_factor, is_borrow_collateralized, is_liquidatable, liquidity,
    weighted_value, Collateral,
};
pub use liquidation::{
    absorb, protocol_pnl, quote_collateral, sale_proceeds, AbsorbCollateral, AbsorbResult,
};
pub use math::{
    annual_to_per_second, div_price, mul_div, mul_div_ceil, mul_factor, mul_price,
    per_second_to_annual, pow10,
};
pub use principal::{
    present_value, present_value_borrow, present_value_supply, principal_value,
    principal_value_borrow, principal_value_supply,
};
pub use rate::{accrue_index, accrue_indices, utilization, RateCurve};

/// index scale. Indices start at this value, so principal == present value at T0.
pub const BASE_INDEX_SCALE: u128 = 1_000_000_000_000_000; // 1e15

/// Scale for rates, collateral factors, utilization, and liquidation factors.
pub const FACTOR_SCALE: u128 = 1_000_000_000_000_000_000; // 1e18

/// Scale for base-denominated prices.
pub const PRICE_SCALE: u128 = 100_000_000; // 1e8

/// Scale for reward accrual (the `BASE_ACCRUAL_SCALE`).
pub const BASE_ACCRUAL_SCALE: u128 = 1_000_000; // 1e6

/// the `SECONDS_PER_YEAR`.
pub const SECONDS_PER_YEAR: u128 = 31_536_000;

/// Minimum base decimals supported by the reward accrual.
pub const MIN_BASE_DECIMALS: u8 = 6;

/// Maximum base decimals supported by index model.
pub const MAX_BASE_DECIMALS: u8 = 18;

/// V1 collateral asset limit (fixed-size position slots).
pub const MAX_ASSETS: u8 = 8;
