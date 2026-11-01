//! Account type script.
//!
//! An Account cell is the user-owned handle for a market. It stores a nonce and
//! is locked by the user's wallet lock. The type script enforces:
//! - args = market_id || owner_lock_hash
//! - the cell's lock hash equals owner_lock_hash
//! - creation starts at nonce 0
//! - updates increment the nonce by exactly 1
//! - at most one input and one output in the script group

#![no_std]
#![no_main]
#![forbid(unsafe_code)]

use ckb_std::ckb_constants::Source;
use ckb_std::error::SysError;
use ckb_std::high_level::{load_cell_data, load_cell_lock_hash, load_script};
use monimkt_schemas::{Account, Decode, Reader};

ckb_std::entry!(main);
ckb_std::default_alloc!(4096, 528384, 64);

#[repr(i8)]
#[derive(Clone, Copy)]
enum Error {
    Syscall = 1,
    BadArgs = 2,
    BadData = 3,
    BadLock = 4,
    TooManyCells = 5,
    BadNonce = 6,
    MissingCell = 7,
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
    let mut owner_lock_hash = [0u8; 32];
    owner_lock_hash.copy_from_slice(&args[32..64]);

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
        let output = decode_account(load_cell_data(0, Source::GroupOutput)?)?;
        check_account(&output, market_id, owner_lock_hash)?;
        let lock_hash = load_cell_lock_hash(0, Source::GroupOutput).map_err(|_| Error::Syscall)?;
        if lock_hash != owner_lock_hash {
            return Err(Error::BadLock);
        }

        if has_input {
            let input = decode_account(load_cell_data(0, Source::GroupInput)?)?;
            check_account(&input, market_id, owner_lock_hash)?;
            let expected = input.nonce.checked_add(1).ok_or(Error::BadNonce)?;
            if output.nonce != expected {
                return Err(Error::BadNonce);
            }
        } else if output.nonce != 0 {
            return Err(Error::BadNonce);
        }
    } else {
        // Close: owner consumes the account and reclaims capacity.
        let input = decode_account(load_cell_data(0, Source::GroupInput)?)?;
        check_account(&input, market_id, owner_lock_hash)?;
        let lock_hash = load_cell_lock_hash(0, Source::GroupInput).map_err(|_| Error::Syscall)?;
        if lock_hash != owner_lock_hash {
            return Err(Error::BadLock);
        }
    }

    Ok(())
}

fn decode_account(data: alloc::vec::Vec<u8>) -> Result<Account, Error> {
    let mut reader = Reader::new(&data);
    let account = Account::decode(&mut reader).map_err(|_| Error::BadData)?;
    reader.finish().map_err(|_| Error::BadData)?;
    Ok(account)
}

fn check_account(
    account: &Account,
    market_id: [u8; 32],
    owner_lock_hash: [u8; 32],
) -> Result<(), Error> {
    if account.market_id != market_id || account.owner_lock_hash != owner_lock_hash {
        return Err(Error::BadData);
    }
    Ok(())
}

impl From<SysError> for Error {
    fn from(_: SysError) -> Self {
        Self::Syscall
    }
}
