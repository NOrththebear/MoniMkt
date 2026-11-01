//! User position type script.
//!
//! Enforces the position's identity and nonce, and requires the MarketState cell
//! to be present. The market-type script owns the accounting rules; the position
//! lock owns authorization. This script is the state-shape guard.
//!
//! Args: market_id || owner_lock_hash || market_type_code_hash

#![no_std]
#![no_main]
#![forbid(unsafe_code)]

use ckb_std::ckb_constants::Source;
use ckb_std::ckb_types::prelude::*;
use ckb_std::error::SysError;
use ckb_std::high_level::{load_cell_data, load_cell_type, load_script, load_witness_args};
use monimkt_schemas::{action_tag, Action, Decode, Reader, UserPosition};

ckb_std::entry!(main);
ckb_std::default_alloc!(4096, 528384, 64);

#[repr(i8)]
#[derive(Clone, Copy)]
enum Error {
    Syscall = 1,
    BadArgs = 2,
    BadData = 3,
    TooManyCells = 4,
    BadNonce = 5,
    MissingCell = 6,
    MissingMarket = 7,
    MissingAction = 8,
    BadAction = 9,
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
    if args.len() != 96 {
        return Err(Error::BadArgs);
    }

    let mut market_id = [0u8; 32];
    market_id.copy_from_slice(&args[0..32]);
    let mut owner_lock_hash = [0u8; 32];
    owner_lock_hash.copy_from_slice(&args[32..64]);
    let mut market_type_code_hash = [0u8; 32];
    market_type_code_hash.copy_from_slice(&args[64..96]);

    if !has_input_code_hash(market_type_code_hash) {
        return Err(Error::MissingMarket);
    }

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

    if has_output {
        let output = decode_position(load_cell_data(0, Source::GroupOutput)?)?;
        check_position(&output, market_id, owner_lock_hash)?;

        if has_input {
            let input = decode_position(load_cell_data(0, Source::GroupInput)?)?;
            check_position(&input, market_id, owner_lock_hash)?;
            if action_increments_nonce()? {
                let expected = input.nonce.checked_add(1).ok_or(Error::BadNonce)?;
                if output.nonce != expected {
                    return Err(Error::BadNonce);
                }
            }
        } else if output.nonce != 0 {
            return Err(Error::BadNonce);
        }
    }

    Ok(())
}

fn action_increments_nonce() -> Result<bool, Error> {
    let action = load_action()?;
    Ok(matches!(
        action.tag,
        action_tag::SUPPLY_BASE
            | action_tag::SUPPLY_COLLATERAL
            | action_tag::WITHDRAW_BASE
            | action_tag::WITHDRAW_COLLATERAL
            | action_tag::BORROW
            | action_tag::REPAY
            | action_tag::TRANSFER_BASE
            | action_tag::TRANSFER_COLLATERAL
            | action_tag::CREATE_APPROVAL
            | action_tag::REVOKE_APPROVAL
    ))
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

fn decode_position(data: alloc::vec::Vec<u8>) -> Result<UserPosition, Error> {
    let mut reader = Reader::new(&data);
    let position = UserPosition::decode(&mut reader).map_err(|_| Error::BadData)?;
    reader.finish().map_err(|_| Error::BadData)?;
    Ok(position)
}

fn check_position(
    position: &UserPosition,
    market_id: [u8; 32],
    owner_lock_hash: [u8; 32],
) -> Result<(), Error> {
    if position.market_id != market_id || position.owner_lock_hash != owner_lock_hash {
        return Err(Error::BadData);
    }
    Ok(())
}

impl From<SysError> for Error {
    fn from(_: SysError) -> Self {
        Self::Syscall
    }
}
