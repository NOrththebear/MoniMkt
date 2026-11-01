//! Price oracle type script.
//!
//! Args: asset_id || publisher_set_hash
//!
//! M4 uses a single-publisher mock/test feed. The type script validates identity
//! and basic price sanity; freshness is checked by the market script against the
//! transaction header timestamp.

#![no_std]
#![no_main]
#![forbid(unsafe_code)]

use ckb_std::ckb_constants::Source;
use ckb_std::error::SysError;
use ckb_std::high_level::{load_cell_data, load_script};
use monimkt_schemas::{Decode, Oracle, Reader};

ckb_std::entry!(main);
ckb_std::default_alloc!(4096, 528384, 64);

#[repr(i8)]
#[derive(Clone, Copy)]
enum Error {
    Syscall = 1,
    BadArgs = 2,
    BadData = 3,
    BadPrice = 4,
    TooManyCells = 5,
    MissingCell = 6,
}

fn main() -> i8 {
    match run() {
        Ok(()) => 0,
        Err(error) => error as i8,
    }
}

fn run() -> Result<(), Error> {
    let script = load_script().map_err(|_| Error::Syscall)?;
    let raw = script.args().raw_data();
    let args = raw.as_ref();
    if args.len() != 64 {
        return Err(Error::BadArgs);
    }

    let mut asset_id = [0u8; 32];
    asset_id.copy_from_slice(&args[0..32]);
    let mut publisher_set_hash = [0u8; 32];
    publisher_set_hash.copy_from_slice(&args[32..64]);

    let has_input = load_cell_data(0, Source::GroupInput).is_ok();
    let has_output = load_cell_data(0, Source::GroupOutput).is_ok();
    if load_cell_data(1, Source::GroupInput).is_ok()
        || load_cell_data(1, Source::GroupOutput).is_ok()
    {
        return Err(Error::TooManyCells);
    }
    if !has_input && !has_output {
        return Err(Error::MissingCell);
    }

    if has_input {
        let oracle = decode_oracle(load_cell_data(0, Source::GroupInput)?)?;
        check_oracle(&oracle, asset_id, publisher_set_hash)?;
    }
    if has_output {
        let oracle = decode_oracle(load_cell_data(0, Source::GroupOutput)?)?;
        check_oracle(&oracle, asset_id, publisher_set_hash)?;
    }

    Ok(())
}

fn decode_oracle(data: alloc::vec::Vec<u8>) -> Result<Oracle, Error> {
    let mut reader = Reader::new(&data);
    let oracle = Oracle::decode(&mut reader).map_err(|_| Error::BadData)?;
    reader.finish().map_err(|_| Error::BadData)?;
    Ok(oracle)
}

fn check_oracle(
    oracle: &Oracle,
    asset_id: [u8; 32],
    publisher_set_hash: [u8; 32],
) -> Result<(), Error> {
    if oracle.asset_id != asset_id || oracle.publisher_set_hash != publisher_set_hash {
        return Err(Error::BadData);
    }
    if oracle.price == 0 {
        return Err(Error::BadPrice);
    }
    if oracle.timestamp == 0 {
        return Err(Error::BadData);
    }
    Ok(())
}

impl From<SysError> for Error {
    fn from(_: SysError) -> Self {
        Self::Syscall
    }
}
