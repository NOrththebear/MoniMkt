//! Base-token custody lock.
//!
//! The base vault has two cells:
//! - a `Vault` state cell (type = vault-type, lock = vault-lock), and
//! - an xUDT token cell (type = the base token type, lock = this script).
//!
//! `vault-lock` only guards the state-cell delta. This lock independently
//! requires the token-cell delta to equal the vault-state delta, so the
//! accounting cannot claim tokens that are not actually in custody.
//!
//! Args: market_id || base_asset_id || market_type_code_hash || vault_type_code_hash
//! The base_asset_id is also the full type-script hash of the xUDT cell.

#![no_std]
#![no_main]
#![forbid(unsafe_code)]

use ckb_std::ckb_constants::Source;
use ckb_std::ckb_types::prelude::*;
use ckb_std::error::SysError;
use ckb_std::high_level::{load_cell_data, load_cell_lock, load_cell_type, load_script};
use monimkt_schemas::{Decode, MarketState, Reader, Vault};

ckb_std::entry!(main);
ckb_std::default_alloc!(4096, 528384, 64);

#[repr(i8)]
#[derive(Clone, Copy)]
enum Error {
    Syscall = 1,
    BadArgs = 2,
    BadToken = 3,
    MissingMarket = 4,
    BadMarket = 5,
    MissingVault = 6,
    BadVault = 7,
    BadDelta = 8,
    TooManyCells = 9,
    MissingOutput = 15,
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
    if args.len() != 128 {
        return Err(Error::BadArgs);
    }

    let mut market_id = [0u8; 32];
    market_id.copy_from_slice(&args[0..32]);
    let mut asset_id = [0u8; 32];
    asset_id.copy_from_slice(&args[32..64]);
    let mut market_type_code_hash = [0u8; 32];
    market_type_code_hash.copy_from_slice(&args[64..96]);
    let mut vault_type_code_hash = [0u8; 32];
    vault_type_code_hash.copy_from_slice(&args[96..128]);

    let (token_in, input_count) = sum_tokens(Source::Input, asset_id, &script)?;
    let (token_out, output_count) = sum_tokens(Source::Output, asset_id, &script)?;

    if input_count > 0 {
        if output_count == 0 {
            return Err(Error::MissingOutput);
        }

        // The token cells are only valid alongside the canonical market state.
        let market = load_market_state(Source::Input, market_type_code_hash)?;
        if market.market_id != market_id || market.base_asset_id != asset_id {
            return Err(Error::BadMarket);
        }

        let vault_in = load_vault(Source::Input, vault_type_code_hash, market_id, asset_id)?;
        let vault_out = load_vault(Source::Output, vault_type_code_hash, market_id, asset_id)?;

        let token_delta = to_i128(token_out)?
            .checked_sub(to_i128(token_in)?)
            .ok_or(Error::BadDelta)?;
        let vault_delta = to_i128(vault_out.amount)?
            .checked_sub(to_i128(vault_in.amount)?)
            .ok_or(Error::BadDelta)?;
        if token_delta != vault_delta {
            return Err(Error::BadDelta);
        }
    } else if output_count > 0 {
        // Genesis: the token cells are created with the vault state and the
        // MarketState output in the same transaction.
        let market = load_market_state(Source::Output, market_type_code_hash)?;
        if market.market_id != market_id || market.base_asset_id != asset_id {
            return Err(Error::BadMarket);
        }
        let vault = load_vault(Source::Output, vault_type_code_hash, market_id, asset_id)?;
        if vault.amount != token_out {
            return Err(Error::BadDelta);
        }
    } else {
        return Err(Error::MissingOutput);
    }

    Ok(())
}

fn sum_tokens(
    source: Source,
    asset_id: [u8; 32],
    lock_script: &ckb_std::ckb_types::packed::Script,
) -> Result<(u128, usize), Error> {
    let mut total = 0u128;
    let mut count = 0usize;
    let mut index = 0usize;
    loop {
        match load_cell_type(index, source) {
            Ok(Some(type_script))
                if type_script.calc_script_hash().as_slice() == asset_id.as_slice() =>
            {
                let lock = load_cell_lock(index, source).map_err(|_| Error::Syscall)?;
                if lock.as_slice() == lock_script.as_slice() {
                    let amount = read_amount(load_cell_data(index, source)?)?;
                    total = total.checked_add(amount).ok_or(Error::BadDelta)?;
                    count += 1;
                    if count > 64 {
                        return Err(Error::TooManyCells);
                    }
                }
            }
            Ok(_) => {}
            Err(SysError::IndexOutOfBound) => return Ok((total, count)),
            Err(_) => return Err(Error::Syscall),
        }
        index += 1;
        if index > 256 {
            return Err(Error::TooManyCells);
        }
    }
}

fn read_amount(data: alloc::vec::Vec<u8>) -> Result<u128, Error> {
    if data.len() < 16 {
        return Err(Error::BadToken);
    }
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&data[0..16]);
    Ok(u128::from_le_bytes(bytes))
}

fn to_i128(value: u128) -> Result<i128, Error> {
    i128::try_from(value).map_err(|_| Error::BadDelta)
}

fn load_market_state(
    source: Source,
    market_type_code_hash: [u8; 32],
) -> Result<MarketState, Error> {
    let data = load_cell_by_code_hash(source, market_type_code_hash, Error::MissingMarket)?;
    let mut reader = Reader::new(&data);
    let state = MarketState::decode(&mut reader).map_err(|_| Error::BadMarket)?;
    reader.finish().map_err(|_| Error::BadMarket)?;
    Ok(state)
}

fn load_vault(
    source: Source,
    vault_type_code_hash: [u8; 32],
    market_id: [u8; 32],
    asset_id: [u8; 32],
) -> Result<Vault, Error> {
    let data = load_vault_data(source, vault_type_code_hash, market_id, asset_id)?;
    let mut reader = Reader::new(&data);
    let vault = Vault::decode(&mut reader).map_err(|_| Error::BadVault)?;
    reader.finish().map_err(|_| Error::BadVault)?;
    if vault.market_id != market_id || vault.asset_id != asset_id {
        return Err(Error::BadVault);
    }
    Ok(vault)
}

fn load_vault_data(
    source: Source,
    vault_type_code_hash: [u8; 32],
    market_id: [u8; 32],
    asset_id: [u8; 32],
) -> Result<alloc::vec::Vec<u8>, Error> {
    let mut index = 0usize;
    loop {
        match load_cell_type(index, source) {
            Ok(Some(script))
                if script.code_hash().as_slice() == vault_type_code_hash.as_slice()
                    && args_match(script.args().raw_data().as_ref(), market_id, asset_id) =>
            {
                return load_cell_data(index, source).map_err(|_| Error::Syscall);
            }
            Ok(_) => {
                index += 1;
                if index > 256 {
                    return Err(Error::MissingVault);
                }
            }
            Err(SysError::IndexOutOfBound) => return Err(Error::MissingVault),
            Err(_) => return Err(Error::Syscall),
        }
    }
}

fn args_match(args: &[u8], market_id: [u8; 32], asset_id: [u8; 32]) -> bool {
    args.len() >= 64 && args[0..32] == market_id && args[32..64] == asset_id
}

fn load_cell_by_code_hash(
    source: Source,
    code_hash: [u8; 32],
    missing: Error,
) -> Result<alloc::vec::Vec<u8>, Error> {
    let mut index = 0usize;
    loop {
        match load_cell_type(index, source) {
            Ok(Some(script)) if script.code_hash().as_slice() == code_hash.as_slice() => {
                return load_cell_data(index, source).map_err(|_| Error::Syscall);
            }
            Ok(_) => {
                index += 1;
                if index > 256 {
                    return Err(missing);
                }
            }
            Err(SysError::IndexOutOfBound) => return Err(missing),
            Err(_) => return Err(Error::Syscall),
        }
    }
}

impl From<SysError> for Error {
    fn from(_: SysError) -> Self {
        Self::Syscall
    }
}
