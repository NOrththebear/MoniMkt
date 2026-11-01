//! Position authorization lock.
//!
//! Owner path: require an Account input with type hash `account_type_hash` and
//! args `market_id || owner_lock_hash`. The account cell's own lock (the user's
//! wallet) verifies the signature.
//!
//! Liquidation path: `Absorb` is allowed without an account, provided the
//! canonical MarketState input is present. The market-type script proves the
//! position is liquidatable.
//!
//! Args:
//! market_id || owner_lock_hash || account_type_hash || market_type_code_hash ||
//! approval_type_code_hash

#![no_std]
#![no_main]
#![forbid(unsafe_code)]

use ckb_std::ckb_constants::Source;
use ckb_std::ckb_types::prelude::*;
use ckb_std::error::SysError;
use ckb_std::high_level::{
    load_cell_data, load_cell_type, load_header, load_script, load_witness_args,
};
use monimkt_schemas::{action_tag, permission, Action, Approval, Decode, Reader};

ckb_std::entry!(main);
ckb_std::default_alloc!(4096, 528384, 64);

#[repr(i8)]
#[derive(Clone, Copy)]
enum Error {
    Syscall = 1,
    BadArgs = 2,
    MissingAction = 3,
    BadAction = 4,
    MissingAccount = 5,
    MissingMarket = 6,
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
    if args.len() != 160 {
        return Err(Error::BadArgs);
    }

    let mut market_id = [0u8; 32];
    market_id.copy_from_slice(&args[0..32]);
    let mut owner_lock_hash = [0u8; 32];
    owner_lock_hash.copy_from_slice(&args[32..64]);
    let mut account_type_hash = [0u8; 32];
    account_type_hash.copy_from_slice(&args[64..96]);
    let mut market_type_code_hash = [0u8; 32];
    market_type_code_hash.copy_from_slice(&args[96..128]);
    let mut approval_type_code_hash = [0u8; 32];
    approval_type_code_hash.copy_from_slice(&args[128..160]);

    let action = load_action()?;
    if action.tag == action_tag::ABSORB {
        if has_input_code_hash(market_type_code_hash) {
            return Ok(());
        }
        return Err(Error::MissingMarket);
    }

    let mut expected_account_args = [0u8; 64];
    expected_account_args[0..32].copy_from_slice(&market_id);
    expected_account_args[32..64].copy_from_slice(&owner_lock_hash);

    if has_input_with_type_args(account_type_hash, &expected_account_args) {
        return Ok(());
    }

    // CKB header timestamps are milliseconds; approval expiry is in seconds.
    let now = load_header(0, Source::HeaderDep)
        .map_err(|_| Error::Syscall)?
        .raw()
        .timestamp()
        .unpack()
        / 1000;
    if manager_approved(
        approval_type_code_hash,
        account_type_hash,
        market_id,
        owner_lock_hash,
        now,
        action.tag,
    ) {
        Ok(())
    } else {
        Err(Error::MissingAccount)
    }
}

fn permission_for_action(tag: u8) -> Option<u32> {
    match tag {
        action_tag::SUPPLY_BASE | action_tag::REPAY => Some(permission::SUPPLY),
        action_tag::WITHDRAW_BASE => Some(permission::WITHDRAW),
        action_tag::BORROW => Some(permission::BORROW),
        action_tag::SUPPLY_COLLATERAL | action_tag::WITHDRAW_COLLATERAL => {
            Some(permission::COLLATERAL)
        }
        action_tag::TRANSFER_BASE | action_tag::TRANSFER_COLLATERAL => Some(permission::TRANSFER),
        _ => None,
    }
}

fn manager_approved(
    approval_type_code_hash: [u8; 32],
    account_type_hash: [u8; 32],
    market_id: [u8; 32],
    owner_lock_hash: [u8; 32],
    now: u64,
    action_tag: u8,
) -> bool {
    let permission = match permission_for_action(action_tag) {
        Some(value) => value,
        None => return false,
    };

    let mut index = 0usize;
    loop {
        match load_cell_type(index, Source::CellDep) {
            Ok(Some(script))
                if script.code_hash().as_slice() == approval_type_code_hash.as_slice() =>
            {
                let data = match load_cell_data(index, Source::CellDep) {
                    Ok(data) => data,
                    Err(_) => return false,
                };
                let mut reader = Reader::new(&data);
                let approval = match Approval::decode(&mut reader) {
                    Ok(approval) => approval,
                    Err(_) => return false,
                };
                if reader.finish().is_err() {
                    return false;
                }
                if approval.market_id != market_id
                    || approval.owner_lock_hash != owner_lock_hash
                    || approval.expiry <= now
                    || approval.permissions & permission == 0
                {
                    return false;
                }

                let mut expected_args = [0u8; 128];
                expected_args[0..32].copy_from_slice(&market_id);
                expected_args[32..64].copy_from_slice(&owner_lock_hash);
                expected_args[64..96].copy_from_slice(&approval.manager_lock_hash);
                expected_args[96..128].copy_from_slice(&account_type_hash);
                if script.args().raw_data().as_ref() != expected_args {
                    return false;
                }

                let mut manager_args = [0u8; 64];
                manager_args[0..32].copy_from_slice(&market_id);
                manager_args[32..64].copy_from_slice(&approval.manager_lock_hash);
                if has_input_with_type_args(account_type_hash, &manager_args) {
                    return true;
                }
            }
            Ok(_) => {}
            Err(_) => return false,
        }
        index += 1;
        if index > 256 {
            return false;
        }
    }
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

fn has_input_with_type_args(code_hash: [u8; 32], expected_args: &[u8]) -> bool {
    let mut index = 0usize;
    loop {
        match load_cell_type(index, Source::Input) {
            Ok(Some(script)) if script.code_hash().as_slice() == code_hash.as_slice() => {
                if script.args().raw_data().as_ref() == expected_args {
                    return true;
                }
            }
            Ok(_) => {}
            Err(_) => return false,
        }
        index += 1;
        if index > 256 {
            return false;
        }
    }
}

impl From<SysError> for Error {
    fn from(_: SysError) -> Self {
        Self::Syscall
    }
}
