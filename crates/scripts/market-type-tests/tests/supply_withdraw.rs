//! ckb-testtool integration test.
#![allow(clippy::useless_vec)]

//! `SupplyBase` / `WithdrawBase` accounting tests.
//!
//! Position and vault type scripts are stubs here; the market-type script is the
//! accounting guard. Authorization and custody arrive in M4.

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
    action_tag, asset_kind, Action, Encode, MarketConfig, MarketState, Principal, UserPosition,
    Vault, Writer, SCHEMA_VERSION,
};

const MAX_CYCLES: u64 = 100_000_000;
const CAPACITY: u64 = 100_000_000_000; // 1,000 CKB
const RUSD: u128 = 100_000_000;
const INDEX: u128 = 1_000_000_000_000_000;

fn script_path() -> String {
    format!(
        "{}/../../../target/riscv64imac-unknown-none-elf/release/monimkt-market-type",
        env!("CARGO_MANIFEST_DIR")
    )
}

fn vault_type_path() -> String {
    format!(
        "{}/../../../target/riscv64imac-unknown-none-elf/release/monimkt-vault-type",
        env!("CARGO_MANIFEST_DIR")
    )
}

fn script_code_hash(script: &Script) -> [u8; 32] {
    script
        .code_hash()
        .as_slice()
        .try_into()
        .expect("32-byte code hash")
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
        base_borrow_min: RUSD,
        target_reserves: 10_000 * RUSD,
        base_min_for_rewards: 0,
        tracking_index_scale: INDEX as u64,
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
        supply_index: INDEX,
        borrow_index: INDEX,
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

fn empty_position() -> UserPosition {
    UserPosition {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        owner_lock_hash: [4u8; 32],
        principal: Principal::ZERO,
        tracking_index: 0,
        tracking_accrued: 0,
        reward_claimed: 0,
        nonce: 0,
        assets_in: 0,
        collateral: [0u128; 8],
        reserved: [0u8; 32],
    }
}

fn empty_vault() -> Vault {
    Vault {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        asset_id: [2u8; 32],
        amount: 0,
        reserved: [0u8; 32],
    }
}

struct Fixture {
    context: Context,
    lock_script: Script,
    market_script: Script,
    config_out: OutPoint,
    position_script: Script,
    vault_script: Script,
}

fn setup() -> Fixture {
    let mut context = Context::default();
    let market_bin: Bytes = std::fs::read(script_path())
        .expect("build the RISC-V script first")
        .into();
    let vault_bin: Bytes = std::fs::read(vault_type_path())
        .expect("build the RISC-V vault-type script first")
        .into();
    let market_code = context.deploy_cell(market_bin);
    let stub = ALWAYS_SUCCESS.clone();
    let config_code = context.deploy_cell(stub.clone());
    let position_code = context.deploy_cell(stub);
    let vault_code = context.deploy_cell(vault_bin);
    let lock_code = context.deploy_cell(ALWAYS_SUCCESS.clone());

    let lock_script = context.build_script(&lock_code, Bytes::new()).unwrap();
    let market_id = [1u8; 32];

    // The stub scripts share the same always-success code, so give them
    // distinct args to make their type script hashes distinct.
    let mut config_args = market_id.to_vec();
    config_args.push(0);
    let config_script = context
        .build_script(&config_code, Bytes::from(config_args))
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

    let mut position_args = market_id.to_vec();
    position_args.push(1);
    let position_script = context
        .build_script(&position_code, Bytes::from(position_args))
        .unwrap();
    let position_code_hash = script_code_hash(&position_script);

    let mut vault_args = market_id.to_vec();
    vault_args.extend_from_slice(&[2u8; 32]);
    vault_args.push(asset_kind::XUDT);
    let vault_script = context
        .build_script(&vault_code, Bytes::from(vault_args))
        .unwrap();
    let vault_code_hash = script_code_hash(&vault_script);

    let mut market_args = Vec::new();
    market_args.extend_from_slice(&market_id);
    market_args.extend_from_slice(&config_type_hash);
    market_args.extend_from_slice(&position_code_hash);
    market_args.extend_from_slice(&vault_code_hash);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    market_args.extend_from_slice(&[0u8; 32]);
    let market_script = context
        .build_script(&market_code, Bytes::from(market_args))
        .unwrap();

    Fixture {
        context,
        lock_script,
        market_script,
        config_out,
        position_script,
        vault_script,
    }
}

fn typed_cell(lock: &Script, type_script: &Script, capacity: u64) -> CellOutput {
    CellOutput::new_builder()
        .capacity(capacity)
        .lock(lock.clone())
        .type_(Some(type_script.clone()).pack())
        .build()
}

#[allow(clippy::too_many_arguments)]
fn run_transition(
    fixture: &mut Fixture,
    old_state: &MarketState,
    new_state: &MarketState,
    old_position: &UserPosition,
    new_position: &UserPosition,
    old_vault: &Vault,
    new_vault: &Vault,
    action: Action,
    now: u64,
) -> Result<(), String> {
    let state_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.market_script, CAPACITY),
        encode(old_state),
    );
    let position_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.position_script, CAPACITY),
        encode(old_position),
    );
    let vault_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.vault_script, CAPACITY),
        encode(old_vault),
    );

    let header = HeaderBuilder::default().timestamp(now * 1000).build();
    fixture.context.insert_header(header.clone());

    let witness = WitnessArgs::new_builder()
        .input_type(
            BytesOpt::new_builder()
                .set(Some(encode(&action).pack()))
                .build(),
        )
        .build();

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(state_in).build())
        .input(
            CellInput::new_builder()
                .previous_output(position_in)
                .build(),
        )
        .input(CellInput::new_builder().previous_output(vault_in).build())
        .output(typed_cell(
            &fixture.lock_script,
            &fixture.market_script,
            CAPACITY,
        ))
        .output(typed_cell(
            &fixture.lock_script,
            &fixture.position_script,
            CAPACITY,
        ))
        .output(typed_cell(
            &fixture.lock_script,
            &fixture.vault_script,
            CAPACITY,
        ))
        .outputs_data(vec![encode(new_state), encode(new_position), encode(new_vault)].pack())
        .cell_deps(vec![CellDep::new_builder()
            .out_point(fixture.config_out.clone())
            .build()])
        .header_deps(vec![header.hash()])
        .witnesses(vec![witness.as_bytes().pack()])
        .build();

    let tx = fixture.context.complete_tx(tx);
    fixture
        .context
        .verify_tx(&tx, MAX_CYCLES)
        .map(|_| ())
        .map_err(|error| format!("{error:?}"))
}

#[test]
fn supply_base_updates_accounting() {
    let mut fixture = setup();
    let now = 1_700_000_000;
    let old_state = genesis(now);
    let old_position = empty_position();
    let old_vault = empty_vault();
    let (new_state, new_position) =
        core::supply_base(&old_state, &old_position, 100 * RUSD).unwrap();
    let new_vault = Vault {
        amount: 100 * RUSD,
        ..old_vault
    };

    let action = Action {
        tag: action_tag::SUPPLY_BASE,
        amount: 100 * RUSD,
        ..Default::default()
    };

    run_transition(
        &mut fixture,
        &old_state,
        &new_state,
        &old_position,
        &new_position,
        &old_vault,
        &new_vault,
        action,
        now,
    )
    .expect("supply should pass");
}

#[test]
fn withdraw_base_updates_accounting() {
    let mut fixture = setup();
    let now = 1_700_000_000;
    let old_state = genesis(now);
    let old_position = empty_position();
    let old_vault = empty_vault();
    let (state_after_supply, position_after_supply) =
        core::supply_base(&old_state, &old_position, 100 * RUSD).unwrap();
    let vault_after_supply = Vault {
        amount: 100 * RUSD,
        ..old_vault
    };
    let (new_state, new_position) =
        core::withdraw_base(&state_after_supply, &position_after_supply, 40 * RUSD).unwrap();
    let new_vault = Vault {
        amount: 60 * RUSD,
        ..old_vault
    };

    let action = Action {
        tag: action_tag::WITHDRAW_BASE,
        amount: 40 * RUSD,
        ..Default::default()
    };

    run_transition(
        &mut fixture,
        &state_after_supply,
        &new_state,
        &position_after_supply,
        &new_position,
        &vault_after_supply,
        &new_vault,
        action,
        now,
    )
    .expect("withdraw should pass");
}

#[test]
fn wrong_supply_position_is_rejected() {
    let mut fixture = setup();
    let now = 1_700_000_000;
    let old_state = genesis(now);
    let old_position = empty_position();
    let old_vault = empty_vault();
    let (new_state, new_position) =
        core::supply_base(&old_state, &old_position, 100 * RUSD).unwrap();
    let wrong_position = old_position;
    let new_vault = Vault {
        amount: 100 * RUSD,
        ..old_vault
    };

    let action = Action {
        tag: action_tag::SUPPLY_BASE,
        amount: 100 * RUSD,
        ..Default::default()
    };

    let result = run_transition(
        &mut fixture,
        &old_state,
        &new_state,
        &old_position,
        &wrong_position,
        &old_vault,
        &new_vault,
        action,
        now,
    );
    assert!(result.is_err(), "wrong position should be rejected");
    let _ = new_position;
}
