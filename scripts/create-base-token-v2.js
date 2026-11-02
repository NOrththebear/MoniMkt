// Create the v2 custody token cell (new multi-cell base-token-lock).
const fs = require("fs");
const path = require("path");
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

const MARKET_ID =
  "0x70e26d96e2b61a1c8e33104ccaf066e18e1e371737b0c4871738874627ba7481";
const RUSD_ASSET_ID =
  "0xe016940e96b9ad2d6505d06996a24f84dbc319ce1a0b0a619aa6af26ce190a3a";
const RUSD_ARGS =
  "0x17a32809302cdca3ffdfde54659dc6d0e3e2d7ce6d8e79616cc72e4e4eff6d2c";
const MARKET_TYPE =
  "0x9172f13db28292479142728fbeca4e60bc4b40724cd4791a382ad715b58fda33";
const VAULT_TYPE =
  "0x7cb11e5aa57978f74e3d2526a4bbc289fbb04e6e0a7b6cfba145fcc20b31980c";
const BASE_TOKEN_LOCK =
  "0xb7cd9a37752b68ac47aab635e884b8c211cb5973aa3e2d5f9a174aac2d4c1f68";
const AMOUNT = 170n * 100000000n;

const b32 = (h) => Buffer.from(h.slice(2), "hex");
const cat = (...a) => Buffer.concat(a.map((x) => Buffer.from(x)));
const hex = (b) => "0x" + Buffer.from(b).toString("hex");
function u128le(v) {
  const b = Buffer.alloc(16);
  let x = BigInt(v);
  for (let i = 0; i < 16; i++) { b[i] = Number(x & 255n); x >>= 8n; }
  return hex(b);
}
function amount(h) {
  const b = Buffer.from(h.slice(2), "hex");
  let v = 0n;
  for (let i = 15; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
  return v;
}
(async () => {
  const client = new ccc.ClientPublicTestnet();
  const key = fs.readFileSync(path.join(__dirname, "..", ".secrets", "testnet-deployer.key"), "utf8").trim();
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  const from = await signer.getRecommendedAddressObj();
  const xudt = await ccc.Script.fromKnownScript(client, ccc.KnownScript.XUdt, RUSD_ARGS);
  const baseLock = ccc.Script.from({
    codeHash: BASE_TOKEN_LOCK,
    hashType: "type",
    args: hex(cat(b32(MARKET_ID), b32(RUSD_ASSET_ID), b32(MARKET_TYPE), b32(VAULT_TYPE))),
  });
  let source = null, sourceAmount = 0n;
  for await (const cell of client.findCellsByLock(from.script, xudt, true, "desc", 30)) {
    const a = amount(cell.outputData);
    if (a >= AMOUNT && (!source || a > sourceAmount)) { source = cell; sourceAmount = a; }
  }
  if (!source) throw new Error("no RUSD source");
  const outputs = [
    { capacity: 500n * 100000000n, lock: baseLock, type: xudt },
    { capacity: source.cellOutput.capacity, lock: from.script, type: xudt },
  ];
  const data = [u128le(AMOUNT), u128le(sourceAmount - AMOUNT)];
  const tx = ccc.Transaction.from({
    inputs: [ccc.CellInput.from({ previousOutput: source.outPoint, since: 0 })],
    outputs,
    outputsData: data,
  });
  await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.XUdt);
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 20000);
  const hash = await signer.sendTransaction(tx);
  console.log("base token v2 tx:", hash);
  console.log(`  token cell: ${hash}:0`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
