//! Per-asset totals type script.
//!
//! Args: market_id || asset_id
//! Data: AssetTotals

#![no_std]
#![no_main]
#![forbid(unsafe_code)]

use ckb_std::ckb_constants::Source;
use ckb_std::error::SysError;
use ckb_std::high_level::{load_cell_data, load_script};
use monimkt_schemas::{AssetTotals, Decode, Reader};

ckb_std::entry!(main);
ckb_std::default_alloc!(4096, 528384, 64);

#[repr(i8)]
#[derive(Clone, Copy)]
enum Error {
    Syscall = 1,
    BadArgs = 2,
    BadData = 3,
    TooManyCells = 4,
    MissingCell = 5,
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

    let mut market_id = [0u8; 32];
    market_id.copy_from_slice(&args[0..32]);
    let mut asset_id = [0u8; 32];
    asset_id.copy_from_slice(&args[32..64]);

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
        let totals = decode_totals(load_cell_data(0, Source::GroupInput)?)?;
        check_totals(&totals, market_id, asset_id)?;
    }
    if has_output {
        let totals = decode_totals(load_cell_data(0, Source::GroupOutput)?)?;
        check_totals(&totals, market_id, asset_id)?;
    }

    Ok(())
}

fn decode_totals(data: alloc::vec::Vec<u8>) -> Result<AssetTotals, Error> {
    let mut reader = Reader::new(&data);
    let totals = AssetTotals::decode(&mut reader).map_err(|_| Error::BadData)?;
    reader.finish().map_err(|_| Error::BadData)?;
    Ok(totals)
}

fn check_totals(
    totals: &AssetTotals,
    market_id: [u8; 32],
    asset_id: [u8; 32],
) -> Result<(), Error> {
    if totals.market_id != market_id || totals.asset_id != asset_id {
        return Err(Error::BadData);
    }
    Ok(())
}

impl From<SysError> for Error {
    fn from(_: SysError) -> Self {
        Self::Syscall
    }
}
