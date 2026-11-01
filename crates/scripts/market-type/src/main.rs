//! MarketState type script.
//!
//! M3 validates:
//! - `Accrue`
//! - `SupplyBase`
//! - `WithdrawBase`
//!
//! The position and vault type scripts are still stubs in the tests; this script
//! is the accounting guard. Authorization and token custody arrive in M4.

#![no_std]
#![no_main]
#![forbid(unsafe_code)]

use ckb_std::ckb_constants::Source;
use ckb_std::ckb_types::prelude::*;
use ckb_std::error::SysError;
use ckb_std::high_level::{
    load_cell_data, load_cell_type, load_cell_type_hash, load_header, load_script,
    load_witness_args,
};
use monimkt_market_core as market_core;
use monimkt_math::{
    is_borrow_collateralized, is_liquidatable, pow10, present_value_borrow, present_value_supply,
    quote_collateral, AbsorbCollateral, Collateral, BASE_INDEX_SCALE, PRICE_SCALE,
};
use monimkt_schemas::{
    action_tag, pause_flag, Action, AssetConfig, AssetTotals, Decode, MarketConfig, MarketState,
    Oracle, Reader, UserPosition, Vault,
};

ckb_std::entry!(main);
ckb_std::default_alloc!(4096, 528384, 64);

#[repr(i8)]
#[derive(Clone, Copy)]
enum Error {
    Syscall = 1,
    BadArgs = 2,
    BadState = 3,
    BadConfig = 4,
    MissingAction = 5,
    BadAction = 6,
    UnsupportedAction = 7,
    BadTransition = 8,
    MissingHeader = 9,
    Core = 10,
    MissingPosition = 11,
    MissingVault = 12,
    Paused = 13,
}

struct MarketArgs {
    market_id: [u8; 32],
    config_type_hash: [u8; 32],
    position_type_code_hash: [u8; 32],
    vault_type_code_hash: [u8; 32],
    oracle_type_code_hash: [u8; 32],
    asset_config_code_hash: [u8; 32],
    asset_totals_code_hash: [u8; 32],
}

fn main() -> i8 {
    match run() {
        Ok(()) => 0,
        Err(error) => error as i8,
    }
}

fn run() -> Result<(), Error> {
    let args = load_market_args()?;

    let has_input = load_cell_data(0, Source::GroupInput).is_ok();
    let new_state = load_market_state(Source::GroupOutput)?;

    if !has_input {
        return validate_genesis(&args, &new_state);
    }

    let old_state = load_market_state(Source::GroupInput)?;
    if old_state.market_id != args.market_id || new_state.market_id != args.market_id {
        return Err(Error::BadState);
    }
    if old_state.version != new_state.version || old_state.base_asset_id != new_state.base_asset_id
    {
        return Err(Error::BadState);
    }

    let action = load_action()?;
    let config = load_config(args.market_id, args.config_type_hash)?;
    let now = load_timestamp()?;

    if action.tag == action_tag::PAUSE {
        if action.flags & !0b11111 != 0 {
            return Err(Error::BadTransition);
        }
        let mut expected =
            market_core::accrue(&old_state, &config, now).map_err(|_| Error::Core)?;
        expected.pause_flags = action.flags;
        if expected != new_state {
            return Err(Error::BadTransition);
        }
        return Ok(());
    }

    if let Some(flag) = pause_flag_for(action.tag) {
        if old_state.pause_flags & flag != 0 {
            return Err(Error::Paused);
        }
    }

    match action.tag {
        action_tag::ACCRUE => {
            let expected =
                market_core::accrue(&old_state, &config, now).map_err(|_| Error::Core)?;
            if expected != new_state {
                return Err(Error::BadTransition);
            }
        }
        action_tag::SUPPLY_BASE => {
            let old_position = load_position(Source::Input, args.position_type_code_hash)?;
            let new_position = load_position(Source::Output, args.position_type_code_hash)?;
            let old_vault = load_vault(Source::Input, args.vault_type_code_hash)?;
            let new_vault = load_vault(Source::Output, args.vault_type_code_hash)?;
            check_vault(args.market_id, &old_vault)?;
            check_vault(args.market_id, &new_vault)?;
            check_base_vault(&old_state, &old_vault)?;
            check_base_vault(&new_state, &new_vault)?;

            let received = new_vault
                .amount
                .checked_sub(old_vault.amount)
                .ok_or(Error::BadTransition)?;
            let accrued = market_core::accrue(&old_state, &config, now).map_err(|_| Error::Core)?;
            let (expected_state, expected_position) =
                market_core::supply_base(&accrued, &old_position, received)
                    .map_err(|_| Error::Core)?;
            if expected_state != new_state || !position_matches(&expected_position, &new_position) {
                return Err(Error::BadTransition);
            }
        }
        action_tag::REPAY => {
            let old_position = load_position(Source::Input, args.position_type_code_hash)?;
            let new_position = load_position(Source::Output, args.position_type_code_hash)?;
            let old_vault = load_vault(Source::Input, args.vault_type_code_hash)?;
            let new_vault = load_vault(Source::Output, args.vault_type_code_hash)?;
            check_vault(args.market_id, &old_vault)?;
            check_vault(args.market_id, &new_vault)?;
            check_base_vault(&old_state, &old_vault)?;
            check_base_vault(&new_state, &new_vault)?;

            let received = new_vault
                .amount
                .checked_sub(old_vault.amount)
                .ok_or(Error::BadTransition)?;
            let accrued = market_core::accrue(&old_state, &config, now).map_err(|_| Error::Core)?;
            let (expected_state, expected_position) =
                market_core::repay_base(&accrued, &old_position, received)
                    .map_err(|_| Error::Core)?;
            if expected_state != new_state || !position_matches(&expected_position, &new_position) {
                return Err(Error::BadTransition);
            }
        }
        action_tag::SUPPLY_COLLATERAL => {
            let old_position = load_position(Source::Input, args.position_type_code_hash)?;
            let new_position = load_position(Source::Output, args.position_type_code_hash)?;
            let old_vault = load_vault(Source::Input, args.vault_type_code_hash)?;
            let new_vault = load_vault(Source::Output, args.vault_type_code_hash)?;
            let old_totals =
                load_asset_totals(Source::Input, args.asset_totals_code_hash, args.market_id)?;
            let new_totals =
                load_asset_totals(Source::Output, args.asset_totals_code_hash, args.market_id)?;
            let asset_config = load_asset_config(args.asset_config_code_hash, args.market_id)?;
            check_vault(args.market_id, &old_vault)?;
            check_vault(args.market_id, &new_vault)?;
            if old_vault.asset_id != asset_config.asset_id
                || new_vault.asset_id != asset_config.asset_id
                || old_totals.asset_id != asset_config.asset_id
                || new_totals.asset_id != asset_config.asset_id
            {
                return Err(Error::BadTransition);
            }

            let received = new_vault
                .amount
                .checked_sub(old_vault.amount)
                .ok_or(Error::BadTransition)?;
            let expected_total = old_totals
                .total_supplied
                .checked_add(received)
                .ok_or(Error::BadTransition)?;
            if new_totals.total_supplied != expected_total
                || new_totals.total_supplied > asset_config.supply_cap
            {
                return Err(Error::BadTransition);
            }

            let mut expected_position = old_position;
            market_core::supply_collateral(&mut expected_position, 0, received)
                .map_err(|_| Error::Core)?;
            let accrued = market_core::accrue(&old_state, &config, now).map_err(|_| Error::Core)?;
            if accrued != new_state || !position_matches(&expected_position, &new_position) {
                return Err(Error::BadTransition);
            }
        }
        action_tag::WITHDRAW_COLLATERAL => {
            let old_position = load_position(Source::Input, args.position_type_code_hash)?;
            let new_position = load_position(Source::Output, args.position_type_code_hash)?;
            let old_vault = load_vault(Source::Input, args.vault_type_code_hash)?;
            let new_vault = load_vault(Source::Output, args.vault_type_code_hash)?;
            let old_totals =
                load_asset_totals(Source::Input, args.asset_totals_code_hash, args.market_id)?;
            let new_totals =
                load_asset_totals(Source::Output, args.asset_totals_code_hash, args.market_id)?;
            let asset_config = load_asset_config(args.asset_config_code_hash, args.market_id)?;
            check_vault(args.market_id, &old_vault)?;
            check_vault(args.market_id, &new_vault)?;
            if old_vault.asset_id != asset_config.asset_id
                || new_vault.asset_id != asset_config.asset_id
                || old_totals.asset_id != asset_config.asset_id
                || new_totals.asset_id != asset_config.asset_id
            {
                return Err(Error::BadTransition);
            }

            let paid = old_vault
                .amount
                .checked_sub(new_vault.amount)
                .ok_or(Error::BadTransition)?;
            let expected_total = old_totals
                .total_supplied
                .checked_sub(paid)
                .ok_or(Error::BadTransition)?;
            if new_totals.total_supplied != expected_total {
                return Err(Error::BadTransition);
            }

            let mut expected_position = old_position;
            market_core::withdraw_collateral(&mut expected_position, 0, paid)
                .map_err(|_| Error::Core)?;

            if expected_position.principal.is_negative() {
                let oracle = load_oracle(args.oracle_type_code_hash)?;
                check_oracle(&oracle, &asset_config, now, config.max_oracle_age)?;
                let collateral = Collateral {
                    amount: expected_position.collateral[0],
                    price: oracle.price,
                    scale: asset_config.scale as u128,
                    borrow_cf: asset_config.borrow_cf as u128,
                    liquidate_cf: asset_config.liquidate_cf as u128,
                };
                let principal = expected_position
                    .principal
                    .to_i128()
                    .map_err(|_| Error::BadState)?;
                if !is_borrow_collateralized(principal, &[collateral]).map_err(|_| Error::Core)? {
                    return Err(Error::BadTransition);
                }
            }

            let accrued = market_core::accrue(&old_state, &config, now).map_err(|_| Error::Core)?;
            if accrued != new_state || !position_matches(&expected_position, &new_position) {
                return Err(Error::BadTransition);
            }
        }
        action_tag::BUY_COLLATERAL => {
            let old_totals =
                load_asset_totals(Source::Input, args.asset_totals_code_hash, args.market_id)?;
            let new_totals =
                load_asset_totals(Source::Output, args.asset_totals_code_hash, args.market_id)?;
            let asset_config = load_asset_config(args.asset_config_code_hash, args.market_id)?;
            let oracle = load_oracle(args.oracle_type_code_hash)?;
            check_oracle(&oracle, &asset_config, now, config.max_oracle_age)?;

            let old_ckb_vault = load_vault_by_asset(
                Source::Input,
                args.vault_type_code_hash,
                asset_config.asset_id,
            )?;
            let new_ckb_vault = load_vault_by_asset(
                Source::Output,
                args.vault_type_code_hash,
                asset_config.asset_id,
            )?;
            let old_base_vault = load_vault_by_asset(
                Source::Input,
                args.vault_type_code_hash,
                old_state.base_asset_id,
            )?;
            let new_base_vault = load_vault_by_asset(
                Source::Output,
                args.vault_type_code_hash,
                old_state.base_asset_id,
            )?;
            check_vault(args.market_id, &old_ckb_vault)?;
            check_vault(args.market_id, &new_ckb_vault)?;
            check_vault(args.market_id, &old_base_vault)?;
            check_vault(args.market_id, &new_base_vault)?;
            if old_totals.asset_id != asset_config.asset_id
                || new_totals.asset_id != asset_config.asset_id
                || old_totals != new_totals
            {
                return Err(Error::BadTransition);
            }

            let base_in = new_base_vault
                .amount
                .checked_sub(old_base_vault.amount)
                .ok_or(Error::BadTransition)?;
            let collateral_out = old_ckb_vault
                .amount
                .checked_sub(new_ckb_vault.amount)
                .ok_or(Error::BadTransition)?;
            if base_in == 0 || collateral_out == 0 {
                return Err(Error::BadTransition);
            }

            let supply_present =
                present_value_supply(old_state.supply_index, old_state.total_supply_principal)
                    .map_err(|_| Error::Core)?;
            let borrow_present =
                present_value_borrow(old_state.borrow_index, old_state.total_borrow_principal)
                    .map_err(|_| Error::Core)?;
            let reserves =
                old_base_vault.amount as i128 - supply_present as i128 + borrow_present as i128;
            if reserves >= 0 && reserves as u128 >= config.target_reserves {
                return Err(Error::BadTransition);
            }

            let collateral_reserves = old_ckb_vault
                .amount
                .checked_sub(old_totals.total_supplied)
                .ok_or(Error::BadTransition)?;
            if collateral_out > collateral_reserves {
                return Err(Error::BadTransition);
            }

            let base_scale = pow10(old_state.base_decimals).map_err(|_| Error::BadState)?;
            let quote = quote_collateral(
                base_in,
                PRICE_SCALE,
                base_scale,
                oracle.price,
                asset_config.scale as u128,
                asset_config.liquidation_factor as u128,
                config.store_front as u128,
            )
            .map_err(|_| Error::Core)?;
            if collateral_out < quote {
                return Err(Error::BadTransition);
            }

            let mut expected_state =
                market_core::accrue(&old_state, &config, now).map_err(|_| Error::Core)?;
            expected_state.total_cash = expected_state
                .total_cash
                .checked_add(base_in)
                .ok_or(Error::BadTransition)?;
            if expected_state != new_state {
                return Err(Error::BadTransition);
            }
        }
        action_tag::ABSORB => {
            let old_position = load_position(Source::Input, args.position_type_code_hash)?;
            let new_position = load_position(Source::Output, args.position_type_code_hash)?;
            let old_vault = load_vault(Source::Input, args.vault_type_code_hash)?;
            let new_vault = load_vault(Source::Output, args.vault_type_code_hash)?;
            let old_totals =
                load_asset_totals(Source::Input, args.asset_totals_code_hash, args.market_id)?;
            let new_totals =
                load_asset_totals(Source::Output, args.asset_totals_code_hash, args.market_id)?;
            let asset_config = load_asset_config(args.asset_config_code_hash, args.market_id)?;
            let oracle = load_oracle(args.oracle_type_code_hash)?;
            check_oracle(&oracle, &asset_config, now, config.max_oracle_age)?;
            check_vault(args.market_id, &old_vault)?;
            check_vault(args.market_id, &new_vault)?;
            if old_vault.asset_id != asset_config.asset_id
                || new_vault.asset_id != asset_config.asset_id
                || old_totals.asset_id != asset_config.asset_id
                || new_totals.asset_id != asset_config.asset_id
            {
                return Err(Error::BadTransition);
            }

            let principal = old_position
                .principal
                .to_i128()
                .map_err(|_| Error::BadState)?;
            let liquidation_collateral = Collateral {
                amount: old_position.collateral[0],
                price: oracle.price,
                scale: asset_config.scale as u128,
                borrow_cf: asset_config.borrow_cf as u128,
                liquidate_cf: asset_config.liquidate_cf as u128,
            };
            if !is_liquidatable(principal, &[liquidation_collateral]).map_err(|_| Error::Core)? {
                return Err(Error::BadTransition);
            }

            let absorb_collateral = AbsorbCollateral {
                amount: old_position.collateral[0],
                price: oracle.price,
                scale: asset_config.scale as u128,
                liquidation_factor: asset_config.liquidation_factor as u128,
            };
            let accrued = market_core::accrue(&old_state, &config, now).map_err(|_| Error::Core)?;
            let (expected_state, expected_position, _result) =
                market_core::absorb(&accrued, &old_position, &[absorb_collateral])
                    .map_err(|_| Error::Core)?;

            let seized = old_position.collateral[0];
            let expected_total = old_totals
                .total_supplied
                .checked_sub(seized)
                .ok_or(Error::BadTransition)?;
            if new_totals.total_supplied != expected_total
                || old_vault.amount != new_vault.amount
                || expected_state != new_state
                || !position_matches(&expected_position, &new_position)
            {
                return Err(Error::BadTransition);
            }
        }
        action_tag::BORROW => {
            let old_position = load_position(Source::Input, args.position_type_code_hash)?;
            let new_position = load_position(Source::Output, args.position_type_code_hash)?;
            let old_vault = load_vault(Source::Input, args.vault_type_code_hash)?;
            let new_vault = load_vault(Source::Output, args.vault_type_code_hash)?;
            check_vault(args.market_id, &old_vault)?;
            check_vault(args.market_id, &new_vault)?;
            check_base_vault(&old_state, &old_vault)?;
            check_base_vault(&new_state, &new_vault)?;

            let paid = old_vault
                .amount
                .checked_sub(new_vault.amount)
                .ok_or(Error::BadTransition)?;
            let oracle = load_oracle(args.oracle_type_code_hash)?;
            let asset_config = load_asset_config(args.asset_config_code_hash, args.market_id)?;
            check_oracle(&oracle, &asset_config, now, config.max_oracle_age)?;

            let collateral = Collateral {
                amount: old_position.collateral[0],
                price: oracle.price,
                scale: asset_config.scale as u128,
                borrow_cf: asset_config.borrow_cf as u128,
                liquidate_cf: asset_config.liquidate_cf as u128,
            };
            let accrued = market_core::accrue(&old_state, &config, now).map_err(|_| Error::Core)?;
            let (expected_state, expected_position) = market_core::borrow_base(
                &accrued,
                &old_position,
                paid,
                &[collateral],
                config.base_borrow_min,
            )
            .map_err(|_| Error::Core)?;
            if expected_state != new_state || !position_matches(&expected_position, &new_position) {
                return Err(Error::BadTransition);
            }
        }
        action_tag::WITHDRAW_BASE => {
            let old_position = load_position(Source::Input, args.position_type_code_hash)?;
            let new_position = load_position(Source::Output, args.position_type_code_hash)?;
            let old_vault = load_vault(Source::Input, args.vault_type_code_hash)?;
            let new_vault = load_vault(Source::Output, args.vault_type_code_hash)?;
            check_vault(args.market_id, &old_vault)?;
            check_vault(args.market_id, &new_vault)?;
            check_base_vault(&old_state, &old_vault)?;
            check_base_vault(&new_state, &new_vault)?;

            let paid = old_vault
                .amount
                .checked_sub(new_vault.amount)
                .ok_or(Error::BadTransition)?;
            let accrued = market_core::accrue(&old_state, &config, now).map_err(|_| Error::Core)?;
            let (expected_state, expected_position) =
                market_core::withdraw_base(&accrued, &old_position, paid)
                    .map_err(|_| Error::Core)?;
            if expected_state != new_state || !position_matches(&expected_position, &new_position) {
                return Err(Error::BadTransition);
            }
        }
        _ => return Err(Error::UnsupportedAction),
    }

    Ok(())
}

fn validate_genesis(args: &MarketArgs, state: &MarketState) -> Result<(), Error> {
    if state.version != 1 || state.market_id != args.market_id {
        return Err(Error::BadState);
    }
    if state.supply_index != BASE_INDEX_SCALE || state.borrow_index != BASE_INDEX_SCALE {
        return Err(Error::BadState);
    }
    if state.total_supply_principal != 0
        || state.total_borrow_principal != 0
        || state.total_cash != 0
        || state.last_accrual_time == 0
    {
        return Err(Error::BadState);
    }
    Ok(())
}

fn load_market_args() -> Result<MarketArgs, Error> {
    let script = load_script().map_err(|_| Error::Syscall)?;
    let raw = script.args().raw_data();
    let args = raw.as_ref();
    if args.len() != 224 {
        return Err(Error::BadArgs);
    }

    let mut market_id = [0u8; 32];
    market_id.copy_from_slice(&args[0..32]);
    let mut config_type_hash = [0u8; 32];
    config_type_hash.copy_from_slice(&args[32..64]);
    let mut position_type_code_hash = [0u8; 32];
    position_type_code_hash.copy_from_slice(&args[64..96]);
    let mut vault_type_code_hash = [0u8; 32];
    vault_type_code_hash.copy_from_slice(&args[96..128]);
    let mut oracle_type_code_hash = [0u8; 32];
    oracle_type_code_hash.copy_from_slice(&args[128..160]);
    let mut asset_config_code_hash = [0u8; 32];
    asset_config_code_hash.copy_from_slice(&args[160..192]);
    let mut asset_totals_code_hash = [0u8; 32];
    asset_totals_code_hash.copy_from_slice(&args[192..224]);

    Ok(MarketArgs {
        market_id,
        config_type_hash,
        position_type_code_hash,
        vault_type_code_hash,
        oracle_type_code_hash,
        asset_config_code_hash,
        asset_totals_code_hash,
    })
}

fn load_market_state(source: Source) -> Result<MarketState, Error> {
    let data = load_cell_data(0, source).map_err(|_| Error::Syscall)?;
    let mut reader = Reader::new(&data);
    let state = MarketState::decode(&mut reader).map_err(|_| Error::BadState)?;
    reader.finish().map_err(|_| Error::BadState)?;
    Ok(state)
}

fn load_position(source: Source, code_hash: [u8; 32]) -> Result<UserPosition, Error> {
    let data = load_cell_by_code_hash(source, code_hash, Error::MissingPosition)?;
    let mut reader = Reader::new(&data);
    let position = UserPosition::decode(&mut reader).map_err(|_| Error::MissingPosition)?;
    reader.finish().map_err(|_| Error::MissingPosition)?;
    Ok(position)
}

fn load_vault(source: Source, code_hash: [u8; 32]) -> Result<Vault, Error> {
    let data = load_cell_by_code_hash(source, code_hash, Error::MissingVault)?;
    decode_vault(&data)
}

fn load_vault_by_asset(
    source: Source,
    code_hash: [u8; 32],
    asset_id: [u8; 32],
) -> Result<Vault, Error> {
    let mut index = 0usize;
    loop {
        match load_cell_type(index, source) {
            Ok(Some(script)) if script.code_hash().as_slice() == code_hash.as_slice() => {
                let data = load_cell_data(index, source).map_err(|_| Error::Syscall)?;
                let vault = decode_vault(&data)?;
                if vault.asset_id == asset_id {
                    return Ok(vault);
                }
                index += 1;
                if index > 256 {
                    return Err(Error::MissingVault);
                }
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

fn decode_vault(data: &[u8]) -> Result<Vault, Error> {
    let mut reader = Reader::new(data);
    let vault = Vault::decode(&mut reader).map_err(|_| Error::MissingVault)?;
    reader.finish().map_err(|_| Error::MissingVault)?;
    Ok(vault)
}

fn position_matches(expected: &UserPosition, actual: &UserPosition) -> bool {
    // The nonce is owned by the position/account authorization layer, not by
    // the market accounting layer.
    expected.version == actual.version
        && expected.market_id == actual.market_id
        && expected.owner_lock_hash == actual.owner_lock_hash
        && expected.principal == actual.principal
        && expected.tracking_index == actual.tracking_index
        && expected.tracking_accrued == actual.tracking_accrued
        && expected.reward_claimed == actual.reward_claimed
        && expected.assets_in == actual.assets_in
        && expected.collateral == actual.collateral
}

fn check_vault(market_id: [u8; 32], vault: &Vault) -> Result<(), Error> {
    if vault.market_id != market_id {
        return Err(Error::BadTransition);
    }
    Ok(())
}

fn check_base_vault(state: &MarketState, vault: &Vault) -> Result<(), Error> {
    if vault.market_id != state.market_id || vault.asset_id != state.base_asset_id {
        return Err(Error::BadTransition);
    }
    Ok(())
}

fn pause_flag_for(action_tag: u8) -> Option<u8> {
    match action_tag {
        action_tag::SUPPLY_BASE | action_tag::SUPPLY_COLLATERAL | action_tag::REPAY => {
            Some(pause_flag::SUPPLY)
        }
        action_tag::WITHDRAW_BASE | action_tag::WITHDRAW_COLLATERAL | action_tag::BORROW => {
            Some(pause_flag::WITHDRAW)
        }
        action_tag::TRANSFER_BASE | action_tag::TRANSFER_COLLATERAL => Some(pause_flag::TRANSFER),
        action_tag::ABSORB => Some(pause_flag::ABSORB),
        action_tag::BUY_COLLATERAL => Some(pause_flag::BUY),
        _ => None,
    }
}

fn load_asset_totals(
    source: Source,
    code_hash: [u8; 32],
    market_id: [u8; 32],
) -> Result<AssetTotals, Error> {
    let data = load_cell_by_code_hash(source, code_hash, Error::BadConfig)?;
    let mut reader = Reader::new(&data);
    let totals = AssetTotals::decode(&mut reader).map_err(|_| Error::BadConfig)?;
    reader.finish().map_err(|_| Error::BadConfig)?;
    if totals.market_id != market_id {
        return Err(Error::BadConfig);
    }
    Ok(totals)
}

fn load_oracle(code_hash: [u8; 32]) -> Result<Oracle, Error> {
    let data = load_cell_by_code_hash(Source::CellDep, code_hash, Error::BadConfig)?;
    let mut reader = Reader::new(&data);
    let oracle = Oracle::decode(&mut reader).map_err(|_| Error::BadConfig)?;
    reader.finish().map_err(|_| Error::BadConfig)?;
    Ok(oracle)
}

fn load_asset_config(code_hash: [u8; 32], market_id: [u8; 32]) -> Result<AssetConfig, Error> {
    let data = load_cell_by_code_hash(Source::CellDep, code_hash, Error::BadConfig)?;
    let mut reader = Reader::new(&data);
    let config = AssetConfig::decode(&mut reader).map_err(|_| Error::BadConfig)?;
    reader.finish().map_err(|_| Error::BadConfig)?;
    if config.market_id != market_id {
        return Err(Error::BadConfig);
    }
    Ok(config)
}

fn check_oracle(
    oracle: &Oracle,
    asset_config: &AssetConfig,
    now: u64,
    max_age: u64,
) -> Result<(), Error> {
    if oracle.asset_id != asset_config.asset_id || oracle.price == 0 {
        return Err(Error::BadConfig);
    }
    if oracle.timestamp > now || now - oracle.timestamp > max_age {
        return Err(Error::BadConfig);
    }
    Ok(())
}

fn load_cell_by_type_hash(
    source: Source,
    type_hash: [u8; 32],
    missing: Error,
) -> Result<alloc::vec::Vec<u8>, Error> {
    let mut index = 0usize;
    loop {
        match load_cell_type_hash(index, source) {
            Ok(Some(hash)) if hash == type_hash => {
                return load_cell_data(index, source).map_err(|_| Error::Syscall);
            }
            Ok(_) => {
                index = index.checked_add(1).ok_or(missing)?;
                if index > 256 {
                    return Err(missing);
                }
            }
            Err(SysError::IndexOutOfBound) => return Err(missing),
            Err(_) => return Err(Error::Syscall),
        }
    }
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
                index = index.checked_add(1).ok_or(missing)?;
                if index > 256 {
                    return Err(missing);
                }
            }
            Err(SysError::IndexOutOfBound) => return Err(missing),
            Err(_) => return Err(Error::Syscall),
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

fn load_config(market_id: [u8; 32], config_type_hash: [u8; 32]) -> Result<MarketConfig, Error> {
    let data = load_cell_by_type_hash(Source::CellDep, config_type_hash, Error::BadConfig)?;
    let mut reader = Reader::new(&data);
    let config = MarketConfig::decode(&mut reader).map_err(|_| Error::BadConfig)?;
    reader.finish().map_err(|_| Error::BadConfig)?;
    if config.market_id != market_id {
        return Err(Error::BadConfig);
    }
    Ok(config)
}

fn load_timestamp() -> Result<u64, Error> {
    let header = load_header(0, Source::HeaderDep).map_err(|_| Error::MissingHeader)?;
    // CKB header timestamps are milliseconds since the Unix epoch. Market
    // math (interest, oracle freshness) is denominated in seconds.
    Ok(header.raw().timestamp().unpack() / 1000)
}
