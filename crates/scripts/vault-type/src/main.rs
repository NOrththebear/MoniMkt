//! Vault state type script.
//!
//! Enforces the vault's identity. Custody and direction checks live in the
//! vault lock; the market-type script owns the exact accounting.
//!
//! Args: market_id || asset_id || kind

#![no_std]
#![no_main]
#![forbid(unsafe_code)]

use ckb_std::ckb_constants::Source;
use ckb_std::error::SysError;
use ckb_std::high_level::{
    load_cell_capacity, load_cell_data, load_cell_lock, load_cell_type, load_script,
};
use monimkt_schemas::{asset_kind, Decode, Reader, Vault};

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
    BadCapacity = 6,
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
    if args.len() != 65 {
        return Err(Error::BadArgs);
    }

    let mut market_id = [0u8; 32];
    market_id.copy_from_slice(&args[0..32]);
    let mut asset_id = [0u8; 32];
    asset_id.copy_from_slice(&args[32..64]);
    let kind = args[64];

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
        let vault = decode_vault(load_cell_data(0, Source::GroupInput)?)?;
        check_vault(&vault, market_id, asset_id)?;
        check_capacity(Source::GroupInput, kind, vault.amount)?;
    }
    if has_output {
        let vault = decode_vault(load_cell_data(0, Source::GroupOutput)?)?;
        check_vault(&vault, market_id, asset_id)?;
        check_capacity(Source::GroupOutput, kind, vault.amount)?;
    }

    Ok(())
}

fn decode_vault(data: alloc::vec::Vec<u8>) -> Result<Vault, Error> {
    let mut reader = Reader::new(&data);
    let vault = Vault::decode(&mut reader).map_err(|_| Error::BadData)?;
    reader.finish().map_err(|_| Error::BadData)?;
    Ok(vault)
}

fn check_capacity(source: Source, kind: u8, amount: u128) -> Result<(), Error> {
    if kind != asset_kind::CKB {
        return Ok(());
    }

    let capacity = load_cell_capacity(0, source).map_err(|_| Error::Syscall)? as u128;
    let data_len = load_cell_data(0, source).map_err(|_| Error::Syscall)?.len() as u128;
    let lock_args = load_cell_lock(0, source)
        .map_err(|_| Error::Syscall)?
        .args()
        .raw_data()
        .len() as u128;
    let type_args = load_cell_type(0, source)
        .map_err(|_| Error::Syscall)?
        .map(|script| script.args().raw_data().len() as u128)
        .unwrap_or(0);

    // 8 (capacity) + 33 (code hash + hash type) per script + args + data.
    let occupied = 8 + 33 + lock_args + 33 + type_args + data_len;
    if capacity < occupied + amount {
        return Err(Error::BadCapacity);
    }
    Ok(())
}

fn check_vault(vault: &Vault, market_id: [u8; 32], asset_id: [u8; 32]) -> Result<(), Error> {
    if vault.market_id != market_id || vault.asset_id != asset_id {
        return Err(Error::BadData);
    }
    Ok(())
}

impl From<SysError> for Error {
    fn from(_: SysError) -> Self {
        Self::Syscall
    }
}
