// Borrow Mock RUSD from the MoniMkt testnet market.
//
// Usage:
//   node scripts/testnet-borrow.js          # dry run
//   node scripts/testnet-borrow.js --send   # send transaction
const fs = require("fs");
const path = require("path");
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

const SEND = process.argv.includes("--send");

const MARKET_TX = "0x8068c38f66c471f1195953833f58420f55ce85f1292dc0552fbc0b46dd108707";
const COLLATERAL_TX = "0x6f5c2b19438a49a674dfea781f4fb569c8c5e5433dd2aec1946bd0cb2cfd2449";
const BASE_TX = "0x858f167c1f51562cdecffa059f248553a024068d413cea2518c0d935c030cc84";
const CONFIG_OUTPOINT = { txHash: MARKET_TX, index: 0 };
const ASSET_CONFIG_OUTPOINT = { txHash: MARKET_TX, index: 1 };
const ORACLE_OUTPOINT = { txHash: MARKET_TX, index: 3 };

const MARKET_ID =
  "0xbbdf1ecbf068ed59c0a13c93f603b6243b1886272ab9ff64c9159a221df87c7b";
const RUSD_ASSET_ID =
  "0xe016940e96b9ad2d6505d06996a24f84dbc319ce1a0b0a619aa6af26ce190a3a";
const XUDT_ARGS = "0x17a32809302cdca3ffdfde54659dc6d0e3e2d7ce6d8e79616cc72e4e4eff6d2c";

const CODE = {
  marketType: "0x6263c538234aaf7642d0bfb47e161f8f77037f684e10beb8e583b44c538cf432",
  accountType: "0x5b5c9ef26e0aa0ad5ab42250338b7b4db5710a21226c086f9f0b5a1c3cf02b12",
  positionType: "0xa0f58d96515fb400d098e29c0a09d2ff58c8db1cbd64a285eeb7ad71a335bbdc",
  positionLock: "0xcf4242a372739fe07e348782f1c5b365e08fbbefbd9eca4494b9c7071adfde90",
  vaultType: "0x7cb11e5aa57978f74e3d2526a4bbc289fbb04e6e0a7b6cfba145fcc20b31980c",
  vaultLock: "0x8868ee05f78a75052162ba833cbdd4437d2be9957618287b67030c1b64dfdf51",
  approvalType: "0x5920bee56487e7e82dfb872f8157a5d53c7add1953ba033261516a2ef1ab92ae",
};

const DEP = {
  marketType: "0xaabcbae24fcd41ea1b7d4422c01c434833dafc26ccabde89d60a613fc74d35eb",
  accountType: "0xf72f1e264525a5122a3e14b81094a01e64b08534b0faef211520cf533422c98e",
  positionType: "0xeddfa8c566ee439c1760ed19c13b21a4aad0d899b7e4f5cb570d69b4917c8f28",
  positionLock: "0x35e4ef7cfb92227518a4cbbb7237e606b2a68b74b9a95e8474937fa45c050ec2",
  vaultType: "0x8d696b4daf41bf6d36f29eb243b5a6bfb548e56da6c6b73fa8f05b74ab2eee2a",
  vaultLock: "0x9a448f8a65c61031c183148a0e4692e3531a4793854189591c3916f37e60dbdb",
};

const RUSD = 100000000n;
const BORROW_AMOUNT = 10n * RUSD;
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
function updateState(oldData, { supplyIndex, borrowIndex, totalSupply, totalCash, last }) {
  const next = Buffer.from(oldData);
  u128le(supplyIndex).copy(next, 66);
  u128le(borrowIndex).copy(next, 82);
  u128le(totalSupply).copy(next, 130);
  u128le(totalCash).copy(next, 162);
  u64le(BigInt(last)).copy(next, 178);
  return next;
}
function updatePosition(oldData, { principal, nonce }) {
  const next = Buffer.from(oldData);
  next[65] = 0;
  u128le(principal).copy(next, 66);
  u64le(BigInt(nonce)).copy(next, 114);
  return next;
}
function updateAccount(oldData, nonce) {
  const next = Buffer.from(oldData);
  u64le(BigInt(nonce)).copy(next, 65);
  return next;
}
function updateVault(oldData, amount) {
  const next = Buffer.from(oldData);
  u128le(amount).copy(next, 65);
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

  const stateOut = { txHash: COLLATERAL_TX, index: 0 };
  const positionOut = { txHash: COLLATERAL_TX, index: 1 };
  const accountOut = { txHash: COLLATERAL_TX, index: 2 };
  const baseVaultOut = { txHash: BASE_TX, index: 3 };
  const baseTokenOut = { txHash: BASE_TX, index: 4 };
  const rusdOut = { txHash: BASE_TX, index: 5 };

  const cells = await Promise.all(
    [stateOut, positionOut, accountOut, baseVaultOut, baseTokenOut, rusdOut].map(
      (outPoint) => getCell(client, outPoint),
    ),
  );
  const [stateCell, positionCell, accountCell, baseVaultCell, baseTokenCell, rusdCell] =
    cells;

  const oldState = hexToBytes(stateCell.outputData);
  const oldPosition = hexToBytes(positionCell.outputData);
  const oldAccount = hexToBytes(accountCell.outputData);
  const oldVault = hexToBytes(baseVaultCell.outputData);
  const oldToken = hexToBytes(baseTokenCell.outputData);
  const rusdBalance = u128FromLE(hexToBytes(rusdCell.outputData));

  const oldSupplyIndex = u128FromLE(oldState.slice(66, 82));
  const oldBorrowIndex = u128FromLE(oldState.slice(82, 98));
  const oldTotalSupply = u128FromLE(oldState.slice(130, 146));
  const oldTotalCash = u128FromLE(oldState.slice(162, 178));
  const oldLast = Number(u128FromLE(oldState.slice(178, 186)));
  const oldVaultAmount = u128FromLE(oldVault.slice(65, 81));
  const oldTokenAmount = u128FromLE(oldToken.slice(0, 16));
  const oldPrincipal = u128FromLE(oldPosition.slice(66, 82));
  const oldNonce = Number(u128FromLE(oldPosition.slice(114, 122)));
  const oldAccountNonce = Number(u128FromLE(oldAccount.slice(65, 73)));

  if (oldPrincipal < BORROW_AMOUNT) {
    throw new Error("position supply is smaller than the requested borrow");
  }

  const tip = await rpc("get_tip_header", []);
  const now = Math.floor(Number(BigInt(tip.timestamp)) / 1000);
  if (now < oldLast) throw new Error(`header time ${now} < last accrual ${oldLast}`);
  const dt = BigInt(now - oldLast);
  const perSecondBase = 10_000_000_000_000_000n / 31_536_000n;
  const supplyIndex = oldSupplyIndex + (oldSupplyIndex * perSecondBase * dt) / 10n ** 18n;
  const borrowIndex = oldBorrowIndex;

  const oldPresent = (oldPrincipal * supplyIndex) / INDEX;
  const newPresent = oldPresent - BORROW_AMOUNT;
  const newPrincipal = (newPresent * INDEX) / supplyIndex;
  const principalDelta = oldPrincipal - newPrincipal;

  const newState = updateState(oldState, {
    supplyIndex,
    borrowIndex,
    totalSupply: oldTotalSupply - principalDelta,
    totalCash: oldTotalCash - BORROW_AMOUNT,
    last: now,
  });
  const newPosition = updatePosition(oldPosition, {
    principal: newPrincipal,
    nonce: oldNonce + 1,
  });
  const newAccount = updateAccount(oldAccount, oldAccountNonce + 1);
  const newVault = updateVault(oldVault, oldVaultAmount - BORROW_AMOUNT);

  console.log("now:", now, "dt:", dt.toString());
  console.log("borrow:", BORROW_AMOUNT.toString());
  console.log("old principal:", oldPrincipal.toString(), "new:", newPrincipal.toString());
  console.log("base vault:", oldVaultAmount.toString(), "->", (oldVaultAmount - BORROW_AMOUNT).toString());
  console.log("RUSD wallet:", rusdBalance.toString(), "->", (rusdBalance + BORROW_AMOUNT).toString());

  const marketType = script(
    CODE.marketType,
    concat(
      bytes32(MARKET_ID),
      bytes32("0x98b23352b224c175ff8220a54484091594f00601d52a9a33b3f908517be66371"),
      bytes32(CODE.positionType),
      bytes32(CODE.vaultType),
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
  const accountType = script(
    CODE.accountType,
    concat(bytes32(MARKET_ID), bytes32(ownerLockHash)),
  );
  const baseVaultType = script(
    CODE.vaultType,
    concat(bytes32(MARKET_ID), bytes32(RUSD_ASSET_ID), u8(0)),
  );
  const baseVaultLock = script(
    CODE.vaultLock,
    concat(
      bytes32(MARKET_ID),
      bytes32(RUSD_ASSET_ID),
      bytes32(CODE.marketType),
      bytes32(CODE.vaultType),
    ),
  );
  const xudtType = await ccc.Script.fromKnownScript(
    client,
    ccc.KnownScript.XUdt,
    XUDT_ARGS,
  );

  if (!SEND) {
    console.log("dry run; pass --send to broadcast");
    process.exit(0);
  }

  const action = actionHex(6, BORROW_AMOUNT); // BORROW
  const witness = bytesToHex(ccc.WitnessArgs.from({ inputType: action }).toBytes());

  const tx = ccc.Transaction.from({
    cellDeps: [
      { outPoint: { txHash: DEP.marketType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.accountType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.positionType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.positionLock, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.vaultType, index: 0 }, depType: "code" },
      { outPoint: { txHash: DEP.vaultLock, index: 0 }, depType: "code" },
      { outPoint: CONFIG_OUTPOINT, depType: "code" },
      { outPoint: ASSET_CONFIG_OUTPOINT, depType: "code" },
      { outPoint: ORACLE_OUTPOINT, depType: "code" },
    ],
    headerDeps: [tip.hash],
    inputs: [stateOut, positionOut, accountOut, baseVaultOut, baseTokenOut, rusdOut].map(
      (outPoint) => ccc.CellInput.from({ previousOutput: outPoint, since: 0 }),
    ),
    outputs: [
      { capacity: stateCell.cellOutput.capacity, lock: address.script, type: marketType },
      { capacity: positionCell.cellOutput.capacity, lock: positionLock, type: positionType },
      { capacity: accountCell.cellOutput.capacity, lock: address.script, type: accountType },
      { capacity: baseVaultCell.cellOutput.capacity, lock: baseVaultLock, type: baseVaultType },
      { capacity: baseTokenCell.cellOutput.capacity, lock: baseVaultLock, type: xudtType },
      { capacity: rusdCell.cellOutput.capacity, lock: address.script, type: xudtType },
    ],
    outputsData: [
      bytesToHex(newState),
      bytesToHex(newPosition),
      bytesToHex(newAccount),
      bytesToHex(newVault),
      bytesToHex(u128le(oldTokenAmount - BORROW_AMOUNT)),
      bytesToHex(u128le(rusdBalance + BORROW_AMOUNT)),
    ],
  });

  await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.XUdt);
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 10000);

  tx.witnesses[0] = witness;
  tx.witnesses[1] = witness;
  tx.witnesses[2] = witness;
  tx.witnesses[3] = witness;
  tx.witnesses[4] = witness;
  tx.witnesses[5] = witness;

  const hash = await signer.sendTransaction(tx);
  console.log("borrow tx:", hash);
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
