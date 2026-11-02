// Send Mock RUSD (and a little CKB for fees/capacity) from the deployer wallet.
// Usage: node scripts/send-rusd.js <address> [rusdAmount] [ckbAmount]
const fs = require("fs");
const path = require("path");
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

const ADDRESS = process.argv[2];
const RUSD_AMOUNT = BigInt(process.argv[3] || "1000") * 100000000n;
const CKB_AMOUNT = BigInt(process.argv[4] || "1000") * 100000000n;
const RUSD_ARGS = "0x17a32809302cdca3ffdfde54659dc6d0e3e2d7ce6d8e79616cc72e4e4eff6d2c";
const RPC = "https://testnet.ckb.dev";

function u128le(v) {
  const b = Buffer.alloc(16);
  let x = BigInt(v);
  for (let i = 0; i < 16; i++) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}
function hex(bytes) {
  return "0x" + Buffer.from(bytes).toString("hex");
}
function bytes(hexValue) {
  return Buffer.from(hexValue.replace(/^0x/, ""), "hex");
}
function amountFromData(data) {
  const b = bytes(data);
  let v = 0n;
  for (let i = 15; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
  return v;
}
async function waitCommit(hash) {
  for (let i = 0; i < 120; i++) {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "get_transaction", params: [hash] }),
    });
    const json = await res.json();
    const status = json?.result?.tx_status?.status;
    if (status === "committed") return;
    if (status === "rejected") throw new Error(json.result.tx_status.reason);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("confirmation timeout");
}

(async () => {
  if (!ADDRESS) throw new Error("usage: node scripts/send-rusd.js <address> [rusd] [ckb]");
  const client = new ccc.ClientPublicTestnet();
  const key = fs.readFileSync(path.join(__dirname, "..", ".secrets", "testnet-deployer.key"), "utf8").trim();
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  const from = await signer.getRecommendedAddressObj();
  const to = await ccc.Address.fromString(ADDRESS, client);
  const xudtType = await ccc.Script.fromKnownScript(client, ccc.KnownScript.XUdt, RUSD_ARGS);

  let source = null;
  let sourceAmount = 0n;
  for await (const cell of client.findCellsByLock(from.script, xudtType, true, "desc", 30)) {
    const amount = amountFromData(cell.outputData);
    if (amount >= RUSD_AMOUNT && (!source || amount > sourceAmount)) {
      source = cell;
      sourceAmount = amount;
    }
  }
  if (!source) throw new Error("deployer has no single RUSD cell large enough");

  const tx = ccc.Transaction.from({
    inputs: [ccc.CellInput.from({ previousOutput: source.outPoint, since: 0 })],
    outputs: [
      { capacity: 300n * 100000000n, lock: to.script, type: xudtType },
      { capacity: 500n * 100000000n, lock: from.script, type: xudtType },
      { capacity: CKB_AMOUNT, lock: to.script },
    ],
    outputsData: [hex(u128le(RUSD_AMOUNT)), hex(u128le(sourceAmount - RUSD_AMOUNT)), "0x"],
  });
  await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.XUdt);
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 20000);
  const hash = await signer.sendTransaction(tx);
  console.log("send tx:", hash);
  await waitCommit(hash);
  console.log(`sent ${RUSD_AMOUNT / 100000000n} RUSD and ${CKB_AMOUNT / 100000000n} CKB to ${ADDRESS}`);

  let received = 0n;
  for await (const cell of client.findCellsByLock(to.script, xudtType, true, "desc", 30)) {
    received += amountFromData(cell.outputData);
  }
  console.log("recipient RUSD balance:", received.toString(), `(${received / 100000000n} RUSD)`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
