# MoniMkt â€” Implementation Plan

> Native CKB lending market: **RUSD as the base asset**, **CKB as collateral**.
> Build in small steps, test locally first, then deploy to CKB testnet.

---

## 1. Scope and assumptions

### 1.1 Assets

| Asset | Role | Standard | Decimals | Notes |
|---|---|---|---|---|
| **RUSD** | Base asset (lend/borrow) | xUDT | 8 | Stable++ stablecoin. Testnet faucet available. Issuer-controlled; monitor upgrades. |
| **CKB** | Collateral | Native | 8 (shannons) | CKB is also the fee/storage token. Vault must account for occupied capacity. |

Known identifiers (verify before deployment; token hashes can change if the issuer upgrades):

- **RUSD testnet xUDT type hash:** `0x45b32a2bc4285d0a09678eb11960ddc8707bc2779887a09d482e9bfe9a2cdf52`
- **RUSD mainnet xUDT type hash:** `0x71ff665b40ba044b1981ea9a8965189559c8e01e8cdfa34a3cc565e1f870a95c`
- **RUSD testnet faucet:** `https://testnet0815.stablepp.xyz/faucet`
- **CKB testnet faucet:** `https://faucet.nervos.org`

### 1.2 Market parameters (initial testnet values)

| Parameter | Value | Rationale |
|---|---|---|
| `supply_kink` | 80% | Stablecoin-style curve |
| `borrow_kink` | 80% | |
| `supply_slope_low` | 3.5% APR | |
| `supply_slope_high` | 40% APR | |
| `borrow_slope_low` | 4.0% APR | |
| `borrow_slope_high` | 50% APR | |
| `borrow_base` | 0% | |
| CKB `borrow_cf` | 50% | CKB is volatile; conservative |
| CKB `liquidate_cf` | 60% | 10-point buffer |
| CKB `liquidation_factor` | 90% | 10% penalty |
| `store_front` | 50% | 50% of penalty to buyers |
| `base_borrow_min` | 10 RUSD | Testnet |
| `target_reserves` | 10,000 RUSD | Testnet |
| CKB `supply_cap` | 50,000,000 CKB | Testnet; tune later |
| Oracle | CKB/RUSD | Base-denominated; no separate RUSD/USD feed |

### 1.3 Out of scope for v1

- Multiple markets.
- Multiple collateral assets (only CKB).
- On-chain rewards.
- Share token / ERC-4626 analogue.
- Cross-chain governance.
- DEX liquidation integration (add after absorb/buy works).
- Merkleized user state.

---

## 2. Test ladder

Every step is tested at the lowest level that can catch the bug, then promoted.

| Level | Tool | What it proves |
|---|---|---|
| 1. Math unit tests | `cargo test` | Formulas, rounding, invariants |
| 2. Schema tests | `cargo test` + Molecule | Encode/decode, malformed data |
| 3. Script tests | `ckb-testtool` | A script accepts valid txs and rejects invalid ones |
| 4. Transaction tests | `ckb-testtool` + SDK | Full tx template builds and validates |
| 5. Local devnet | OffCKB / `ckb run` | End-to-end with real cells, wallets, indexer |
| 6. Testnet | CKB Aggron | Deployment, faucets, real RUSD/CKB, monitoring |
| 7. Mainnet | CKB mainnet | Audited, capped, monitored |

**Rule:** no step moves to the next level until its tests are green and the invariants hold.

---

## 3. Milestones

### M0 â€” Repository and toolchain (2â€“3 days)

**Goal:** a working Rust/CKB development environment.

**Tasks:**

- Create Cargo workspace:
  ```
  crates/
    math/
    schemas/
    cells/
    scripts/market-type/
    scripts/position-type/
    scripts/account-type/
    scripts/vault-lock/
    scripts/position-lock/
    scripts/oracle-type/
    scripts/config-type/
    scripts/pause-type/
    scripts/approval-type/
    sdk/
    services/batcher/
    services/indexer/
    services/keeper/
  ```
- Install:
  - Rust stable + `rustup target add riscv64imac-unknown-none-elf`
  - `ckb-std`, `ckb-testtool`, `molecule`
  - `ckb-cli`, OffCKB, CCC (JS/TS)
- CI: `cargo fmt --check`, `cargo clippy`, `cargo test`.
- Start a local devnet with OffCKB; fund a test account; query a cell.

**Local test:**

```bash
cargo test
offckb node
offckb faucet <address>
ckb-cli rpc get_tip_block_number
```

**Exit criteria:**

- A hello-world CKB script builds and passes a `ckb-testtool` test.
- A local devnet produces blocks; a test account can send CKB.
- CI is green.

---

### M1 â€” Math library (3â€“5 days)

**Goal:** a pure-Rust reference implementation of index modelâ€™s math, independent of CKB.

**Tasks:**

- `Principal` as sign + magnitude (`i128` or `{ negative: bool, magnitude: u128 }`).
- `present_value(principal, supply_index, borrow_index)`.
- `principal_value(present, supply_index, borrow_index)` with index rounding:
  - supply: floor
  - borrow: ceil
- `utilization(total_supply_present, total_borrow_present)`.
- `supply_rate(utilization, curve)`, `borrow_rate(utilization, curve)`.
- `accrue(index, rate, dt)`.
- `collateral_value(amount, price, scale, cf)`.
- `is_borrow_collateralized`, `is_liquidatable`.
- `absorb` math: `delta_value`, residual, protocol cost, PnL.
- `quote_collateral` math.
- `mul_div` helpers with `u128`/`u256`.

**Local test:**

- index test vectors:
  - index = 1e15, principal = 100e8, rate = 1e9/s, dt = 1 year.
  - supply/withdraw round trips.
  - borrow/repay round trips.
  - liquidation at different prices.
- Property tests:
  - `present_value(principal_value(v)) <= v` for supply.
  - `present_value(principal_value(v)) >= v` for borrow.
  - indices monotonic.
  - no free value in a round trip.
- Fuzz 10k random cases.

**Exit criteria:**

- All unit/property tests pass.
- The reference model matches a small Python reference spreadsheet for the test vectors.
- Rounding directions are documented.

---

### M2 â€” Schemas and cell parser (3â€“5 days)

**Goal:** stable Molecule schemas and safe parsing.

**Tasks:**

- `schemas/market.mol`:
  - `MarketState`, `MarketConfig`, `AssetConfig`, `AssetTotals`
  - `UserPosition`, `Account`, `Approval`
  - `Oracle`, `Pause`
  - `Action` enum
- Generate Rust bindings.
- `cells` crate:
  - `load_market_state`, `load_position`, `load_account`, `load_vault`, `load_oracle`, `load_config`, `load_pause`.
  - Strict length/type/args checks.
  - Typed error codes.
- `CKB_ASSET_ID` sentinel and `AssetKind::{Xudt, Ckb}`.

**Local test:**

- Round-trip encode/decode every struct.
- Malformed/truncated data returns a typed error, not a panic.
- Wrong type/args is rejected.

**Exit criteria:**

- All schema tests pass.
- Error codes are documented and stable.
- A cell parser fuzz target runs.

---

### M3 â€” Walking skeleton: RUSD supply/withdraw (1â€“2 weeks)

**Goal:** the smallest end-to-end market: create account, supply RUSD, accrue, withdraw RUSD. No collateral, no borrow.

**Cells:**

- `MarketState` (indices, total_supply_principal, total_cash, last_accrual).
- `MarketConfig` (rate curve, pause).
- `BaseVault` (mock RUSD xUDT on devnet).
- `Account` (user handle, nonce).
- `UserPosition` (principal only).

**Scripts:**

- `MarketType`: `Accrue`, `SupplyBase`, `WithdrawBase`.
- `PositionType`: principal transition only.
- `AccountType`: nonce + owner lock hash.
- `VaultLock`: RUSD xUDT delta.

**SDK:**

- `create_account`.
- `supply_base`.
- `withdraw_base`.
- `accrue`.

**Local test (script level):**

- Supply 100 RUSD â†’ position principal = 100e8; vault +100e8; `total_supply_principal += 100e8`.
- Accrue 1 year at 3.5% â†’ balance > 100e8.
- Withdraw 50 RUSD â†’ principal decreases; vault -50e8.
- Withdraw more than balance â†’ rejected.
- Wrong owner signature â†’ rejected.
- Replayed nonce â†’ rejected.
- Missing/extra/wrong cells â†’ rejected.

**Local test (devnet):**

- Deploy a mock RUSD xUDT (8 decimals) and mint 1,000 RUSD to a test wallet.
- Run the full flow with CCC/ckb-cli.
- Verify cells and balances with `ckb-cli`.

**Exit criteria:**

- End-to-end supply/withdraw works on devnet.
- Invariants:
  - `total_cash == base vault amount`
  - `sum(principal) == total_supply_principal - total_borrow_principal`
  - `supply_index` monotonic.
- No critical script errors.

**Why this step first:** it validates the hardest CKB plumbing (cells, auth, vault, state) without collateral/liquidation complexity.

---

### M4 â€” CKB collateral and borrow (2 weeks)

**Goal:** supply CKB collateral, borrow RUSD, repay, withdraw CKB.

**New cells:**

- `AssetConfig` (CKB: scale 1e8, CFs, liquidation factor, supply cap).
- `AssetTotals` (CKB total_supplied).
- `CkbVault` (native CKB; `CkbVaultType` + `VaultLock`).
- `Oracle` (CKB/RUSD mock).

**New scripts/logic:**

- `CkbVaultType`:
  ```
  capacity >= occupied_capacity(lock, type, data) + amount
  ```
  The cell data stores `amount` (shannons). The type script enforces the capacity/amount invariant.
- `PositionType`: collateral slots, `assets_in` bitmap.
- `MarketType`:
  - `SupplyCollateral`, `WithdrawCollateral`.
  - `Borrow`, `Repay`.
  - `is_borrow_collateralized`.
- `VaultLock`: CKB vault delta (capacity change) and RUSD vault delta.
- `OracleType`: mock CKB/RUSD price with timestamp.

**CKB collateral accounting:**

- The CKB vault is a single native-CKB cell.
- `amount` = free CKB (capacity minus occupied).
- Deposit: user CKB cells â†’ vault capacity += deposit; vault `amount` += deposit; position collateral += deposit.
- Withdraw: vault capacity -= withdraw; vault `amount` -= withdraw; user receives a CKB cell with capacity = withdraw; position collateral -= withdraw.
- The user pays the storage overhead of their output cell; the UI shows the net received CKB.

**Local test:**

- Supply 10,000 CKB at price 0.0012 RUSD/CKB.
- Borrow up to 50% CF = 6 RUSD (10,000 * 0.0012 * 0.5 = 6 RUSD).
- Borrow 7 RUSD â†’ rejected (`NotCollateralized`).
- Repay 3 RUSD â†’ borrow 3 RUSD.
- Withdraw CKB that would break CF â†’ rejected.
- Price drop to 0.0008 â†’ position becomes liquidatable at 60% CF.
- Oracle stale â†’ rejected.
- CKB vault capacity invariant holds.

**Exit criteria:**

- Borrow/repay/withdraw work end-to-end on devnet.
- CF/liquidation threshold math matches the reference model.
- CKB vault capacity/amount invariant holds for all tests.
- No way to borrow without sufficient CKB collateral.

---

### M5 â€” Liquidation (1â€“2 weeks)

**Goal:** absorb an underwater position, sell seized CKB at a discount, handle bad debt.

**New actions:**

- `Absorb`.
- `BuyCollateral`.
- `quoteCollateral`.

**New logic:**

- `PositionLock` liquidation path.
- `MarketType` absorb math:
  ```
  delta_value = Î£ collateral_value * liquidation_factor
  new_balance = max(0, old_balance + delta_value)
  total_borrow_principal -= debt
  total_supply_principal += residual
  asset_totals.total_supplied -= seized
  ```
- `BuyCollateral`:
  ```
  discount = store_front * (1 - liquidation_factor)
  collateral_out = base_in * price_base / (price_asset * (1 - discount)) * scale
  require collateral_out >= min_amount
  require collateral_out <= collateral_reserves
  ```
- Bad debt: `V*LF < D` â†’ residual 0; reserves decrease.

**Local test:**

- Price crash: CKB drops below the liquidation threshold.
- `absorb` healthy position â†’ rejected.
- `absorb` underwater position â†’ debt wiped; borrower residual correct; collateral moved to reserves.
- `buyCollateral` at discount â†’ buyer gets CKB; reserves increase.
- `buyCollateral` when reserves >= target â†’ rejected.
- Bad debt scenario â†’ reserves negative; no supplier haircut.
- `absorb` + `buy` in one tx (optional).
- Liquidation math matches the reference model.

**Exit criteria:**

- Only liquidatable positions can be absorbed.
- Protocol PnL matches the reference model.
- Collateral reserves accounting is correct.
- No free value / no double-seize.

---

### M6 â€” Approvals and manager permissions (3â€“5 days)

**Goal:** scoped manager permissions, expiry, revocation, no replay.

**New cells/scripts:**

- `Approval` cell + `ApprovalType`.
- `PositionLock` manager path.

**Local test:**

- Owner creates an approval for a manager with `supply` + `withdraw` permissions, expiry 1 day.
- Manager supplies/withdraws within scope â†’ accepted.
- Manager borrows â†’ rejected (not in scope).
- Expired approval â†’ rejected.
- Revoked approval â†’ rejected.
- Replayed nonce â†’ rejected.
- Manager cannot exceed the owner's position.

**Exit criteria:**

- Scoped permissions work.
- Owner can revoke.
- No replay/expiry bypass.

---

### M7 â€” Batching (1â€“2 weeks)

**Goal:** many user actions, one `MarketState` update.

**New components:**

- `Intent { market_id, owner, nonce, expiry, action, max_fee }`.
- `IntentLock` (or wallet-lock + intent signature).
- Batcher service:
  - mempool of signed intents,
  - simulate against current state,
  - build one tx with N accounts/positions + one MarketState,
  - submit/monitor.

**Local test:**

- Batch 10, 50, 100 supplies/withdrawals.
- Each user signs only their intent; batcher cannot forge.
- Aggregate invariants hold.
- Nonce ordering correct.
- Cycle/tx-size benchmark: record cycles per intent; find the max batch size under 3.5B cycles.
- Batcher cannot include an intent twice.
- Censorship: a user can self-submit if the batcher excludes them.

**Exit criteria:**

- Batch tx passes scripts.
- Throughput > single-action tx.
- No forgery/replay.
- Batch size limit documented.

---

### M8 â€” Indexer and minimal UI (1â€“2 weeks)

**Goal:** users can see balances/health and build transactions.

**Tasks:**

- Indexer:
  - parse MarketState/Position/AssetTotals/Vault/Oracle cells,
  - DB schema: markets, accounts, positions, collateral, actions, liquidations, reserves,
  - reorg-aware,
  - REST/GraphQL views: balance, borrow, health, utilization, APY, reserves, liquidation queue.
- UI:
  - connect wallet (CCC / JoyID),
  - create account,
  - supply/withdraw RUSD,
  - supply/withdraw CKB,
  - borrow/repay,
  - show health factor and liquidation price,
  - liquidate (advanced).
- SDK:
  - `build_supply_base`, `build_borrow`, etc.
  - `simulate` before submit.

**Local test:**

- Indexer state matches on-chain cells after each action.
- UI shows correct balances/health.
- Transactions built by the UI pass `ckb-testtool` simulation.
- Reorg handling: rewind/replay.

**Exit criteria:**

- A user can complete the full flow from the UI on devnet.
- Indexer and chain agree.
- No mismatched decimals (RUSD 8, CKB 8).

---

### M9 â€” Testnet deployment (1 week)

**Goal:** deploy on CKB testnet with official testnet RUSD and native CKB.

**Tasks:**

- Deploy scripts with Type ID to CKB testnet.
- Create:
  - MarketState genesis,
  - MarketConfig,
  - CKB AssetConfig/AssetTotals,
  - RUSD BaseVault,
  - CKB Vault,
  - Oracle cell (CKB/RUSD),
  - Pause cell,
  - Governance/config cells.
- Use official testnet RUSD:
  - type hash `0x45b32a2bc4285d0a09678eb11960ddc8707bc2779887a09d482e9bfe9a2cdf52`
  - decimals 8
  - faucet `https://testnet0815.stablepp.xyz/faucet`
- Fund test accounts with CKB from `https://faucet.nervos.org`.
- Deploy batcher/indexer/keeper.
- Smoke tests:
  - create account,
  - supply RUSD,
  - supply CKB,
  - borrow RUSD,
  - repay,
  - withdraw,
  - price update,
  - liquidation with a small position,
  - pause/unpause.
- Monitoring:
  - market state vs vault,
  - reserves,
  - oracle freshness,
  - failed tx rate,
  - liquidation backlog.

**Exit criteria:**

- Full flow works on testnet.
- Invariants hold after every smoke test.
- No critical script errors.
- Testnet addresses/scripts documented.

---

### M10 â€” Hardening and audit (2â€“4 weeks)

**Goal:** mainnet readiness.

**Tasks:**

- Fuzz cell parsing and transaction templates.
- Adversarial tests:
  - duplicate/missing/extra cells,
  - wrong market/asset IDs,
  - wrong token types,
  - vault spend without MarketState,
  - position debit without authorization,
  - replay/expired approval,
  - stale/zero/deviating oracle,
  - healthy position absorb,
  - bad debt,
  - capacity griefing,
  - cycle exhaustion.
- Cycle benchmarks for borrow/absorb with max collateral.
- External audit of scripts, vault lock, position lock, oracle adapter, governance.
- Bug bounty.
- Mainnet checklist:
  - RUSD issuer/upgrade risk assessment,
  - RUSD liquidity,
  - CKB/RUSD oracle quality,
  - caps and circuit breakers,
  - governance timelock,
  - incident response,
  - migration/freeze plan.

**Exit criteria:**

- Audit findings resolved.
- Mainnet parameters approved.
- Monitoring/alerting live.
- Incident runbook tested.

---

## 4. Per-step test checklist

For every milestone, test these categories:

### Happy path
- The intended action succeeds.
- Cell outputs are correct.
- Events/indexer sees the action.

### Boundary
- Zero amount.
- Max amount.
- Exact `base_borrow_min`.
- Exact CF/liquidation threshold.
- Exact vault capacity/occupied capacity.
- 8-decimal rounding (RUSD and CKB).

### Authorization
- Wrong signer.
- Missing account cell.
- Expired approval.
- Revoked approval.
- Replayed nonce.
- Manager exceeding scope.
- Liquidation of a healthy position.

### Cell confusion
- Duplicate MarketState.
- Extra position/vault/collateral cells.
- Wrong market ID.
- Wrong asset ID.
- Wrong token type.
- Missing oracle/config/header dep.
- Position from another market.
- Vault without MarketState.

### Oracle
- Price = 0.
- Stale timestamp.
- Future timestamp.
- Deviation > max.
- Confidence too wide.
- Missing oracle cell.

### Capacity
- Vault capacity exactly `occupied + amount`.
- Deposit/withdraw at 1 shannon.
- User output cell capacity covers lock overhead.
- CKB vault remains valid at zero amount.

### Invariants
- `sum(principal) == total_supply_principal - total_borrow_principal`.
- `total_cash == base vault amount`.
- `asset_totals.total_supplied + collateral_reserves == collateral vault amount`.
- `reserves = total_cash - present_supply + present_borrow`.
- Indices monotonic.
- No free value.
- No unauthorized debit.
- No vault spend without market transition.

---

## 5. RUSD and CKB specifics

### 5.1 RUSD

- xUDT, 8 decimals.
- Testnet type hash: `0x45b32a2bc4285d0a09678eb11960ddc8707bc2779887a09d482e9bfe9a2cdf52`.
- Mainnet type hash: `0x71ff665b40ba044b1981ea9a8965189559c8e01e8cdfa34a3cc565e1f870a95c`.
- Testnet faucet: `https://testnet0815.stablepp.xyz/faucet`.
- **Risk:** RUSD is issuer-controlled and small (mainnet supply ~73k at the time of research). The issuer may upgrade/freeze the token. The market must:
  - monitor the RUSD type script/lock,
  - cap exposure,
  - have a pause/migration plan,
  - consider a diversified base or a wrapper for mainnet.

### 5.2 CKB collateral

- Native CKB, 8 decimals (shannons).
- A CKB cellâ€™s capacity is both the token amount and the storage limit.
- The vault cell stores `amount` (free CKB) in data; its capacity must satisfy:
  ```
  capacity >= occupied_capacity(lock, type, data) + amount
  ```
- `CkbVaultType` enforces this invariant.
- `VaultLock` enforces the capacity delta.
- The user pays the storage overhead of their output cell when withdrawing; the UI shows the net received CKB.
- Users must keep fee CKB outside the vault; the UI must warn and reserve enough for fees.
- A single CKB vault cell is simple; if contention becomes an issue, shard the vault later.

### 5.3 Oracle

- Use **base-denominated** CKB/RUSD price (RUSD per CKB), scaled 1e8.
- `value = CKB_shannons * price / 1e8` gives RUSD scaled 1e8.
- No separate RUSD/USD feed is needed for collateralization.
- If RUSD depegs, the CKB/RUSD market price reflects it; document the assumption.
- Testnet: mock/committee oracle with configurable price.
- Mainnet: TWAP/multiple sources; freshness, confidence, deviation checks.

---

## 6. Repository layout

```
monimkt/
â”œâ”€â”€ ARCHITECTURE.md
â”œâ”€â”€ IMPLEMENTATION_PLAN.md
â”œâ”€â”€ Cargo.toml
â”œâ”€â”€ crates/
â”‚   â”œâ”€â”€ math/
â”‚   â”œâ”€â”€ schemas/
â”‚   â”œâ”€â”€ cells/
â”‚   â”œâ”€â”€ scripts/
â”‚   â”‚   â”œâ”€â”€ market-type/
â”‚   â”‚   â”œâ”€â”€ position-type/
â”‚   â”‚   â”œâ”€â”€ account-type/
â”‚   â”‚   â”œâ”€â”€ vault-lock/
â”‚   â”‚   â”œâ”€â”€ position-lock/
â”‚   â”‚   â”œâ”€â”€ oracle-type/
â”‚   â”‚   â”œâ”€â”€ config-type/
â”‚   â”‚   â”œâ”€â”€ pause-type/
â”‚   â”‚   â””â”€â”€ approval-type/
â”‚   â”œâ”€â”€ sdk/
â”‚   â””â”€â”€ services/
â”‚       â”œâ”€â”€ batcher/
â”‚       â”œâ”€â”€ indexer/
â”‚       â””â”€â”€ keeper/
â”œâ”€â”€ schemas/
â”‚   â””â”€â”€ market.mol
â”œâ”€â”€ tests/
â”‚   â”œâ”€â”€ unit/
â”‚   â”œâ”€â”€ script/
â”‚   â”œâ”€â”€ integration/
â”‚   â””â”€â”€ fuzz/
â””â”€â”€ docs/
```

---

## 7. Definition of done (v1)

- RUSD supply/withdraw works on testnet.
- CKB collateral supply/withdraw works.
- Borrow/repay works with CF checks.
- Liquidation (absorb + buy) works.
- Manager approvals work.
- Batching works.
- Indexer/UI shows correct balances and health.
- All invariants hold in tests and testnet smoke tests.
- Audit completed; mainnet caps and monitoring ready.

---

## 8. Suggested order of work (summary)

1. **M0** repo/toolchain.
2. **M1** math.
3. **M2** schemas/parser.
4. **M3** RUSD supply/withdraw walking skeleton.
5. **M4** CKB collateral + borrow.
6. **M5** liquidation.
7. **M6** approvals.
8. **M7** batching.
9. **M8** indexer/UI.
10. **M9** testnet.
11. **M10** audit/mainnet.

The first true â€œit worksâ€ moment is **M3**: create account â†’ supply RUSD â†’ accrue â†’ withdraw RUSD on a local devnet. Everything after that is adding collateral, risk, liquidation, and scale.
