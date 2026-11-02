// Update the v3 CKB oracle cell.
// Usage: node scripts/testnet-oracle.js --price 0.02 --send
const fs = require("fs");
const path = require("path");
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

const args = process.argv.slice(2);
const SEND = args.includes("--send");
const priceArg = args.includes("--price") ? args[args.indexOf("--price") + 1] : "0.02";

const ORACLE_TYPE = {
  codeHash: "0x0bd6c8139235be080d920271ab2afdbee9af6badc78ade2eed661f4c407a2adf",
  dep: "0x676d2e33ddfa4960e3d9a60b7992416383f62d32dc7d6f3ac3e6a8d59b23dee8",
};
const CKB_ASSET_ID =
  "0x434b420000000000000000000000000000000000000000000000000000000000";
const PUBLISHER_SET_HASH =
  "0x" +
  require("crypto")
    .createHash("sha256")
    .update("monimkt-testnet-oracle-publishers")
    .digest("hex");

function hexToBytes(hex) { return Buffer.from(hex.replace(/^0x/, ""), "hex"); }
function bytesToHex(bytes) { return "0x" + Buffer.from(bytes).toString("hex"); }
function u8(v) { return Buffer.from([v]); }
function u64le(v) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; }
function u128le(v) {
  const b = Buffer.alloc(16); let x = BigInt(v);
  for (let i = 0; i < 16; i++) { b[i] = Number(x & 0xffn); x >>= 8n; }
  return b;
}
function bytes32(hex) { const b = Buffer.from(hexToBytes(hex)); if (b.length !== 32) throw new Error("bad 32"); return b; }
function concat(...p) { return Buffer.concat(p.map((x) => Buffer.from(x))); }

(async () => {
  const price = BigInt(Math.round(Number(priceArg) * 1e8));
  const now = Math.floor(Date.now() / 1000);
  const data = concat(
    u8(1),
    bytes32(CKB_ASSET_ID),
    u128le(price),
    u8(0xff), // i8 -1? replaced below
    u64le(now),
    u128le(0n),
    bytes32(PUBLISHER_SET_HASH),
    Buffer.alloc(32),
  );
  // exponent = -8
  data[49] = 0xf8;

  const client = new ccc.ClientPublicTestnet();
  const key = fs.readFileSync(path.join(__dirname, "..", ".secrets", "testnet-deployer.key"), "utf8").trim();
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  const address = await signer.getAddressObjSecp256k1();
  const oracleType = ccc.Script.from({
    codeHash: ORACLE_TYPE.codeHash,
    hashType: "type",
    args: bytesToHex(concat(bytes32(CKB_ASSET_ID), bytes32(PUBLISHER_SET_HASH))),
  });
  let old;
  let bestTimestamp = -1;
  for await (const cell of client.findCells(
    { script: oracleType, scriptType: "type", scriptSearchMode: "exact", withData: true },
    "desc",
    20,
  )) {
    const cellData = hexToBytes(cell.outputData);
    const timestamp = Number(cellData.slice(50, 58).readBigUInt64LE());
    if (timestamp > bestTimestamp) {
      old = cell;
      bestTimestamp = timestamp;
    }
  }
  if (!old) throw new Error("oracle cell not found");
  console.log("price:", price.toString(), "timestamp:", now, "data:", bytesToHex(data));
  if (!SEND) { console.log("dry run; pass --send"); process.exit(0); }

  const tx = ccc.Transaction.from({
    cellDeps: [{ outPoint: { txHash: ORACLE_TYPE.dep, index: 0 }, depType: "code" }],
    inputs: [ccc.CellInput.from({ previousOutput: old.outPoint, since: 0 })],
    outputs: [
      {
        capacity: old.cellOutput.capacity,
        lock: address.script,
        type: oracleType,
      },
    ],
    outputsData: [bytesToHex(data)],
  });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 10000);
  const hash = await signer.sendTransaction(tx);
  console.log("oracle tx:", hash);
  console.log(`  new oracle: ${hash}:0`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
