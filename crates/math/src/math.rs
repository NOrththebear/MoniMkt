//! Fixed-point helpers.
//!
//! Products can reach 256 bits even when operands are `u128` (e.g. principal Ã— index,
//! or amount Ã— price). We use `uint`'s `U512` for the intermediate product and return
//! a `u128`, rejecting results that do not fit.

// `uint`'s macro expansion triggers a false-positive `manual_div_ceil` lint on
// recent clippy versions. The generated code is not ours to change.
#![allow(clippy::manual_div_ceil)]

use crate::error::{MathError, MathResult};
use crate::{FACTOR_SCALE, SECONDS_PER_YEAR};
use uint::construct_uint;

construct_uint! {
    pub struct U512(8);
}

#[inline]
fn to_u512(value: u128) -> U512 {
    U512::from(value as u64) + (U512::from((value >> 64) as u64) << 64)
}

#[inline]
fn u512_to_u128(value: U512) -> MathResult<u128> {
    if value > to_u512(u128::MAX) {
        return Err(MathError::Overflow);
    }
    Ok(value.as_u128())
}

/// Returns `(a * b) / c`, rounded down.
pub fn mul_div(a: u128, b: u128, c: u128) -> MathResult<u128> {
    if c == 0 {
        return Err(MathError::DivisionByZero);
    }
    // Both operands fit in 128 bits, so their product fits in 256 bits and
    // therefore cannot overflow U512.
    let product = to_u512(a) * to_u512(b);
    u512_to_u128(product / to_u512(c))
}

/// Returns `(a * b) / c`, rounded up.
pub fn mul_div_ceil(a: u128, b: u128, c: u128) -> MathResult<u128> {
    if c == 0 {
        return Err(MathError::DivisionByZero);
    }
    let product = to_u512(a) * to_u512(b);
    let numerator = product + to_u512(c - 1);
    u512_to_u128(numerator / to_u512(c))
}

/// Multiplies `n` by a `1e18`-scaled factor, rounding down.
pub fn mul_factor(n: u128, factor: u128) -> MathResult<u128> {
    mul_div(n, factor, FACTOR_SCALE)
}

/// Divides `n` by a `1e18`-scaled factor, rounding down.
pub fn div_factor(n: u128, factor: u128) -> MathResult<u128> {
    if factor == 0 {
        return Err(MathError::DivisionByZero);
    }
    mul_div(n, FACTOR_SCALE, factor)
}

/// Converts an amount in `from_scale` units to a price-scaled value:
/// `amount * price / from_scale`.
///
/// For CKB: `amount` is shannons, `from_scale` is `1e8`, and `price` is RUSD per CKB
/// scaled by `1e8`. The result is RUSD scaled by `1e8`.
pub fn mul_price(amount: u128, price: u128, from_scale: u128) -> MathResult<u128> {
    if from_scale == 0 {
        return Err(MathError::InvalidDecimals);
    }
    mul_div(amount, price, from_scale)
}

/// Converts a price-scaled value back to an amount in `to_scale` units:
/// `value * to_scale / price`.
pub fn div_price(value: u128, price: u128, to_scale: u128) -> MathResult<u128> {
    if price == 0 {
        return Err(MathError::InvalidPrice);
    }
    mul_div(value, to_scale, price)
}

/// Converts a per-year, `1e18`-scaled rate to per-second.
///
/// This matches the constructor, which uses integer division by
/// `SECONDS_PER_YEAR`.
pub fn annual_to_per_second(per_year: u128) -> u128 {
    per_year / SECONDS_PER_YEAR
}

/// Converts a per-second, `1e18`-scaled rate to per-year.
pub fn per_second_to_annual(per_second: u128) -> MathResult<u128> {
    per_second
        .checked_mul(SECONDS_PER_YEAR)
        .ok_or(MathError::Overflow)
}

/// Returns `10^decimals` as a `u128`.
pub fn pow10(decimals: u8) -> MathResult<u128> {
    if decimals > 38 {
        return Err(MathError::InvalidDecimals);
    }
    Ok(10u128.pow(decimals as u32))
}

/// Checked addition for `u128`.
pub fn safe_add(a: u128, b: u128) -> MathResult<u128> {
    a.checked_add(b).ok_or(MathError::Overflow)
}

/// Checked subtraction for `u128`.
pub fn safe_sub(a: u128, b: u128) -> MathResult<u128> {
    a.checked_sub(b).ok_or(MathError::Overflow)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mul_div_basic() {
        assert_eq!(mul_div(10, 20, 5).unwrap(), 40);
        assert_eq!(mul_div(7, 3, 2).unwrap(), 10);
        assert_eq!(mul_div_ceil(7, 3, 2).unwrap(), 11);
    }

    #[test]
    fn mul_div_handles_large_products() {
        // 1e18 * 1e18 = 1e36, which fits in u128, but 1e20 * 1e20 does not.
        assert_eq!(
            mul_div(
                1_000_000_000_000_000_000,
                1_000_000_000_000_000_000,
                1_000_000_000_000_000_000
            )
            .unwrap(),
            1_000_000_000_000_000_000
        );
        assert_eq!(
            mul_div(
                1_000_000_000_000_000_000_000,
                1_000_000_000_000_000_000_000,
                1_000_000_000_000_000_000_000
            )
            .unwrap(),
            1_000_000_000_000_000_000_000
        );
    }

    #[test]
    fn mul_div_rejects_zero_divisor() {
        assert_eq!(mul_div(1, 2, 0), Err(MathError::DivisionByZero));
    }

    #[test]
    fn mul_div_rejects_overflow() {
        assert_eq!(mul_div(u128::MAX, u128::MAX, 1), Err(MathError::Overflow));
    }

    #[test]
    fn annual_conversion_round_trip_is_close() {
        let per_year = 40_000_000_000_000_000; // 4%
        let per_second = annual_to_per_second(per_year);
        let back = per_second_to_annual(per_second).unwrap();
        assert!(back <= per_year);
        assert!(per_year - back < SECONDS_PER_YEAR);
    }
}
