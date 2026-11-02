// Supply CKB collateral to the MoniMkt testnet market.
//
// Usage:
//   node scripts/testnet-collateral.js          # dry run
//   node scripts/testnet-collateral.js --send   # send transaction
const fs = require("fs");
const path = require("path");
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

const SEND = process.argv.includes("--send");

const MARKET_TX = "0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380";
const POSITION_B_TX = "0x4ef719b768bb8da5ad65d58b9096339785da800fbdfb0ec91710f4e8e0a01af7";
const CONFIG_OUTPOINT = { txHash: MARKET_TX, index: 0 };
const ASSET_CONFIG_OUTPOINT = { txHash: MARKET_TX, index: 1 };

const MARKET_ID =
  "0x70e26d96e2b61a1c8e33104ccaf066e18e1e371737b0c4871738874627ba7481";
const CKB_ASSET_ID =
  "0x434b420000000000000000000000000000000000000000000000000000000000";

const CODE = {
  marketType: "0x9172f13db28292479142728fbeca4e60bc4b40724cd4791a382ad715b58fda33",
  accountType: "0x5b5c9ef26e0aa0ad5ab42250338b7b4db5710a21226c086f9f0b5a1c3cf02b12",
  positionType: "0xa0f58d96515fb400d098e29c0a09d2ff58c8db1cbd64a285eeb7ad71a335bbdc",
  positionLock: "0xcf4242a372739fe07e348782f1c5b365e08fbbefbd9eca4494b9c7071adfde90",
  vaultType: "0x7cb11e5aa57978f74e3d2526a4bbc289fbb04e6e0a7b6cfba145fcc20b31980c",
  vaultLock: "0x8868ee05f78a75052162ba833cbdd4437d2be9957618287b67030c1b64dfdf51",
  approvalType: "0x5920bee56487e7e82dfb872f8157a5d53c7add1953ba033261516a2ef1ab92ae",
  assetConfigType: "0xd20914d2863601569206fce44b94e3ff98e2a7c6453b519ee0e89790ba6ab283",
  assetTotalsType: "0xef551fc012c9d5f1df7c89e94dd953455567e82e60c955d1c8a060b6a288b4d8",
};

const DEP = {
  marketType: "0xcd9d81e249f1398fc6dfc40548cdd0f2f538de4e7ebca7b4a839c28d70b1492f",
  accountType: "0xf72f1e264525a5122a3e14b81094a01e64b08534b0faef211520cf533422c98e",
  positionType: "0xeddfa8c566ee439c1760ed19c13b21a4aad0d899b7e4f5cb570d69b4917c8f28",
  positionLock: "0x35e4ef7cfb92227518a4cbbb7237e606b2a68b74b9a95e8474937fa45c050ec2",
  vaultType: "0x8d696b4daf41bf6d36f29eb243b5a6bfb548e56da6c6b73fa8f05b74ab2eee2a",
  vaultLock: "0x9a448f8a65c61031c183148a0e4692e3531a4793854189591c3916f37e60dbdb",
  assetTotalsType: "0x7a1254abddd616f1057123ed50b816d9e6d03ce19bfa2beb9a905d71912131b0",
};

const CKB = 100000000n;
const COLLATERAL_AMOUNT = 1000n * CKB;
const CAPACITY_HEADROOM = 1000n * CKB;

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
async function getCell(client, outPoint) {
  const cell = await client.getCell(outPoint);
  if (!cell) throw new Error(`cell not found ${outPoint.txHash}:${outPoint.index}`);
  return cell;
}
function actionHex(tag, amount) {
  return bytesToHex(
    concat(u8(tag), u8(0), u8(0), u8(0), u128le(amount), u128le(0n), Buffer.alloc(32)),
  );
}
function updateState(oldData, { supplyIndex, borrowIndex, last }) {
  const next = Buffer.from(oldData);
  u128le(supplyIndex).copy(next, 66);
  u128le(borrowIndex).copy(next, 82);
  u64le(BigInt(last)).copy(next, 178);
  return next;
}

async function main() {
  const client = new ccc.ClientPublicTestnet();
  const key = fs
    .readFileSync(path.join(__dirname, "..", ".secrets", "testnet-deployer.key"), "utf8")
    .trim();
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  const address = await signer.getAddressObjSecp256k1();
  const ownerLockHash = address.script.hash();

  const stateOut = { txHash: POSITION_B_TX, index: 0 };
  const positionOut = { txHash: POSITION_B_TX, index: 1 };
  const accountOut = { txHash: "0x049882b7a102d5bd8cdf9199b5dcea6e17b81d1044ae1d95b563011b8dd5d246", index: 2 };
  const ckbVaultOut = { txHash: MARKET_TX, index: 6 };
  const assetTotalsOut = { txHash: MARKET_TX, index: 2 };

  const cells = await Promise.all(
    [stateOut, positionOut, accountOut, ckbVaultOut, assetTotalsOut].map((outPoint) =>
      getCell(client, outPoint),
    ),
  );
  const [stateCell, positionCell, accountCell, ckbVaultCell, assetTotalsCell] = cells;

  const oldState = hexToBytes(stateCell.outputData);
  const oldPosition = hexToBytes(positionCell.outputData);
  const oldAccount = hexToBytes(accountCell.outputData);
  const oldVault = hexToBytes(ckbVaultCell.outputData);
  const oldTotals = hexToBytes(assetTotalsCell.outputData);

  const oldSupplyIndex = u128FromLE(oldState.slice(66, 82));
  const oldBorrowIndex = u128FromLE(oldState.slice(82, 98));
  const oldLast = Number(u128FromLE(oldState.slice(178, 186)));
  const oldVaultAmount = u128FromLE(oldVault.slice(65, 81));
  const oldTotalSupplied = u128FromLE(oldTotals.slice(65, 81));
  const oldNonce = Number(u128FromLE(oldPosition.slice(114, 122)));
  const oldAccountNonce = Number(u128FromLE(oldAccount.slice(65, 73)));

  const tip = await rpc("get_tip_header", []);
  const now = Math.floor(Number(BigInt(tip.timestamp)) / 1000);
  if (now < oldLast) throw new Error(`header time ${now} < last accrual ${oldLast}`);
  const dt = BigInt(now - oldLast);
  const perSecondBase = 10_000_000_000_000_000n / 31_536_000n;
  const supplyIndex = oldSupplyIndex + (oldSupplyIndex * perSecondBase * dt) / 10n ** 18n;
  const borrowIndex = oldBorrowIndex;

  const newState = updateState(oldState, { supplyIndex, borrowIndex, last: now });

  const newPosition = Buffer.from(oldPosition);
  u32le(1).copy(newPosition, 122); // assets_in
  u128le(COLLATERAL_AMOUNT).copy(newPosition, 126);
  u64le(BigInt(oldNonce + 1)).copy(newPosition, 114);

  const newAccount = Buffer.from(oldAccount);
  u64le(BigInt(oldAccountNonce + 1)).copy(newAccount, 65);

  const newVault = Buffer.from(oldVault);
  u128le(oldVaultAmount + COLLATERAL_AMOUNT).copy(newVault, 65);

  const newTotals = Buffer.from(oldTotals);
  u128le(oldTotalSupplied + COLLATERAL_AMOUNT).copy(newTotals, 65);

  const newVaultCapacity =
    BigInt(ckbVaultCell.cellOutput.capacity) + COLLATERAL_AMOUNT + CAPACITY_HEADROOM;

  console.log("now:", now, "dt:", dt.toString());
  console.log("collateral:", COLLATERAL_AMOUNT.toString());
  console.log("CKB vault:", oldVaultAmount.toString(), "->", (oldVaultAmount + COLLATERAL_AMOUNT).toString());
  console.log("totals:", oldTotalSupplied.toString(), "->", (oldTotalSupplied + COLLATERAL_AMOUNT).toString());
  console.log("vault capacity:", ckbVaultCell.cellOutput.capacity, "->", newVaultCapacity.toString());

  const marketType = script(
    CODE.marketType,
    concat(
      bytes32(MARKET_ID),
      bytes32("0xf8caed6fa96fea950a25899596cdcee66b79ede10f844867e73edf6b060dc3b9"),
      bytes32(CODE.positionType),
      bytes32(CODE.vaultType),
      bytes32("0x0bd6c8139235be080d920271ab2afdbee9af6badc78ade2eed661f4c407a2adf"),
      bytes32(CODE.assetConfigType),
      bytes32(CODE.assetTotalsType),
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
  const accountType = script(
    CODE.accountType,
    concat(bytes32(MARKET_ID), bytes32(ownerLockHash)),
  );
  const ckbVaultType = script(
    CODE.vaultType,
    concat(bytes32(MARKET_ID), bytes32(CKB_ASSET_ID), u8(1)),
  );
  const ckbVaultLock = script(
    CODE.vaultLock,
    concat(
      bytes32(MARKET_ID),
      bytes32(CKB_ASSET_ID),
      bytes32(CODE.marketType),
      bytes32(CODE.vaultType),
    ),
  );
  const assetTotalsType = script(
    CODE.assetTotalsType,
    concat(bytes32(MARKET_ID), bytes32(CKB_ASSET_ID)),
  );

  if (!SEND) {
    console.log("dry run; pass --send to broadcast");
    process.exit(0);
  }

  const action = actionHex(3, COLLATERAL_AMOUNT); // SUPPLY_COLLATERAL
  const witness = bytesToHex(ccc.WitnessArgs.from({ inputType: action }).toBytes());

  const tx = ccc.Transaction.from({
    cellDeps: [
      { outPoint: { txHash: DEP.marketType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.accountType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.positionType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.positionLock, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.vaultType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.vaultLock, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.assetTotalsType, index: 0 }, depType: "code" },
      { outPoint: CONFIG_OUTPOINT, depType: "code" },
      { outPoint: ASSET_CONFIG_OUTPOINT, depType: "code" },
    ],
    headerDeps: [tip.hash],
    inputs: [stateOut, positionOut, accountOut, ckbVaultOut, assetTotalsOut].map(
      (outPoint) => ccc.CellInput.from({ previousOutput: outPoint, since: 0 }),
    ),
    outputs: [
      { capacity: stateCell.cellOutput.capacity, lock: address.script, type: marketType },
      { capacity: positionCell.cellOutput.capacity, lock: positionLock, type: positionType },
      { capacity: accountCell.cellOutput.capacity, lock: address.script, type: accountType },
      { capacity: newVaultCapacity, lock: ckbVaultLock, type: ckbVaultType },
      { capacity: assetTotalsCell.cellOutput.capacity, lock: address.script, type: assetTotalsType },
    ],
    outputsData: [
      bytesToHex(newState),
      bytesToHex(newPosition),
      bytesToHex(newAccount),
      bytesToHex(newVault),
      bytesToHex(newTotals),
    ],
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 10000);

  tx.witnesses[0] = witness;
  tx.witnesses[1] = witness;
  tx.witnesses[2] = witness;
  tx.witnesses[3] = witness;
  tx.witnesses[4] = witness;

  const hash = await signer.sendTransaction(tx);
  console.log("collateral tx:", hash);
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
