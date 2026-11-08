import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { ccc } from "@ckb-ccc/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(__dirname);
const args = process.argv.slice(2);
const SEND = args.includes("--send");
const FORCE = args.includes("--force");

const CKB_RPC_URL = "https://testnet.ckb.dev";
const CKB_ASSET_ID = "0x434b420000000000000000000000000000000000000000000000000000000000";
const ORACLE_CODE_HASH = "0x0bd6c8139235be080d920271ab2afdbee9af6badc78ade2eed661f4c407a2adf";
const ORACLE_CODE_DEP = "0x676d2e33ddfa4960e3d9a60b7992416383f62d32dc7d6f3ac3e6a8d59b23dee8";
const PUBLISHER_SET_HASH =
  "0x" +
  crypto
    .createHash("sha256")
    .update("monimkt-testnet-oracle-publishers")
    .digest("hex");

const MAX_DEVIATION_BPS = BigInt(process.env.MAX_DEVIATION_BPS || "2000");
const SOURCES = [
  {
    name: "Binance",
    url: "https://api.binance.com/api/v3/ticker/price?symbol=CKBUSDT",
    parse: (json) => Number(json?.price),
  },
  {
    name: "Gate.io",
    url: "https://api.gateio.ws/api/v4/spot/tickers?currency_pair=CKB_USDT",
    parse: (json) => Number(json?.[0]?.last),
  },
  {
    name: "CoinGecko",
    url: "https://api.coingecko.com/api/v3/simple/price?ids=nervos-network&vs_currencies=usd",
    parse: (json) => Number(json?.["nervos-network"]?.usd),
  },
];

function hexToBytes(value) {
  return Buffer.from(value.replace(/^0x/, ""), "hex");
}
function bytesToHex(value) {
  return "0x" + Buffer.from(value).toString("hex");
}
function bytes32(value) {
  const bytes = Buffer.from(hexToBytes(value));
  if (bytes.length !== 32) throw new Error(`expected 32 bytes: ${value}`);
  return bytes;
}
function u8(value) {
  return Buffer.from([value]);
}
function u64le(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
}
function u128le(value) {
  const bytes = Buffer.alloc(16);
  let x = BigInt(value);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return bytes;
}
function readU64(bytes, offset) {
  let value = 0n;
  for (let i = 7; i >= 0; i--) value = (value << 8n) | BigInt(bytes[offset + i]);
  return Number(value);
}
function readU128(bytes, offset) {
  let value = 0n;
  for (let i = 15; i >= 0; i--) value = (value << 8n) | BigInt(bytes[offset + i]);
  return value;
}
function concat(...parts) {
  return Buffer.concat(parts.map((part) => Buffer.from(part)));
}
function oracleType() {
  return ccc.Script.from({
    codeHash: ORACLE_CODE_HASH,
    hashType: "type",
    args: bytesToHex(concat(bytes32(CKB_ASSET_ID), bytes32(PUBLISHER_SET_HASH))),
  });
}
function encodeOracle(priceRaw, confidenceRaw, timestamp) {
  return bytesToHex(
    concat(
      u8(1),
      bytes32(CKB_ASSET_ID),
      u128le(priceRaw),
      u8(0xf8), // exponent -8
      u64le(timestamp),
      u128le(confidenceRaw),
      bytes32(PUBLISHER_SET_HASH),
      Buffer.alloc(32),
    ),
  );
}

async function fetchPrice(source) {
  const response = await fetch(source.url, {
    headers: { accept: "application/json", "user-agent": "MoniMkt-Oracle/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const price = source.parse(await response.json());
  if (!Number.isFinite(price) || price <= 0 || price > 10) {
    throw new Error(`invalid price: ${price}`);
  }
  return price;
}

async function collectPrice() {
  const results = await Promise.allSettled(SOURCES.map((source) => fetchPrice(source)));
  const valid = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      valid.push({ source: SOURCES[i].name, price: result.value });
    } else {
      console.warn(`oracle source failed: ${SOURCES[i].name}: ${result.reason?.message || result.reason}`);
    }
  }
  if (valid.length < 2) {
    throw new Error(`need at least 2 valid price sources, got ${valid.length}`);
  }
  valid.sort((a, b) => a.price - b.price);
  const median = valid[Math.floor(valid.length / 2)].price;
  return {
    price: median,
    confidence: valid[valid.length - 1].price - valid[0].price,
    sources: valid,
  };
}

async function findOracleCell(client) {
  let best;
  let bestTimestamp = -1;
  for await (const cell of client.findCells(
    { script: oracleType(), scriptType: "type", scriptSearchMode: "exact", withData: true },
    "desc",
    20,
  )) {
    const data = hexToBytes(cell.outputData);
    const timestamp = readU64(data, 50);
    if (timestamp > bestTimestamp) {
      best = cell;
      bestTimestamp = timestamp;
    }
  }
  return best;
}

function readKey() {
  if (process.env.CKB_ORACLE_KEY) return process.env.CKB_ORACLE_KEY.trim();
  const candidates = [
    path.join(repoRoot, ".secrets", "oracle.key"),
    path.join(repoRoot, ".secrets", "testnet-deployer.key"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  }
  throw new Error("CKB_ORACLE_KEY is not set and no local oracle/deployer key was found");
}

async function waitForCommit(hash) {
  for (let i = 0; i < 120; i++) {
    const response = await fetch(CKB_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "get_transaction", params: [hash] }),
    });
    const json = await response.json();
    const status = json?.result?.tx_status?.status;
    if (status === "committed") return;
    if (status === "rejected") throw new Error(json.result.tx_status.reason || "oracle transaction rejected");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("oracle transaction confirmation timed out");
}

(async () => {
  const client = new ccc.ClientPublicTestnet();
  const oracle = await findOracleCell(client);
  if (!oracle) throw new Error("oracle cell not found");

  const oldData = hexToBytes(oracle.outputData);
  const oldPrice = readU128(oldData, 33);
  const oldTimestamp = readU64(oldData, 50);
  const { price, confidence, sources } = await collectPrice();
  const priceRaw = BigInt(Math.round(price * 1e8));
  const confidenceRaw = BigInt(Math.round(confidence * 1e8));
  const now = Math.floor(Date.now() / 1000) - 30;

  console.log("sources:", sources.map((item) => `${item.source}=${item.price}`).join(", "));
  console.log("median:", price, "raw:", priceRaw.toString(), "confidence:", confidenceRaw.toString());
  console.log("old oracle:", Number(oldPrice) / 1e8, "age:", Math.max(0, now - oldTimestamp), "seconds");

  if (oldPrice > 0n && priceRaw > 0n && !FORCE) {
    const delta = priceRaw > oldPrice ? priceRaw - oldPrice : oldPrice - priceRaw;
    const deviationBps = (delta * 10000n) / oldPrice;
    if (deviationBps > MAX_DEVIATION_BPS) {
      throw new Error(
        `price deviation ${deviationBps} bps exceeds MAX_DEVIATION_BPS=${MAX_DEVIATION_BPS}; use --force only for a deliberate feed migration`,
      );
    }
  } else if (FORCE) {
    console.warn("deviation guard bypassed with --force");
  }

  const data = encodeOracle(priceRaw, confidenceRaw, now);
  console.log("new oracle data:", data);
  if (!SEND) {
    console.log("dry run; pass --send to publish");
    process.exit(0);
  }

  const key = readKey();
  const signer = new ccc.SignerCkbPrivateKey(client, key);
  const tx = ccc.Transaction.from({
    cellDeps: [{ outPoint: { txHash: ORACLE_CODE_DEP, index: 0 }, depType: "code" }],
    inputs: [ccc.CellInput.from({ previousOutput: oracle.outPoint, since: 0 })],
    outputs: [
      {
        capacity: oracle.cellOutput.capacity,
        lock: oracle.cellOutput.lock,
        type: oracleType(),
      },
    ],
    outputsData: [data],
  });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 10000);
  const hash = await signer.sendTransaction(tx);
  console.log("oracle tx:", hash);
  await waitForCommit(hash);
  console.log(`oracle updated: ${hash}:0`);
  process.exit(0);
})().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
