// Consume two obsolete Type ID code cells and return their capacity to the deployer.
const fs = require("fs");
const path = require("path");
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

const OUTPOINTS = [
  {
    txHash:
      "0x1a04a7871563df25c1095d7985601e002cc58feb31dcbd89bfdd73e79b121750",
    index: 0,
  },
  {
    txHash:
      "0xcf1c662c81c6016d236023a622ca037c2b106be1eb9cd068a5918b5e8f06a13d",
    index: 0,
  },
];

(async () => {
  const client = new ccc.ClientPublicTestnet();
  const key = fs
    .readFileSync(path.join(__dirname, "..", ".secrets", "testnet-deployer.key"), "utf8")
    .trim();
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  const address = await signer.getAddressObjSecp256k1();

  let total = 0n;
  for (const outpoint of OUTPOINTS) {
    const cell = await client.getCell(outpoint);
    if (!cell) throw new Error(`cell not found: ${outpoint.txHash}:${outpoint.index}`);
    const capacity = BigInt(cell.cellOutput.capacity);
    total += capacity;
    console.log(`consume ${outpoint.txHash}:${outpoint.index} = ${capacity} shannons`);
  }

  // Leave 0.01 CKB for the transaction fee.
  const fee = 1_000_000n;
  const tx = ccc.Transaction.from({
    inputs: OUTPOINTS.map((outpoint) =>
      ccc.CellInput.from({ previousOutput: outpoint, since: 0 }),
    ),
    outputs: [
      {
        capacity: total - fee,
        lock: address.script,
      },
    ],
    outputsData: ["0x"],
  });

  const hash = await signer.sendTransaction(tx);
  console.log("reclaim tx:", hash);
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
