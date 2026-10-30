//! Interest rate model and accrual.
//!
//! The market uses a piecewise-linear curve with a kink, separately for supply and
//! borrow. Configuration is stored per year (scaled by `1e18`); the contract
//! converts to per-second rates by integer division by `SECONDS_PER_YEAR`.
//!
//! Accrual is a first-order update per interval:
//!
//! ```text
//! index += index * per_second_rate * dt / 1e18
//! ```
//!
//! This is path-dependent unless accrued every second. The CKB design uses a
//! batcher/keeper to accrue frequently.

use crate::error::{MathError, MathResult};
use crate::math::{mul_div, mul_factor};
use crate::{FACTOR_SCALE, SECONDS_PER_YEAR};

/// A piecewise-linear rate curve with a kink.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RateCurve {
    /// Utilization at which the high slope starts, scaled by `1e18`.
    pub kink: u128,
    /// Per-second base rate, scaled by `1e18`.
    pub per_second_base: u128,
    /// Per-second low slope, scaled by `1e18`.
    pub per_second_slope_low: u128,
    /// Per-second high slope, scaled by `1e18`.
    pub per_second_slope_high: u128,
}

impl RateCurve {
    /// Builds a curve from per-year rates, matching the constructor.
    pub fn from_per_year(
        kink: u128,
        base: u128,
        slope_low: u128,
        slope_high: u128,
    ) -> MathResult<Self> {
        if kink > FACTOR_SCALE {
            return Err(MathError::InvalidFactor);
        }
        Ok(Self {
            kink,
            per_second_base: base / SECONDS_PER_YEAR,
            per_second_slope_low: slope_low / SECONDS_PER_YEAR,
            per_second_slope_high: slope_high / SECONDS_PER_YEAR,
        })
    }

    /// Builds a curve from per-second rates directly (useful for tests).
    pub fn from_per_second(
        kink: u128,
        base: u128,
        slope_low: u128,
        slope_high: u128,
    ) -> MathResult<Self> {
        if kink > FACTOR_SCALE {
            return Err(MathError::InvalidFactor);
        }
        Ok(Self {
            kink,
            per_second_base: base,
            per_second_slope_low: slope_low,
            per_second_slope_high: slope_high,
        })
    }

    /// Returns the per-second rate at `utilization`, scaled by `1e18`.
    pub fn rate_at(&self, utilization: u128) -> MathResult<u128> {
        if utilization <= self.kink {
            let variable = mul_factor(self.per_second_slope_low, utilization)?;
            self.per_second_base
                .checked_add(variable)
                .ok_or(MathError::Overflow)
        } else {
            let low = mul_factor(self.per_second_slope_low, self.kink)?;
            let high = mul_factor(self.per_second_slope_high, utilization - self.kink)?;
            self.per_second_base
                .checked_add(low)
                .and_then(|value| value.checked_add(high))
                .ok_or(MathError::Overflow)
        }
    }

    /// Returns the approximate per-year rate at `utilization`, scaled by `1e18`.
    pub fn annual_rate_at(&self, utilization: u128) -> MathResult<u128> {
        self.rate_at(utilization)?
            .checked_mul(SECONDS_PER_YEAR)
            .ok_or(MathError::Overflow)
    }
}

/// Utilization = borrows / supply, scaled by `1e18`.
///
/// Returns 0 when supply is zero, matching index model.
pub fn utilization(total_supply_present: u128, total_borrow_present: u128) -> MathResult<u128> {
    if total_supply_present == 0 {
        return Ok(0);
    }
    mul_div(total_borrow_present, FACTOR_SCALE, total_supply_present)
}

/// Accrues one index for `dt` seconds at `per_second_rate`.
pub fn accrue_index(index: u128, per_second_rate: u128, dt: u64) -> MathResult<u128> {
    let rate_dt = per_second_rate
        .checked_mul(dt as u128)
        .ok_or(MathError::Overflow)?;
    let delta = mul_factor(index, rate_dt)?;
    index.checked_add(delta).ok_or(MathError::Overflow)
}

/// Accrues the supply and borrow indices together.
pub fn accrue_indices(
    supply_index: u128,
    borrow_index: u128,
    supply_rate: u128,
    borrow_rate: u128,
    dt: u64,
) -> MathResult<(u128, u128)> {
    Ok((
        accrue_index(supply_index, supply_rate, dt)?,
        accrue_index(borrow_index, borrow_rate, dt)?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::BASE_INDEX_SCALE;

    #[test]
    fn utilization_basic() {
        assert_eq!(utilization(1_000, 800).unwrap(), 800_000_000_000_000_000);
        assert_eq!(utilization(0, 100).unwrap(), 0);
        assert_eq!(utilization(100, 0).unwrap(), 0);
    }

    #[test]
    fn curve_below_and_above_kink() {
        let curve = RateCurve::from_per_year(
            800_000_000_000_000_000, // 80%
            0,
            40_000_000_000_000_000,  // 4%
            500_000_000_000_000_000, // 50%
        )
        .unwrap();

        let below = curve.rate_at(800_000_000_000_000_000).unwrap();
        let above = curve.rate_at(1_000_000_000_000_000_000).unwrap();
        assert!(above > below);

        let annual = curve.annual_rate_at(800_000_000_000_000_000).unwrap();
        // At the 80% kink the 4% low slope yields ~3.2% APR. Integer
        // division makes the result slightly below 3.2%.
        assert!(annual <= 32_000_000_000_000_000);
        assert!(annual > 31_900_000_000_000_000);
    }

    #[test]
    fn accrual_matches_one_year_simple_interest() {
        let rate = 1_000_000_000u128; // per-second, ~1e18 scale
        let index = BASE_INDEX_SCALE;
        let accrued = accrue_index(index, rate, SECONDS_PER_YEAR as u64).unwrap();
        let expected_delta = mul_factor(index, rate * SECONDS_PER_YEAR).unwrap();
        assert_eq!(accrued, index + expected_delta);
    }

    #[test]
    fn zero_dt_is_identity() {
        assert_eq!(accrue_index(123, 456, 0).unwrap(), 123);
    }

    #[test]
    fn kink_validation() {
        assert_eq!(
            RateCurve::from_per_year(FACTOR_SCALE + 1, 0, 0, 0),
            Err(MathError::InvalidFactor)
        );
    }
}
