//! Collateralization and liquidation thresholds.
//!
//! Prices are base-denominated: `price` is RUSD per collateral token, scaled by
//! `1e8`. `scale` is `10^asset_decimals`. The result of `collateral_value` is in
//! base units (RUSD), also scaled by `1e8`.
//!
//! `principal` is the signed present value: positive for supply, negative for
//! borrow. For a borrower, `liquidity = principal + Σ(weighted collateral)`.

use crate::error::{MathError, MathResult};
use crate::math::{mul_div, mul_factor, mul_price};
use crate::FACTOR_SCALE;

/// One collateral position with its risk factors.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Collateral {
    /// Token amount in native units (shannons for CKB, 1e8 for RUSD).
    pub amount: u128,
    /// Base-denominated price, scaled by `1e8`.
    pub price: u128,
    /// `10^asset_decimals`.
    pub scale: u128,
    /// Borrow collateral factor, scaled by `1e18`.
    pub borrow_cf: u128,
    /// Liquidation collateral factor, scaled by `1e18`.
    pub liquidate_cf: u128,
}

impl Collateral {
    /// Validates the factor ranges and scale.
    pub fn validate(&self) -> MathResult<()> {
        if self.scale == 0 {
            return Err(MathError::InvalidDecimals);
        }
        if self.price == 0 {
            return Err(MathError::InvalidPrice);
        }
        if self.borrow_cf > FACTOR_SCALE || self.liquidate_cf > FACTOR_SCALE {
            return Err(MathError::InvalidFactor);
        }
        if self.borrow_cf > self.liquidate_cf {
            return Err(MathError::InvalidFactor);
        }
        Ok(())
    }
}

/// Raw collateral value in base units, scaled by `1e8`.
pub fn collateral_value(collateral: &Collateral) -> MathResult<u128> {
    collateral.validate()?;
    mul_price(collateral.amount, collateral.price, collateral.scale)
}

/// Collateral value multiplied by a `1e18`-scaled factor.
pub fn weighted_value(collateral: &Collateral, factor: u128) -> MathResult<u128> {
    if factor > FACTOR_SCALE {
        return Err(MathError::InvalidFactor);
    }
    mul_factor(collateral_value(collateral)?, factor)
}

/// Signed liquidity in base units.
///
/// When `use_liquidation_cf` is false, uses `borrow_cf` (borrowing capacity).
/// When true, uses `liquidate_cf` (liquidation threshold).
pub fn liquidity(
    principal: i128,
    collaterals: &[Collateral],
    use_liquidation_cf: bool,
) -> MathResult<i128> {
    let mut result = principal;
    for collateral in collaterals {
        let factor = if use_liquidation_cf {
            collateral.liquidate_cf
        } else {
            collateral.borrow_cf
        };
        let value = weighted_value(collateral, factor)?;
        let signed = i128::try_from(value).map_err(|_| MathError::Overflow)?;
        result = result.checked_add(signed).ok_or(MathError::Overflow)?;
    }
    Ok(result)
}

/// A supplier (principal >= 0) is always collateralized; otherwise liquidity
/// must be non-negative using the borrow collateral factors.
pub fn is_borrow_collateralized(principal: i128, collaterals: &[Collateral]) -> MathResult<bool> {
    if principal >= 0 {
        return Ok(true);
    }
    Ok(liquidity(principal, collaterals, false)? >= 0)
}

/// A supplier cannot be liquidated; a borrower is liquidatable when liquidity is
/// negative using the liquidation collateral factors.
pub fn is_liquidatable(principal: i128, collaterals: &[Collateral]) -> MathResult<bool> {
    if principal >= 0 {
        return Ok(false);
    }
    Ok(liquidity(principal, collaterals, true)? < 0)
}

/// Health factor scaled by `1e18`.
///
/// Returns `None` for a non-borrower (principal >= 0) or zero debt.
/// A value below `1e18` is liquidatable.
pub fn health_factor(principal: i128, collaterals: &[Collateral]) -> MathResult<Option<u128>> {
    if principal >= 0 {
        return Ok(None);
    }
    let debt = principal.unsigned_abs();
    if debt == 0 {
        return Ok(None);
    }
    let mut weighted = 0u128;
    for collateral in collaterals {
        weighted = weighted
            .checked_add(weighted_value(collateral, collateral.liquidate_cf)?)
            .ok_or(MathError::Overflow)?;
    }
    Ok(Some(mul_div(weighted, FACTOR_SCALE, debt)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ckb(amount: u128, price: u128) -> Collateral {
        Collateral {
            amount,
            price,
            scale: 100_000_000,                    // 1e8 shannons per CKB
            borrow_cf: 500_000_000_000_000_000,    // 50%
            liquidate_cf: 600_000_000_000_000_000, // 60%
        }
    }

    #[test]
    fn ckb_collateral_value() {
        // 10,000 CKB at 0.0012 RUSD/CKB = 12 RUSD.
        let collateral = ckb(10_000 * 100_000_000, 120_000);
        assert_eq!(collateral_value(&collateral).unwrap(), 1_200_000_000);
    }

    #[test]
    fn borrow_boundary() {
        // 10,000 CKB at 0.0012 -> 12 RUSD value; 50% CF -> 6 RUSD capacity.
        let collateral = ckb(10_000 * 100_000_000, 120_000);
        assert!(is_borrow_collateralized(-600_000_000, &[collateral]).unwrap());
        assert!(!is_borrow_collateralized(-600_000_001, &[collateral]).unwrap());
        assert!(!is_liquidatable(-600_000_000, &[collateral]).unwrap());
    }

    #[test]
    fn liquidation_boundary() {
        // 10,000 CKB at 0.0008 -> 8 RUSD value; 60% liquidation CF -> 4.8 RUSD.
        let collateral = ckb(10_000 * 100_000_000, 80_000);
        assert!(is_liquidatable(-480_000_001, &[collateral]).unwrap());
        assert!(!is_liquidatable(-480_000_000, &[collateral]).unwrap());
    }

    #[test]
    fn health_factor_value() {
        let collateral = ckb(10_000 * 100_000_000, 120_000);
        // Weighted collateral at 60% = 7.2 RUSD; debt 6 RUSD -> 1.2.
        let hf = health_factor(-600_000_000, &[collateral]).unwrap().unwrap();
        assert_eq!(hf, 1_200_000_000_000_000_000);
    }

    #[test]
    fn validate_rejects_bad_factors() {
        let mut collateral = ckb(1, 1);
        collateral.borrow_cf = FACTOR_SCALE + 1;
        assert_eq!(collateral.validate(), Err(MathError::InvalidFactor));

        let mut collateral = ckb(1, 1);
        collateral.borrow_cf = 700_000_000_000_000_000;
        collateral.liquidate_cf = 600_000_000_000_000_000;
        assert_eq!(collateral.validate(), Err(MathError::InvalidFactor));
    }
}
