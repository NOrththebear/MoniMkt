//! Pause-flag enforcement and the governance PAUSE action.
#![allow(clippy::useless_vec)]

use ckb_testtool::builtin::ALWAYS_SUCCESS;
use ckb_testtool::ckb_hash::blake2b_256;
use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{HeaderBuilder, TransactionBuilder},
    packed::*,
    prelude::*,
};
use ckb_testtool::context::Context;
use monimkt_schemas::{
    action_tag, pause_flag, Action, Encode, MarketConfig, MarketState, Writer, SCHEMA_VERSION,
};

const MAX_CYCLES: u64 = 100_000_000;
const CAPACITY: u64 = 100_000_000_000;
const INDEX: u128 = 1_000_000_000_000_000;

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

fn config() -> MarketConfig {
    MarketConfig {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        supply_kink: 800_000_000_000_000_000,
        borrow_kink: 800_000_000_000_000_000,
        supply_slope_low: 35_000_000_000_000_000,
        supply_slope_high: 400_000_000_000_000_000,
        supply_base: 0,
        borrow_slope_low: 40_000_000_000_000_000,
        borrow_slope_high: 500_000_000_000_000_000,
        borrow_base: 0,
        store_front: 500_000_000_000_000_000,
        base_borrow_min: 1_000_000_000,
        target_reserves: 10_000_000_000,
        base_min_for_rewards: 0,
        tracking_index_scale: INDEX as u64,
        base_tracking_supply_speed: 0,
        base_tracking_borrow_speed: 0,
        max_oracle_age: 3600,
        max_price_deviation: 100_000_000_000_000_000,
        reserved: [0u8; 32],
    }
}

fn state(now: u64, pause_flags: u8) -> MarketState {
    MarketState {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        base_asset_id: [2u8; 32],
        base_decimals: 8,
        supply_index: INDEX,
        borrow_index: INDEX,
        tracking_supply_index: 0,
        tracking_borrow_index: 0,
        total_supply_principal: 0,
        total_borrow_principal: 0,
        total_cash: 0,
        last_accrual_time: now,
        pause_flags,
        asset_count: 0,
        config_hash: [0u8; 32],
        reserved: [0u8; 32],
    }
}

fn setup() -> (Context, Script, OutPoint) {
    let market_id = [1u8; 32];
    let mut context = Context::default();
    let market_code = context.deploy_cell(bin("monimkt-market-type"));
    let config_code = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let lock_code = context.deploy_cell(ALWAYS_SUCCESS.clone());
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

    (context, market_script, config_out)
}

fn run(
    old_state: &MarketState,
    new_state: &MarketState,
    action: Action,
    now: u64,
) -> Result<(), String> {
    let (mut context, market_script, config_out) = setup();
    let lock_code = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let lock_script = context.build_script(&lock_code, Bytes::new()).unwrap();
    let input = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(lock_script.clone())
            .type_(Some(market_script.clone()).pack())
            .build(),
        encode(old_state),
    );
    let output = CellOutput::new_builder()
        .capacity(CAPACITY)
        .lock(lock_script)
        .type_(Some(market_script).pack())
        .build();

    let header = HeaderBuilder::default().timestamp(now * 1000).build();
    context.insert_header(header.clone());

    let witness = WitnessArgs::new_builder()
        .input_type(
            BytesOpt::new_builder()
                .set(Some(encode(&action).pack()))
                .build(),
        )
        .build();

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(input).build())
        .output(output)
        .outputs_data(vec![encode(new_state)].pack())
        .cell_deps(vec![CellDep::new_builder().out_point(config_out).build()])
        .header_deps(vec![header.hash()])
        .witnesses(vec![witness.as_bytes().pack()])
        .build();

    let tx = context.complete_tx(tx);
    context
        .verify_tx(&tx, MAX_CYCLES)
        .map(|_| ())
        .map_err(|error| format!("{error:?}"))
}

#[test]
fn pause_action_updates_flags() {
    let now = 1_700_000_000;
    let old = state(now, 0);
    let mut new = old;
    new.pause_flags = pause_flag::SUPPLY;
    let action = Action {
        tag: action_tag::PAUSE,
        flags: pause_flag::SUPPLY,
        ..Default::default()
    };
    run(&old, &new, action, now).expect("pause action should pass");
}

#[test]
fn paused_action_is_rejected() {
    let now = 1_700_000_000;
    let old = state(now, pause_flag::SUPPLY);
    let new = old;
    let action = Action {
        tag: action_tag::SUPPLY_BASE,
        amount: 1,
        ..Default::default()
    };
    let result = run(&old, &new, action, now);
    assert!(result.is_err(), "paused supply must be rejected");
}
