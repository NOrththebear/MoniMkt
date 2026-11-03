"use client";

import { Buffer } from "buffer";
import { ccc } from "@ckb-ccc/core";
import {
  CKB_ASSET_CONFIG,
  CKB_ASSET_ID,
  CKB_RPC_URL,
  CONFIG_TYPE_HASH,
  FACTOR,
  INDEX,
  MARKET_CONFIG,
  MARKET_ID,
  MIN_WITHDRAW_CKB,
  PRICE_SCALE,
  PUBLISHER_SET_HASH,
  RUSD_ASSET_ID,
  RUSD_XUDT_ARGS,
  SCRIPT_CODE,
  SCRIPT_DEPS,
  SECONDS_PER_YEAR,
} from "./ckb-config";

export const client = new ccc.ClientPublicTestnet();

// Standard testnet xUDT type code hash.
const XUDT_CODE_HASH =
  "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb";

export interface MarketState {
  supplyIndex: bigint;
  borrowIndex: bigint;
  totalSupply: bigint;
  totalBorrow: bigint;
  totalCash: bigint;
  lastAccrual: number;
  pauseFlags: number;
}

export interface UserPosition {
  principalNegative: boolean;
  principal: bigint;
  nonce: number;
  assetsIn: number;
  collateral: bigint;
}

export interface MarketSnapshot {
  state: MarketState;
  oracle: { price: bigint; timestamp: number; exponent: number };
  baseVaultAmount: bigint;
  ckbVaultAmount: bigint;
  ckbVaultCapacity: bigint;
  totalCkbSupplied: bigint;
  config: typeof MARKET_CONFIG;
  cell: ccc.Cell;
}

export interface UserSnapshot {
  account?: ccc.Cell;
  position?: ccc.Cell;
  positionData: UserPosition;
  accountNonce: number;
  rusdBalance: bigint;
  ckbBalance: bigint;
  suppliedRusd: bigint;
  borrowedRusd: bigint;
  collateralCkb: bigint;
  healthFactor: number | null;
  borrowLimit: bigint;
  collateralValue: bigint;
}

function hex(bytes: Uint8Array): `0x${string}` {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function bytes(value: string): Uint8Array {
  return Buffer.from(value.replace(/^0x/, ""), "hex");
}

function concat(...parts: (Uint8Array | string)[]): Uint8Array {
  return Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(bytes(p)) : Buffer.from(p))));
}

function b32(value: string): Uint8Array {
  const v = Buffer.from(bytes(value));
  if (v.length !== 32) throw new Error(`expected 32 bytes: ${value}`);
  return v;
}

function u8(v: number): Uint8Array {
  return Buffer.from([v]);
}

function u32le(v: number): Uint8Array {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v);
  return b;
}

function u64le(v: bigint | number): Uint8Array {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(v));
  return b;
}

function u128le(v: bigint): Uint8Array {
  const b = Buffer.alloc(16);
  let x = BigInt(v);
  for (let i = 0; i < 16; i++) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}

function readU128(data: Uint8Array, offset: number): bigint {
  let v = 0n;
  for (let i = 15; i >= 0; i--) v = (v << 8n) | BigInt(data[offset + i]);
  return v;
}

function readU64(data: Uint8Array, offset: number): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(data[offset + i]);
  return v;
}

export function script(codeHash: string, args: Uint8Array | string = "0x"): ccc.Script {
  return ccc.Script.from({ codeHash, hashType: "type", args: typeof args === "string" ? args : hex(args) });
}

export const scripts = {
  market: () =>
    script(
      SCRIPT_CODE.marketType,
      concat(
        b32(MARKET_ID),
        b32(CONFIG_TYPE_HASH),
        b32(SCRIPT_CODE.positionType),
        b32(SCRIPT_CODE.vaultType),
        b32(SCRIPT_CODE.oracleType),
        b32(SCRIPT_CODE.assetConfigType),
        b32(SCRIPT_CODE.assetTotalsType),
      ),
    ),
  marketStateLock: () => script(SCRIPT_CODE.marketStateLock),
  config: () => script(SCRIPT_CODE.configType, b32(MARKET_ID)),
  account: (owner: string) => script(SCRIPT_CODE.accountType, concat(b32(MARKET_ID), b32(owner))),
  position: (owner: string) =>
    script(SCRIPT_CODE.positionType, concat(b32(MARKET_ID), b32(owner), b32(SCRIPT_CODE.marketType))),
  positionLock: (owner: string) =>
    script(
      SCRIPT_CODE.positionLock,
      concat(
        b32(MARKET_ID),
        b32(owner),
        b32(SCRIPT_CODE.accountType),
        b32(SCRIPT_CODE.marketType),
        b32(SCRIPT_CODE.approvalType),
      ),
    ),
  assetConfig: () => script(SCRIPT_CODE.assetConfigType, concat(b32(MARKET_ID), b32(CKB_ASSET_ID))),
  assetTotals: () => script(SCRIPT_CODE.assetTotalsType, concat(b32(MARKET_ID), b32(CKB_ASSET_ID))),
  oracle: () => script(SCRIPT_CODE.oracleType, concat(b32(CKB_ASSET_ID), b32(PUBLISHER_SET_HASH))),
  baseVault: () => script(SCRIPT_CODE.vaultType, concat(b32(MARKET_ID), b32(RUSD_ASSET_ID), u8(0))),
  ckbVault: () => script(SCRIPT_CODE.vaultType, concat(b32(MARKET_ID), b32(CKB_ASSET_ID), u8(1))),
  baseVaultLock: () =>
    script(SCRIPT_CODE.vaultLock, concat(b32(MARKET_ID), b32(RUSD_ASSET_ID), b32(SCRIPT_CODE.marketType), b32(SCRIPT_CODE.vaultType))),
  ckbVaultLock: () =>
    script(SCRIPT_CODE.vaultLock, concat(b32(MARKET_ID), b32(CKB_ASSET_ID), b32(SCRIPT_CODE.marketType), b32(SCRIPT_CODE.vaultType))),
  baseTokenLock: () =>
    script(
      SCRIPT_CODE.baseTokenLock,
      concat(b32(MARKET_ID), b32(RUSD_ASSET_ID), b32(SCRIPT_CODE.marketType), b32(SCRIPT_CODE.vaultType)),
    ),
};

let xudtPromise: Promise<ccc.Script> | null = null;
export function xudtScript(): Promise<ccc.Script> {
  if (!xudtPromise) {
    xudtPromise = ccc.Script.fromKnownScript(client, ccc.KnownScript.XUdt, RUSD_XUDT_ARGS);
  }
  return xudtPromise;
}

async function findCell(typeScript: ccc.Script): Promise<ccc.Cell | undefined> {
  for await (const cell of client.findCells(
    { script: typeScript, scriptType: "type", scriptSearchMode: "exact", withData: true } as any,
    "desc",
    5,
  )) {
    return cell;
  }
  return undefined;
}

async function findOracleCell(): Promise<ccc.Cell | undefined> {
  let best: ccc.Cell | undefined;
  let bestTimestamp = -1;
  for await (const cell of client.findCells(
    { script: scripts.oracle(), scriptType: "type", scriptSearchMode: "exact", withData: true } as any,
    "desc",
    20,
  )) {
    const timestamp = decodeOracle(bytes(cell.outputData)).timestamp;
    if (timestamp > bestTimestamp) {
      best = cell;
      bestTimestamp = timestamp;
    }
  }
  return best;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCell(typeScript: ccc.Script, attempts = 30): Promise<ccc.Cell | undefined> {
  for (let i = 0; i < attempts; i++) {
    const cell = await findCell(typeScript);
    if (cell) return cell;
    await sleep(1000);
  }
  return undefined;
}

async function findBaseToken(): Promise<ccc.Cell | undefined> {
  const xudt = await xudtScript();
  const lock = scripts.baseTokenLock();
  for await (const cell of client.findCells(
    { script: xudt, scriptType: "type", scriptSearchMode: "exact", withData: true } as any,
    "desc",
    20,
  )) {
    if (cell.cellOutput.lock.eq(lock)) return cell;
  }
  return undefined;
}

async function findRusdCells(ownerLock: ccc.Script): Promise<ccc.Cell[]> {
  const xudt = await xudtScript();
  const cells: ccc.Cell[] = [];
  for await (const cell of client.findCellsByLock(ownerLock, xudt, true, "desc", 20)) {
    cells.push(cell);
  }
  return cells;
}

function decodeState(data: Uint8Array): MarketState {
  return {
    supplyIndex: readU128(data, 66),
    borrowIndex: readU128(data, 82),
    totalSupply: readU128(data, 130),
    totalBorrow: readU128(data, 146),
    totalCash: readU128(data, 162),
    lastAccrual: Number(readU64(data, 178)),
    pauseFlags: data[186],
  };
}

function decodePosition(data: Uint8Array): UserPosition {
  return {
    principalNegative: data[65] !== 0,
    principal: readU128(data, 66),
    nonce: Number(readU64(data, 114)),
    assetsIn: Buffer.from(data.slice(122, 126)).readUInt32LE(0),
    collateral: readU128(data, 126),
  };
}

function decodeVault(data: Uint8Array): bigint {
  return readU128(data, 65);
}

function decodeTotals(data: Uint8Array): bigint {
  return readU128(data, 65);
}

function decodeOracle(data: Uint8Array): { price: bigint; timestamp: number; exponent: number } {
  return {
    price: readU128(data, 33),
    exponent: Buffer.from(data.slice(49, 50)).readInt8(0),
    timestamp: Number(readU64(data, 50)),
  };
}

function encodeState(state: MarketState): Uint8Array {
  return concat(
    u8(1),
    b32(MARKET_ID),
    b32(RUSD_ASSET_ID),
    u8(8),
    u128le(state.supplyIndex),
    u128le(state.borrowIndex),
    u128le(0n),
    u128le(0n),
    u128le(state.totalSupply),
    u128le(state.totalBorrow),
    u128le(state.totalCash),
    u64le(state.lastAccrual),
    u8(state.pauseFlags),
    u8(1),
    b32(CONFIG_TYPE_HASH),
    Buffer.alloc(32),
  );
}

function encodeAccount(owner: string, nonce: number): Uint8Array {
  return concat(u8(1), b32(MARKET_ID), b32(owner), u64le(nonce), u8(0), Buffer.alloc(32));
}

function encodePosition(owner: string, position: UserPosition): Uint8Array {
  return concat(
    u8(1),
    b32(MARKET_ID),
    b32(owner),
    u8(position.principalNegative ? 1 : 0),
    u128le(position.principal),
    u128le(0n),
    u64le(0n),
    u64le(0n),
    u64le(position.nonce),
    u32le(position.assetsIn),
    u128le(position.collateral),
    Buffer.alloc(7 * 16),
    Buffer.alloc(32),
  );
}

function encodeVault(assetId: string, amount: bigint): Uint8Array {
  return concat(u8(1), b32(MARKET_ID), b32(assetId), u128le(amount), Buffer.alloc(32));
}

function encodeTotals(total: bigint): Uint8Array {
  return concat(u8(1), b32(MARKET_ID), b32(CKB_ASSET_ID), u128le(total), Buffer.alloc(32));
}

function encodeAction(tag: number, amount = 0n, minAmount = 0n): string {
  return hex(concat(u8(tag), u8(0), u8(0), u8(0), u128le(amount), u128le(minAmount), Buffer.alloc(32)));
}

export function parseAmount(value: string, decimals = 8): bigint {
  const clean = value.trim();
  if (!clean || Number.isNaN(Number(clean))) throw new Error("Invalid amount");
  const [whole, fraction = ""] = clean.split(".");
  const frac = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

export function formatAmount(value: bigint, decimals = 8, maxFraction = 4): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function presentValue(index: bigint, principal: bigint): bigint {
  return (principal * index) / INDEX;
}

function principalValueSupply(index: bigint, present: bigint): bigint {
  return (present * INDEX) / index;
}

function principalValueBorrow(index: bigint, present: bigint): bigint {
  if (present === 0n) return 0n;
  return (present * INDEX + index - 1n) / index;
}

function principalValue(supplyIndex: bigint, borrowIndex: bigint, present: bigint): bigint {
  if (present >= 0n) return principalValueSupply(supplyIndex, present);
  return -principalValueBorrow(borrowIndex, -present);
}

function rateAt(util: bigint, kink: bigint, base: bigint, low: bigint, high: bigint): bigint {
  const perSecondBase = base / SECONDS_PER_YEAR;
  const perSecondLow = low / SECONDS_PER_YEAR;
  const perSecondHigh = high / SECONDS_PER_YEAR;
  if (util <= kink) {
    return perSecondBase + (perSecondLow * util) / FACTOR;
  }
  return perSecondBase + (perSecondLow * kink) / FACTOR + (perSecondHigh * (util - kink)) / FACTOR;
}

export function accrueState(state: MarketState, now: number): MarketState {
  if (now < state.lastAccrual) throw new Error("Clock is behind the market");
  const dt = BigInt(now - state.lastAccrual);
  if (dt === 0n) return state;
  const presentSupply = presentValue(state.supplyIndex, state.totalSupply);
  const presentBorrow = presentValue(state.borrowIndex, state.totalBorrow);
  const utilization = presentSupply === 0n ? 0n : (presentBorrow * FACTOR) / presentSupply;
  const supplyRate = rateAt(
    utilization,
    MARKET_CONFIG.supplyKink,
    MARKET_CONFIG.supplyBase,
    MARKET_CONFIG.supplySlopeLow,
    MARKET_CONFIG.supplySlopeHigh,
  );
  const borrowRate = rateAt(
    utilization,
    MARKET_CONFIG.borrowKink,
    MARKET_CONFIG.borrowBase,
    MARKET_CONFIG.borrowSlopeLow,
    MARKET_CONFIG.borrowSlopeHigh,
  );
  return {
    ...state,
    supplyIndex: state.supplyIndex + (state.supplyIndex * supplyRate * dt) / FACTOR,
    borrowIndex: state.borrowIndex + (state.borrowIndex * borrowRate * dt) / FACTOR,
    lastAccrual: now,
  };
}

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const stateCell = await findCell(scripts.market());
  const baseVaultCell = await findCell(scripts.baseVault());
  const ckbVaultCell = await findCell(scripts.ckbVault());
  const totalsCell = await findCell(scripts.assetTotals());
  const oracleCell = await findOracleCell();
  if (!stateCell || !baseVaultCell || !ckbVaultCell || !totalsCell || !oracleCell) {
    throw new Error("Market cells not found on testnet");
  }
  return {
    cell: stateCell,
    state: decodeState(bytes(stateCell.outputData)),
    oracle: decodeOracle(bytes(oracleCell.outputData)),
    baseVaultAmount: decodeVault(bytes(baseVaultCell.outputData)),
    ckbVaultAmount: decodeVault(bytes(ckbVaultCell.outputData)),
    ckbVaultCapacity: BigInt(ckbVaultCell.cellOutput.capacity),
    totalCkbSupplied: decodeTotals(bytes(totalsCell.outputData)),
    config: MARKET_CONFIG,
  };
}

export async function getUserSnapshot(ownerLock: ccc.Script): Promise<UserSnapshot> {
  const owner = ownerLock.hash();
  const [market, accountCell, positionCell, rusdCells] = await Promise.all([
    getMarketSnapshot(),
    findCell(scripts.account(owner)),
    findCell(scripts.position(owner)),
    findRusdCells(ownerLock),
  ]);
  let ckbBalance = 0n;
  for await (const cell of client.findCellsByLock(ownerLock, null, false, "desc", 50)) {
    if (!cell.cellOutput.type) ckbBalance += BigInt(cell.cellOutput.capacity);
  }
  const rusdBalance = rusdCells.reduce((sum, cell) => sum + readU128(bytes(cell.outputData), 0), 0n);
  const positionData = positionCell
    ? decodePosition(bytes(positionCell.outputData))
    : { principalNegative: false, principal: 0n, nonce: 0, assetsIn: 0, collateral: 0n };
  const accountNonce = accountCell ? Number(readU64(bytes(accountCell.outputData), 65)) : 0;

  const suppliedRusd = positionData.principalNegative
    ? 0n
    : presentValue(market.state.supplyIndex, positionData.principal);
  const borrowedRusd = positionData.principalNegative
    ? presentValue(market.state.borrowIndex, positionData.principal)
    : 0n;
  const collateralCkb = positionData.collateral;
  const collateralValue = (collateralCkb * market.oracle.price) / PRICE_SCALE;
  const borrowLimit = (collateralValue * CKB_ASSET_CONFIG.borrowCf) / FACTOR;
  const healthFactor =
    borrowedRusd > 0n ? Number((borrowLimit * FACTOR) / borrowedRusd) / 1e18 : null;

  return {
    account: accountCell,
    position: positionCell,
    positionData,
    accountNonce,
    rusdBalance,
    ckbBalance,
    suppliedRusd,
    borrowedRusd,
    collateralCkb,
    healthFactor,
    borrowLimit,
    collateralValue,
  };
}

function cellDeps(extra: ccc.Cell[] = []) {
  return [
    ...SCRIPT_DEPS.map(([txHash, index]) => ({ outPoint: { txHash, index }, depType: "code" as const })),
    ...extra.map((cell) => ({ outPoint: cell.outPoint, depType: "code" as const })),
  ];
}

export type TxProgress = "preparing" | "signing" | "confirming" | "committed";

let txProgressHandler: ((phase: TxProgress, hash?: string) => void) | undefined;

export function setTxProgressHandler(handler?: (phase: TxProgress, hash?: string) => void): void {
  txProgressHandler = handler;
}

async function sendTx(tx: ccc.Transaction, signer: ccc.Signer, witnessCount: number, action: string): Promise<string> {
  await tx.addCellDepsOfKnownScripts(client, ccc.KnownScript.XUdt);
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 10000);
  const witness = hex(ccc.WitnessArgs.from({ inputType: action }).toBytes());
  // Fill every witness slot so CCC can hash/sign the transaction.
  for (let i = 0; i < tx.inputs.length; i++) tx.witnesses[i] = "0x";
  // The market action witness must be present on the state, position, vault
  // and account inputs. Token inputs must keep an empty inputType: xUDT
  // interprets a non-empty inputType witness as an extension and rejects it.
  for (let i = 0; i < tx.inputs.length; i++) {
    const cell = await client.getCell(tx.inputs[i].previousOutput);
    if (cell?.cellOutput.type?.codeHash.toLowerCase() === XUDT_CODE_HASH) continue;
    tx.witnesses[i] = witness;
  }
  txProgressHandler?.("signing");
  // Give the UI one frame to show "Confirm in your wallet..." before the
  // wallet popup takes focus.
  if (typeof requestAnimationFrame === "function") {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  const hash = await signer.sendTransaction(tx);
  txProgressHandler?.("confirming", hash);
  await waitForCommit(hash);
  txProgressHandler?.("committed", hash);
  return hash;
}

export async function waitForCommit(hash: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    const response = await fetch(CKB_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "get_transaction", params: [hash] }),
    });
    const json = await response.json();
    const status = json?.result?.tx_status?.status;
    if (status === "committed") return;
    if (status === "rejected") {
      throw new Error(json?.result?.tx_status?.reason || "Transaction rejected");
    }
    await sleep(1000);
  }
  throw new Error("Transaction confirmation timed out");
}

export async function ensureUserCells(signer: ccc.Signer): Promise<void> {
  const address = await signer.getRecommendedAddressObj();
  const owner = address.script.hash();
  const [stateCell, accountCell, positionCell] = await Promise.all([
    findCell(scripts.market()),
    findCell(scripts.account(owner)),
    findCell(scripts.position(owner)),
  ]);
  if (!stateCell) throw new Error("MarketState not found");
  if (accountCell && positionCell) return;

  const configCell = await findCell(scripts.config());
  if (!configCell) throw new Error("MarketConfig not found");
  const tip = await client.getTipHeader();
  const state = accrueState(decodeState(bytes(stateCell.outputData)), Number(tip.timestamp / 1000n));

  const outputs: any[] = [
    { capacity: stateCell.cellOutput.capacity, lock: scripts.marketStateLock(), type: scripts.market() },
  ];
  const data: string[] = [hex(encodeState(state))];
  if (!accountCell) {
    outputs.push({ capacity: 300n * 100_000_000n, lock: address.script, type: scripts.account(owner) });
    data.push(hex(encodeAccount(owner, 0)));
  }
  if (!positionCell) {
    outputs.push({ capacity: 500n * 100_000_000n, lock: scripts.positionLock(owner), type: scripts.position(owner) });
    data.push(
      hex(
        encodePosition(owner, {
          principalNegative: false,
          principal: 0n,
          nonce: 0,
          assetsIn: 0,
          collateral: 0n,
        }),
      ),
    );
  }

  const tx = ccc.Transaction.from({
    cellDeps: cellDeps([configCell]),
    headerDeps: [tip.hash],
    inputs: [ccc.CellInput.from({ previousOutput: stateCell.outPoint, since: 0 })],
    outputs,
    outputsData: data,
  });
  await sendTx(tx, signer, 1, encodeAction(12));
  const account = await waitForCell(scripts.account(owner));
  const position = await waitForCell(scripts.position(owner));
  if (!account || !position) {
    throw new Error("Account/position transaction sent but cells are not live yet. Refresh and retry.");
  }
}

async function commonUserCells(owner: string) {
  const [stateCell, accountCell, positionCell, ckbVaultCell, totalsCell, baseVaultCell, baseTokenCell, configCell, assetConfigCell, oracleCell] =
    await Promise.all([
      findCell(scripts.market()),
      findCell(scripts.account(owner)),
      findCell(scripts.position(owner)),
      findCell(scripts.ckbVault()),
      findCell(scripts.assetTotals()),
      findCell(scripts.baseVault()),
      findBaseToken(),
      findCell(scripts.config()),
      findCell(scripts.assetConfig()),
      findOracleCell(),
    ]);
  if (!stateCell || !accountCell || !positionCell || !ckbVaultCell || !totalsCell || !baseVaultCell || !baseTokenCell || !configCell || !assetConfigCell || !oracleCell) {
    throw new Error("Missing account, position, or market cells. Initialize first.");
  }
  return { stateCell, accountCell, positionCell, ckbVaultCell, totalsCell, baseVaultCell, baseTokenCell, configCell, assetConfigCell, oracleCell };
}

export async function supplyCkb(signer: ccc.Signer, amount: bigint): Promise<string> {
  const address = await signer.getRecommendedAddressObj();
  const owner = address.script.hash();
  await ensureUserCells(signer);
  const c = await commonUserCells(owner);
  const tip = await client.getTipHeader();
  const state = accrueState(decodeState(bytes(c.stateCell.outputData)), Number(tip.timestamp / 1000n));
  const position = decodePosition(bytes(c.positionCell.outputData));
  const totals = decodeTotals(bytes(c.totalsCell.outputData));
  const vaultAmount = decodeVault(bytes(c.ckbVaultCell.outputData));

  const nextPosition = {
    ...position,
    collateral: position.collateral + amount,
    assetsIn: position.assetsIn | 1,
    nonce: position.nonce + 1,
  };
  const nextAccount = encodeAccount(owner, Number(readU64(bytes(c.accountCell.outputData), 65)) + 1);
  const nextVault = encodeVault(CKB_ASSET_ID, vaultAmount + amount);
  const nextTotals = encodeTotals(totals + amount);
  const nextCapacity = BigInt(c.ckbVaultCell.cellOutput.capacity) + amount;

  const tx = ccc.Transaction.from({
    cellDeps: cellDeps([c.configCell, c.assetConfigCell]),
    headerDeps: [tip.hash],
    inputs: [c.stateCell, c.positionCell, c.accountCell, c.ckbVaultCell, c.totalsCell].map((cell) =>
      ccc.CellInput.from({ previousOutput: cell.outPoint, since: 0 }),
    ),
    outputs: [
      { capacity: c.stateCell.cellOutput.capacity, lock: scripts.marketStateLock(), type: scripts.market() },
      { capacity: c.positionCell.cellOutput.capacity, lock: scripts.positionLock(owner), type: scripts.position(owner) },
      { capacity: c.accountCell.cellOutput.capacity, lock: address.script, type: scripts.account(owner) },
      { capacity: nextCapacity, lock: scripts.ckbVaultLock(), type: scripts.ckbVault() },
      { capacity: c.totalsCell.cellOutput.capacity, lock: scripts.marketStateLock(), type: scripts.assetTotals() },
    ],
    outputsData: [hex(encodeState(state)), hex(encodePosition(owner, nextPosition)), hex(nextAccount), hex(nextVault), hex(nextTotals)],
  });
  return sendTx(tx, signer, 5, encodeAction(3, amount));
}

export async function withdrawCkb(signer: ccc.Signer, amount: bigint): Promise<string> {
  if (amount < MIN_WITHDRAW_CKB) throw new Error("Minimum withdrawal is 61 CKB");
  const address = await signer.getRecommendedAddressObj();
  const owner = address.script.hash();
  await ensureUserCells(signer);
  const c = await commonUserCells(owner);
  const tip = await client.getTipHeader();
  const state = accrueState(decodeState(bytes(c.stateCell.outputData)), Number(tip.timestamp / 1000n));
  const position = decodePosition(bytes(c.positionCell.outputData));
  const totals = decodeTotals(bytes(c.totalsCell.outputData));
  const vaultAmount = decodeVault(bytes(c.ckbVaultCell.outputData));
  if (position.collateral < amount) throw new Error("Insufficient collateral");

  const nextCollateral = position.collateral - amount;
  const nextPosition = {
    ...position,
    collateral: nextCollateral,
    assetsIn: nextCollateral === 0n ? position.assetsIn & ~1 : position.assetsIn,
    nonce: position.nonce + 1,
  };
  const nextAccount = encodeAccount(owner, Number(readU64(bytes(c.accountCell.outputData), 65)) + 1);
  const nextVault = encodeVault(CKB_ASSET_ID, vaultAmount - amount);
  const nextTotals = encodeTotals(totals - amount);
  const nextCapacity = BigInt(c.ckbVaultCell.cellOutput.capacity) - amount;

  const tx = ccc.Transaction.from({
    cellDeps: cellDeps([c.configCell, c.assetConfigCell, c.oracleCell]),
    headerDeps: [tip.hash],
    inputs: [c.stateCell, c.positionCell, c.accountCell, c.ckbVaultCell, c.totalsCell].map((cell) =>
      ccc.CellInput.from({ previousOutput: cell.outPoint, since: 0 }),
    ),
    outputs: [
      { capacity: c.stateCell.cellOutput.capacity, lock: scripts.marketStateLock(), type: scripts.market() },
      { capacity: c.positionCell.cellOutput.capacity, lock: scripts.positionLock(owner), type: scripts.position(owner) },
      { capacity: c.accountCell.cellOutput.capacity, lock: address.script, type: scripts.account(owner) },
      { capacity: nextCapacity, lock: scripts.ckbVaultLock(), type: scripts.ckbVault() },
      { capacity: c.totalsCell.cellOutput.capacity, lock: scripts.marketStateLock(), type: scripts.assetTotals() },
      { capacity: amount, lock: address.script },
    ],
    outputsData: [hex(encodeState(state)), hex(encodePosition(owner, nextPosition)), hex(nextAccount), hex(nextVault), hex(nextTotals), "0x"],
  });
  return sendTx(tx, signer, 5, encodeAction(5, amount));
}

export async function borrowRusd(signer: ccc.Signer, amount: bigint): Promise<string> {
  const address = await signer.getRecommendedAddressObj();
  const owner = address.script.hash();
  await ensureUserCells(signer);
  const c = await commonUserCells(owner);
  const tip = await client.getTipHeader();
  const state = accrueState(decodeState(bytes(c.stateCell.outputData)), Number(tip.timestamp / 1000n));
  const position = decodePosition(bytes(c.positionCell.outputData));
  const vaultAmount = decodeVault(bytes(c.baseVaultCell.outputData));
  const tokenAmount = readU128(bytes(c.baseTokenCell.outputData), 0);
  const oldPrincipal = position.principalNegative ? -position.principal : position.principal;
  const oldPresent = oldPrincipal >= 0n ? presentValue(state.supplyIndex, oldPrincipal) : -presentValue(state.borrowIndex, -oldPrincipal);
  const newPresent = oldPresent - amount;
  const newPrincipal = principalValue(state.supplyIndex, state.borrowIndex, newPresent);
  const old = oldPrincipal;
  const newP = newPrincipal;
  let withdraw = 0n;
  let borrow = 0n;
  if (newP > old) {
    // no-op
  } else if (newP >= 0n) {
    withdraw = old >= 0n ? old - newP : 0n;
  } else if (old <= 0n) {
    borrow = (-newP) - (-old);
  } else {
    withdraw = old;
    borrow = -newP;
  }

  const nextState = {
    ...state,
    totalSupply: state.totalSupply - withdraw,
    totalBorrow: state.totalBorrow + borrow,
    totalCash: state.totalCash - amount,
  };
  const nextPosition = {
    ...position,
    principalNegative: newP < 0n,
    principal: newP < 0n ? -newP : newP,
    nonce: position.nonce + 1,
  };
  const nextAccount = encodeAccount(owner, Number(readU64(bytes(c.accountCell.outputData), 65)) + 1);

  const tx = ccc.Transaction.from({
    cellDeps: cellDeps([c.configCell, c.assetConfigCell, c.oracleCell]),
    headerDeps: [tip.hash],
    inputs: [c.stateCell, c.positionCell, c.accountCell, c.baseVaultCell, c.baseTokenCell].map((cell) =>
      ccc.CellInput.from({ previousOutput: cell.outPoint, since: 0 }),
    ),
    outputs: [
      { capacity: c.stateCell.cellOutput.capacity, lock: scripts.marketStateLock(), type: scripts.market() },
      { capacity: c.positionCell.cellOutput.capacity, lock: scripts.positionLock(owner), type: scripts.position(owner) },
      { capacity: c.accountCell.cellOutput.capacity, lock: address.script, type: scripts.account(owner) },
      { capacity: c.baseVaultCell.cellOutput.capacity, lock: scripts.baseVaultLock(), type: scripts.baseVault() },
      { capacity: c.baseTokenCell.cellOutput.capacity, lock: scripts.baseTokenLock(), type: await xudtScript() },
      { capacity: 150n * 100_000_000n, lock: address.script, type: await xudtScript() },
    ],
    outputsData: [
      hex(encodeState(nextState)),
      hex(encodePosition(owner, nextPosition)),
      hex(nextAccount),
      hex(encodeVault(RUSD_ASSET_ID, vaultAmount - amount)),
      hex(u128le(tokenAmount - amount)),
      hex(u128le(amount)),
    ],
  });
  return sendTx(tx, signer, 5, encodeAction(6, amount));
}

export async function supplyRusd(signer: ccc.Signer, amount: bigint): Promise<string> {
  const address = await signer.getRecommendedAddressObj();
  const owner = address.script.hash();
  await ensureUserCells(signer);
  const c = await commonUserCells(owner);
  const rusdCells = await findRusdCells(address.script);
  const source = rusdCells.find((cell) => readU128(bytes(cell.outputData), 0) >= amount);
  if (!source) throw new Error("Insufficient RUSD balance");
  const sourceAmount = readU128(bytes(source.outputData), 0);
  const tip = await client.getTipHeader();
  const state = accrueState(decodeState(bytes(c.stateCell.outputData)), Number(tip.timestamp / 1000n));
  const position = decodePosition(bytes(c.positionCell.outputData));
  const vaultAmount = decodeVault(bytes(c.baseVaultCell.outputData));
  const tokenAmount = readU128(bytes(c.baseTokenCell.outputData), 0);
  const old = position.principalNegative ? -position.principal : position.principal;
  const oldPresent = old >= 0n ? presentValue(state.supplyIndex, old) : -presentValue(state.borrowIndex, -old);
  const newPresent = oldPresent + amount;
  const newP = principalValue(state.supplyIndex, state.borrowIndex, newPresent);
  let repay = 0n;
  let supply = 0n;
  if (newP < old) {
    // no-op
  } else if (newP <= 0n) {
    repay = newP - old;
  } else if (old >= 0n) {
    supply = newP - old;
  } else {
    repay = -old;
    supply = newP;
  }

  const nextState = {
    ...state,
    totalSupply: state.totalSupply + supply,
    totalBorrow: state.totalBorrow - repay,
    totalCash: state.totalCash + amount,
  };
  const nextPosition = {
    ...position,
    principalNegative: newP < 0n,
    principal: newP < 0n ? -newP : newP,
    nonce: position.nonce + 1,
  };
  const nextAccount = encodeAccount(owner, Number(readU64(bytes(c.accountCell.outputData), 65)) + 1);

  const outputs = [
    { capacity: c.stateCell.cellOutput.capacity, lock: scripts.marketStateLock(), type: scripts.market() },
    { capacity: c.positionCell.cellOutput.capacity, lock: scripts.positionLock(owner), type: scripts.position(owner) },
    { capacity: c.accountCell.cellOutput.capacity, lock: address.script, type: scripts.account(owner) },
    { capacity: c.baseVaultCell.cellOutput.capacity, lock: scripts.baseVaultLock(), type: scripts.baseVault() },
    { capacity: c.baseTokenCell.cellOutput.capacity, lock: scripts.baseTokenLock(), type: await xudtScript() },
  ];
  const data = [
    hex(encodeState(nextState)),
    hex(encodePosition(owner, nextPosition)),
    hex(nextAccount),
    hex(encodeVault(RUSD_ASSET_ID, vaultAmount + amount)),
    hex(u128le(tokenAmount + amount)),
  ];
  if (sourceAmount > amount) {
    outputs.push({ capacity: source.cellOutput.capacity, lock: address.script, type: await xudtScript() });
    data.push(hex(u128le(sourceAmount - amount)));
  }

  const tx = ccc.Transaction.from({
    cellDeps: cellDeps([c.configCell]),
    headerDeps: [tip.hash],
    inputs: [c.stateCell, c.positionCell, c.accountCell, c.baseVaultCell, c.baseTokenCell, source].map((cell) =>
      ccc.CellInput.from({ previousOutput: cell.outPoint, since: 0 }),
    ),
    outputs,
    outputsData: data,
  });
  return sendTx(tx, signer, 6, encodeAction(2, amount));
}

export async function withdrawRusd(signer: ccc.Signer, amount: bigint): Promise<string> {
  const address = await signer.getRecommendedAddressObj();
  const owner = address.script.hash();
  await ensureUserCells(signer);
  const c = await commonUserCells(owner);
  const tip = await client.getTipHeader();
  const state = accrueState(decodeState(bytes(c.stateCell.outputData)), Number(tip.timestamp / 1000n));
  const position = decodePosition(bytes(c.positionCell.outputData));
  if (position.principalNegative) throw new Error("Repay debt before withdrawing RUSD supply");
  const vaultAmount = decodeVault(bytes(c.baseVaultCell.outputData));
  const tokenAmount = readU128(bytes(c.baseTokenCell.outputData), 0);
  const old = position.principal;
  const oldPresent = presentValue(state.supplyIndex, old);
  if (amount > oldPresent) throw new Error("Insufficient supplied RUSD");
  const newPresent = oldPresent - amount;
  const newP = principalValueSupply(state.supplyIndex, newPresent);
  const principalDelta = old - newP;

  const nextState = {
    ...state,
    totalSupply: state.totalSupply - principalDelta,
    totalCash: state.totalCash - amount,
  };
  const nextPosition = {
    ...position,
    principal: newP,
    nonce: position.nonce + 1,
  };
  const nextAccount = encodeAccount(owner, Number(readU64(bytes(c.accountCell.outputData), 65)) + 1);

  const tx = ccc.Transaction.from({
    cellDeps: cellDeps([c.configCell]),
    headerDeps: [tip.hash],
    inputs: [c.stateCell, c.positionCell, c.accountCell, c.baseVaultCell, c.baseTokenCell].map((cell) =>
      ccc.CellInput.from({ previousOutput: cell.outPoint, since: 0 }),
    ),
    outputs: [
      { capacity: c.stateCell.cellOutput.capacity, lock: scripts.marketStateLock(), type: scripts.market() },
      { capacity: c.positionCell.cellOutput.capacity, lock: scripts.positionLock(owner), type: scripts.position(owner) },
      { capacity: c.accountCell.cellOutput.capacity, lock: address.script, type: scripts.account(owner) },
      { capacity: c.baseVaultCell.cellOutput.capacity, lock: scripts.baseVaultLock(), type: scripts.baseVault() },
      { capacity: c.baseTokenCell.cellOutput.capacity, lock: scripts.baseTokenLock(), type: await xudtScript() },
      { capacity: 150n * 100_000_000n, lock: address.script, type: await xudtScript() },
    ],
    outputsData: [
      hex(encodeState(nextState)),
      hex(encodePosition(owner, nextPosition)),
      hex(nextAccount),
      hex(encodeVault(RUSD_ASSET_ID, vaultAmount - amount)),
      hex(u128le(tokenAmount - amount)),
      hex(u128le(amount)),
    ],
  });
  return sendTx(tx, signer, 5, encodeAction(4, amount));
}

export async function repayRusd(signer: ccc.Signer, amount: bigint): Promise<string> {
  const address = await signer.getRecommendedAddressObj();
  const owner = address.script.hash();
  await ensureUserCells(signer);
  const c = await commonUserCells(owner);
  const rusdCells = await findRusdCells(address.script);
  const source = rusdCells.find((cell) => readU128(bytes(cell.outputData), 0) >= amount);
  if (!source) throw new Error("Insufficient RUSD balance");
  const sourceAmount = readU128(bytes(source.outputData), 0);
  const tip = await client.getTipHeader();
  const state = accrueState(decodeState(bytes(c.stateCell.outputData)), Number(tip.timestamp / 1000n));
  const position = decodePosition(bytes(c.positionCell.outputData));
  const vaultAmount = decodeVault(bytes(c.baseVaultCell.outputData));
  const tokenAmount = readU128(bytes(c.baseTokenCell.outputData), 0);
  const oldPrincipal = position.principalNegative ? -position.principal : position.principal;
  const oldPresent = oldPrincipal >= 0n ? presentValue(state.supplyIndex, oldPrincipal) : -presentValue(state.borrowIndex, -oldPrincipal);
  const newPresent = oldPresent + amount;
  const newPrincipal = principalValue(state.supplyIndex, state.borrowIndex, newPresent);
  const old = oldPrincipal;
  const newP = newPrincipal;
  let supply = 0n;
  let repay = 0n;
  if (newP < old) {
    // no-op
  } else if (newP <= 0n) {
    repay = newP - old;
  } else if (old >= 0n) {
    supply = newP - old;
  } else {
    repay = -old;
    supply = newP;
  }

  const nextState = {
    ...state,
    totalSupply: state.totalSupply + supply,
    totalBorrow: state.totalBorrow - repay,
    totalCash: state.totalCash + amount,
  };
  const nextPosition = {
    ...position,
    principalNegative: newP < 0n,
    principal: newP < 0n ? -newP : newP,
    nonce: position.nonce + 1,
  };
  const nextAccount = encodeAccount(owner, Number(readU64(bytes(c.accountCell.outputData), 65)) + 1);

  const outputs = [
    { capacity: c.stateCell.cellOutput.capacity, lock: scripts.marketStateLock(), type: scripts.market() },
    { capacity: c.positionCell.cellOutput.capacity, lock: scripts.positionLock(owner), type: scripts.position(owner) },
    { capacity: c.accountCell.cellOutput.capacity, lock: address.script, type: scripts.account(owner) },
    { capacity: c.baseVaultCell.cellOutput.capacity, lock: scripts.baseVaultLock(), type: scripts.baseVault() },
    { capacity: c.baseTokenCell.cellOutput.capacity, lock: scripts.baseTokenLock(), type: await xudtScript() },
  ];
  const data = [
    hex(encodeState(nextState)),
    hex(encodePosition(owner, nextPosition)),
    hex(nextAccount),
    hex(encodeVault(RUSD_ASSET_ID, vaultAmount + amount)),
    hex(u128le(tokenAmount + amount)),
  ];
  if (sourceAmount > amount) {
    outputs.push({ capacity: source.cellOutput.capacity, lock: address.script, type: await xudtScript() });
    data.push(hex(u128le(sourceAmount - amount)));
  }

  const tx = ccc.Transaction.from({
    cellDeps: cellDeps([c.configCell]),
    headerDeps: [tip.hash],
    inputs: [c.stateCell, c.positionCell, c.accountCell, c.baseVaultCell, c.baseTokenCell, source].map((cell) =>
      ccc.CellInput.from({ previousOutput: cell.outPoint, since: 0 }),
    ),
    outputs,
    outputsData: data,
  });
  return sendTx(tx, signer, 6, encodeAction(7, amount));
}

export function rates(snapshot: MarketSnapshot) {
  const presentSupply = presentValue(snapshot.state.supplyIndex, snapshot.state.totalSupply);
  const presentBorrow = presentValue(snapshot.state.borrowIndex, snapshot.state.totalBorrow);
  const util = presentSupply === 0n ? 0n : (presentBorrow * FACTOR) / presentSupply;
  const supply = rateAt(
    util,
    MARKET_CONFIG.supplyKink,
    MARKET_CONFIG.supplyBase,
    MARKET_CONFIG.supplySlopeLow,
    MARKET_CONFIG.supplySlopeHigh,
  );
  const borrow = rateAt(
    util,
    MARKET_CONFIG.borrowKink,
    MARKET_CONFIG.borrowBase,
    MARKET_CONFIG.borrowSlopeLow,
    MARKET_CONFIG.borrowSlopeHigh,
  );
  return {
    utilization: Number(util) / 1e16,
    supplyApy: (Number(supply) / 1e18) * Number(SECONDS_PER_YEAR) * 100,
    borrowApy: (Number(borrow) / 1e18) * Number(SECONDS_PER_YEAR) * 100,
  };
}


