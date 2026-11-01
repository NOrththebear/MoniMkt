//! Genesis creation: MarketState and vault cells.
#![allow(clippy::useless_vec)]

use ckb_testtool::builtin::ALWAYS_SUCCESS;
use ckb_testtool::ckb_types::{bytes::Bytes, core::TransactionBuilder, packed::*, prelude::*};
use ckb_testtool::context::Context;
use monimkt_schemas::{asset_kind, Encode, MarketState, Vault, Writer, SCHEMA_VERSION};

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

#[test]
fn create_market_state_and_vault() {
    let market_id = [1u8; 32];
    let asset_id = [2u8; 32];

    let mut context = Context::default();
    let market_code = context.deploy_cell(bin("monimkt-market-type"));
    let vault_code = context.deploy_cell(bin("monimkt-vault-type"));
    let lock_code = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let lock = context.build_script(&lock_code, Bytes::new()).unwrap();

    let mut market_args = market_id.to_vec();
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    let market_script = context
        .build_script(&market_code, Bytes::from(market_args))
        .unwrap();
    let market_code_hash = script_code_hash(&market_script);

    let mut vault_args = market_id.to_vec();
    vault_args.extend_from_slice(&asset_id);
    vault_args.push(asset_kind::XUDT);
    let vault_script = context
        .build_script(&vault_code, Bytes::from(vault_args))
        .unwrap();
    let vault_code_hash = script_code_hash(&vault_script);

    let vault_lock_code = context.deploy_cell(bin("monimkt-vault-lock"));
    let mut vault_lock_args = market_id.to_vec();
    vault_lock_args.extend_from_slice(&asset_id);
    vault_lock_args.extend_from_slice(&market_code_hash);
    vault_lock_args.extend_from_slice(&vault_code_hash);
    let vault_lock = context
        .build_script(&vault_lock_code, Bytes::from(vault_lock_args))
        .unwrap();

    let state = MarketState {
        version: SCHEMA_VERSION,
        market_id,
        base_asset_id: [4u8; 32],
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
    let vault = Vault {
        version: SCHEMA_VERSION,
        market_id,
        asset_id,
        amount: 0,
        reserved: [0u8; 32],
    };

    let funding = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(lock.clone())
            .build(),
        Bytes::new(),
    );

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(funding).build())
        .output(
            CellOutput::new_builder()
                .capacity(CAPACITY)
                .lock(lock.clone())
                .type_(Some(market_script).pack())
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(CAPACITY)
                .lock(vault_lock)
                .type_(Some(vault_script).pack())
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(CAPACITY)
                .lock(lock)
                .build(),
        )
        .outputs_data(vec![encode(&state), encode(&vault), Bytes::new()].pack())
        .build();

    let tx = context.complete_tx(tx);
    context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("genesis creation should pass");
}
