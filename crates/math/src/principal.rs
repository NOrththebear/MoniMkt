//! Present value / principal value conversion.
//!
//! The market stores a signed principal per account and two global indices. At
//! initialization both indices equal `BASE_INDEX_SCALE`, so principal == present
//! value. Rounding is deliberately asymmetric:
//!
//! - supply principal rounds down,
//! - borrow principal rounds up,
//! - present value rounds down.
//!
//! The helpers below use an `i128` signed balance for simplicity. The cell schema
//! will encode the same value as sign + magnitude.

use crate::error::{MathError, MathResult};
use crate::math::{mul_div, mul_div_ceil};
use crate::BASE_INDEX_SCALE;

/// Present value of a positive (supply) principal, rounded down.
pub fn present_value_supply(index: u128, principal: u128) -> MathResult<u128> {
    if index == 0 {
        return Err(MathError::InvalidIndex);
    }
    mul_div(principal, index, BASE_INDEX_SCALE)
}

/// Present value of a negative (borrow) principal, rounded down.
pub fn present_value_borrow(index: u128, principal: u128) -> MathResult<u128> {
    if index == 0 {
        return Err(MathError::InvalidIndex);
    }
    mul_div(principal, index, BASE_INDEX_SCALE)
}

/// Principal for a positive (supply) present value, rounded down.
pub fn principal_value_supply(index: u128, present: u128) -> MathResult<u128> {
    if index == 0 {
        return Err(MathError::InvalidIndex);
    }
    mul_div(present, BASE_INDEX_SCALE, index)
}

/// Principal for a negative (borrow) present value, rounded up.
pub fn principal_value_borrow(index: u128, present: u128) -> MathResult<u128> {
    if index == 0 {
        return Err(MathError::InvalidIndex);
    }
    mul_div_ceil(present, BASE_INDEX_SCALE, index)
}

/// Signed present value for an account.
///
/// `principal > 0` is a supply position; `principal < 0` is a borrow position.
pub fn present_value(supply_index: u128, borrow_index: u128, principal: i128) -> MathResult<i128> {
    if principal >= 0 {
        let magnitude = present_value_supply(supply_index, principal as u128)?;
        i128::try_from(magnitude).map_err(|_| MathError::Overflow)
    } else {
        let magnitude = present_value_borrow(borrow_index, principal.unsigned_abs())?;
        let signed = i128::try_from(magnitude).map_err(|_| MathError::Overflow)?;
        Ok(-signed)
    }
}

/// Signed principal for a present value.
///
/// Positive values use the supply index (floor); negative values use the borrow
/// index (ceil).
pub fn principal_value(supply_index: u128, borrow_index: u128, present: i128) -> MathResult<i128> {
    if present >= 0 {
        let magnitude = principal_value_supply(supply_index, present as u128)?;
        i128::try_from(magnitude).map_err(|_| MathError::Overflow)
    } else {
        let magnitude = principal_value_borrow(borrow_index, present.unsigned_abs())?;
        let signed = i128::try_from(magnitude).map_err(|_| MathError::Overflow)?;
        Ok(-signed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const INDEX: u128 = BASE_INDEX_SCALE;

    #[test]
    fn at_initial_index_principal_equals_present() {
        assert_eq!(present_value_supply(INDEX, 100).unwrap(), 100);
        assert_eq!(present_value_borrow(INDEX, 100).unwrap(), 100);
        assert_eq!(principal_value_supply(INDEX, 100).unwrap(), 100);
        assert_eq!(principal_value_borrow(INDEX, 100).unwrap(), 100);
    }

    #[test]
    fn supply_round_trip_never_increases() {
        let index = INDEX + INDEX / 10; // 10% growth
        for value in [0u128, 1, 7, 100, 1_000_000] {
            let principal = principal_value_supply(index, value).unwrap();
            let present = present_value_supply(index, principal).unwrap();
            assert!(
                present <= value,
                "supply round trip minted value: {present} > {value}"
            );
        }
    }

    #[test]
    fn borrow_round_trip_never_decreases() {
        let index = INDEX + INDEX / 10; // 10% growth
        for value in [0u128, 1, 7, 100, 1_000_000] {
            let principal = principal_value_borrow(index, value).unwrap();
            let present = present_value_borrow(index, principal).unwrap();
            assert!(
                present >= value,
                "borrow round trip lost value: {present} < {value}"
            );
        }
    }

    #[test]
    fn signed_present_value() {
        let index = INDEX;
        assert_eq!(present_value(index, index, 100).unwrap(), 100);
        assert_eq!(present_value(index, index, -100).unwrap(), -100);
        assert_eq!(present_value(index, index, 0).unwrap(), 0);
    }

    #[test]
    fn signed_principal_value() {
        let index = INDEX;
        assert_eq!(principal_value(index, index, 100).unwrap(), 100);
        assert_eq!(principal_value(index, index, -100).unwrap(), -100);
        assert_eq!(principal_value(index, index, 0).unwrap(), 0);
    }

    #[test]
    fn zero_index_is_rejected() {
        assert_eq!(present_value_supply(0, 1), Err(MathError::InvalidIndex));
        assert_eq!(principal_value_borrow(0, 1), Err(MathError::InvalidIndex));
    }
}
