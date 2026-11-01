//! Vault custody lock.
//!
//! A vault cell holds a `Vault` state and is locked by this script. Every spend
//! must include the canonical MarketState cell. The lock independently checks
//! the vault identity and the direction of the amount change; the market-type
//! script checks the exact delta.
//!
//! Args: market_id || asset_id || market_type_code_hash || vault_type_code_hash

#![no_std]
#![no_main]
#![forbid(unsafe_code)]

use ckb_std::ckb_constants::Source;
use ckb_std::ckb_types::prelude::*;
use ckb_std::error::SysError;
use ckb_std::high_level::{load_cell_data, load_cell_type, load_script, load_witness_args};
use monimkt_schemas::{action_tag, Action, Decode, Reader, Vault};

ckb_std::entry!(main);
ckb_std::default_alloc!(4096, 528384, 64);

#[repr(i8)]
#[derive(Clone, Copy)]
enum Error {
    Syscall = 1,
    BadArgs = 2,
    BadVault = 3,
    MissingMarket = 4,
    MissingAction = 5,
    BadAction = 6,
    MissingOutput = 7,
    BadDirection = 8,
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

    let has_input = load_cell_data(0, Source::GroupInput).is_ok();
    if !has_input {
        // Genesis: create the vault alongside the MarketState output.
        let vault = decode_vault(load_cell_data(0, Source::GroupOutput)?)?;
        check_vault(&vault, market_id, asset_id)?;
        if !has_output_code_hash(market_type_code_hash) {
            return Err(Error::MissingMarket);
        }
        return Ok(());
    }

    if !has_input_code_hash(market_type_code_hash) {
        return Err(Error::MissingMarket);
    }

    let old_vault = decode_vault(load_cell_data(0, Source::GroupInput)?)?;
    check_vault(&old_vault, market_id, asset_id)?;

    let new_vault = load_output_vault(vault_type_code_hash, market_id, asset_id)?;
    check_vault(&new_vault, market_id, asset_id)?;

    let action = load_action()?;
    match action.tag {
        action_tag::SUPPLY_BASE | action_tag::REPAY => {
            if new_vault.amount < old_vault.amount {
                return Err(Error::BadDirection);
            }
        }
        action_tag::WITHDRAW_BASE | action_tag::BORROW => {
            if new_vault.amount > old_vault.amount {
                return Err(Error::BadDirection);
            }
        }
        // Collateral/market operations get their exact direction checks in M4.
        _ => {}
    }

    Ok(())
}

fn load_action() -> Result<Action, Error> {
    let witness = load_witness_args(0, Source::GroupInput).map_err(|_| Error::MissingAction)?;
    let input_type = witness.input_type().to_opt().ok_or(Error::MissingAction)?;
    let data = input_type.raw_data();
    let mut reader = Reader::new(data.as_ref());
    let action = Action::decode(&mut reader).map_err(|_| Error::BadAction)?;
    reader.finish().map_err(|_| Error::BadAction)?;
    Ok(action)
}

fn has_output_code_hash(code_hash: [u8; 32]) -> bool {
    let mut index = 0usize;
    loop {
        match load_cell_type(index, Source::Output) {
            Ok(Some(script)) if script.code_hash().as_slice() == code_hash.as_slice() => {
                return true;
            }
            Ok(_) => {
                index += 1;
                if index > 256 {
                    return false;
                }
            }
            Err(_) => return false,
        }
    }
}

fn has_input_code_hash(code_hash: [u8; 32]) -> bool {
    let mut index = 0usize;
    loop {
        match load_cell_type(index, Source::Input) {
            Ok(Some(script)) if script.code_hash().as_slice() == code_hash.as_slice() => {
                return true;
            }
            Ok(_) => {
                index += 1;
                if index > 256 {
                    return false;
                }
            }
            Err(_) => return false,
        }
    }
}

fn load_output_vault(
    vault_type_code_hash: [u8; 32],
    market_id: [u8; 32],
    asset_id: [u8; 32],
) -> Result<Vault, Error> {
    let mut expected_args = [0u8; 64];
    expected_args[0..32].copy_from_slice(&market_id);
    expected_args[32..64].copy_from_slice(&asset_id);

    let mut index = 0usize;
    loop {
        match load_cell_type(index, Source::Output) {
            Ok(Some(script))
                if script.code_hash().as_slice() == vault_type_code_hash.as_slice()
                    && is_expected_vault_args(
                        script.args().raw_data().as_ref(),
                        &expected_args,
                    ) =>
            {
                let data = load_cell_data(index, Source::Output).map_err(|_| Error::Syscall)?;
                return decode_vault(data);
            }
            Ok(_) => {
                index += 1;
                if index > 256 {
                    return Err(Error::MissingOutput);
                }
            }
            Err(SysError::IndexOutOfBound) => return Err(Error::MissingOutput),
            Err(_) => return Err(Error::Syscall),
        }
    }
}

fn is_expected_vault_args(actual: &[u8], expected: &[u8]) -> bool {
    actual.len() >= expected.len() && &actual[..expected.len()] == expected
}

fn decode_vault(data: alloc::vec::Vec<u8>) -> Result<Vault, Error> {
    let mut reader = Reader::new(&data);
    let vault = Vault::decode(&mut reader).map_err(|_| Error::BadVault)?;
    reader.finish().map_err(|_| Error::BadVault)?;
    Ok(vault)
}

fn check_vault(vault: &Vault, market_id: [u8; 32], asset_id: [u8; 32]) -> Result<(), Error> {
    if vault.market_id != market_id || vault.asset_id != asset_id {
        return Err(Error::BadVault);
    }
    Ok(())
}

impl From<SysError> for Error {
    fn from(_: SysError) -> Self {
        Self::Syscall
    }
}
