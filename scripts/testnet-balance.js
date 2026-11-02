// Check CKB and Mock RUSD balances for the testnet deployer wallet.
const fs = require("fs");
const path = require("path");

const RPC = "https://testnet.ckb.dev";
const LOCK = {
  code_hash:
    "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
  hash_type: "type",
  args: "0xede79962a802b77c55b8418356ecbd11cfbc63f2",
};
const MOCK_RUSD = {
  code_hash:
    "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb",
  hash_type: "type",
  args: "0x17a32809302cdca3ffdfde54659dc6d0e3e2d7ce6d8e79616cc72e4e4eff6d2c",
};

async function rpc(method, params) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    signal: AbortSignal.timeout(30000),
  });
  const json = await response.json();
  if (!json.result) throw new Error(JSON.stringify(json));
  return json.result;
}

function u128le(hex) {
  const bytes = Buffer.from(hex.slice(0, 32), "hex");
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    value = (value << 8n) + BigInt(bytes[i]);
  }
  return value;
}

(async () => {
  const result = await rpc("get_cells", [
    { script: LOCK, script_type: "lock" },
    "asc",
    "0x64",
  ]);

  let ckb = 0n;
  let free = 0n;
  let locked = 0n;
  let rusd = 0n;
  for (const object of result.objects) {
    const capacity = BigInt(object.output.capacity);
    ckb += capacity;
    if (!object.output.type) {
      free += capacity;
    } else {
      locked += capacity;
    }
    const type = object.output.type;
    if (
      type &&
      type.code_hash === MOCK_RUSD.code_hash &&
      type.args === MOCK_RUSD.args
    ) {
      rusd += u128le(object.output_data.slice(2));
    }
  }

  console.log("address      :", fs.readFileSync(path.join(__dirname, "..", ".secrets", "testnet-deployer.address"), "utf8").trim());
  console.log("live cells   :", result.objects.length);
  console.log("CKB total    :", (Number(ckb) / 1e8).toFixed(8));
  console.log("CKB free     :", (Number(free) / 1e8).toFixed(8));
  console.log("CKB in typed :", (Number(locked) / 1e8).toFixed(8));
  console.log("Mock RUSD    :", (Number(rusd) / 1e8).toFixed(8));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
