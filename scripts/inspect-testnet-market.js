// Inspect the live MoniMkt testnet market cells.
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

const CELLS = {
  marketConfig: { txHash: "0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380", index: 0 },
  assetConfig: { txHash: "0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380", index: 1 },
  assetTotals: { txHash: "0xcb74ceec31f838f9f33725777d0958b20190b8068c3a67ed8ab27c7bf6720038", index: 4 },
  oracle: { txHash: "0x577f5881a6410a3e55c765e7bd0c57051ae416e4ea2b13fe4ec926f0940c2625", index: 0 },
  marketState: { txHash: "0xcb74ceec31f838f9f33725777d0958b20190b8068c3a67ed8ab27c7bf6720038", index: 0 },
  baseVault: { txHash: "0xf7f3f88cd88fee3abcb6953c21151693cbed04a848b40294632ac8fa1373180f", index: 3 },
  ckbVault: { txHash: "0xcb74ceec31f838f9f33725777d0958b20190b8068c3a67ed8ab27c7bf6720038", index: 3 },
  account: { txHash: "0xcb74ceec31f838f9f33725777d0958b20190b8068c3a67ed8ab27c7bf6720038", index: 2 },
  position: { txHash: "0xcb74ceec31f838f9f33725777d0958b20190b8068c3a67ed8ab27c7bf6720038", index: 1 },
  baseToken: { txHash: "0xf7f3f88cd88fee3abcb6953c21151693cbed04a848b40294632ac8fa1373180f", index: 4 },
};

function bytes(hex) {
  return Buffer.from(hex.replace(/^0x/, ""), "hex");
}
function u128LE(buf, offset) {
  let value = 0n;
  for (let i = 15; i >= 0; i--) value = (value << 8n) | BigInt(buf[offset + i]);
  return value;
}
function u64LE(buf, offset) {
  let value = 0n;
  for (let i = 7; i >= 0; i--) value = (value << 8n) | BigInt(buf[offset + i]);
  return value;
}
function fmt(value) {
  return `${value} (${Number(value) / 1e8})`;
}

(async () => {
  const client = new ccc.ClientPublicTestnet();
  for (const [name, outPoint] of Object.entries(CELLS)) {
    const cell = await client.getCell(outPoint);
    if (!cell) {
      console.log(`${name}: missing`);
      continue;
    }
    const data = bytes(cell.outputData);
    console.log(`${name}: ${outPoint.txHash}:${outPoint.index} capacity=${cell.cellOutput.capacity} data=${data.length}`);
    if (name === "marketState") {
      console.log(`  supply_index=${u128LE(data, 66)}`);
      console.log(`  borrow_index=${u128LE(data, 82)}`);
      console.log(`  total_supply_principal=${fmt(u128LE(data, 130))}`);
      console.log(`  total_borrow_principal=${fmt(u128LE(data, 146))}`);
      console.log(`  total_cash=${fmt(u128LE(data, 162))}`);
      console.log(`  last_accrual_time=${u64LE(data, 178)}`);
    }
    if (name === "baseVault" || name === "ckbVault") {
      console.log(`  amount=${fmt(u128LE(data, 65))}`);
    }
    if (name === "assetTotals") {
      console.log(`  total_supplied=${fmt(u128LE(data, 65))}`);
    }
    if (name === "position") {
      console.log(`  principal_negative=${data[65]} magnitude=${fmt(u128LE(data, 66))}`);
      console.log(`  nonce=${u64LE(data, 114)} assets_in=${data.readUInt32LE(122)}`);
      console.log(`  collateral[0]=${fmt(u128LE(data, 126))}`);
    }
    if (name === "account") {
      console.log(`  nonce=${u64LE(data, 65)}`);
    }
    if (name === "baseToken") {
      console.log(`  amount=${fmt(u128LE(data, 0))}`);
    }
    if (name === "oracle") {
      console.log(`  price=${u128LE(data, 33)} exponent=${data.readInt8(49)} timestamp=${u64LE(data, 50)}`);
    }
  }
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
