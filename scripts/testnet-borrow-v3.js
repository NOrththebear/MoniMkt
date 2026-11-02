// Borrow 40 RUSD from the v3 MoniMkt testnet market.
const fs = require("fs");
const path = require("path");
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

const SEND = process.argv.includes("--send");

const MARKET_TX = "0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380";
const COLLATERAL_TX = "0x9ca39f8494a3c4368b6ffadca63771537121fdcc54b9a526bbe47ca171f06490";
const SUPPLY_TX = "0x049882b7a102d5bd8cdf9199b5dcea6e17b81d1044ae1d95b563011b8dd5d246";

const MARKET_ID = "0x70e26d96e2b61a1c8e33104ccaf066e18e1e371737b0c4871738874627ba7481";
const CONFIG_TYPE_HASH = "0xf8caed6fa96fea950a25899596cdcee66b79ede10f844867e73edf6b060dc3b9";
const RUSD_ASSET_ID = "0xe016940e96b9ad2d6505d06996a24f84dbc319ce1a0b0a619aa6af26ce190a3a";
const XUDT_ARGS = "0x17a32809302cdca3ffdfde54659dc6d0e3e2d7ce6d8e79616cc72e4e4eff6d2c";

const CODE = {
  marketType: "0x9172f13db28292479142728fbeca4e60bc4b40724cd4791a382ad715b58fda33",
  accountType: "0x5b5c9ef26e0aa0ad5ab42250338b7b4db5710a21226c086f9f0b5a1c3cf02b12",
  positionType: "0xa0f58d96515fb400d098e29c0a09d2ff58c8db1cbd64a285eeb7ad71a335bbdc",
  positionLock: "0xcf4242a372739fe07e348782f1c5b365e08fbbefbd9eca4494b9c7071adfde90",
  vaultType: "0x7cb11e5aa57978f74e3d2526a4bbc289fbb04e6e0a7b6cfba145fcc20b31980c",
  vaultLock: "0x8868ee05f78a75052162ba833cbdd4437d2be9957618287b67030c1b64dfdf51",
  baseTokenLock: "0x10c2e4f8913ebb1a556ccc749f64a64d6978eda27ded0e3d3746ceacf7651620",
  approvalType: "0x5920bee56487e7e82dfb872f8157a5d53c7add1953ba033261516a2ef1ab92ae",
};

const DEP = {
  marketType: "0xcd9d81e249f1398fc6dfc40548cdd0f2f538de4e7ebca7b4a839c28d70b1492f",
  accountType: "0xf72f1e264525a5122a3e14b81094a01e64b08534b0faef211520cf533422c98e",
  positionType: "0xeddfa8c566ee439c1760ed19c13b21a4aad0d899b7e4f5cb570d69b4917c8f28",
  positionLock: "0x35e4ef7cfb92227518a4cbbb7237e606b2a68b74b9a95e8474937fa45c050ec2",
  vaultType: "0x8d696b4daf41bf6d36f29eb243b5a6bfb548e56da6c6b73fa8f05b74ab2eee2a",
  vaultLock: "0x9a448f8a65c61031c183148a0e4692e3531a4793854189591c3916f37e60dbdb",
  baseTokenLock: "0x636e2ff2d5eb10ac77ab618bb6ce77f9b374b39e66d749bf163f0fe78bdaee2d",
};

const RUSD = 100000000n;
const BORROW_AMOUNT = 40n * RUSD;
const INDEX = 1000000000000000n;

function hexToBytes(hex) {
  return Buffer.from(hex.replace(/^0x/, ""), "hex");
}
function bytesToHex(bytes) {
  return "0x" + Buffer.from(bytes).toString("hex");
}
function u8(v) { return Buffer.from([v]); }
function u32le(v) { const b = Buffer.alloc(4); b.writeUInt32LE(Number(v)); return b; }
function u64le(v) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; }
function u128le(v) {
  const b = Buffer.alloc(16);
  let x = BigInt(v);
  for (let i = 0; i < 16; i++) { b[i] = Number(x & 0xffn); x >>= 8n; }
  return b;
}
function bytes32(hex) {
  const b = Buffer.from(hexToBytes(hex));
  if (b.length !== 32) throw new Error(`expected 32 bytes: ${hex}`);
  return b;
}
function concat(...parts) { return Buffer.concat(parts.map((p) => Buffer.from(p))); }
function u128FromLE(bytes) {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
  return v;
}
function script(codeHash, args) {
  return ccc.Script.from({ codeHash, hashType: "type", args: bytesToHex(args) });
}
async function rpc(method, params) {
  const r = await fetch("https://testnet.ckb.dev", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}
async function getCell(client, outPoint) {
  const c = await client.getCell(outPoint);
  if (!c) throw new Error(`cell not found ${outPoint.txHash}:${outPoint.index}`);
  return c;
}
function actionHex(tag, amount) {
  return bytesToHex(concat(u8(tag), u8(0), u8(0), u8(0), u128le(amount), u128le(0n), Buffer.alloc(32)));
}

async function main() {
  const client = new ccc.ClientPublicTestnet();
  const key = fs.readFileSync(path.join(__dirname, "..", ".secrets", "testnet-deployer.key"), "utf8").trim();
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  const address = await signer.getAddressObjSecp256k1();
  const ownerLockHash = address.script.hash();

  const stateOut = { txHash: COLLATERAL_TX, index: 0 };
  const positionOut = { txHash: COLLATERAL_TX, index: 1 };
  const accountOut = { txHash: COLLATERAL_TX, index: 2 };
  const baseVaultOut = { txHash: SUPPLY_TX, index: 3 };
  const baseTokenOut = { txHash: SUPPLY_TX, index: 4 };
  const rusdOut = { txHash: SUPPLY_TX, index: 5 };

  const [stateCell, positionCell, accountCell, baseVaultCell, baseTokenCell, rusdCell] =
    await Promise.all([stateOut, positionOut, accountOut, baseVaultOut, baseTokenOut, rusdOut].map((o) => getCell(client, o)));

  const oldState = hexToBytes(stateCell.outputData);
  const oldPosition = hexToBytes(positionCell.outputData);
  const oldAccount = hexToBytes(accountCell.outputData);
  const oldVault = hexToBytes(baseVaultCell.outputData);
  const oldToken = hexToBytes(baseTokenCell.outputData);
  const rusdBalance = u128FromLE(hexToBytes(rusdCell.outputData));

  const oldSupplyIndex = u128FromLE(oldState.slice(66, 82));
  const oldBorrowIndex = u128FromLE(oldState.slice(82, 98));
  const oldTotalSupply = u128FromLE(oldState.slice(130, 146));
  const oldTotalBorrow = u128FromLE(oldState.slice(146, 162));
  const oldTotalCash = u128FromLE(oldState.slice(162, 178));
  const oldLast = Number(u128FromLE(oldState.slice(178, 186)));
  const oldVaultAmount = u128FromLE(oldVault.slice(65, 81));
  const oldTokenAmount = u128FromLE(oldToken.slice(0, 16));
  const oldPrincipal = u128FromLE(oldPosition.slice(66, 82));
  const oldNonce = Number(u128FromLE(oldPosition.slice(114, 122)));
  const oldAccountNonce = Number(u128FromLE(oldAccount.slice(65, 73)));
  if (oldTotalBorrow !== 0n || oldPrincipal !== 0n) throw new Error("expected an empty borrow position");

  const tip = await rpc("get_tip_header", []);
  const now = Math.floor(Number(BigInt(tip.timestamp)) / 1000);
  if (now < oldLast) throw new Error(`header time ${now} < last accrual ${oldLast}`);
  const dt = BigInt(now - oldLast);
  const perSecondBase = 10_000_000_000_000_000n / 31_536_000n;
  const supplyIndex = oldSupplyIndex + (oldSupplyIndex * perSecondBase * dt) / 10n ** 18n;
  const borrowIndex = oldBorrowIndex;
  const newPrincipal = -BORROW_AMOUNT;

  const newState = Buffer.from(oldState);
  u128le(supplyIndex).copy(newState, 66);
  u128le(borrowIndex).copy(newState, 82);
  u128le(oldTotalSupply).copy(newState, 130);
  u128le(oldTotalBorrow + BORROW_AMOUNT).copy(newState, 146);
  u128le(oldTotalCash - BORROW_AMOUNT).copy(newState, 162);
  u64le(now).copy(newState, 178);

  const newPosition = Buffer.from(oldPosition);
  newPosition[65] = 1; // negative
  u128le(BORROW_AMOUNT).copy(newPosition, 66);
  u64le(oldNonce + 1).copy(newPosition, 114);

  const newAccount = Buffer.from(oldAccount);
  u64le(oldAccountNonce + 1).copy(newAccount, 65);

  const newVault = Buffer.from(oldVault);
  u128le(oldVaultAmount - BORROW_AMOUNT).copy(newVault, 65);
  const newTokenAmount = oldTokenAmount - BORROW_AMOUNT;
  const newRusd = rusdBalance + BORROW_AMOUNT;

  console.log("now:", now, "dt:", dt.toString());
  console.log("borrow:", BORROW_AMOUNT.toString(), "principal:", newPrincipal.toString());
  console.log("base vault:", oldVaultAmount.toString(), "->", (oldVaultAmount - BORROW_AMOUNT).toString());
  console.log("RUSD wallet:", rusdBalance.toString(), "->", newRusd.toString());

  const marketType = script(CODE.marketType, concat(
    bytes32(MARKET_ID), bytes32(CONFIG_TYPE_HASH), bytes32(CODE.positionType),
    bytes32(CODE.vaultType), bytes32("0x0bd6c8139235be080d920271ab2afdbee9af6badc78ade2eed661f4c407a2adf"),
    bytes32("0xd20914d2863601569206fce44b94e3ff98e2a7c6453b519ee0e89790ba6ab283"),
    bytes32("0xef551fc012c9d5f1df7c89e94dd953455567e82e60c955d1c8a060b6a288b4d8"),
  ));
  const positionType = script(CODE.positionType, concat(bytes32(MARKET_ID), bytes32(ownerLockHash), bytes32(CODE.marketType)));
  const positionLock = script(CODE.positionLock, concat(bytes32(MARKET_ID), bytes32(ownerLockHash), bytes32(CODE.accountType), bytes32(CODE.marketType), bytes32(CODE.approvalType)));
  const accountType = script(CODE.accountType, concat(bytes32(MARKET_ID), bytes32(ownerLockHash)));
  const baseVaultType = script(CODE.vaultType, concat(bytes32(MARKET_ID), bytes32(RUSD_ASSET_ID), u8(0)));
  const baseVaultLock = script(CODE.vaultLock, concat(bytes32(MARKET_ID), bytes32(RUSD_ASSET_ID), bytes32(CODE.marketType), bytes32(CODE.vaultType)));
  const baseTokenLock = script(CODE.baseTokenLock, concat(bytes32(MARKET_ID), bytes32(RUSD_ASSET_ID), bytes32(CODE.marketType), bytes32(CODE.vaultType)));
  const xudtType = await ccc.Script.fromKnownScript(client, ccc.KnownScript.XUdt, XUDT_ARGS);

  if (!SEND) { console.log("dry run; pass --send"); process.exit(0); }

  const witness = bytesToHex(ccc.WitnessArgs.from({ inputType: actionHex(6, BORROW_AMOUNT) }).toBytes());
  const tx = ccc.Transaction.from({
    cellDeps: [
      { outPoint: { txHash: DEP.marketType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.accountType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.positionType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.positionLock, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.vaultType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.vaultLock, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.baseTokenLock, index: 0 }, depType: "code" },
      { outPoint: { txHash: MARKET_TX, index: 0 }, depType: "code" },
      { outPoint: { txHash: MARKET_TX, index: 1 }, depType: "code" },
      { outPoint: { txHash: MARKET_TX, index: 3 }, depType: "code" },
    ],
    headerDeps: [tip.hash],
    inputs: [stateOut, positionOut, accountOut, baseVaultOut, baseTokenOut, rusdOut].map((o) => ccc.CellInput.from({ previousOutput: o, since: 0 })),
    outputs: [
      { capacity: stateCell.cellOutput.capacity, lock: address.script, type: marketType },
      { capacity: positionCell.cellOutput.capacity, lock: positionLock, type: positionType },
      { capacity: accountCell.cellOutput.capacity, lock: address.script, type: accountType },
      { capacity: baseVaultCell.cellOutput.capacity, lock: baseVaultLock, type: baseVaultType },
      { capacity: baseTokenCell.cellOutput.capacity, lock: baseTokenLock, type: xudtType },
      { capacity: rusdCell.cellOutput.capacity, lock: address.script, type: xudtType },
    ],
    outputsData: [bytesToHex(newState), bytesToHex(newPosition), bytesToHex(newAccount), bytesToHex(newVault), bytesToHex(u128le(newTokenAmount)), bytesToHex(u128le(newRusd))],
  });
  await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.XUdt);
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 10000);
  for (let i = 0; i < 6; i++) tx.witnesses[i] = witness;

  const hash = await signer.sendTransaction(tx);
  console.log("borrow tx:", hash);
  tx.outputs.forEach((o, i) => console.log(`  ${i}: ${hash}:${i} capacity=${o.capacity} type=${o.type ? o.type.hash() : "none"}`));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
