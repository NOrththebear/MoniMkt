// Create the deployer's MoniMkt position cell on CKB testnet.
//
// Usage:
//   node scripts/create-testnet-position.js          # dry run
//   node scripts/create-testnet-position.js --send   # send transaction
const fs = require("fs");
const path = require("path");
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

const SEND = process.argv.includes("--send");

const MARKET_TX = "0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380";
const STATE_TX = "0x049882b7a102d5bd8cdf9199b5dcea6e17b81d1044ae1d95b563011b8dd5d246";
const MARKET_STATE_INDEX = 0n;
const CONFIG_INDEX = 0;

const CODE = {
  marketType: "0x9172f13db28292479142728fbeca4e60bc4b40724cd4791a382ad715b58fda33",
  accountType: "0x5b5c9ef26e0aa0ad5ab42250338b7b4db5710a21226c086f9f0b5a1c3cf02b12",
  positionType: "0xa0f58d96515fb400d098e29c0a09d2ff58c8db1cbd64a285eeb7ad71a335bbdc",
  positionLock: "0xcf4242a372739fe07e348782f1c5b365e08fbbefbd9eca4494b9c7071adfde90",
  approvalType: "0x5920bee56487e7e82dfb872f8157a5d53c7add1953ba033261516a2ef1ab92ae",
};

const MARKET_ID =
  "0x70e26d96e2b61a1c8e33104ccaf066e18e1e371737b0c4871738874627ba7481";
const CONFIG_TYPE_HASH =
  "0xf8caed6fa96fea950a25899596cdcee66b79ede10f844867e73edf6b060dc3b9";
const STATE_DEP =
  "0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380";

const CAP = {
  position: 500n * 100000000n,
};
const INDEX = 1000000000000000n;

function hexToBytes(hex) {
  return Buffer.from(hex.replace(/^0x/, ""), "hex");
}
function bytesToHex(bytes) {
  return "0x" + Buffer.from(bytes).toString("hex");
}
function u8(value) {
  return Buffer.from([value]);
}
function u32le(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(Number(value));
  return buf;
}
function u64le(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}
function u128le(value) {
  const buf = Buffer.alloc(16);
  let valueBig = BigInt(value);
  for (let i = 0; i < 16; i++) {
    buf[i] = Number(valueBig & 0xffn);
    valueBig >>= 8n;
  }
  return buf;
}
function bytes32(hex) {
  const value = Buffer.from(hexToBytes(hex));
  if (value.length !== 32) throw new Error(`expected 32 bytes: ${hex}`);
  return value;
}
function concat(...parts) {
  return Buffer.concat(parts.map((p) => Buffer.from(p)));
}
function u128FromLE(bytes) {
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value;
}
function u64FromLE(bytes) {
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    value = (value << 8n) | BigInt(bytes[i]);
  }
  return value;
}
function script(codeHash, args) {
  return ccc.Script.from({ codeHash, hashType: "type", args: bytesToHex(args) });
}
async function rpc(method, params) {
  const response = await fetch("https://testnet.ckb.dev", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
  });
  const json = await response.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

function encodePosition(ownerLockHash) {
  return concat(
    u8(1),
    bytes32(MARKET_ID),
    bytes32(ownerLockHash),
    u8(0), // principal.negative
    u128le(0n), // principal.magnitude
    u128le(0n), // tracking_index
    u64le(0n), // tracking_accrued
    u64le(0n), // reward_claimed
    u64le(0n), // nonce
    u32le(0), // assets_in
    Buffer.alloc(8 * 16), // collateral[8]
    Buffer.alloc(32),
  );
}

function encodeAction(tag) {
  return concat(
    u8(tag),
    u8(0), // asset_index
    u8(0), // flags
    u8(0), // reserved0
    u128le(0n), // amount
    u128le(0n), // min_amount
    Buffer.alloc(32), // target
  );
}

function accruedStateHex(oldHex, now) {
  const data = hexToBytes(oldHex);
  if (data.length !== 252) throw new Error(`unexpected state length ${data.length}`);
  const last = Number(u64FromLE(data.slice(178, 186)));
  if (now < last) throw new Error(`header time ${now} < last accrual ${last}`);
  const dt = BigInt(now - last);
  const oldSupplyIndex = u128FromLE(data.slice(66, 82));
  const oldBorrowIndex = u128FromLE(data.slice(82, 98));
  // This setup position has no borrows, so utilization is 0 and the supply
  // rate is supply_base / SECONDS_PER_YEAR.
  const perSecond = 10_000_000_000_000_000n / 31_536_000n;
  const delta = (oldSupplyIndex * perSecond * dt) / 1_000_000_000_000_000_000n;
  const next = Buffer.from(data);
  u128le(oldSupplyIndex + delta).copy(next, 66);
  u128le(oldBorrowIndex).copy(next, 82);
  u64le(BigInt(now)).copy(next, 178);
  return bytesToHex(next);
}

async function main() {
  const client = new ccc.ClientPublicTestnet();
  const key = fs
    .readFileSync(
      path.join(__dirname, "..", ".secrets", "testnet-deployer.key"),
      "utf8",
    )
    .trim();
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  const address = await signer.getAddressObjSecp256k1();
  const ownerLockHash = address.script.hash();

  const stateOutPoint = {
    txHash: STATE_TX,
    index: MARKET_STATE_INDEX,
  };
  const stateCell = await client.getCell(stateOutPoint);
  if (!stateCell) throw new Error("MarketState cell not found");
  const oldStateHex = stateCell.outputData;
  console.log("old state:", oldStateHex);

  const tip = await rpc("get_tip_header", []);
  const now = Math.floor(Number(BigInt(tip.timestamp)) / 1000); // timestamp is hex milliseconds
  console.log("tip:", tip.hash, "timestamp:", now);

  const newStateHex = accruedStateHex(oldStateHex, now);
  console.log("new state:", newStateHex);

  const marketType = script(
    CODE.marketType,
    concat(
      bytes32(MARKET_ID),
      bytes32(CONFIG_TYPE_HASH),
      bytes32(CODE.positionType),
      bytes32("0x7cb11e5aa57978f74e3d2526a4bbc289fbb04e6e0a7b6cfba145fcc20b31980c"),
      bytes32("0x0bd6c8139235be080d920271ab2afdbee9af6badc78ade2eed661f4c407a2adf"),
      bytes32("0xd20914d2863601569206fce44b94e3ff98e2a7c6453b519ee0e89790ba6ab283"),
      bytes32("0xef551fc012c9d5f1df7c89e94dd953455567e82e60c955d1c8a060b6a288b4d8"),
    ),
  );
  const positionType = script(
    CODE.positionType,
    concat(bytes32(MARKET_ID), bytes32(ownerLockHash), bytes32(CODE.marketType)),
  );
  const positionLock = script(
    CODE.positionLock,
    concat(
      bytes32(MARKET_ID),
      bytes32(ownerLockHash),
      bytes32(CODE.accountType),
      bytes32(CODE.marketType),
      bytes32(CODE.approvalType),
    ),
  );

  console.log("position type:", positionType.hash());
  console.log("position lock:", positionLock.hash());
  console.log("position data length:", encodePosition(ownerLockHash).length);

  if (!SEND) {
    console.log("dry run; pass --send to broadcast");
    process.exit(0);
  }

  const actionHex = bytesToHex(encodeAction(12)); // ACCRUE
  const witness = ccc.WitnessArgs.from({ inputType: actionHex }).toBytes();

  const tx = ccc.Transaction.from({
    cellDeps: [
      {
        outPoint: { txHash: "0xcd9d81e249f1398fc6dfc40548cdd0f2f538de4e7ebca7b4a839c28d70b1492f", index: 0 },
        depType: "code",
      },
      {
        outPoint: { txHash: "0xeddfa8c566ee439c1760ed19c13b21a4aad0d899b7e4f5cb570d69b4917c8f28", index: 0 },
        depType: "code",
      },
      {
        outPoint: { txHash: "0x35e4ef7cfb92227518a4cbbb7237e606b2a68b74b9a95e8474937fa45c050ec2", index: 0 },
        depType: "code",
      },
      {
        outPoint: { txHash: STATE_DEP, index: CONFIG_INDEX },
        depType: "code",
      },
    ],
    headerDeps: [tip.hash],
    inputs: [
      ccc.CellInput.from({ previousOutput: stateOutPoint, since: 0 }),
    ],
    outputs: [
      {
        capacity: stateCell.cellOutput.capacity,
        lock: address.script,
        type: marketType,
      },
      {
        capacity: CAP.position,
        lock: positionLock,
        type: positionType,
      },
    ],
    outputsData: [newStateHex, bytesToHex(encodePosition(ownerLockHash))],
    witnesses: [bytesToHex(witness)],
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 10000);

  const hash = await signer.sendTransaction(tx);
  console.log("create-position tx:", hash);
  tx.outputs.forEach((output, index) => {
    console.log(
      `  ${index}: ${hash}:${index} capacity=${output.capacity} type=${output.type ? output.type.hash() : "none"}`,
    );
  });
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
