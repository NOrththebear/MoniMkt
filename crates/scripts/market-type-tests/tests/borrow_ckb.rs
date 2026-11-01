//! Borrow RUSD against CKB collateral, using a CKB/RUSD oracle and asset config.
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
use monimkt_market_core as core;
use monimkt_math::Collateral;
use monimkt_schemas::{
    action_tag, asset_kind, Action, AssetConfig, Encode, MarketConfig, MarketState, Oracle,
    Principal, UserPosition, Vault, Writer, SCHEMA_VERSION,
};

const MAX_CYCLES: u64 = 100_000_000;
const CAPACITY: u64 = 100_000_000_000;
const RUSD: u128 = 100_000_000;
const CKB: u128 = 100_000_000;
const INDEX: u128 = 1_000_000_000_000_000;
const PRICE: u128 = 120_000; // 0.0012 RUSD per CKB

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

fn asset_config() -> AssetConfig {
    AssetConfig {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        asset_id: [2u8; 32],
        price_feed_id: [3u8; 32],
        kind: asset_kind::CKB,
        scale: CKB as u64,
        borrow_cf: 500_000_000_000_000_000,
        liquidate_cf: 600_000_000_000_000_000,
        liquidation_factor: 900_000_000_000_000_000,
        supply_cap: 50_000_000 * CKB,
        reserved: [0u8; 32],
    }
}

fn state(now: u64) -> MarketState {
    MarketState {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        base_asset_id: [4u8; 32],
        base_decimals: 8,
        supply_index: INDEX,
        borrow_index: INDEX,
        tracking_supply_index: 0,
        tracking_borrow_index: 0,
        total_supply_principal: 100 * RUSD,
        total_borrow_principal: 0,
        total_cash: 100 * RUSD,
        last_accrual_time: now,
        pause_flags: 0,
        asset_count: 1,
        config_hash: [0u8; 32],
        reserved: [0u8; 32],
    }
}

fn position() -> UserPosition {
    UserPosition {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        owner_lock_hash: [5u8; 32],
        principal: Principal::ZERO,
        tracking_index: 0,
        tracking_accrued: 0,
        reward_claimed: 0,
        nonce: 0,
        assets_in: 1,
        collateral: [10_000 * CKB, 0, 0, 0, 0, 0, 0, 0],
        reserved: [0u8; 32],
    }
}

fn vault(amount: u128) -> Vault {
    Vault {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        asset_id: [4u8; 32],
        amount,
        reserved: [0u8; 32],
    }
}

struct Fixture {
    context: Context,
    market_script: Script,
    position_script: Script,
    vault_script: Script,
    config_out: OutPoint,
    asset_config_out: OutPoint,
    oracle_out: OutPoint,
    lock_script: Script,
}

fn setup(oracle_timestamp: u64) -> Fixture {
    let market_id = [1u8; 32];
    let asset_id = [2u8; 32];

    let mut context = Context::default();
    let market_code = context.deploy_cell(bin("monimkt-market-type"));
    let position_code = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let vault_code = context.deploy_cell(bin("monimkt-vault-type"));
    let oracle_code = context.deploy_cell(bin("monimkt-oracle-type"));
    let asset_config_code = context.deploy_cell(bin("monimkt-asset-config-type"));
    let config_code = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let lock_code = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let lock_script = context.build_script(&lock_code, Bytes::new()).unwrap();

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
    vault_args.extend_from_slice(&[4u8; 32]); // RUSD base asset
    vault_args.push(asset_kind::XUDT);
    let vault_script = context
        .build_script(&vault_code, Bytes::from(vault_args))
        .unwrap();
    let vault_code_hash = script_code_hash(&vault_script);

    let publisher_set = [6u8; 32];
    let mut oracle_args = asset_id.to_vec();
    oracle_args.extend_from_slice(&publisher_set);
    let oracle_script = context
        .build_script(&oracle_code, Bytes::from(oracle_args))
        .unwrap();
    let oracle_code_hash = script_code_hash(&oracle_script);
    let oracle_out = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(lock_script.clone())
            .type_(Some(oracle_script).pack())
            .build(),
        encode(&Oracle {
            version: SCHEMA_VERSION,
            asset_id,
            price: PRICE,
            exponent: -8,
            timestamp: oracle_timestamp,
            confidence: 0,
            publisher_set_hash: publisher_set,
            reserved: [0u8; 32],
        }),
    );

    let mut asset_config_args = market_id.to_vec();
    asset_config_args.extend_from_slice(&asset_id);
    let asset_config_script = context
        .build_script(&asset_config_code, Bytes::from(asset_config_args))
        .unwrap();
    let asset_config_code_hash = script_code_hash(&asset_config_script);
    let asset_config_out = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(lock_script.clone())
            .type_(Some(asset_config_script).pack())
            .build(),
        encode(&asset_config()),
    );

    let mut market_args = market_id.to_vec();
    market_args.extend_from_slice(&config_type_hash);
    market_args.extend_from_slice(&position_code_hash);
    market_args.extend_from_slice(&vault_code_hash);
    market_args.extend_from_slice(&oracle_code_hash);
    market_args.extend_from_slice(&asset_config_code_hash);
    market_args.extend_from_slice(&[0u8; 32]);
    let market_script = context
        .build_script(&market_code, Bytes::from(market_args))
        .unwrap();

    Fixture {
        context,
        market_script,
        position_script,
        vault_script,
        config_out,
        asset_config_out,
        oracle_out,
        lock_script,
    }
}

fn typed_cell(lock: &Script, type_script: &Script) -> CellOutput {
    CellOutput::new_builder()
        .capacity(CAPACITY)
        .lock(lock.clone())
        .type_(Some(type_script.clone()).pack())
        .build()
}

#[allow(clippy::too_many_arguments)]
fn run_action(
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
        typed_cell(&fixture.lock_script, &fixture.market_script),
        encode(old_state),
    );
    let position_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.position_script),
        encode(old_position),
    );
    let vault_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.vault_script),
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
        .output(typed_cell(&fixture.lock_script, &fixture.market_script))
        .output(typed_cell(&fixture.lock_script, &fixture.position_script))
        .output(typed_cell(&fixture.lock_script, &fixture.vault_script))
        .outputs_data(vec![encode(new_state), encode(new_position), encode(new_vault)].pack())
        .cell_deps(vec![
            CellDep::new_builder()
                .out_point(fixture.config_out.clone())
                .build(),
            CellDep::new_builder()
                .out_point(fixture.asset_config_out.clone())
                .build(),
            CellDep::new_builder()
                .out_point(fixture.oracle_out.clone())
                .build(),
        ])
        .header_deps(vec![header.hash()])
        .witnesses(vec![
            witness.as_bytes().pack(),
            witness.as_bytes().pack(),
            witness.as_bytes().pack(),
        ])
        .build();

    let tx = fixture.context.complete_tx(tx);
    fixture
        .context
        .verify_tx(&tx, MAX_CYCLES)
        .map(|_| ())
        .map_err(|error| format!("{error:?}"))
}

#[test]
fn borrow_against_ckb_succeeds() {
    let now = 1_700_000_000;
    let mut fixture = setup(now);
    let old_state = state(now);
    let old_position = position();
    let old_vault = vault(100 * RUSD);

    let collateral = Collateral {
        amount: old_position.collateral[0],
        price: PRICE,
        scale: CKB,
        borrow_cf: 500_000_000_000_000_000,
        liquidate_cf: 600_000_000_000_000_000,
    };
    let (new_state, new_position) =
        core::borrow_base(&old_state, &old_position, 6 * RUSD, &[collateral], RUSD).unwrap();
    let new_vault = vault(94 * RUSD);

    run_action(
        &mut fixture,
        &old_state,
        &new_state,
        &old_position,
        &new_position,
        &old_vault,
        &new_vault,
        Action {
            tag: action_tag::BORROW,
            amount: 6 * RUSD,
            ..Default::default()
        },
        now,
    )
    .expect("borrow should pass");
}

#[test]
fn stale_oracle_is_rejected() {
    let now = 1_700_000_000;
    let mut fixture = setup(now - 3601);
    let old_state = state(now);
    let old_position = position();
    let old_vault = vault(100 * RUSD);

    let collateral = Collateral {
        amount: old_position.collateral[0],
        price: PRICE,
        scale: CKB,
        borrow_cf: 500_000_000_000_000_000,
        liquidate_cf: 600_000_000_000_000_000,
    };
    let (new_state, new_position) =
        core::borrow_base(&old_state, &old_position, 6 * RUSD, &[collateral], RUSD).unwrap();

    let result = run_action(
        &mut fixture,
        &old_state,
        &new_state,
        &old_position,
        &new_position,
        &old_vault,
        &vault(94 * RUSD),
        Action {
            tag: action_tag::BORROW,
            amount: 6 * RUSD,
            ..Default::default()
        },
        now,
    );
    assert!(result.is_err(), "stale oracle must be rejected");
}

#[test]
fn repay_against_ckb_succeeds() {
    let now = 1_700_000_000;
    let mut fixture = setup(now);

    let mut old_state = state(now);
    old_state.total_borrow_principal = 6 * RUSD;
    old_state.total_cash = 94 * RUSD;

    let mut old_position = position();
    old_position.principal = Principal::from_i128(-(6 * RUSD as i128));

    let old_vault = vault(94 * RUSD);
    let (new_state, new_position) = core::repay_base(&old_state, &old_position, 3 * RUSD).unwrap();
    let new_vault = vault(97 * RUSD);

    run_action(
        &mut fixture,
        &old_state,
        &new_state,
        &old_position,
        &new_position,
        &old_vault,
        &new_vault,
        Action {
            tag: action_tag::REPAY,
            amount: 3 * RUSD,
            ..Default::default()
        },
        now,
    )
    .expect("repay should pass");
}

#[test]
fn borrow_beyond_collateral_factor_is_rejected() {
    let now = 1_700_000_000;
    let mut fixture = setup(now);
    let old_state = state(now);
    let old_position = position();
    let old_vault = vault(100 * RUSD);

    let collateral = Collateral {
        amount: old_position.collateral[0],
        price: PRICE,
        scale: CKB,
        borrow_cf: 500_000_000_000_000_000,
        liquidate_cf: 600_000_000_000_000_000,
    };
    let (new_state, new_position) =
        core::borrow_base(&old_state, &old_position, 6 * RUSD, &[collateral], RUSD).unwrap();

    // Claim a 7 RUSD borrow while only moving 6 RUSD of cash: the market
    // script must recompute from the vault delta and reject.
    let result = run_action(
        &mut fixture,
        &old_state,
        &new_state,
        &old_position,
        &new_position,
        &old_vault,
        &vault(93 * RUSD),
        Action {
            tag: action_tag::BORROW,
            amount: 6 * RUSD,
            ..Default::default()
        },
        now,
    );
    assert!(
        result.is_err(),
        "wrong cash delta / borrow should be rejected"
    );
}
