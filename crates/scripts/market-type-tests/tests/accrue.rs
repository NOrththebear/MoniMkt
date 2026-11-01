//! ckb-testtool integration test.
#![allow(clippy::useless_vec)]

//! End-to-end `Accrue` validation for the market-type script.
//!
//! Build the RISC-V script first:
//! `cargo build -p monimkt-market-type --target riscv64imac-unknown-none-elf --release`

use ckb_testtool::builtin::ALWAYS_SUCCESS;
use ckb_testtool::ckb_hash::blake2b_256;
use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{HeaderBuilder, TransactionBuilder},
    packed::*,
    prelude::*,
};
use ckb_testtool::context::Context;
use monimkt_market_core as core;
use monimkt_schemas::{
    action_tag, Action, Encode, MarketConfig, MarketState, Writer, SCHEMA_VERSION,
};

const MAX_CYCLES: u64 = 50_000_000;
const CAPACITY: u64 = 100_000_000_000; // 1,000 CKB

fn script_path() -> String {
    format!(
        "{}/../../../target/riscv64imac-unknown-none-elf/release/monimkt-market-type",
        env!("CARGO_MANIFEST_DIR")
    )
}

fn encode<T: Encode>(value: &T) -> Bytes {
    let mut writer = Writer::new();
    value.encode(&mut writer);
    writer.into_vec().into()
}

fn config() -> MarketConfig {
    MarketConfig {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        supply_kink: 800_000_000_000_000_000,
        borrow_kink: 800_000_000_000_000_000,
        supply_slope_low: 35_000_000_000_000_000,
        supply_slope_high: 400_000_000_000_000_000,
        supply_base: 10_000_000_000_000_000, // 1% so accrual is visible
        borrow_slope_low: 40_000_000_000_000_000,
        borrow_slope_high: 500_000_000_000_000_000,
        borrow_base: 0,
        store_front: 500_000_000_000_000_000,
        base_borrow_min: 1_000_000_000,
        target_reserves: 10_000_000_000,
        base_min_for_rewards: 0,
        tracking_index_scale: 1_000_000_000_000_000,
        base_tracking_supply_speed: 0,
        base_tracking_borrow_speed: 0,
        max_oracle_age: 3600,
        max_price_deviation: 100_000_000_000_000_000,
        reserved: [0u8; 32],
    }
}

fn genesis(now: u64) -> MarketState {
    MarketState {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        base_asset_id: [2u8; 32],
        base_decimals: 8,
        supply_index: 1_000_000_000_000_000,
        borrow_index: 1_000_000_000_000_000,
        tracking_supply_index: 0,
        tracking_borrow_index: 0,
        total_supply_principal: 0,
        total_borrow_principal: 0,
        total_cash: 0,
        last_accrual_time: now,
        pause_flags: 0,
        asset_count: 0,
        config_hash: [0u8; 32],
        reserved: [0u8; 32],
    }
}

#[test]
fn accrue_transition_is_validated() {
    let market_id = [1u8; 32];
    let start = 1_700_000_000u64;
    let now = start + 31_536_000;
    let old_state = genesis(start);
    let expected_state = core::accrue(&old_state, &config(), now).unwrap();
    assert_ne!(old_state, expected_state);

    let mut context = Context::default();
    let market_bin: Bytes = std::fs::read(script_path())
        .expect("build the RISC-V script first")
        .into();
    let market_code = context.deploy_cell(market_bin);
    let always_success_bin = ALWAYS_SUCCESS.clone();
    let config_code = context.deploy_cell(always_success_bin.clone());
    let lock_code = context.deploy_cell(always_success_bin);

    let lock_script = context.build_script(&lock_code, Bytes::new()).unwrap();

    let config_script = context
        .build_script(&config_code, Bytes::from(market_id.to_vec()))
        .unwrap();
    let config_type_hash: [u8; 32] = blake2b_256(config_script.as_slice());
    let config_out = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(lock_script.clone())
            .type_(Some(config_script).pack())
            .build(),
        encode(&config()),
    );

    let mut market_args = Vec::new();
    market_args.extend_from_slice(&market_id);
    market_args.extend_from_slice(&config_type_hash);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    let market_script = context
        .build_script(&market_code, Bytes::from(market_args))
        .unwrap();

    let input_out = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(lock_script.clone())
            .type_(Some(market_script.clone()).pack())
            .build(),
        encode(&old_state),
    );

    let output = CellOutput::new_builder()
        .capacity(CAPACITY)
        .lock(lock_script)
        .type_(Some(market_script).pack())
        .build();

    let header = HeaderBuilder::default().timestamp(now * 1000).build();
    context.insert_header(header.clone());

    let action = Action {
        tag: action_tag::ACCRUE,
        ..Default::default()
    };
    let witness = WitnessArgs::new_builder()
        .input_type(
            BytesOpt::new_builder()
                .set(Some(encode(&action).pack()))
                .build(),
        )
        .build();

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(input_out).build())
        .output(output)
        .outputs_data(vec![encode(&expected_state)].pack())
        .cell_deps(vec![CellDep::new_builder().out_point(config_out).build()])
        .header_deps(vec![header.hash()])
        .witnesses(vec![witness.as_bytes().pack()])
        .build();

    let tx = context.complete_tx(tx);
    let cycles = context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("accrue transition should pass");
    println!("accrue cycles: {cycles}");
}

#[test]
fn wrong_output_state_is_rejected() {
    let market_id = [1u8; 32];
    let start = 1_700_000_000u64;
    let now = start + 31_536_000;
    let old_state = genesis(start);
    let expected_state = core::accrue(&old_state, &config(), now).unwrap();
    let wrong_state = old_state; // not accrued

    let mut context = Context::default();
    let market_bin: Bytes = std::fs::read(script_path())
        .expect("build the RISC-V script first")
        .into();
    let market_code = context.deploy_cell(market_bin);
    let always_success_bin = ALWAYS_SUCCESS.clone();
    let config_code = context.deploy_cell(always_success_bin.clone());
    let lock_code = context.deploy_cell(always_success_bin);
    let lock_script = context.build_script(&lock_code, Bytes::new()).unwrap();

    let config_script = context
        .build_script(&config_code, Bytes::from(market_id.to_vec()))
        .unwrap();
    let config_type_hash: [u8; 32] = blake2b_256(config_script.as_slice());
    let config_out = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(lock_script.clone())
            .type_(Some(config_script).pack())
            .build(),
        encode(&config()),
    );

    let mut market_args = Vec::new();
    market_args.extend_from_slice(&market_id);
    market_args.extend_from_slice(&config_type_hash);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    let market_script = context
        .build_script(&market_code, Bytes::from(market_args))
        .unwrap();

    let input_out = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(lock_script.clone())
            .type_(Some(market_script.clone()).pack())
            .build(),
        encode(&old_state),
    );
    let output = CellOutput::new_builder()
        .capacity(CAPACITY)
        .lock(lock_script)
        .type_(Some(market_script).pack())
        .build();

    let header = HeaderBuilder::default().timestamp(now * 1000).build();
    context.insert_header(header.clone());

    let action = Action {
        tag: action_tag::ACCRUE,
        ..Default::default()
    };
    let witness = WitnessArgs::new_builder()
        .input_type(
            BytesOpt::new_builder()
                .set(Some(encode(&action).pack()))
                .build(),
        )
        .build();

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(input_out).build())
        .output(output)
        .outputs_data(vec![encode(&wrong_state)].pack())
        .cell_deps(vec![CellDep::new_builder().out_point(config_out).build()])
        .header_deps(vec![header.hash()])
        .witnesses(vec![witness.as_bytes().pack()])
        .build();

    let tx = context.complete_tx(tx);
    let result = context.verify_tx(&tx, MAX_CYCLES);
    assert!(result.is_err(), "wrong output should be rejected");
    let _ = expected_state;
}
