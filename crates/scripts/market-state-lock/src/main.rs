//! Permissive MarketState lock.
//!
//! The market's security lives in `market-type`. This lock only exists so any
//! user can include the singleton MarketState cell in a transaction; the type
//! script validates the actual transition.

#![no_std]
#![no_main]
#![forbid(unsafe_code)]

ckb_std::entry!(main);
ckb_std::default_alloc!(4096, 528384, 64);

fn main() -> i8 {
    0
}
