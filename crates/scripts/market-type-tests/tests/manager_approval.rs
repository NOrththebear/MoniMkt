//! Manager approval path for position-lock.
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
    action_tag, permission, Account, Action, Approval, Encode, Writer, SCHEMA_VERSION,
};

const MAX_CYCLES: u64 = 20_000_000;
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

fn run_manager(expiry: u64, permissions: u32) -> Result<(), String> {
    let now = 1_700_000_000;
    let market_id = [1u8; 32];

    let mut context = Context::default();
    let position_lock_code = context.deploy_cell(bin("monimkt-position-lock"));
    let account_code = context.deploy_cell(bin("monimkt-account-type"));
    let approval_code = context.deploy_cell(bin("monimkt-approval-type"));
    let lock_code = context.deploy_cell(ALWAYS_SUCCESS.clone());

    let owner_lock = context
        .build_script(&lock_code, Bytes::from(vec![1u8]))
        .unwrap();
    let manager_lock = context
        .build_script(&lock_code, Bytes::from(vec![2u8]))
        .unwrap();
    let owner_hash: [u8; 32] = blake2b_256(owner_lock.as_slice());
    let manager_hash: [u8; 32] = blake2b_256(manager_lock.as_slice());

    let mut account_args = market_id.to_vec();
    account_args.extend_from_slice(&manager_hash);
    let account_script = context
        .build_script(&account_code, Bytes::from(account_args))
        .unwrap();
    let account_code_hash = script_code_hash(&account_script);

    let mut approval_args = market_id.to_vec();
    approval_args.extend_from_slice(&owner_hash);
    approval_args.extend_from_slice(&manager_hash);
    approval_args.extend_from_slice(&account_code_hash);
    let approval_script = context
        .build_script(&approval_code, Bytes::from(approval_args))
        .unwrap();
    let approval_code_hash = script_code_hash(&approval_script);

    let mut lock_args = market_id.to_vec();
    lock_args.extend_from_slice(&owner_hash);
    lock_args.extend_from_slice(&account_code_hash);
    lock_args.extend_from_slice(&[0u8; 32]); // market type code hash, unused here
    lock_args.extend_from_slice(&approval_code_hash);
    let position_lock = context
        .build_script(&position_lock_code, Bytes::from(lock_args))
        .unwrap();

    let position_in = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(position_lock.clone())
            .build(),
        Bytes::new(),
    );
    let account_in = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(manager_lock.clone())
            .type_(Some(account_script).pack())
            .build(),
        encode(&Account {
            version: SCHEMA_VERSION,
            market_id,
            owner_lock_hash: manager_hash,
            nonce: 0,
            flags: 0,
            reserved: [0u8; 32],
        }),
    );
    let approval_out = context.create_cell(
        CellOutput::new_builder()
            .capacity(CAPACITY)
            .lock(owner_lock.clone())
            .type_(Some(approval_script).pack())
            .build(),
        encode(&Approval {
            version: SCHEMA_VERSION,
            market_id,
            owner_lock_hash: owner_hash,
            manager_lock_hash: manager_hash,
            permissions,
            expiry,
            nonce: 0,
            reserved: [0u8; 32],
        }),
    );

    let header = HeaderBuilder::default().timestamp(now * 1000).build();
    context.insert_header(header.clone());

    let action = Action {
        tag: action_tag::SUPPLY_BASE,
        amount: 100,
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
        .input(
            CellInput::new_builder()
                .previous_output(position_in)
                .build(),
        )
        .input(CellInput::new_builder().previous_output(account_in).build())
        .output(
            CellOutput::new_builder()
                .capacity(CAPACITY)
                .lock(position_lock)
                .build(),
        )
        .output(
            CellOutput::new_builder()
                .capacity(CAPACITY)
                .lock(manager_lock)
                .build(),
        )
        .outputs_data(vec![Bytes::new(), Bytes::new()].pack())
        .cell_deps(vec![CellDep::new_builder().out_point(approval_out).build()])
        .header_deps(vec![header.hash()])
        .witnesses(vec![witness.as_bytes().pack(), witness.as_bytes().pack()])
        .build();

    let tx = context.complete_tx(tx);
    context
        .verify_tx(&tx, MAX_CYCLES)
        .map(|_| ())
        .map_err(|error| format!("{error:?}"))
}

#[test]
fn manager_with_supply_permission_passes() {
    run_manager(1_700_001_000, permission::SUPPLY).expect("manager supply should pass");
}

#[test]
fn manager_with_wrong_permission_is_rejected() {
    let result = run_manager(1_700_001_000, permission::WITHDRAW);
    assert!(result.is_err(), "wrong permission must be rejected");
}

#[test]
fn expired_approval_is_rejected() {
    let result = run_manager(1_699_999_999, permission::SUPPLY);
    assert!(result.is_err(), "expired approval must be rejected");
}
