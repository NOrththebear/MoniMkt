//! Scoped manager approval type script.
//!
//! Args: market_id || owner_lock_hash || manager_lock_hash || account_type_code_hash
//! Data: Approval
//!
//! Creation requires the owner's Account cell as an input; the account's lock
//! verifies the owner's signature. Revocation is a normal spend by the owner's
//! lock, so no output is required.

#![no_std]
#![no_main]
#![forbid(unsafe_code)]

use ckb_std::ckb_constants::Source;
use ckb_std::ckb_types::prelude::*;
use ckb_std::error::SysError;
use ckb_std::high_level::{load_cell_data, load_cell_type, load_script};
use monimkt_schemas::{Approval, Decode, Reader};

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
    MissingAccount = 6,
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
    let mut owner_lock_hash = [0u8; 32];
    owner_lock_hash.copy_from_slice(&args[32..64]);
    let mut manager_lock_hash = [0u8; 32];
    manager_lock_hash.copy_from_slice(&args[64..96]);
    let mut account_type_code_hash = [0u8; 32];
    account_type_code_hash.copy_from_slice(&args[96..128]);

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
        let approval = decode_approval(load_cell_data(0, Source::GroupOutput)?)?;
        check_approval(&approval, market_id, owner_lock_hash, manager_lock_hash)?;
        if !has_input {
            // Creation requires the owner's Account cell; its wallet lock
            // verifies the owner's signature.
            let mut account_args = [0u8; 64];
            account_args[0..32].copy_from_slice(&market_id);
            account_args[32..64].copy_from_slice(&owner_lock_hash);
            if !has_input_with_type_args(account_type_code_hash, &account_args) {
                return Err(Error::MissingAccount);
            }
        }
    } else {
        // Revocation / close: owner spends the approval cell.
        let approval = decode_approval(load_cell_data(0, Source::GroupInput)?)?;
        check_approval(&approval, market_id, owner_lock_hash, manager_lock_hash)?;
    }

    Ok(())
}

fn decode_approval(data: alloc::vec::Vec<u8>) -> Result<Approval, Error> {
    let mut reader = Reader::new(&data);
    let approval = Approval::decode(&mut reader).map_err(|_| Error::BadData)?;
    reader.finish().map_err(|_| Error::BadData)?;
    Ok(approval)
}

fn check_approval(
    approval: &Approval,
    market_id: [u8; 32],
    owner_lock_hash: [u8; 32],
    manager_lock_hash: [u8; 32],
) -> Result<(), Error> {
    if approval.market_id != market_id
        || approval.owner_lock_hash != owner_lock_hash
        || approval.manager_lock_hash != manager_lock_hash
    {
        return Err(Error::BadData);
    }
    Ok(())
}

fn has_input_with_type_args(type_hash: [u8; 32], expected_args: &[u8]) -> bool {
    let mut index = 0usize;
    loop {
        match load_cell_type(index, Source::Input) {
            Ok(Some(script)) if script.code_hash().as_slice() == type_hash.as_slice() => {
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
