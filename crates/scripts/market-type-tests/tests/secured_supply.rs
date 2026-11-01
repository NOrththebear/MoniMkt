//! ckb-testtool integration test.
#![allow(clippy::useless_vec)]

//! Secured supply/withdraw: real Account, Position, PositionLock, VaultLock,
//! and VaultType scripts.

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
    action_tag, asset_kind, Account, Action, Encode, MarketConfig, MarketState, Principal,
    UserPosition, Vault, Writer, SCHEMA_VERSION,
};

const MAX_CYCLES: u64 = 100_000_000;
const CAPACITY: u64 = 100_000_000_000; // 1,000 CKB
const RUSD: u128 = 100_000_000;
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

fn empty_position(owner_lock_hash: [u8; 32]) -> UserPosition {
    UserPosition {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        owner_lock_hash,
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

fn empty_account(owner_lock_hash: [u8; 32], nonce: u64) -> Account {
    Account {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        owner_lock_hash,
        nonce,
        flags: 0,
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

fn script_code_hash(script: &Script) -> [u8; 32] {
    script
        .code_hash()
        .as_slice()
        .try_into()
        .expect("32-byte code hash")
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
    owner_lock_script: Script,
    owner_lock_hash: [u8; 32],
    market_script: Script,
    position_script: Script,
    position_lock_script: Script,
    vault_type_script: Script,
    vault_lock_script: Script,
    account_script: Script,
    config_out: OutPoint,
}

fn setup() -> Fixture {
    let market_id = [1u8; 32];
    let asset_id = [2u8; 32];

    let mut context = Context::default();
    let market_code = context.deploy_cell(bin("monimkt-market-type"));
    let account_code = context.deploy_cell(bin("monimkt-account-type"));
    let position_code = context.deploy_cell(bin("monimkt-position-type"));
    let position_lock_code = context.deploy_cell(bin("monimkt-position-lock"));
    let vault_lock_code = context.deploy_cell(bin("monimkt-vault-lock"));
    let vault_type_code = context.deploy_cell(bin("monimkt-vault-type"));
    let config_code = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let owner_lock_code = context.deploy_cell(ALWAYS_SUCCESS.clone());

    let owner_lock_script = context
        .build_script(&owner_lock_code, Bytes::new())
        .unwrap();
    let owner_lock_hash: [u8; 32] = blake2b_256(owner_lock_script.as_slice());

    let mut config_args = market_id.to_vec();
    config_args.push(0);
    let config_script = context
        .build_script(&config_code, Bytes::from(config_args))
        .unwrap();
    let config_type_hash: [u8; 32] = blake2b_256(config_script.as_slice());
    let config_out = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(owner_lock_script.clone())
            .type_(Some(config_script).pack())
            .build(),
        encode(&config()),
    );

    let market_code_hash = {
        let dummy = context.build_script(&market_code, Bytes::new()).unwrap();
        script_code_hash(&dummy)
    };

    let mut account_args = market_id.to_vec();
    account_args.extend_from_slice(&owner_lock_hash);
    let account_script = context
        .build_script(&account_code, Bytes::from(account_args))
        .unwrap();
    let account_code_hash = script_code_hash(&account_script);

    let mut position_args = market_id.to_vec();
    position_args.extend_from_slice(&owner_lock_hash);
    position_args.extend_from_slice(&market_code_hash);
    let position_script = context
        .build_script(&position_code, Bytes::from(position_args))
        .unwrap();
    let position_code_hash = script_code_hash(&position_script);

    let mut position_lock_args = market_id.to_vec();
    position_lock_args.extend_from_slice(&owner_lock_hash);
    position_lock_args.extend_from_slice(&account_code_hash);
    position_lock_args.extend_from_slice(&market_code_hash);
    position_lock_args.extend_from_slice(&[0u8; 32]); // no approval type in owner-only tests
    let position_lock_script = context
        .build_script(&position_lock_code, Bytes::from(position_lock_args))
        .unwrap();

    let mut vault_type_args = market_id.to_vec();
    vault_type_args.extend_from_slice(&asset_id);
    vault_type_args.push(asset_kind::XUDT);
    let vault_type_script = context
        .build_script(&vault_type_code, Bytes::from(vault_type_args))
        .unwrap();
    let vault_code_hash = script_code_hash(&vault_type_script);

    let mut vault_lock_args = market_id.to_vec();
    vault_lock_args.extend_from_slice(&asset_id);
    vault_lock_args.extend_from_slice(&market_code_hash);
    vault_lock_args.extend_from_slice(&vault_code_hash);
    let vault_lock_script = context
        .build_script(&vault_lock_code, Bytes::from(vault_lock_args))
        .unwrap();

    let mut market_args = market_id.to_vec();
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
        owner_lock_script,
        owner_lock_hash,
        market_script,
        position_script,
        position_lock_script,
        vault_type_script,
        vault_lock_script,
        account_script,
        config_out,
    }
}

#[allow(clippy::too_many_arguments)]
fn run(
    fixture: &mut Fixture,
    old_state: &MarketState,
    old_position: &UserPosition,
    old_vault: &Vault,
    old_account: &Account,
    new_state: &MarketState,
    new_position: &UserPosition,
    new_vault: &Vault,
    new_account: &Account,
    action: Action,
    now: u64,
    include_account: bool,
) -> Result<(), String> {
    let state_in = fixture.context.create_cell(
        typed_cell(&fixture.owner_lock_script, &fixture.market_script),
        encode(old_state),
    );
    let position_in = fixture.context.create_cell(
        typed_cell(&fixture.position_lock_script, &fixture.position_script),
        encode(old_position),
    );
    let vault_in = fixture.context.create_cell(
        typed_cell(&fixture.vault_lock_script, &fixture.vault_type_script),
        encode(old_vault),
    );
    let account_in = if include_account {
        Some(fixture.context.create_cell(
            typed_cell(&fixture.owner_lock_script, &fixture.account_script),
            encode(old_account),
        ))
    } else {
        None
    };

    let header = HeaderBuilder::default().timestamp(now * 1000).build();
    fixture.context.insert_header(header.clone());

    let witness = WitnessArgs::new_builder()
        .input_type(
            BytesOpt::new_builder()
                .set(Some(encode(&action).pack()))
                .build(),
        )
        .build();

    let mut tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(state_in).build())
        .input(
            CellInput::new_builder()
                .previous_output(position_in)
                .build(),
        )
        .input(CellInput::new_builder().previous_output(vault_in).build());

    let mut witness_count = 3;
    if let Some(account_in) = account_in {
        tx = tx.input(CellInput::new_builder().previous_output(account_in).build());
        witness_count = 4;
    }

    tx = tx
        .output(typed_cell(
            &fixture.owner_lock_script,
            &fixture.market_script,
        ))
        .output(typed_cell(
            &fixture.position_lock_script,
            &fixture.position_script,
        ))
        .output(typed_cell(
            &fixture.vault_lock_script,
            &fixture.vault_type_script,
        ));

    let mut outputs_data = vec![encode(new_state), encode(new_position), encode(new_vault)];

    if include_account {
        tx = tx.output(typed_cell(
            &fixture.owner_lock_script,
            &fixture.account_script,
        ));
        outputs_data.push(encode(new_account));
    }

    let witnesses = vec![witness.as_bytes().pack(); witness_count];

    let tx = tx
        .outputs_data(outputs_data.pack())
        .cell_deps(vec![CellDep::new_builder()
            .out_point(fixture.config_out.clone())
            .build()])
        .header_deps(vec![header.hash()])
        .witnesses(witnesses)
        .build();

    let tx = fixture.context.complete_tx(tx);
    fixture
        .context
        .verify_tx(&tx, MAX_CYCLES)
        .map(|_| ())
        .map_err(|error| format!("{error:?}"))
}

#[test]
fn secured_supply_passes_all_scripts() {
    let mut fixture = setup();
    let now = 1_700_000_000;
    let old_state = genesis(now);
    let old_position = empty_position(fixture.owner_lock_hash);
    let old_vault = empty_vault();
    let old_account = empty_account(fixture.owner_lock_hash, 0);

    let (new_state, mut new_position) =
        core::supply_base(&old_state, &old_position, 100 * RUSD).unwrap();
    new_position.nonce = 1;
    let new_vault = Vault {
        amount: 100 * RUSD,
        ..old_vault
    };
    let new_account = empty_account(fixture.owner_lock_hash, 1);

    let action = Action {
        tag: action_tag::SUPPLY_BASE,
        amount: 100 * RUSD,
        ..Default::default()
    };

    run(
        &mut fixture,
        &old_state,
        &old_position,
        &old_vault,
        &old_account,
        &new_state,
        &new_position,
        &new_vault,
        &new_account,
        action,
        now,
        true,
    )
    .expect("secured supply should pass");
}

#[test]
fn secured_withdraw_passes_all_scripts() {
    let mut fixture = setup();
    let now = 1_700_000_000;
    let old_state = genesis(now);
    let old_position = empty_position(fixture.owner_lock_hash);
    let old_vault = empty_vault();

    let (state_after_supply, mut position_after_supply) =
        core::supply_base(&old_state, &old_position, 100 * RUSD).unwrap();
    position_after_supply.nonce = 1;
    let vault_after_supply = Vault {
        amount: 100 * RUSD,
        ..old_vault
    };
    let account_after_supply = empty_account(fixture.owner_lock_hash, 1);

    let (new_state, mut new_position) =
        core::withdraw_base(&state_after_supply, &position_after_supply, 40 * RUSD).unwrap();
    new_position.nonce = 2;
    let new_vault = Vault {
        amount: 60 * RUSD,
        ..old_vault
    };
    let new_account = empty_account(fixture.owner_lock_hash, 2);

    let action = Action {
        tag: action_tag::WITHDRAW_BASE,
        amount: 40 * RUSD,
        ..Default::default()
    };

    run(
        &mut fixture,
        &state_after_supply,
        &position_after_supply,
        &vault_after_supply,
        &account_after_supply,
        &new_state,
        &new_position,
        &new_vault,
        &new_account,
        action,
        now,
        true,
    )
    .expect("secured withdraw should pass");
}

#[test]
fn missing_account_is_rejected() {
    let mut fixture = setup();
    let now = 1_700_000_000;
    let old_state = genesis(now);
    let old_position = empty_position(fixture.owner_lock_hash);
    let old_vault = empty_vault();

    let (new_state, mut new_position) =
        core::supply_base(&old_state, &old_position, 100 * RUSD).unwrap();
    new_position.nonce = 1;
    let new_vault = Vault {
        amount: 100 * RUSD,
        ..old_vault
    };
    let new_account = empty_account(fixture.owner_lock_hash, 1);

    let action = Action {
        tag: action_tag::SUPPLY_BASE,
        amount: 100 * RUSD,
        ..Default::default()
    };

    let owner_lock_hash = fixture.owner_lock_hash;
    let old_account = empty_account(owner_lock_hash, 0);
    let result = run(
        &mut fixture,
        &old_state,
        &old_position,
        &old_vault,
        &old_account,
        &new_state,
        &new_position,
        &new_vault,
        &new_account,
        action,
        now,
        false,
    );
    assert!(result.is_err(), "missing account should be rejected");
}
