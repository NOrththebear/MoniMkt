//! Supply CKB collateral: position, vault, asset totals, and capacity checks.
#![allow(clippy::useless_vec)]

use ckb_testtool::builtin::ALWAYS_SUCCESS;
use ckb_testtool::ckb_hash::blake2b_256;
use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{Capacity, HeaderBuilder, TransactionBuilder},
    packed::*,
    prelude::*,
};
use ckb_testtool::context::Context;
use monimkt_market_core as core;
use monimkt_math::AbsorbCollateral;
use monimkt_schemas::{
    action_tag, asset_kind, Action, AssetConfig, AssetTotals, Encode, MarketConfig, MarketState,
    Oracle, Principal, UserPosition, Vault, Writer, SCHEMA_VERSION,
};

const MAX_CYCLES: u64 = 10_000_000;
const CAPACITY: u64 = 100_000_000_000;
const RUSD: u128 = 100_000_000;
const CKB: u128 = 100_000_000;
const INDEX: u128 = 1_000_000_000_000_000;
const COLLATERAL: u128 = 10_000 * CKB;

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
        total_supply_principal: 0,
        total_borrow_principal: 0,
        total_cash: 0,
        last_accrual_time: now,
        pause_flags: 0,
        asset_count: 1,
        config_hash: [0u8; 32],
        reserved: [0u8; 32],
    }
}

fn position(collateral: u128) -> UserPosition {
    UserPosition {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        owner_lock_hash: [5u8; 32],
        principal: Principal::ZERO,
        tracking_index: 0,
        tracking_accrued: 0,
        reward_claimed: 0,
        nonce: 0,
        assets_in: if collateral == 0 { 0 } else { 1 },
        collateral: [collateral, 0, 0, 0, 0, 0, 0, 0],
        reserved: [0u8; 32],
    }
}

fn vault_for(asset_id: [u8; 32], amount: u128) -> Vault {
    Vault {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        asset_id,
        amount,
        reserved: [0u8; 32],
    }
}

fn vault(amount: u128) -> Vault {
    vault_for([2u8; 32], amount)
}

fn totals(amount: u128) -> AssetTotals {
    AssetTotals {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        asset_id: [2u8; 32],
        total_supplied: amount,
        reserved: [0u8; 32],
    }
}

fn vault_cell(lock: &Script, type_script: &Script, amount: u128) -> CellOutput {
    let data = encode(&vault(amount));
    let base = CellOutput::new_builder()
        .capacity(0u64)
        .lock(lock.clone())
        .type_(Some(type_script.clone()).pack())
        .build();
    let occupied = base
        .occupied_capacity(Capacity::bytes(data.len()).unwrap())
        .unwrap()
        .as_u64();
    base.as_builder().capacity(occupied + amount as u64).build()
}

fn typed_cell(lock: &Script, type_script: &Script) -> CellOutput {
    CellOutput::new_builder()
        .capacity(CAPACITY)
        .lock(lock.clone())
        .type_(Some(type_script.clone()).pack())
        .build()
}

struct Fixture {
    context: Context,
    market_script: Script,
    position_script: Script,
    vault_script: Script,
    base_vault_script: Script,
    totals_script: Script,
    asset_config_out: OutPoint,
    oracle_out: OutPoint,
    config_out: OutPoint,
    lock_script: Script,
}

fn setup(oracle_price: u128) -> Fixture {
    let market_id = [1u8; 32];
    let asset_id = [2u8; 32];

    let mut context = Context::default();
    let market_code = context.deploy_cell(bin("monimkt-market-type"));
    let position_code = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let vault_code = context.deploy_cell(bin("monimkt-vault-type"));
    let asset_config_code = context.deploy_cell(bin("monimkt-asset-config-type"));
    let asset_totals_code = context.deploy_cell(bin("monimkt-asset-totals-type"));
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
    vault_args.extend_from_slice(&asset_id);
    vault_args.push(asset_kind::CKB);
    let vault_script = context
        .build_script(&vault_code, Bytes::from(vault_args))
        .unwrap();
    let vault_code_hash = script_code_hash(&vault_script);

    let mut base_vault_args = market_id.to_vec();
    base_vault_args.extend_from_slice(&[4u8; 32]);
    base_vault_args.push(asset_kind::XUDT);
    let base_vault_script = context
        .build_script(&vault_code, Bytes::from(base_vault_args))
        .unwrap();

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

    let oracle_code = context.deploy_cell(bin("monimkt-oracle-type"));
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
            price: oracle_price,
            exponent: -8,
            timestamp: 1_700_000_000,
            confidence: 0,
            publisher_set_hash: publisher_set,
            reserved: [0u8; 32],
        }),
    );

    let mut totals_args = market_id.to_vec();
    totals_args.extend_from_slice(&asset_id);
    let totals_script = context
        .build_script(&asset_totals_code, Bytes::from(totals_args))
        .unwrap();
    let totals_code_hash = script_code_hash(&totals_script);

    let mut market_args = market_id.to_vec();
    market_args.extend_from_slice(&config_type_hash);
    market_args.extend_from_slice(&position_code_hash);
    market_args.extend_from_slice(&vault_code_hash);
    market_args.extend_from_slice(&oracle_code_hash);
    market_args.extend_from_slice(&asset_config_code_hash);
    market_args.extend_from_slice(&totals_code_hash);
    let market_script = context
        .build_script(&market_code, Bytes::from(market_args))
        .unwrap();

    Fixture {
        context,
        market_script,
        position_script,
        vault_script,
        base_vault_script,
        totals_script,
        asset_config_out,
        oracle_out,
        config_out,
        lock_script,
    }
}

#[test]
fn supply_ckb_collateral_updates_position_vault_and_totals() {
    let now = 1_700_000_000;
    let mut fixture = setup(50_000);
    let old_state = state(now);
    let old_position = position(0);
    let old_vault = vault(0);
    let old_totals = totals(0);

    let mut new_position = old_position;
    core::supply_collateral(&mut new_position, 0, COLLATERAL).unwrap();
    let new_vault = vault(COLLATERAL);
    let new_totals = totals(COLLATERAL);
    let new_state = core::accrue(&old_state, &config(), now).unwrap();

    let old_vault_cell = vault_cell(&fixture.lock_script, &fixture.vault_script, 0);
    let new_vault_cell = vault_cell(&fixture.lock_script, &fixture.vault_script, COLLATERAL);

    let state_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.market_script),
        encode(&old_state),
    );
    let position_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.position_script),
        encode(&old_position),
    );
    let vault_in = fixture
        .context
        .create_cell(old_vault_cell.clone(), encode(&old_vault));
    let totals_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.totals_script),
        encode(&old_totals),
    );

    // Funding input supplies the extra CKB capacity for the vault.
    let funding_capacity = COLLATERAL as u64 + 1_000 * CKB as u64;
    let funding_in = fixture.context.create_cell(
        CellOutput::new_builder()
            .capacity(funding_capacity)
            .lock(fixture.lock_script.clone())
            .build(),
        Bytes::new(),
    );

    let header = HeaderBuilder::default().timestamp(now * 1000).build();
    fixture.context.insert_header(header.clone());

    let action = Action {
        tag: action_tag::SUPPLY_COLLATERAL,
        asset_index: 0,
        amount: COLLATERAL,
        ..Default::default()
    };
    let witness = WitnessArgs::new_builder()
        .input_type(
            BytesOpt::new_builder()
                .set(Some(encode(&action).pack()))
                .build(),
        )
        .build();

    let change_capacity = funding_capacity - COLLATERAL as u64;
    let change = CellOutput::new_builder()
        .capacity(change_capacity)
        .lock(fixture.lock_script.clone())
        .build();

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(state_in).build())
        .input(
            CellInput::new_builder()
                .previous_output(position_in)
                .build(),
        )
        .input(CellInput::new_builder().previous_output(vault_in).build())
        .input(CellInput::new_builder().previous_output(totals_in).build())
        .input(CellInput::new_builder().previous_output(funding_in).build())
        .output(typed_cell(&fixture.lock_script, &fixture.market_script))
        .output(typed_cell(&fixture.lock_script, &fixture.position_script))
        .output(new_vault_cell)
        .output(typed_cell(&fixture.lock_script, &fixture.totals_script))
        .output(change)
        .outputs_data(
            vec![
                encode(&new_state),
                encode(&new_position),
                encode(&new_vault),
                encode(&new_totals),
                Bytes::new(),
            ]
            .pack(),
        )
        .cell_deps(vec![
            CellDep::new_builder()
                .out_point(fixture.config_out.clone())
                .build(),
            CellDep::new_builder()
                .out_point(fixture.asset_config_out.clone())
                .build(),
        ])
        .header_deps(vec![header.hash()])
        .witnesses(vec![
            witness.as_bytes().pack(),
            witness.as_bytes().pack(),
            witness.as_bytes().pack(),
            witness.as_bytes().pack(),
            witness.as_bytes().pack(),
        ])
        .build();

    let tx = fixture.context.complete_tx(tx);
    let cycles = fixture
        .context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("supply collateral should pass");
    println!("supply collateral cycles: {cycles}");
    let _ = old_vault;
}

#[test]
fn withdraw_ckb_collateral_updates_position_vault_and_totals() {
    let now = 1_700_000_000;
    let mut fixture = setup(50_000);
    let old_state = state(now);
    let old_position = position(COLLATERAL);
    let old_vault = vault(COLLATERAL);
    let old_totals = totals(COLLATERAL);

    let withdraw_amount = 4_000 * CKB;
    let mut new_position = old_position;
    core::withdraw_collateral(&mut new_position, 0, withdraw_amount).unwrap();
    let new_vault = vault(COLLATERAL - withdraw_amount);
    let new_totals = totals(COLLATERAL - withdraw_amount);
    let new_state = core::accrue(&old_state, &config(), now).unwrap();

    let old_vault_cell = vault_cell(&fixture.lock_script, &fixture.vault_script, COLLATERAL);
    let new_vault_cell = vault_cell(
        &fixture.lock_script,
        &fixture.vault_script,
        COLLATERAL - withdraw_amount,
    );

    let state_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.market_script),
        encode(&old_state),
    );
    let position_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.position_script),
        encode(&old_position),
    );
    let vault_in = fixture
        .context
        .create_cell(old_vault_cell, encode(&old_vault));
    let totals_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.totals_script),
        encode(&old_totals),
    );

    let header = HeaderBuilder::default().timestamp(now * 1000).build();
    fixture.context.insert_header(header.clone());

    let action = Action {
        tag: action_tag::WITHDRAW_COLLATERAL,
        asset_index: 0,
        amount: withdraw_amount,
        ..Default::default()
    };
    let witness = WitnessArgs::new_builder()
        .input_type(
            BytesOpt::new_builder()
                .set(Some(encode(&action).pack()))
                .build(),
        )
        .build();

    let user_out = CellOutput::new_builder()
        .capacity(withdraw_amount as u64)
        .lock(fixture.lock_script.clone())
        .build();

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(state_in).build())
        .input(
            CellInput::new_builder()
                .previous_output(position_in)
                .build(),
        )
        .input(CellInput::new_builder().previous_output(vault_in).build())
        .input(CellInput::new_builder().previous_output(totals_in).build())
        .output(typed_cell(&fixture.lock_script, &fixture.market_script))
        .output(typed_cell(&fixture.lock_script, &fixture.position_script))
        .output(new_vault_cell)
        .output(typed_cell(&fixture.lock_script, &fixture.totals_script))
        .output(user_out)
        .outputs_data(
            vec![
                encode(&new_state),
                encode(&new_position),
                encode(&new_vault),
                encode(&new_totals),
                Bytes::new(),
            ]
            .pack(),
        )
        .cell_deps(vec![
            CellDep::new_builder()
                .out_point(fixture.config_out.clone())
                .build(),
            CellDep::new_builder()
                .out_point(fixture.asset_config_out.clone())
                .build(),
        ])
        .header_deps(vec![header.hash()])
        .witnesses(vec![
            witness.as_bytes().pack(),
            witness.as_bytes().pack(),
            witness.as_bytes().pack(),
            witness.as_bytes().pack(),
        ])
        .build();

    let tx = fixture.context.complete_tx(tx);
    fixture
        .context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("withdraw collateral should pass");
}

#[test]
fn absorb_underwater_ckb_position() {
    let now = 1_700_000_000;
    let mut fixture = setup(50_000);

    let mut old_state = state(now);
    old_state.total_supply_principal = 100 * RUSD;
    old_state.total_borrow_principal = 6 * RUSD;
    old_state.total_cash = 94 * RUSD;

    let mut old_position = position(COLLATERAL);
    old_position.principal = Principal::from_i128(-(6 * RUSD as i128));
    let old_vault = vault(COLLATERAL);
    let old_totals = totals(COLLATERAL);

    let absorb_collateral = AbsorbCollateral {
        amount: COLLATERAL,
        price: 50_000,
        scale: CKB,
        liquidation_factor: 900_000_000_000_000_000,
    };
    let (new_state, new_position, result) =
        core::absorb(&old_state, &old_position, &[absorb_collateral]).unwrap();
    assert_eq!(result.residual, 0);
    let new_vault = vault(COLLATERAL); // absorb does not move CKB
    let new_totals = totals(0);

    let old_vault_cell = vault_cell(&fixture.lock_script, &fixture.vault_script, COLLATERAL);
    let new_vault_cell = vault_cell(&fixture.lock_script, &fixture.vault_script, COLLATERAL);

    let state_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.market_script),
        encode(&old_state),
    );
    let position_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.position_script),
        encode(&old_position),
    );
    let vault_in = fixture
        .context
        .create_cell(old_vault_cell, encode(&old_vault));
    let totals_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.totals_script),
        encode(&old_totals),
    );

    let header = HeaderBuilder::default().timestamp(now * 1000).build();
    fixture.context.insert_header(header.clone());

    let action = Action {
        tag: action_tag::ABSORB,
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
        .input(CellInput::new_builder().previous_output(state_in).build())
        .input(
            CellInput::new_builder()
                .previous_output(position_in)
                .build(),
        )
        .input(CellInput::new_builder().previous_output(vault_in).build())
        .input(CellInput::new_builder().previous_output(totals_in).build())
        .output(typed_cell(&fixture.lock_script, &fixture.market_script))
        .output(typed_cell(&fixture.lock_script, &fixture.position_script))
        .output(new_vault_cell)
        .output(typed_cell(&fixture.lock_script, &fixture.totals_script))
        .outputs_data(
            vec![
                encode(&new_state),
                encode(&new_position),
                encode(&new_vault),
                encode(&new_totals),
            ]
            .pack(),
        )
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
            witness.as_bytes().pack(),
        ])
        .build();

    let tx = fixture.context.complete_tx(tx);
    let cycles = fixture
        .context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("absorb should pass");
    println!("absorb cycles: {cycles}");
}

#[test]
fn buy_ckb_collateral_after_absorb() {
    let now = 1_700_000_000;
    let mut fixture = setup(50_000);

    let mut old_state = state(now);
    old_state.total_supply_principal = 100 * RUSD;
    old_state.total_cash = 94 * RUSD;

    let old_totals = totals(0);
    let new_totals = totals(0);
    let old_ckb_vault = vault(COLLATERAL);
    let new_ckb_vault = vault(0);
    let old_base_vault = vault_for([4u8; 32], 94 * RUSD);
    let new_base_vault = vault_for([4u8; 32], 94 * RUSD + 475_000_000);

    let mut new_state = core::accrue(&old_state, &config(), now).unwrap();
    new_state.total_cash += 475_000_000;

    let ckb_in_cell = vault_cell(&fixture.lock_script, &fixture.vault_script, COLLATERAL);
    let ckb_out_cell = vault_cell(&fixture.lock_script, &fixture.vault_script, 0);

    // Base vault is a state cell; capacity is fixed and the amount is data only.
    let base_in_cell = CellOutput::new_builder()
        .capacity(CAPACITY)
        .lock(fixture.lock_script.clone())
        .type_(Some(fixture.base_vault_script.clone()).pack())
        .build();

    let state_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.market_script),
        encode(&old_state),
    );
    let totals_in = fixture.context.create_cell(
        typed_cell(&fixture.lock_script, &fixture.totals_script),
        encode(&old_totals),
    );
    let ckb_in = fixture
        .context
        .create_cell(ckb_in_cell, encode(&old_ckb_vault));
    let base_in = fixture
        .context
        .create_cell(base_in_cell, encode(&old_base_vault));

    // Buyer's RUSD contribution (plain cell, not interpreted by the script).
    let buyer_base = fixture.context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(fixture.lock_script.clone())
            .build(),
        Bytes::new(),
    );

    let header = HeaderBuilder::default().timestamp(now * 1000).build();
    fixture.context.insert_header(header.clone());

    let action = Action {
        tag: action_tag::BUY_COLLATERAL,
        ..Default::default()
    };
    let witness = WitnessArgs::new_builder()
        .input_type(
            BytesOpt::new_builder()
                .set(Some(encode(&action).pack()))
                .build(),
        )
        .build();

    let buyer_ckb_out = CellOutput::new_builder()
        .capacity(COLLATERAL as u64)
        .lock(fixture.lock_script.clone())
        .build();
    let change = CellOutput::new_builder()
        .capacity(CAPACITY)
        .lock(fixture.lock_script.clone())
        .build();

    let base_out_cell = CellOutput::new_builder()
        .capacity(CAPACITY)
        .lock(fixture.lock_script.clone())
        .type_(Some(fixture.base_vault_script.clone()).pack())
        .build();

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(state_in).build())
        .input(CellInput::new_builder().previous_output(totals_in).build())
        .input(CellInput::new_builder().previous_output(ckb_in).build())
        .input(CellInput::new_builder().previous_output(base_in).build())
        .input(CellInput::new_builder().previous_output(buyer_base).build())
        .output(typed_cell(&fixture.lock_script, &fixture.market_script))
        .output(typed_cell(&fixture.lock_script, &fixture.totals_script))
        .output(ckb_out_cell)
        .output(base_out_cell)
        .output(buyer_ckb_out)
        .output(change)
        .outputs_data(
            vec![
                encode(&new_state),
                encode(&new_totals),
                encode(&new_ckb_vault),
                encode(&new_base_vault),
                Bytes::new(),
                Bytes::new(),
            ]
            .pack(),
        )
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
            witness.as_bytes().pack(),
            witness.as_bytes().pack(),
        ])
        .build();

    let tx = fixture.context.complete_tx(tx);
    let cycles = fixture
        .context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("buy collateral should pass");
    println!("buy collateral cycles: {cycles}");
}
