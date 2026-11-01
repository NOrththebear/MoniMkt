//! Native CKB vault capacity tests.
#![allow(clippy::useless_vec)]

use ckb_testtool::builtin::ALWAYS_SUCCESS;
use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{Capacity, TransactionBuilder},
    packed::*,
    prelude::*,
};
use ckb_testtool::context::Context;
use monimkt_schemas::{asset_kind, Encode, Vault, Writer, SCHEMA_VERSION};

const MAX_CYCLES: u64 = 10_000_000;
const CKB: u128 = 100_000_000; // shannons per CKB
const AMOUNT: u128 = 5_000 * CKB;

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

fn vault_data() -> Bytes {
    encode(&Vault {
        version: SCHEMA_VERSION,
        market_id: [1u8; 32],
        asset_id: [2u8; 32],
        amount: AMOUNT,
        reserved: [0u8; 32],
    })
}

fn build_tx(delta: i64) -> (Context, ckb_testtool::ckb_types::core::TransactionView) {
    let mut context = Context::default();
    let vault_code = context.deploy_cell(bin("monimkt-vault-type"));
    let lock_code = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let lock_script = context.build_script(&lock_code, Bytes::new()).unwrap();

    let mut args = [1u8; 32].to_vec();
    args.extend_from_slice(&[2u8; 32]);
    args.push(asset_kind::CKB);
    let type_script = context
        .build_script(&vault_code, Bytes::from(args))
        .unwrap();

    let data = vault_data();
    let base_output = CellOutput::new_builder()
        .capacity(0u64)
        .lock(lock_script.clone())
        .type_(Some(type_script).pack())
        .build();
    let occupied = base_output
        .occupied_capacity(Capacity::bytes(data.len()).unwrap())
        .unwrap()
        .as_u64();
    let output_capacity = (occupied as i64 + AMOUNT as i64 + delta) as u64;

    let output = base_output.as_builder().capacity(output_capacity).build();

    let input_capacity = output_capacity + 1_000 * CKB as u64;
    let input_out = context.create_cell(
        CellOutput::new_builder()
            .capacity(input_capacity)
            .lock(lock_script.clone())
            .build(),
        Bytes::new(),
    );
    let change = CellOutput::new_builder()
        .capacity(input_capacity - output_capacity)
        .lock(lock_script)
        .build();

    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(input_out).build())
        .output(output)
        .output(change)
        .outputs_data(vec![data, Bytes::new()].pack())
        .build();
    let tx = context.complete_tx(tx);
    (context, tx)
}

#[test]
fn ckb_vault_capacity_covers_amount() {
    let (context, tx) = build_tx(0);
    context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("capacity == occupied + amount should pass");
}

#[test]
fn ckb_vault_capacity_shortfall_is_rejected() {
    let (context, tx) = build_tx(-(AMOUNT as i64));
    assert!(
        context.verify_tx(&tx, MAX_CYCLES).is_err(),
        "capacity < occupied + amount must be rejected"
    );
}
