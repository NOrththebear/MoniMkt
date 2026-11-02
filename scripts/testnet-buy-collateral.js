// Buy seized CKB from the v3 market at the liquidation discount.
const fs = require("fs");
const path = require("path");
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

const SEND = process.argv.includes("--send");
const MARKET_TX = "0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380";
const ABSORB_TX = "0xee7dafae208076bbda8afdfd8979fa2f346bb9a4255d1693f4e41457fb17d7fd";
const BORROW_TX = "0xcef0da2cc25b56ab642594d8a354dbc02c5d0fbfb1158d6b26fcb3b7b193ec15";
const ORACLE_OUTPOINT = { txHash: "0x1bf15d4c78baf84e106ceb730068e12416327ba6e722d290299e7a5708fbc7e3", index: 0 };

const MARKET_ID = "0x70e26d96e2b61a1c8e33104ccaf066e18e1e371737b0c4871738874627ba7481";
const CONFIG_TYPE_HASH = "0xf8caed6fa96fea950a25899596cdcee66b79ede10f844867e73edf6b060dc3b9";
const RUSD_ASSET_ID = "0xe016940e96b9ad2d6505d06996a24f84dbc319ce1a0b0a619aa6af26ce190a3a";
const CKB_ASSET_ID = "0x434b420000000000000000000000000000000000000000000000000000000000";
const XUDT_ARGS = "0x17a32809302cdca3ffdfde54659dc6d0e3e2d7ce6d8e79616cc72e4e4eff6d2c";

const CODE = {
  marketType: "0x9172f13db28292479142728fbeca4e60bc4b40724cd4791a382ad715b58fda33",
  vaultType: "0x7cb11e5aa57978f74e3d2526a4bbc289fbb04e6e0a7b6cfba145fcc20b31980c",
  vaultLock: "0x8868ee05f78a75052162ba833cbdd4437d2be9957618287b67030c1b64dfdf51",
  baseTokenLock: "0x10c2e4f8913ebb1a556ccc749f64a64d6978eda27ded0e3d3746ceacf7651620",
  assetTotalsType: "0xef551fc012c9d5f1df7c89e94dd953455567e82e60c955d1c8a060b6a288b4d8",
};
const DEP = {
  marketType: "0xcd9d81e249f1398fc6dfc40548cdd0f2f538de4e7ebca7b4a839c28d70b1492f",
  vaultType: "0x8d696b4daf41bf6d36f29eb243b5a6bfb548e56da6c6b73fa8f05b74ab2eee2a",
  vaultLock: "0x9a448f8a65c61031c183148a0e4692e3531a4793854189591c3916f37e60dbdb",
  baseTokenLock: "0x636e2ff2d5eb10ac77ab618bb6ce77f9b374b39e66d749bf163f0fe78bdaee2d",
  assetTotalsType: "0x7a1254abddd616f1057123ed50b816d9e6d03ce19bfa2beb9a905d71912131b0",
};

const RUSD = 100000000n;
const BASE_IN = 10n * RUSD;
const FACTOR = 10n ** 18n;
const INDEX = 10n ** 15n;
const YEAR = 31_536_000n;

function hexToBytes(h) { return Buffer.from(h.replace(/^0x/, ""), "hex"); }
function bytesToHex(b) { return "0x" + Buffer.from(b).toString("hex"); }
function u8(v) { return Buffer.from([v]); }
function u32le(v) { const b = Buffer.alloc(4); b.writeUInt32LE(Number(v)); return b; }
function u64le(v) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; }
function u128le(v) { const b = Buffer.alloc(16); let x = BigInt(v); for (let i = 0; i < 16; i++) { b[i] = Number(x & 0xffn); x >>= 8n; } return b; }
function bytes32(h) { const b = Buffer.from(hexToBytes(h)); if (b.length !== 32) throw new Error("bad32"); return b; }
function concat(...p) { return Buffer.concat(p.map((x) => Buffer.from(x))); }
function u128FromLE(bytes) { let v = 0n; for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]); return v; }
function script(c, a) { return ccc.Script.from({ codeHash: c, hashType: "type", args: bytesToHex(a) }); }
async function getCell(client, o) { const c = await client.getCell(o); if (!c) throw new Error(`missing ${o.txHash}:${o.index}`); return c; }
async function rpc(method, params) {
  const r = await fetch("https://testnet.ckb.dev", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }) });
  const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result;
}
function actionHex(tag, baseIn, minOut) {
  return bytesToHex(concat(u8(tag), u8(0), u8(0), u8(0), u128le(baseIn), u128le(minOut), Buffer.alloc(32)));
}

(async () => {
  const client = new ccc.ClientPublicTestnet();
  const key = fs.readFileSync(path.join(__dirname, "..", ".secrets", "testnet-deployer.key"), "utf8").trim();
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  const address = await signer.getAddressObjSecp256k1();
  const ownerLockHash = address.script.hash();

  const stateOut = { txHash: ABSORB_TX, index: 0 };
  const ckbVaultOut = { txHash: ABSORB_TX, index: 2 };
  const totalsOut = { txHash: ABSORB_TX, index: 3 };
  const baseVaultOut = { txHash: BORROW_TX, index: 3 };
  const baseTokenOut = { txHash: BORROW_TX, index: 4 };
  const rusdOut = { txHash: BORROW_TX, index: 5 };
  const [stateCell, ckbVaultCell, totalsCell, baseVaultCell, baseTokenCell, rusdCell] = await Promise.all(
    [stateOut, ckbVaultOut, totalsOut, baseVaultOut, baseTokenOut, rusdOut].map((o) => getCell(client, o)),
  );

  const oldState = hexToBytes(stateCell.outputData);
  const oldCkbVault = hexToBytes(ckbVaultCell.outputData);
  const oldTotals = hexToBytes(totalsCell.outputData);
  const oldBaseVault = hexToBytes(baseVaultCell.outputData);
  const oldBaseToken = hexToBytes(baseTokenCell.outputData);
  const walletRusd = u128FromLE(hexToBytes(rusdCell.outputData));

  const supplyIndex = u128FromLE(oldState.slice(66, 82));
  const borrowIndex = u128FromLE(oldState.slice(82, 98));
  const totalSupply = u128FromLE(oldState.slice(130, 146));
  const totalBorrow = u128FromLE(oldState.slice(146, 162));
  const totalCash = u128FromLE(oldState.slice(162, 178));
  const last = Number(u128FromLE(oldState.slice(178, 186)));
  const ckbAmount = u128FromLE(oldCkbVault.slice(65, 81));
  const baseAmount = u128FromLE(oldBaseVault.slice(65, 81));
  const tokenAmount = u128FromLE(oldBaseToken.slice(0, 16));
  const totalSupplied = u128FromLE(oldTotals.slice(65, 81));

  const tip = await rpc("get_tip_header", []);
  const now = Math.floor(Number(BigInt(tip.timestamp)) / 1000);
  const dt = BigInt(now - last);
  const presentSupply = (totalSupply * supplyIndex) / INDEX;
  const presentBorrow = (totalBorrow * borrowIndex) / INDEX;
  const utilization = presentSupply === 0n ? 0n : (presentBorrow * FACTOR) / presentSupply;
  const supplyBase = 10_000_000_000_000_000n / YEAR;
  const supplySlope = 35_000_000_000_000_000n / YEAR;
  const rateSupply = supplyBase + (supplySlope * utilization) / FACTOR;
  const newSupplyIndex = supplyIndex + (supplyIndex * rateSupply * dt) / FACTOR;

  // quote_collateral for base-denominated market.
  const discount = (500_000_000_000_000_000n * (FACTOR - 900_000_000_000_000_000n)) / FACTOR;
  const discountedPrice = (2_000_000n * (FACTOR - discount)) / FACTOR;
  const value = (100_000_000n * BASE_IN) / 100_000_000n;
  const collateralOut = (value * 100_000_000n) / discountedPrice;
  if (collateralOut > ckbAmount - totalSupplied) throw new Error("exceeds collateral reserves");

  const newState = Buffer.from(oldState);
  u128le(newSupplyIndex).copy(newState, 66);
  u128le(borrowIndex).copy(newState, 82);
  u128le(totalCash + BASE_IN).copy(newState, 162);
  u64le(now).copy(newState, 178);

  const newCkbVault = Buffer.from(oldCkbVault);
  u128le(ckbAmount - collateralOut).copy(newCkbVault, 65);
  const newBaseVault = Buffer.from(oldBaseVault);
  u128le(baseAmount + BASE_IN).copy(newBaseVault, 65);

  console.log("now:", now, "dt:", dt.toString());
  console.log("base in:", BASE_IN.toString(), "collateral out:", collateralOut.toString());
  console.log("CKB vault amount:", ckbAmount.toString(), "->", (ckbAmount - collateralOut).toString());
  console.log("base vault:", baseAmount.toString(), "->", (baseAmount + BASE_IN).toString());

  const marketType = script(CODE.marketType, concat(
    bytes32(MARKET_ID), bytes32(CONFIG_TYPE_HASH), bytes32("0xa0f58d96515fb400d098e29c0a09d2ff58c8db1cbd64a285eeb7ad71a335bbdc"),
    bytes32(CODE.vaultType), bytes32("0x0bd6c8139235be080d920271ab2afdbee9af6badc78ade2eed661f4c407a2adf"),
    bytes32("0xd20914d2863601569206fce44b94e3ff98e2a7c6453b519ee0e89790ba6ab283"),
    bytes32(CODE.assetTotalsType),
  ));
  const ckbVaultType = script(CODE.vaultType, concat(bytes32(MARKET_ID), bytes32(CKB_ASSET_ID), u8(1)));
  const ckbVaultLock = script(CODE.vaultLock, concat(bytes32(MARKET_ID), bytes32(CKB_ASSET_ID), bytes32(CODE.marketType), bytes32(CODE.vaultType)));
  const baseVaultType = script(CODE.vaultType, concat(bytes32(MARKET_ID), bytes32(RUSD_ASSET_ID), u8(0)));
  const baseVaultLock = script(CODE.vaultLock, concat(bytes32(MARKET_ID), bytes32(RUSD_ASSET_ID), bytes32(CODE.marketType), bytes32(CODE.vaultType)));
  const baseTokenLock = script(CODE.baseTokenLock, concat(bytes32(MARKET_ID), bytes32(RUSD_ASSET_ID), bytes32(CODE.marketType), bytes32(CODE.vaultType)));
  const totalsType = script(CODE.assetTotalsType, concat(bytes32(MARKET_ID), bytes32(CKB_ASSET_ID)));
  const xudtType = await ccc.Script.fromKnownScript(client, ccc.KnownScript.XUdt, XUDT_ARGS);

  if (!SEND) { console.log("dry run; pass --send"); process.exit(0); }
  const witness = bytesToHex(ccc.WitnessArgs.from({ inputType: actionHex(11, BASE_IN, collateralOut) }).toBytes());

  const tx = ccc.Transaction.from({
    cellDeps: [
      { outPoint: { txHash: DEP.marketType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.vaultType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.vaultLock, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.baseTokenLock, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.assetTotalsType, index: 0 }, depType: "code" },
      { outPoint: { txHash: MARKET_TX, index: 0 }, depType: "code" },
      { outPoint: { txHash: MARKET_TX, index: 1 }, depType: "code" },
      { outPoint: ORACLE_OUTPOINT, depType: "code" },
    ],
    headerDeps: [tip.hash],
    inputs: [stateOut, ckbVaultOut, totalsOut, baseVaultOut, baseTokenOut, rusdOut].map((o) => ccc.CellInput.from({ previousOutput: o, since: 0 })),
    outputs: [
      { capacity: stateCell.cellOutput.capacity, lock: address.script, type: marketType },
      { capacity: BigInt(ckbVaultCell.cellOutput.capacity) - collateralOut, lock: ckbVaultLock, type: ckbVaultType },
      { capacity: totalsCell.cellOutput.capacity, lock: address.script, type: totalsType },
      { capacity: baseVaultCell.cellOutput.capacity, lock: baseVaultLock, type: baseVaultType },
      { capacity: baseTokenCell.cellOutput.capacity, lock: baseTokenLock, type: xudtType },
      { capacity: rusdCell.cellOutput.capacity, lock: address.script, type: xudtType },
      { capacity: collateralOut, lock: address.script },
    ],
    outputsData: [
      bytesToHex(newState),
      bytesToHex(newCkbVault),
      bytesToHex(oldTotals),
      bytesToHex(newBaseVault),
      bytesToHex(u128le(tokenAmount + BASE_IN)),
      bytesToHex(u128le(walletRusd - BASE_IN)),
      "0x",
    ],
  });
  await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.XUdt);
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 10000);
  for (let i = 0; i < 6; i++) tx.witnesses[i] = witness;
  const hash = await signer.sendTransaction(tx);
  console.log("buy tx:", hash);
  tx.outputs.forEach((o, i) => console.log(`  ${i}: ${hash}:${i} capacity=${o.capacity} type=${o.type ? o.type.hash() : "none"}`));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
