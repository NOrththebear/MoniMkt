// Create the MoniMkt market state cells on CKB testnet.
//
// Usage:
//   node scripts/create-testnet-market.js          # dry run
//   node scripts/create-testnet-market.js --send   # send transaction
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ccc = require("C:/Users/ADMIN/AppData/Roaming/npm/node_modules/@offckb/cli/node_modules/@ckb-ccc/core");

const SEND = process.argv.includes("--send");

const CODE = {
  marketType: "0x9172f13db28292479142728fbeca4e60bc4b40724cd4791a382ad715b58fda33",
  baseTokenLock: "0x10c2e4f8913ebb1a556ccc749f64a64d6978eda27ded0e3d3746ceacf7651620",
  configType: "0x84f9fb69145250ac3bc7cd6a2c46f6f0405a6d3d3c3b13ec097ce15e8f575e5d",
  accountType: "0x5b5c9ef26e0aa0ad5ab42250338b7b4db5710a21226c086f9f0b5a1c3cf02b12",
  positionType: "0xa0f58d96515fb400d098e29c0a09d2ff58c8db1cbd64a285eeb7ad71a335bbdc",
  positionLock: "0xcf4242a372739fe07e348782f1c5b365e08fbbefbd9eca4494b9c7071adfde90",
  vaultLock: "0x8868ee05f78a75052162ba833cbdd4437d2be9957618287b67030c1b64dfdf51",
  vaultType: "0x7cb11e5aa57978f74e3d2526a4bbc289fbb04e6e0a7b6cfba145fcc20b31980c",
  oracleType: "0x0bd6c8139235be080d920271ab2afdbee9af6badc78ade2eed661f4c407a2adf",
  assetConfigType: "0xd20914d2863601569206fce44b94e3ff98e2a7c6453b519ee0e89790ba6ab283",
  assetTotalsType: "0xef551fc012c9d5f1df7c89e94dd953455567e82e60c955d1c8a060b6a288b4d8",
};

const DEPS = [
  ["0xcd9d81e249f1398fc6dfc40548cdd0f2f538de4e7ebca7b4a839c28d70b1492f", 0], // market-type
  ["0xa8eeba5f4df04d88321096df03866702e6a93be3e4deaa5387b8640779811d60", 0], // config-type
  ["0xf72f1e264525a5122a3e14b81094a01e64b08534b0faef211520cf533422c98e", 0], // account-type
  ["0xeddfa8c566ee439c1760ed19c13b21a4aad0d899b7e4f5cb570d69b4917c8f28", 0], // position-type
  ["0x35e4ef7cfb92227518a4cbbb7237e606b2a68b74b9a95e8474937fa45c050ec2", 0], // position-lock
  ["0x9a448f8a65c61031c183148a0e4692e3531a4793854189591c3916f37e60dbdb", 0], // vault-lock
  ["0x636e2ff2d5eb10ac77ab618bb6ce77f9b374b39e66d749bf163f0fe78bdaee2d", 0], // base-token-lock
  ["0x8d696b4daf41bf6d36f29eb243b5a6bfb548e56da6c6b73fa8f05b74ab2eee2a", 0], // vault-type
  ["0x676d2e33ddfa4960e3d9a60b7992416383f62d32dc7d6f3ac3e6a8d59b23dee8", 0], // oracle-type
  ["0x7898b5c1720b5b3a5ec231f03da41614b69e3838578bc3b856fee111fbadd5fc", 0], // asset-config-type
  ["0x7a1254abddd616f1057123ed50b816d9e6d03ce19bfa2beb9a905d71912131b0", 0], // asset-totals-type
];

const XUDT_ARGS = "0x17a32809302cdca3ffdfde54659dc6d0e3e2d7ce6d8e79616cc72e4e4eff6d2c";
const RUSD_ASSET_ID = "0xe016940e96b9ad2d6505d06996a24f84dbc319ce1a0b0a619aa6af26ce190a3a";
const CKB_ASSET_ID =
  "0x434b420000000000000000000000000000000000000000000000000000000000";

const MARKET_ID =
  "0x" +
  crypto.createHash("sha256").update("monimkt-testnet-market-v3").digest("hex");
const PUBLISHER_SET_HASH =
  "0x" +
  crypto
    .createHash("sha256")
    .update("monimkt-testnet-oracle-publishers")
    .digest("hex");

const CAP = {
  config: 500n * 100000000n,
  assetConfig: 500n * 100000000n,
  assetTotals: 500n * 100000000n,
  oracle: 500n * 100000000n,
  state: 1000n * 100000000n,
  baseVault: 1000n * 100000000n,
  ckbVault: 2000n * 100000000n,
  account: 500n * 100000000n,
  baseToken: 500n * 100000000n,
  rusdChange: 500n * 100000000n,
};

const RUSD = 100000000n;
const BASE_TOKEN_SEED = 100n * RUSD; // 1 RUSD held by the base vault token cell.
const INDEX = 1000000000000000n;
const U64_MAX = (1n << 64n) - 1n;

function hexToBytes(hex) {
  return Buffer.from(hex.replace(/^0x/, ""), "hex");
}
function bytesToHex(bytes) {
  return "0x" + Buffer.from(bytes).toString("hex");
}
function u8(value) {
  return Buffer.from([value]);
}
function u32le(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(Number(value));
  return buf;
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
function i8(value) {
  const buf = Buffer.alloc(1);
  buf.writeInt8(value, 0);
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
function encodedNow() {
  return Math.floor(Date.now() / 1000);
}

// -- data encoders ---------------------------------------------------------

function encodeMarketState({ now, configHash }) {
  return concat(
    u8(1),
    bytes32(MARKET_ID),
    bytes32(RUSD_ASSET_ID),
    u8(8),
    u128le(INDEX),
    u128le(INDEX),
    u128le(0),
    u128le(0),
    u128le(0),
    u128le(0),
    u128le(0),
    u64le(now),
    u8(0),
    u8(1),
    bytes32(configHash),
    Buffer.alloc(32),
  );
}

function encodeMarketConfig() {
  return concat(
    u8(1),
    bytes32(MARKET_ID),
    u64le(800_000_000_000_000_000n), // supply_kink
    u64le(800_000_000_000_000_000n), // borrow_kink
    u64le(35_000_000_000_000_000n), // supply_slope_low
    u64le(400_000_000_000_000_000n), // supply_slope_high
    u64le(10_000_000_000_000_000n), // supply_base (1%)
    u64le(40_000_000_000_000_000n), // borrow_slope_low
    u64le(500_000_000_000_000_000n), // borrow_slope_high
    u64le(0n), // borrow_base
    u64le(500_000_000_000_000_000n), // store_front
    u128le(1n * RUSD), // base_borrow_min
    u128le(10_000n * RUSD), // target_reserves
    u128le(0n), // base_min_for_rewards
    u64le(INDEX), // tracking_index_scale
    u64le(0n), // base_tracking_supply_speed
    u64le(0n), // base_tracking_borrow_speed
    u64le(3600n), // max_oracle_age
    u64le(100_000_000_000_000_000n), // max_price_deviation
    Buffer.alloc(32),
  );
}

function encodeAssetConfig() {
  return concat(
    u8(1),
    bytes32(MARKET_ID),
    bytes32(CKB_ASSET_ID),
    bytes32(CKB_ASSET_ID),
    u8(1), // asset_kind::CKB
    u64le(100_000_000n), // scale, 8 decimals
    u64le(500_000_000_000_000_000n), // borrow_cf 50%
    u64le(600_000_000_000_000_000n), // liquidate_cf 60%
    u64le(900_000_000_000_000_000n), // liquidation_factor 90%
    u128le(50_000_000n * 100_000_000n), // supply_cap
    Buffer.alloc(32),
  );
}

function encodeAssetTotals() {
  return concat(
    u8(1),
    bytes32(MARKET_ID),
    bytes32(CKB_ASSET_ID),
    u128le(0n),
    Buffer.alloc(32),
  );
}

function encodeOracle(now) {
  return concat(
    u8(1),
    bytes32(CKB_ASSET_ID),
    u128le(10_000_000n), // $0.01 with exponent -8
    i8(-8),
    u64le(now),
    u128le(0n),
    bytes32(PUBLISHER_SET_HASH),
    Buffer.alloc(32),
  );
}

function encodeVault(assetId, amount) {
  return concat(
    u8(1),
    bytes32(MARKET_ID),
    bytes32(assetId),
    u128le(amount),
    Buffer.alloc(32),
  );
}

function encodeAccount(ownerLockHash, nonce) {
  return concat(
    u8(1),
    bytes32(MARKET_ID),
    bytes32(ownerLockHash),
    u64le(nonce),
    u8(0),
    Buffer.alloc(32),
  );
}

async function main() {
  const client = new ccc.ClientPublicTestnet();
  const key = fs
    .readFileSync(
      path.join(__dirname, "..", ".secrets", "testnet-deployer.key"),
      "utf8",
    )
    .trim();
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  const address = await signer.getAddressObjSecp256k1();
  const ownerLockHash = address.script.hash();

  const xudtType = await ccc.Script.fromKnownScript(
    client,
    ccc.KnownScript.XUdt,
    XUDT_ARGS,
  );

  let rusdCell = null;
  for await (const cell of client.findCellsByLock(
    address.script,
    xudtType,
    true,
  )) {
    const amount = u128FromLE(hexToBytes(cell.outputData ?? "0x"));
    console.log(
      `RUSD cell ${cell.outPoint.txHash}:${cell.outPoint.index} = ${amount}`,
    );
    if (!rusdCell || amount > rusdCell.amount) {
      rusdCell = { cell, amount };
    }
  }
  if (!rusdCell) throw new Error("no Mock RUSD cell found");
  if (rusdCell.amount < BASE_TOKEN_SEED)
    throw new Error("RUSD cell is too small");

  const now = encodedNow();
  const configType = script(CODE.configType, bytes32(MARKET_ID));
  const configTypeHash = configType.hash();

  const baseVaultType = script(
    CODE.vaultType,
    concat(bytes32(MARKET_ID), bytes32(RUSD_ASSET_ID), u8(0)),
  );
  const ckbVaultType = script(
    CODE.vaultType,
    concat(bytes32(MARKET_ID), bytes32(CKB_ASSET_ID), u8(1)),
  );
  const marketType = script(
    CODE.marketType,
    concat(
      bytes32(MARKET_ID),
      bytes32(configTypeHash),
      bytes32(CODE.positionType),
      bytes32(CODE.vaultType),
      bytes32(CODE.oracleType),
      bytes32(CODE.assetConfigType),
      bytes32(CODE.assetTotalsType),
    ),
  );
  const marketCodeHash = CODE.marketType;

  const baseVaultLock = script(
    CODE.vaultLock,
    concat(
      bytes32(MARKET_ID),
      bytes32(RUSD_ASSET_ID),
      bytes32(marketCodeHash),
      bytes32(CODE.vaultType),
    ),
  );
  const ckbVaultLock = script(
    CODE.vaultLock,
    concat(
      bytes32(MARKET_ID),
      bytes32(CKB_ASSET_ID),
      bytes32(marketCodeHash),
      bytes32(CODE.vaultType),
    ),
  );
  const baseTokenLock = script(
    CODE.baseTokenLock,
    concat(
      bytes32(MARKET_ID),
      bytes32(RUSD_ASSET_ID),
      bytes32(marketCodeHash),
      bytes32(CODE.vaultType),
    ),
  );

  const accountType = script(
    CODE.accountType,
    concat(bytes32(MARKET_ID), bytes32(ownerLockHash)),
  );
  const assetConfigType = script(
    CODE.assetConfigType,
    concat(bytes32(MARKET_ID), bytes32(CKB_ASSET_ID)),
  );
  const assetTotalsType = script(
    CODE.assetTotalsType,
    concat(bytes32(MARKET_ID), bytes32(CKB_ASSET_ID)),
  );
  const oracleType = script(
    CODE.oracleType,
    concat(bytes32(CKB_ASSET_ID), bytes32(PUBLISHER_SET_HASH)),
  );

  const outputs = [
    // 0: MarketConfig
    {
      capacity: CAP.config,
      lock: address.script,
      type: configType,
      data: encodeMarketConfig(),
    },
    // 1: CKB AssetConfig
    {
      capacity: CAP.assetConfig,
      lock: address.script,
      type: assetConfigType,
      data: encodeAssetConfig(),
    },
    // 2: CKB AssetTotals
    {
      capacity: CAP.assetTotals,
      lock: address.script,
      type: assetTotalsType,
      data: encodeAssetTotals(),
    },
    // 3: CKB oracle
    {
      capacity: CAP.oracle,
      lock: address.script,
      type: oracleType,
      data: encodeOracle(now),
    },
    // 4: MarketState
    {
      capacity: CAP.state,
      lock: address.script,
      type: marketType,
      data: encodeMarketState({ now, configHash: configTypeHash }),
    },
    // 5: base vault state (Mock RUSD)
    {
      capacity: CAP.baseVault,
      lock: baseVaultLock,
      type: baseVaultType,
      data: encodeVault(RUSD_ASSET_ID, BASE_TOKEN_SEED),
    },
    // 6: CKB vault state
    {
      capacity: CAP.ckbVault,
      lock: ckbVaultLock,
      type: ckbVaultType,
      data: encodeVault(CKB_ASSET_ID, 0n),
    },
    // 7: deployer account
    {
      capacity: CAP.account,
      lock: address.script,
      type: accountType,
      data: encodeAccount(ownerLockHash, 0n),
    },
    // 8: base token cell (Mock RUSD, custody)
    {
      capacity: CAP.baseToken,
      lock: baseTokenLock,
      type: xudtType,
      data: u128le(BASE_TOKEN_SEED),
    },
    // 9: RUSD change
    {
      capacity: CAP.rusdChange,
      lock: address.script,
      type: xudtType,
      data: u128le(rusdCell.amount - BASE_TOKEN_SEED),
    },
  ];

  console.log("market_id:", MARKET_ID);
  console.log("config_type_hash:", configTypeHash);
  console.log("owner_lock_hash:", ownerLockHash);
  console.log("market_type_hash:", marketType.hash());
  console.log("base_vault_type_hash:", baseVaultType.hash());
  console.log("ckb_vault_type_hash:", ckbVaultType.hash());
  console.log("now:", now);
  console.log("rusd input:", rusdCell.cell.outPoint);
  console.log("outputs:");
  outputs.forEach((o, i) =>
    console.log(
      `  ${i}: capacity=${o.capacity} type=${o.type.hash()} data=${o.data.length}`,
    ),
  );

  if (!SEND) {
    console.log("dry run; pass --send to broadcast");
    process.exit(0);
  }

  const tx = ccc.Transaction.from({
    cellDeps: DEPS.map(([txHash, index]) => ({
      outPoint: { txHash, index },
      depType: "code",
    })),
    inputs: [
      ccc.CellInput.from({
        previousOutput: rusdCell.cell.outPoint,
        since: 0,
      }),
    ],
    outputs: outputs.map((o) => ({
      capacity: o.capacity,
      lock: o.lock,
      type: o.type,
    })),
    outputsData: outputs.map((o) => bytesToHex(o.data)),
  });
  await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.XUdt);
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 10000);

  const hash = await signer.sendTransaction(tx);
  console.log("create-market tx:", hash);
  console.log("outputs:");
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
