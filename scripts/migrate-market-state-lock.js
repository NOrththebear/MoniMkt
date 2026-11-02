// Migrate the MarketState cell to the permissive market-state-lock.
const fs = require("fs");
const path = require("path");
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

const SEND = process.argv.includes("--send");
const MARKET_TX = "0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380";
const STATE_OUTPOINT = {
  txHash: "0xfef3caa84761d90cd21090a8bc0e3e7989c1646e75d8319754df4b8900eff1e2",
  index: 0,
};
const MARKET_TYPE =
  "0x9172f13db28292479142728fbeca4e60bc4b40724cd4791a382ad715b58fda33";
const MARKET_STATE_LOCK =
  "0x9a1b42f1c001b18e524ca766f83f8db0da351fdb5d91dc929ae9097499371ba5";
const CONFIG_TYPE_HASH =
  "0xf8caed6fa96fea950a25899596cdcee66b79ede10f844867e73edf6b060dc3b9";
const MARKET_ID =
  "0x70e26d96e2b61a1c8e33104ccaf066e18e1e371737b0c4871738874627ba7481";

const FACTOR = 10n ** 18n;
const INDEX = 10n ** 15n;
const YEAR = 31_536_000n;

function hexToBytes(h) { return Buffer.from(h.replace(/^0x/, ""), "hex"); }
function bytesToHex(b) { return "0x" + Buffer.from(b).toString("hex"); }
function u8(v) { return Buffer.from([v]); }
function u64le(v) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; }
function u128le(v) { const b = Buffer.alloc(16); let x = BigInt(v); for (let i = 0; i < 16; i++) { b[i] = Number(x & 0xffn); x >>= 8n; } return b; }
function u128FromLE(b) { let v = 0n; for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]); return v; }
function bytes32(h) { const b = Buffer.from(hexToBytes(h)); if (b.length !== 32) throw new Error("bad32"); return b; }
function concat(...p) { return Buffer.concat(p.map((x) => Buffer.from(x))); }
function script(c, a) { return ccc.Script.from({ codeHash: c, hashType: "type", args: bytesToHex(a) }); }

(async () => {
  const client = new ccc.ClientPublicTestnet();
  const key = fs.readFileSync(path.join(__dirname, "..", ".secrets", "testnet-deployer.key"), "utf8").trim();
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  const old = await client.getCell(STATE_OUTPOINT);
  if (!old) throw new Error("state cell not found");
  const data = hexToBytes(old.outputData);
  const supplyIndex = u128FromLE(data.slice(66, 82));
  const borrowIndex = u128FromLE(data.slice(82, 98));
  const totalSupply = u128FromLE(data.slice(130, 146));
  const totalBorrow = u128FromLE(data.slice(146, 162));
  const last = Number(u128FromLE(data.slice(178, 186)));

  const tip = await client.getTipHeader();
  const now = Math.floor(Number(BigInt(tip.timestamp)) / 1000);
  const dt = BigInt(now - last);
  const presentSupply = (totalSupply * supplyIndex) / INDEX;
  const presentBorrow = (totalBorrow * borrowIndex) / INDEX;
  const utilization = presentSupply === 0n ? 0n : (presentBorrow * FACTOR) / presentSupply;
  const supplyBase = 10_000_000_000_000_000n / YEAR;
  const supplySlope = 35_000_000_000_000_000n / YEAR;
  const borrowSlope = 40_000_000_000_000_000n / YEAR;
  const kink = 800_000_000_000_000_000n;
  const supplyRate = supplyBase + (supplySlope * utilization) / FACTOR;
  const borrowRate = utilization <= kink ? (borrowSlope * utilization) / FACTOR : 0n;
  const newSupplyIndex = supplyIndex + (supplyIndex * supplyRate * dt) / FACTOR;
  const newBorrowIndex = borrowIndex + (borrowIndex * borrowRate * dt) / FACTOR;

  const next = Buffer.from(data);
  u128le(newSupplyIndex).copy(next, 66);
  u128le(newBorrowIndex).copy(next, 82);
  u64le(now).copy(next, 178);

  const marketType = script(
    MARKET_TYPE,
    concat(
      bytes32(MARKET_ID),
      bytes32(CONFIG_TYPE_HASH),
      bytes32("0xa0f58d96515fb400d098e29c0a09d2ff58c8db1cbd64a285eeb7ad71a335bbdc"),
      bytes32("0x7cb11e5aa57978f74e3d2526a4bbc289fbb04e6e0a7b6cfba145fcc20b31980c"),
      bytes32("0x0bd6c8139235be080d920271ab2afdbee9af6badc78ade2eed661f4c407a2adf"),
      bytes32("0xd20914d2863601569206fce44b94e3ff98e2a7c6453b519ee0e89790ba6ab283"),
      bytes32("0xef551fc012c9d5f1df7c89e94dd953455567e82e60c955d1c8a060b6a288b4d8"),
    ),
  );
  const permissiveLock = ccc.Script.from({ codeHash: MARKET_STATE_LOCK, hashType: "type", args: "0x" });

  console.log("now:", now, "state:", bytesToHex(next));
  if (!SEND) { console.log("dry run; pass --send"); process.exit(0); }

  const action = bytesToHex(concat(u8(12), u8(0), u8(0), u8(0), u128le(0n), u128le(0n), Buffer.alloc(32)));
  const witness = bytesToHex(ccc.WitnessArgs.from({ inputType: action }).toBytes());
  const tx = ccc.Transaction.from({
    cellDeps: [
      { outPoint: { txHash: "0xcd9d81e249f1398fc6dfc40548cdd0f2f538de4e7ebca7b4a839c28d70b1492f", index: 0 }, depType: "code" },
      { outPoint: { txHash: MARKET_TX, index: 0 }, depType: "code" },
    ],
    headerDeps: [tip.hash],
    inputs: [ccc.CellInput.from({ previousOutput: STATE_OUTPOINT, since: 0 })],
    outputs: [{ capacity: old.cellOutput.capacity, lock: permissiveLock, type: marketType }],
    outputsData: [bytesToHex(next)],
    witnesses: [witness],
  });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 10000);
  tx.witnesses[0] = witness;
  const hash = await signer.sendTransaction(tx);
  console.log("state lock migration:", hash);
  console.log(`  new state: ${hash}:0`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
