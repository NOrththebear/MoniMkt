//! Base-token custody lock: token delta must equal vault-state delta.
#![allow(clippy::useless_vec)]

use ckb_testtool::builtin::ALWAYS_SUCCESS;
use ckb_testtool::ckb_types::{bytes::Bytes, core::TransactionBuilder, packed::*, prelude::*};
use ckb_testtool::context::Context;
use monimkt_schemas::{Encode, MarketState, Vault, Writer, SCHEMA_VERSION};

const MAX_CYCLES: u64 = 100_000_000;
const CAPACITY: u64 = 100_000_000_000;

fn bin(name: &str) -> Bytes {
    std::fs::read(format!(
        "{}/../../../target/riscv64imac-unknown-none-elf/release/{}",
        env!("CARGO_MANIFEST_DIR"),
        name
    ))
    .unwrap_or_else(|_| panic!("build the RISC-V script {name} first"))
    .into()
}

fn encode<T: Encode>(value: &T) -> Bytes {
    let mut writer = Writer::new();
    value.encode(&mut writer);
    writer.into_vec().into()
}

fn script_code_hash(script: &Script) -> [u8; 32] {
    script
        .code_hash()
        .as_slice()
        .try_into()
        .expect("32-byte code hash")
}

fn amount_data(amount: u128) -> Bytes {
    Bytes::from(amount.to_le_bytes().to_vec())
}

fn run(old_token: u128, new_token: u128, old_vault: u128, new_vault: u128) -> Result<(), String> {
    let market_id = [1u8; 32];
    let mut context = Context::default();

    let base_lock_code = context.deploy_cell(bin("monimkt-base-token-lock"));
    let vault_type_code = context.deploy_cell(bin("monimkt-vault-type"));
    let token_type_code = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_code = context.deploy_cell(ALWAYS_SUCCESS.clone());

    let always_lock = context.build_script(&always_code, Bytes::new()).unwrap();

    let market_script = context
        .build_script(&always_code, Bytes::from(market_id.to_vec()))
        .unwrap();
    let market_code_hash = script_code_hash(&market_script);

    let token_script = context
        .build_script(&token_type_code, Bytes::from(vec![9u8; 32]))
        .unwrap();
    let asset_id: [u8; 32] = token_script
        .calc_script_hash()
        .as_slice()
        .try_into()
        .unwrap();

    let mut vault_args = market_id.to_vec();
    vault_args.extend_from_slice(&asset_id);
    vault_args.push(0); // XUDT
    let vault_script = context
        .build_script(&vault_type_code, Bytes::from(vault_args))
        .unwrap();
    let vault_type_hash = script_code_hash(&vault_script);

    let mut lock_args = market_id.to_vec();
    lock_args.extend_from_slice(&asset_id);
    lock_args.extend_from_slice(&market_code_hash);
    lock_args.extend_from_slice(&vault_type_hash);
    let base_token_lock = context
        .build_script(&base_lock_code, Bytes::from(lock_args))
        .unwrap();

    let market_state = MarketState {
        version: SCHEMA_VERSION,
        market_id,
        base_asset_id: asset_id,
        base_decimals: 8,
        supply_index: 1_000_000_000_000_000,
        borrow_index: 1_000_000_000_000_000,
        tracking_supply_index: 0,
        tracking_borrow_index: 0,
        total_supply_principal: 0,
        total_borrow_principal: 0,
        total_cash: 0,
        last_accrual_time: 1_700_000_000,
        pause_flags: 0,
        asset_count: 1,
        config_hash: [0u8; 32],
        reserved: [0u8; 32],
    };
    let old_vault_data = Vault {
        version: SCHEMA_VERSION,
        market_id,
        asset_id,
        amount: old_vault,
        reserved: [0u8; 32],
    };
    let new_vault_data = Vault {
        amount: new_vault,
        ..old_vault_data
    };

    let market_in = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(always_lock.clone())
            .type_(Some(market_script.clone()).pack())
            .build(),
        encode(&market_state),
    );
    let vault_in = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(always_lock.clone())
            .type_(Some(vault_script.clone()).pack())
            .build(),
        encode(&old_vault_data),
    );
    let token_in = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(base_token_lock.clone())
            .type_(Some(token_script.clone()).pack())
            .build(),
        amount_data(old_token),
    );
    let funding = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(always_lock.clone())
            .build(),
        Bytes::new(),
    );

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(market_in).build())
        .input(CellInput::new_builder().previous_output(vault_in).build())
        .input(CellInput::new_builder().previous_output(token_in).build())
        .input(CellInput::new_builder().previous_output(funding).build())
        .output(
            CellOutput::new_builder()
                .capacity(CAPACITY)
                .lock(always_lock.clone())
                .type_(Some(market_script).pack())
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(CAPACITY)
                .lock(always_lock.clone())
                .type_(Some(vault_script).pack())
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(CAPACITY)
                .lock(base_token_lock)
                .type_(Some(token_script).pack())
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(CAPACITY)
                .lock(always_lock)
                .build(),
        )
        .outputs_data(
            vec![
                encode(&market_state),
                encode(&new_vault_data),
                amount_data(new_token),
                Bytes::new(),
            ]
            .pack(),
        )
        .build();

    let tx = context.complete_tx(tx);
    context
        .verify_tx(&tx, MAX_CYCLES)
        .map(|_| ())
        .map_err(|error| format!("{error:?}"))
}

#[test]
fn matching_token_and_vault_delta_passes() {
    run(100, 200, 100, 200).expect("matching delta should pass");
}

#[test]
fn token_delta_mismatch_is_rejected() {
    let result = run(100, 200, 100, 150);
    assert!(result.is_err(), "mismatched token delta must be rejected");
}
