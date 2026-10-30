//! Fixed-size Molecule-compatible schemas for MoniMkt v1.
//!
//! The `.mol` source lives at `schemas/market.mol`. The layout is intentionally
//! fixed-size and little-endian so CKB scripts can parse cell data with a small
//! hand-written codec. When a Molecule code generator is available in CI, the
//! same schema can be used to produce equivalent bindings.

#![no_std]
#![forbid(unsafe_code)]

extern crate alloc;

#[cfg(test)]
extern crate std;

pub mod codec;
pub mod types;

pub use codec::{CodecError, Decode, Encode, Reader, Writer};
pub use types::*;

/// Schema version written into every cell.
pub const SCHEMA_VERSION: u8 = 1;
