// Generate a fresh CKB testnet secp256k1 wallet.
// The private key is written to .secrets/testnet-deployer.key (gitignored).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

(async () => {
  const client = new ccc.ClientPublicTestnet();
  let privateKey = null;
  let addresses = null;

  for (let i = 0; i < 10 && !addresses; i++) {
    const candidate = "0x" + crypto.randomBytes(32).toString("hex");
    try {
      const signer = new ccc.SignerCkbPrivateKey(client, candidate);
      addresses = await signer.getAddresses();
      privateKey = candidate;
    } catch (_) {
      // Extremely unlikely invalid scalar; retry.
    }
  }

  if (!addresses || !addresses.length) {
    throw new Error("failed to generate a valid CKB key");
  }

  const dir = path.join(__dirname, "..", ".secrets");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "testnet-deployer.key"), privateKey + "\n");
  fs.writeFileSync(path.join(dir, "testnet-deployer.address"), addresses[0] + "\n");

  console.log(addresses[0]);
  process.exit(0);
})();
