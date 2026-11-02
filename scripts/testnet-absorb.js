// Absorb the underwater v3 borrower.
const fs = require("fs");
const path = require("path");
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

const SEND = process.argv.includes("--send");
const MARKET_TX = "0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380";
const BORROW_TX = "0xcef0da2cc25b56ab642594d8a354dbc02c5d0fbfb1158d6b26fcb3b7b193ec15";
const COLLATERAL_TX = "0x9ca39f8494a3c4368b6ffadca63771537121fdcc54b9a526bbe47ca171f06490";
const ORACLE_OUTPOINT = { txHash: "0x1bf15d4c78baf84e106ceb730068e12416327ba6e722d290299e7a5708fbc7e3", index: 0 };

const MARKET_ID = "0x70e26d96e2b61a1c8e33104ccaf066e18e1e371737b0c4871738874627ba7481";
const CONFIG_TYPE_HASH = "0xf8caed6fa96fea950a25899596cdcee66b79ede10f844867e73edf6b060dc3b9";
const CKB_ASSET_ID = "0x434b420000000000000000000000000000000000000000000000000000000000";

const CODE = {
  marketType: "0x9172f13db28292479142728fbeca4e60bc4b40724cd4791a382ad715b58fda33",
  positionType: "0xa0f58d96515fb400d098e29c0a09d2ff58c8db1cbd64a285eeb7ad71a335bbdc",
  positionLock: "0xcf4242a372739fe07e348782f1c5b365e08fbbefbd9eca4494b9c7071adfde90",
  vaultType: "0x7cb11e5aa57978f74e3d2526a4bbc289fbb04e6e0a7b6cfba145fcc20b31980c",
  vaultLock: "0x8868ee05f78a75052162ba833cbdd4437d2be9957618287b67030c1b64dfdf51",
  assetTotalsType: "0xef551fc012c9d5f1df7c89e94dd953455567e82e60c955d1c8a060b6a288b4d8",
  approvalType: "0x5920bee56487e7e82dfb872f8157a5d53c7add1953ba033261516a2ef1ab92ae",
  accountType: "0x5b5c9ef26e0aa0ad5ab42250338b7b4db5710a21226c086f9f0b5a1c3cf02b12",
};

const DEP = {
  marketType: "0xcd9d81e249f1398fc6dfc40548cdd0f2f538de4e7ebca7b4a839c28d70b1492f",
  positionType: "0xeddfa8c566ee439c1760ed19c13b21a4aad0d899b7e4f5cb570d69b4917c8f28",
  positionLock: "0x35e4ef7cfb92227518a4cbbb7237e606b2a68b74b9a95e8474937fa45c050ec2",
  vaultType: "0x8d696b4daf41bf6d36f29eb243b5a6bfb548e56da6c6b73fa8f05b74ab2eee2a",
  vaultLock: "0x9a448f8a65c61031c183148a0e4692e3531a4793854189591c3916f37e60dbdb",
  assetTotalsType: "0x7a1254abddd616f1057123ed50b816d9e6d03ce19bfa2beb9a905d71912131b0",
};

const FACTOR = 10n ** 18n;
const INDEX = 10n ** 15n;
const YEAR = 31_536_000n;

function hexToBytes(hex) { return Buffer.from(hex.replace(/^0x/, ""), "hex"); }
function bytesToHex(bytes) { return "0x" + Buffer.from(bytes).toString("hex"); }
function u8(v) { return Buffer.from([v]); }
function u32le(v) { const b = Buffer.alloc(4); b.writeUInt32LE(Number(v)); return b; }
function u64le(v) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; }
function u128le(v) {
  const b = Buffer.alloc(16); let x = BigInt(v);
  for (let i = 0; i < 16; i++) { b[i] = Number(x & 0xffn); x >>= 8n; }
  return b;
}
function bytes32(hex) { const b = Buffer.from(hexToBytes(hex)); if (b.length !== 32) throw new Error("bad32"); return b; }
function concat(...p) { return Buffer.concat(p.map((x) => Buffer.from(x))); }
function u128FromLE(bytes) {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
  return v;
}
function script(codeHash, args) { return ccc.Script.from({ codeHash, hashType: "type", args: bytesToHex(args) }); }
async function getCell(client, o) {
  const c = await client.getCell(o);
  if (!c) throw new Error(`missing ${o.txHash}:${o.index}`);
  return c;
}
async function rpc(method, params) {
  const r = await fetch("https://testnet.ckb.dev", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}
function actionHex(tag) {
  return bytesToHex(concat(u8(tag), u8(0), u8(0), u8(0), u128le(0n), u128le(0n), Buffer.alloc(32)));
}

(async () => {
  const client = new ccc.ClientPublicTestnet();
  const key = fs.readFileSync(path.join(__dirname, "..", ".secrets", "testnet-deployer.key"), "utf8").trim();
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  const address = await signer.getAddressObjSecp256k1();
  const ownerLockHash = address.script.hash();

  const stateOut = { txHash: BORROW_TX, index: 0 };
  const positionOut = { txHash: BORROW_TX, index: 1 };
  const ckbVaultOut = { txHash: COLLATERAL_TX, index: 3 };
  const totalsOut = { txHash: COLLATERAL_TX, index: 4 };
  const [stateCell, positionCell, vaultCell, totalsCell] = await Promise.all(
    [stateOut, positionOut, ckbVaultOut, totalsOut].map((o) => getCell(client, o)),
  );
  const oldState = hexToBytes(stateCell.outputData);
  const oldPosition = hexToBytes(positionCell.outputData);
  const oldVault = hexToBytes(vaultCell.outputData);
  const oldTotals = hexToBytes(totalsCell.outputData);

  const supplyIndex = u128FromLE(oldState.slice(66, 82));
  const borrowIndex = u128FromLE(oldState.slice(82, 98));
  const totalSupply = u128FromLE(oldState.slice(130, 146));
  const totalBorrow = u128FromLE(oldState.slice(146, 162));
  const oldLast = Number(u128FromLE(oldState.slice(178, 186)));
  const principal = u128FromLE(oldPosition.slice(66, 82));
  const collateral = u128FromLE(oldPosition.slice(126, 142));
  const nonce = Number(u128FromLE(oldPosition.slice(114, 122)));
  const vaultAmount = u128FromLE(oldVault.slice(65, 81));
  const totalSupplied = u128FromLE(oldTotals.slice(65, 81));

  const tip = await rpc("get_tip_header", []);
  const now = Math.floor(Number(BigInt(tip.timestamp)) / 1000);
  const dt = BigInt(now - oldLast);
  const presentSupply = (totalSupply * supplyIndex) / INDEX;
  const presentBorrow = (totalBorrow * borrowIndex) / INDEX;
  const utilization = presentSupply === 0n ? 0n : (presentBorrow * FACTOR) / presentSupply;
  const kink = 800_000_000_000_000_000n;
  const supplyBase = 10_000_000_000_000_000n / YEAR;
  const supplySlope = 35_000_000_000_000_000n / YEAR;
  const borrowSlope = 40_000_000_000_000_000n / YEAR;
  const rateSupply = supplyBase + (supplySlope * utilization) / FACTOR;
  const rateBorrow = utilization <= kink ? (borrowSlope * utilization) / FACTOR : 0n;
  const newSupplyIndex = supplyIndex + (supplyIndex * rateSupply * dt) / FACTOR;
  const newBorrowIndex = borrowIndex + (borrowIndex * rateBorrow * dt) / FACTOR;

  const debt = principal;
  const collateralValue = (collateral * 2_000_000n) / 100_000_000n;
  const deltaValue = (collateralValue * 900_000_000_000_000_000n) / FACTOR;
  const newBalance = -BigInt(debt) + deltaValue;
  const residual = newBalance > 0n ? newBalance : 0n;

  const newState = Buffer.from(oldState);
  u128le(newSupplyIndex).copy(newState, 66);
  u128le(newBorrowIndex).copy(newState, 82);
  u128le(totalSupply + residual).copy(newState, 130);
  u128le(totalBorrow - debt).copy(newState, 146);
  u64le(now).copy(newState, 178);

  const newPosition = Buffer.from(oldPosition);
  newPosition[65] = 0;
  u128le(residual).copy(newPosition, 66);
  u32le(0).copy(newPosition, 122);
  Buffer.alloc(8 * 16).copy(newPosition, 126);
  u64le(nonce).copy(newPosition, 114);

  const newVault = Buffer.from(oldVault);
  u128le(vaultAmount).copy(newVault, 65);

  const newTotals = Buffer.from(oldTotals);
  u128le(totalSupplied - collateral).copy(newTotals, 65);

  console.log("now:", now, "dt:", dt.toString());
  console.log("utilization:", utilization.toString());
  console.log("debt:", debt.toString(), "collateral:", collateral.toString());
  console.log("collateral value:", collateralValue.toString(), "delta:", deltaValue.toString());
  console.log("residual:", residual.toString(), "new borrow total:", (totalBorrow - debt).toString());

  const marketType = script(CODE.marketType, concat(
    bytes32(MARKET_ID), bytes32(CONFIG_TYPE_HASH), bytes32(CODE.positionType),
    bytes32(CODE.vaultType), bytes32("0x0bd6c8139235be080d920271ab2afdbee9af6badc78ade2eed661f4c407a2adf"),
    bytes32("0xd20914d2863601569206fce44b94e3ff98e2a7c6453b519ee0e89790ba6ab283"),
    bytes32(CODE.assetTotalsType),
  ));
  const positionType = script(CODE.positionType, concat(bytes32(MARKET_ID), bytes32(ownerLockHash), bytes32(CODE.marketType)));
  const ckbVaultType = script(CODE.vaultType, concat(bytes32(MARKET_ID), bytes32(CKB_ASSET_ID), u8(1)));
  const ckbVaultLock = script(CODE.vaultLock, concat(bytes32(MARKET_ID), bytes32(CKB_ASSET_ID), bytes32(CODE.marketType), bytes32(CODE.vaultType)));
  const totalsType = script(CODE.assetTotalsType, concat(bytes32(MARKET_ID), bytes32(CKB_ASSET_ID)));

  if (!SEND) { console.log("dry run; pass --send"); process.exit(0); }

  const witness = bytesToHex(ccc.WitnessArgs.from({ inputType: actionHex(10) }).toBytes());
  const tx = ccc.Transaction.from({
    cellDeps: [
      { outPoint: { txHash: DEP.marketType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.positionType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.positionLock, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.vaultType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.vaultLock, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.assetTotalsType, index: 0 }, depType: "code" },
      { outPoint: { txHash: MARKET_TX, index: 0 }, depType: "code" },
      { outPoint: { txHash: MARKET_TX, index: 1 }, depType: "code" },
      { outPoint: ORACLE_OUTPOINT, depType: "code" },
    ],
    headerDeps: [tip.hash],
    inputs: [stateOut, positionOut, ckbVaultOut, totalsOut].map((o) => ccc.CellInput.from({ previousOutput: o, since: 0 })),
    outputs: [
      { capacity: stateCell.cellOutput.capacity, lock: address.script, type: marketType },
      { capacity: positionCell.cellOutput.capacity, lock: script(CODE.positionLock, concat(bytes32(MARKET_ID), bytes32(ownerLockHash), bytes32(CODE.accountType), bytes32(CODE.marketType), bytes32(CODE.approvalType))), type: positionType },
      { capacity: vaultCell.cellOutput.capacity, lock: ckbVaultLock, type: ckbVaultType },
      { capacity: totalsCell.cellOutput.capacity, lock: address.script, type: totalsType },
    ],
    outputsData: [bytesToHex(newState), bytesToHex(newPosition), bytesToHex(newVault), bytesToHex(newTotals)],
  });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 10000);
  for (let i = 0; i < 4; i++) tx.witnesses[i] = witness;
  const hash = await signer.sendTransaction(tx);
  console.log("absorb tx:", hash);
  tx.outputs.forEach((o, i) => console.log(`  ${i}: ${hash}:${i} capacity=${o.capacity} type=${o.type ? o.type.hash() : "none"}`));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
