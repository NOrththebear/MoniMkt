// Migrate the CKB AssetTotals cell to the permissive market-state-lock.
const fs = require("fs");
const path = require("path");
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

(async () => {
  const client = new ccc.ClientPublicTestnet();
  const key = fs.readFileSync(path.join(__dirname, "..", ".secrets", "testnet-deployer.key"), "utf8").trim();
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  const outpoint = { txHash: "0xfef3caa84761d90cd21090a8bc0e3e7989c1646e75d8319754df4b8900eff1e2", index: 2 };
  const old = await client.getCell(outpoint);
  if (!old) throw new Error("totals cell not found");
  const permissive = ccc.Script.from({
    codeHash: "0x9a1b42f1c001b18e524ca766f83f8db0da351fdb5d91dc929ae9097499371ba5",
    hashType: "type",
    args: "0x",
  });
  const tx = ccc.Transaction.from({
    cellDeps: [
      { outPoint: { txHash: "0x7a1254abddd616f1057123ed50b816d9e6d03ce19bfa2beb9a905d71912131b0", index: 0 }, depType: "code" },
    ],
    inputs: [ccc.CellInput.from({ previousOutput: outpoint, since: 0 })],
    outputs: [{ capacity: old.cellOutput.capacity, lock: permissive, type: old.cellOutput.type }],
    outputsData: [old.outputData],
  });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 20000);
  const hash = await signer.sendTransaction(tx);
  console.log("totals lock migration:", hash);
  console.log(`  new totals: ${hash}:0`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
