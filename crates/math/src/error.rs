/// Errors returned by the math library.
///
/// The variants are intentionally small and map cleanly to CKB script error codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MathError {
    /// Division by zero.
    DivisionByZero,
    /// A checked arithmetic operation overflowed.
    Overflow,
    /// A factor (collateral factor, liquidation factor, kink) is outside its valid range.
    InvalidFactor,
    /// A price is zero or otherwise invalid.
    InvalidPrice,
    /// A scale or decimals value is invalid.
    InvalidDecimals,
    /// An amount is invalid for the operation (e.g. absorb of a non-borrower).
    InvalidAmount,
    /// An index is zero.
    InvalidIndex,
}

pub type MathResult<T> = Result<T, MathError>;
