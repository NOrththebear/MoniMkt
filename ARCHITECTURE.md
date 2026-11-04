# MoniMkt - Native Index-Based Lending on CKB

> A native CKB implementation of an index-based lending market.
> No rollup, no Solidity. State lives in cells; scripts validate transitions.

---

## 1. Design goals

1. **Preserve the economics** â€” signed principal + global indices, utilization-based rate curves, two collateral factors, liquidation factor, absorb + discounted collateral sale, implicit reserves.
2. **Be native to CKB** â€” cells are the state; lock scripts authorize; type scripts enforce transitions; Type ID handles upgrades.
3. **Be implementable** â€” a bounded v1 (one market, â‰¤ 8 collateral assets, single vault per asset) that can ship and be extended.
4. **Be safe under the cell model** â€” no cell confusion, no unauthorized vault spends, no replay, no oracle staleness, no capacity griefing.
5. **Be scalable enough** â€” permissionless batching amortizes the singleton `MarketState` cell; a keeper keeps interest fresh.

Non-goals for v1: cross-market margining, collateral receipts, on-chain rewards, share tokens, cross-chain governance. These are v2.

---

## 2. The core idea

The market is a global balance sheet. CKB has no global storage. We model the balance sheet as a **singleton state cell** plus **per-user cells** and **vault cells**:

```
MarketState (singleton)  â† global indices, totals, cash, pause
AssetTotals[asset]       â† per-asset supplied totals
BaseVault                â† base token cash
CollateralVault[asset]   â† collateral tokens (user collateral + protocol reserves)
UserPosition[user]       â† principal, tracking, collateral slots
Account[user]            â† user-owned handle: nonce + authorization
Approval[owner,manager]  â† scoped capability
Oracle[asset]            â† price + timestamp + confidence
```

Every action is a CKB transaction that consumes the relevant cells and creates updated ones. Scripts validate:

- `MarketType` â€” the global accounting transition.
- `PositionType` â€” the user position transition.
- `AccountType` â€” the user handle / nonce.
- `VaultLock` â€” the token custody delta.
- `PositionLock` â€” who may spend a position (owner, manager, liquidation, credit).
- `OracleType` â€” the price feed's authenticity.
- `ConfigType` / `PauseType` â€” governance and emergency controls.
- `ApprovalType` â€” scoped manager capabilities.

The `MarketState` cell is intentionally a singleton. That is the throughput bottleneck. The architecture solves it with **batching**, not by pretending it isn't there.

---

## 3. Cell graph

```
                         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                         â”‚        MarketState          â”‚
                         â”‚  indices / totals / cash    â”‚
                         â”‚  last_accrual / pause       â”‚
                         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                        â”‚
        â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
        â”‚                               â”‚                                â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”              â”Œâ”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”
â”‚  MarketConfig  â”‚              â”‚   AssetConfig  â”‚              â”‚     Pause      â”‚
â”‚  rate curves   â”‚              â”‚   risk params  â”‚              â”‚  pause flags   â”‚
â”‚  governance    â”‚              â”‚   governance   â”‚              â”‚  guardian      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜              â””â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜              â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                        â”‚
                         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                         â”‚        AssetTotals          â”‚
                         â”‚     total_supplied          â”‚
                         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                        â”‚
              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
              â”‚                         â”‚                         â”‚
      â”Œâ”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”        â”Œâ”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”        â”Œâ”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”
      â”‚   BaseVault    â”‚        â”‚ CollateralVaultâ”‚        â”‚    Oracle      â”‚
      â”‚   xUDT base    â”‚        â”‚   xUDT asset   â”‚        â”‚ price/time/confâ”‚
      â”‚   VaultLock    â”‚        â”‚   VaultLock    â”‚        â”‚  read-only dep â”‚
      â””â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜        â””â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
              â”‚                         â”‚
              â”‚                         â”‚
      â”Œâ”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”        â”Œâ”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”
      â”‚  UserPosition  â”‚â—„â”€â”€â”€â”€â”€â”€â”€â”‚ UserPosition   â”‚
      â”‚  principal     â”‚        â”‚ collateral     â”‚
      â”‚  PositionLock  â”‚        â”‚ slots          â”‚
      â””â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
              â”‚
      â”Œâ”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”        â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
      â”‚    Account     â”‚        â”‚   Approval     â”‚
      â”‚  owner lock    â”‚        â”‚  owner lock    â”‚
      â”‚  nonce         â”‚        â”‚  scope/expiry  â”‚
      â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

Legend:

- `MarketState`, `AssetTotals`: shared state cells; permissive lock, strict type script.
- `BaseVault`, `CollateralVault`: token cells; `VaultLock` is the security boundary.
- `Account`: user-owned cell; the user's wallet lock is the authorization boundary.
- `UserPosition`: market-locked; `PositionLock` decides who may spend, `PositionType` decides what the new state may be.
- `Approval`: owner-locked capability; the manager reads it as a cell dep.
- `Oracle`: read-only dep in user transactions; updated by the publisher.

---

## 4. Scripts

### 4.1 `MarketType`

**Runs on:** `MarketState` input/output (singleton).

**Responsibilities:**

1. Enforce exactly one input and one output `MarketState` for the market (no burn, no duplicate).
2. Check `version`, `market_id`, and `base_asset_id`.
3. Load `MarketConfig`, `AssetConfig[]`, `Pause`, and `Oracle[]` as cell deps; verify their type scripts, args, and governance/guardian locks.
4. Read the header dep timestamp; accrue interest:
   ```
   dt = header.timestamp - last_accrual_time
   supply_index += supply_index * supply_rate * dt / 1e18
   borrow_index += borrow_index * borrow_rate * dt / 1e18
   ```
5. Update tracking indices if the reward thresholds are met.
6. Parse the `Action` from the witness.
7. Validate the action's effect on:
   - `total_supply_principal`
   - `total_borrow_principal`
   - `total_cash`
   - `AssetTotals[].total_supplied`
   - `UserPosition[]` principals/collateral
   - vault amounts
8. Enforce the global invariants (section 9).
9. Reject unknown/extra cells, duplicate cells, wrong market IDs, wrong token types, missing oracles/config/header.
10. Write the new `MarketState` and return success.

The `MarketType` is the accounting engine. It must never trust the action witness alone; it derives the expected state from the cells and compares.

### 4.2 `PositionType`

**Runs on:** `UserPosition` input/output.

**Responsibilities:**

1. Check args: `market_id || owner_lock_hash`.
2. Require the matching `MarketState` cell as an input.
3. Parse the action; validate the principal transition:
   ```
   new_balance = presentValue(old_principal) Â± amount
   new_principal = principalValue(new_balance)
   ```
4. Validate collateral slot changes:
   - Supply collateral: slot increases; `assets_in` bit set.
   - Withdraw collateral: slot decreases; `assets_in` bit cleared when zero.
   - Transfer collateral: sender decreases, receiver increases; total supplied unchanged.
   - Absorb: all slots cleared.
5. Validate the nonce increment for owner/manager paths; no nonce change for credit/liquidation paths.
6. Validate the position's owner lock hash matches the account/approval.
7. Validate `isBorrowCollateralized` for any action that leaves a negative principal (borrow/withdraw/transfer debit).
8. Reject a position with a negative principal after `Absorb` (clamped to zero or positive).
9. Return success.

### 4.3 `AccountType`

**Runs on:** `Account` input/output.

**Responsibilities:**

1. Args: `market_id || owner_lock_hash`.
2. Verify `owner_lock_hash` equals the hash of the cell's lock script (the account is owned by the user).
3. On creation: nonce = 0; no prior account with the same args (the type script can enforce uniqueness via a Type ID-like rule or by requiring the account cell to be created from the user's lock).
4. On update: nonce increments by exactly 1.
5. On close: allow the owner to consume the account and reclaim capacity; no output required.
6. Reject nonce reuse/replay.

### 4.4 `VaultLock`

**Runs on:** vault inputs (`BaseVault`, `CollateralVault`).

**Responsibilities:**

1. Args: `market_id || asset_id`.
2. Require the matching `MarketState` input and the `MarketType` script in the transaction.
3. Verify the vault's token type is the expected xUDT type for `asset_id`.
4. Verify the vault amount delta matches the action's expected delta:
   - Supply/repay: vault increases by received.
   - Withdraw/borrow: vault decreases by paid.
   - Buy collateral: base vault increases; collateral vault decreases.
   - Withdraw reserves: base vault decreases.
5. Require one input and one output vault (the vault persists), except a governance `CloseVault` action.
6. Reject any spend that is not part of a valid market transition.

The `VaultLock` is the token custody boundary. It must be independently strict; the `MarketType` is not the only check.

### 4.5 `PositionLock`

**Runs on:** `UserPosition` inputs.

**Authorization paths:**

1. **Owner path**
   - Require an `Account` cell input with the same `market_id || owner_lock_hash`.
   - The account cell's lock is the owner's wallet/IntentLock, so the owner's signature is verified by the account lock.
   - The position lock checks the account args and nonce; it does not verify the signature itself.
2. **Manager path**
   - Require the manager's `Account` cell input (manager lock verifies the manager's signature).
   - Require an `Approval` cell dep with `market_id || owner_lock_hash || manager_lock_hash`, unexpired, with the required permission.
   - The position lock checks the approval's scope and expiry.
3. **Liquidation path**
   - Require the `MarketState` input and `MarketType` script.
   - Require the action to be `Absorb`.
   - The `MarketType` proves `isLiquidatable`; the position lock trusts it.
4. **Credit path**
   - Allow a position to be credited (principal or collateral increases) without the owner's signature.
   - Require a matching debit from another position in the same transaction, authorized by that owner.
   - The `MarketType` validates the sum; the `PositionType` validates the credit-only change.
   - This lets users receive transfers without signing.

The owner/manager paths are the only paths that can debit a position. The credit path can only increase it.

### 4.6 `OracleType`

**Runs on:** `Oracle` cell.

**Responsibilities:**

1. Args: `asset_id || publisher_set_hash`.
2. Verify the update is signed by an authorized publisher/committee.
3. Validate `price > 0`, `timestamp` monotonic, `confidence` within bounds, and `expiry`.
4. Store `{ asset_id, price, exponent, timestamp, confidence }`.
5. Support both push updates (publisher tx) and pull updates (signed price in the witness, verified by the type script).

The `MarketType` reads the oracle cell as a **cell dep** and checks:
- canonical type/args for the asset,
- `header.timestamp - oracle.timestamp <= max_oracle_age`,
- price deviation from the last accepted price,
- confidence bound.

### 4.7 `ConfigType` / `PauseType`

- `ConfigType` validates parameter bounds:
  - `borrow_cf <= liquidate_cf <= 1e18`
  - `liquidation_factor <= 1e18`
  - `store_front <= 1e18`
  - `supply_kink <= 1e18`, `borrow_kink <= 1e18`
  - `base_borrow_min <= target_reserves`? No, independent.
  - `max_oracle_age > 0`
- `PauseType` validates the five pause flags.
- Locks: governance for config, pause guardian for pause.
- The `MarketType` checks the config/pause cell's lock hash against the expected governance/guardian lock hash.

### 4.8 `ApprovalType`

**Runs on:** `Approval` cell.

**Responsibilities:**

1. Args: `market_id || owner_lock_hash || manager_lock_hash`.
2. Data: `permissions`, `expiry`, `nonce`.
3. On creation: require the owner's `Account` input; verify the owner's authorization; store the capability.
4. On revocation: the owner consumes the approval cell (lock = owner's wallet lock); capacity is reclaimed.
5. On use: the approval cell is a **cell dep** in the manager's action tx; the `PositionLock` reads it. It is not consumed, so it can be reused until expiry/revocation.

---

## 5. State schemas

All data is serialized with **Molecule**. Use `Uint128` for amounts/indices, `Uint64` for timestamps/nonces, `Byte32` for IDs, and a sign-magnitude struct for signed principal.

### 5.1 `MarketState`

```rust
struct MarketState {
    version: u8,
    market_id: Byte32,
    base_asset_id: Byte32,
    base_decimals: u8,
    supply_index: Uint128,          // starts at 1e15
    borrow_index: Uint128,          // starts at 1e15
    tracking_supply_index: Uint128,
    tracking_borrow_index: Uint128,
    total_supply_principal: Uint128,
    total_borrow_principal: Uint128,
    total_cash: Uint128,            // must equal BaseVault amount
    last_accrual_time: Uint64,
    pause_flags: u8,
    asset_count: u8,
    config_hash: Byte32,            // commitment to config cells
    reserved: Byte32,
}
```

### 5.2 `MarketConfig`

```rust
struct MarketConfig {
    version: u8,
    market_id: Byte32,
    supply_kink: Uint64,
    borrow_kink: Uint64,
    supply_slope_low: Uint64,
    supply_slope_high: Uint64,
    supply_base: Uint64,
    borrow_slope_low: Uint64,
    borrow_slope_high: Uint64,
    borrow_base: Uint64,
    store_front: Uint64,
    base_borrow_min: Uint128,
    target_reserves: Uint128,
    base_min_for_rewards: Uint128,
    tracking_index_scale: Uint64,
    base_tracking_supply_speed: Uint64,
    base_tracking_borrow_speed: Uint64,
    max_oracle_age: Uint64,
    max_price_deviation: Uint64,
    reserved: Byte32,
}
```

### 5.3 `AssetConfig`

```rust
struct AssetConfig {
    version: u8,
    market_id: Byte32,
    asset_id: Byte32,               // xUDT type script hash
    price_feed_id: Byte32,
    scale: Uint64,                  // 10^decimals
    borrow_cf: Uint64,
    liquidate_cf: Uint64,
    liquidation_factor: Uint64,
    supply_cap: Uint128,
    reserved: Byte32,
}
```

### 5.4 `AssetTotals`

```rust
struct AssetTotals {
    version: u8,
    market_id: Byte32,
    asset_id: Byte32,
    total_supplied: Uint128,
    reserved: Byte32,
}
```

### 5.5 `UserPosition`

```rust
struct Principal {
    negative: Bool,
    magnitude: Uint128,
}

struct UserPosition {
    version: u8,
    market_id: Byte32,
    owner_lock_hash: Byte32,
    principal: Principal,
    tracking_index: Uint128,
    tracking_accrued: Uint64,
    reward_claimed: Uint64,
    nonce: Uint64,
    assets_in: Uint32,              // bitmap of active collateral slots
    collateral: Vector<Uint128>,    // fixed length = asset_count; index = asset index
    reserved: Byte32,
}
```

For v1, `collateral` is a fixed-length vector of `asset_count` slots (â‰¤ 8). This makes absorb atomic in one cell. Adding an asset beyond 8 requires a position migration. For v2, replace with a Merkle root + `UserCollateral` cells.

### 5.6 `Account`

```rust
struct Account {
    version: u8,
    market_id: Byte32,
    owner_lock_hash: Byte32,
    nonce: Uint64,
    flags: u8,
    reserved: Byte32,
}
```

### 5.7 `Approval`

```rust
struct Approval {
    version: u8,
    market_id: Byte32,
    owner_lock_hash: Byte32,
    manager_lock_hash: Byte32,
    permissions: Uint32,            // supply/withdraw/transfer/borrow/collateral
    expiry: Uint64,
    nonce: Uint64,
    reserved: Byte32,
}
```

### 5.8 `Oracle`

```rust
struct Oracle {
    version: u8,
    asset_id: Byte32,
    price: Uint128,
    exponent: Int8,
    timestamp: Uint64,
    confidence: Uint128,
    publisher_set_hash: Byte32,
    reserved: Byte32,
}
```

### 5.9 `Pause`

```rust
struct Pause {
    version: u8,
    market_id: Byte32,
    flags: u8,                      // supply/transfer/withdraw/absorb/buy
    updated_at: Uint64,
    reserved: Byte32,
}
```

---

## 6. Action model

The witness carries an `Action` plus the user's authorization. The action is a hint; the scripts derive the state change from the cells.

```rust
enum Action {
    CreateAccount,
    SupplyBase { amount: Uint128 },
    SupplyCollateral { asset_index: u8, amount: Uint128 },
    WithdrawBase { amount: Uint128 },
    WithdrawCollateral { asset_index: u8, amount: Uint128 },
    Borrow { amount: Uint128 },
    Repay { amount: Uint128 },
    TransferBase { to: Byte32, amount: Uint128 },
    TransferCollateral { to: Byte32, asset_index: u8, amount: Uint128 },
    Absorb { accounts: Vector<Byte32> },
    BuyCollateral { asset_index: u8, min_amount: Uint128, base_amount: Uint128 },
    Accrue,
    Pause { flags: u8 },
    WithdrawReserves { to: Byte32, amount: Uint128 },
    CreateApproval { manager: Byte32, permissions: Uint32, expiry: Uint64 },
    RevokeApproval,
}
```

The action is included in the signed intent for owner/manager paths. For v1 single-action transactions, the owner's wallet lock can sign the whole transaction (`sighash_all`). For batching, use an `IntentLock` that verifies a signature over a canonical intent hash (section 8).

---

## 7. Transaction templates

### 7.1 Create account

```
Inputs:
  user CKB cells
Outputs:
  Account[user] (nonce = 0)
  change
Deps:
  AccountType code
Witness:
  owner signature
```

### 7.2 Supply base

```
Inputs:
  0: Account[user]                 (owner lock)
  1: UserPosition[user]            (PositionLock)
  2: MarketState                   (SharedStateLock)
  3: BaseVault                     (VaultLock, xUDT base)
  4..: user base xUDT cells
Outputs:
  0: Account[user] (nonce + 1)
  1: UserPosition[user] (principal increased)
  2: MarketState (indices/totals/cash updated)
  3: BaseVault (amount + received)
  4..: change cells
Deps:
  MarketType, PositionType, AccountType, VaultLock, xUDT code
  MarketConfig, AssetConfig[], Pause, Oracle[base] (read-only)
HeaderDeps:
  recent header
Witness:
  Action::SupplyBase { amount }
  owner signature / intent signature
```

### 7.3 Borrow

```
Inputs:
  0: Account[user]
  1: UserPosition[user]
  2: MarketState
  3: BaseVault
Outputs:
  0: Account[user] (nonce + 1)
  1: UserPosition[user] (principal more negative)
  2: MarketState (indices/totals/cash updated)
  3: BaseVault (cash decreased)
  4: user base xUDT cell (borrowed amount)
Deps:
  MarketType, PositionType, AccountType, VaultLock, xUDT
  MarketConfig, AssetConfig[], Pause
  Oracle[base], Oracle[collateral] (all active collateral)
HeaderDeps:
  recent header
Witness:
  Action::Borrow { amount }
  owner signature / intent signature
```

Validation: accrue; compute new principal; enforce `base_borrow_min` if negative; enforce `isBorrowCollateralized`; update totals; vault delta.

### 7.4 Supply collateral

```
Inputs:
  Account[user]
  UserPosition[user]
  MarketState
  AssetTotals[asset]
  CollateralVault[asset]
  user collateral xUDT cells
Outputs:
  Account[user] (nonce + 1)
  UserPosition[user] (collateral slot increased, assets_in bit set)
  MarketState (indices updated; totals unchanged)
  AssetTotals[asset] (total_supplied + received)
  CollateralVault[asset] (amount + received)
  change
Deps:
  MarketType, PositionType, AccountType, VaultLock, xUDT
  MarketConfig, AssetConfig[asset], Pause
HeaderDeps:
  recent header
Witness:
  Action::SupplyCollateral { asset_index, amount }
```

Validation: supply cap; actual token delta; no interest on collateral.

### 7.5 Withdraw collateral

```
Inputs:
  Account[user]
  UserPosition[user]
  MarketState
  AssetTotals[asset]
  CollateralVault[asset]
Outputs:
  Account[user] (nonce + 1)
  UserPosition[user] (collateral slot decreased; bit cleared if zero)
  MarketState
  AssetTotals[asset] (total_supplied - amount)
  CollateralVault[asset] (amount - amount)
  user collateral xUDT cell
Deps:
  MarketType, PositionType, AccountType, VaultLock, xUDT
  MarketConfig, AssetConfig[asset], Pause
  Oracle[collateral] (all active collateral)
HeaderDeps:
  recent header
Witness:
  Action::WithdrawCollateral { asset_index, amount }
```

Validation: `isBorrowCollateralized` after the withdrawal.

### 7.6 Repay

Same as supply base, but the principal moves toward zero/positive. The market type splits the principal change into repay and supply.

### 7.7 Transfer base / collateral

```
Inputs:
  Account[sender]
  UserPosition[sender]
  UserPosition[receiver] (or create)
  MarketState
Outputs:
  Account[sender] (nonce + 1)
  UserPosition[sender] (debit)
  UserPosition[receiver] (credit)
  MarketState (totals updated if crossing)
Deps:
  MarketType, PositionType, AccountType, PositionLock
  MarketConfig, Pause, Oracles (if collateralization check needed)
Witness:
  Action::TransferBase { to, amount }
  sender signature
```

Receiver credit does not require the receiver's signature; the position lock's **credit path** allows a credit-only change, and the market type validates the matching debit. If the receiver has no account/position, the sender pays the capacity to create them.

### 7.8 Absorb

```
Inputs:
  0: MarketState
  1: UserPosition[borrower]       (liquidation path)
  2..: AssetTotals[asset] for each seized asset
  3..: CollateralVault[asset] for each seized asset (or cell deps if unchanged)
Outputs:
  0: MarketState (indices/totals updated)
  1: UserPosition[borrower] (principal 0/residual; collateral cleared)
  2..: AssetTotals[asset] (total_supplied - seized)
  3..: CollateralVault[asset] (unchanged if absorb-only)
Deps:
  MarketType, PositionType, VaultLock, xUDT
  MarketConfig, AssetConfig[], Pause
  Oracle[base], Oracle[all collateral]
HeaderDeps:
  recent header
Witness:
  Action::Absorb { accounts: [borrower] }
  liquidator signature (fee payer)
```

Validation:

```
for each collateral:
    seize = user_collateral
    value = seize * price / scale
    delta_value += value * liquidation_factor / 1e18
delta_balance = delta_value * base_scale / base_price   // if USD-denominated
new_balance = max(0, old_balance + delta_balance)
new_principal = principalValue(new_balance)
total_borrow_principal -= debt
total_supply_principal += residual
asset_totals.total_supplied -= seized
```

The collateral stays in the collateral vault; `collateral_reserves = vault.amount - total_supplied` increases. The protocol's base cash does not change.

### 7.9 Buy collateral

```
Inputs:
  MarketState
  AssetTotals[asset]
  CollateralVault[asset]
  buyer base xUDT cells
Outputs:
  MarketState (total_cash + baseIn)
  AssetTotals[asset] (unchanged total_supplied)
  CollateralVault[asset] (amount - collateralOut)
  buyer collateral xUDT cells
Deps:
  MarketType, VaultLock, xUDT
  MarketConfig, AssetConfig[asset], Pause
  Oracle[base], Oracle[asset]
HeaderDeps:
  recent header
Witness:
  Action::BuyCollateral { asset_index, min_amount, base_amount }
```

Validation:

```
discount = store_front * (1e18 - liquidation_factor) / 1e18
discounted_price = asset_price * (1e18 - discount) / 1e18
collateral_out = base_price * base_in * asset_scale
                 / discounted_price / base_scale
require collateral_out >= min_amount
require collateral_out <= collateral_reserves
```

### 7.10 Accrue

```
Inputs: MarketState
Outputs: MarketState (indices/tracking/last_accrual updated)
Deps: MarketConfig, Pause
HeaderDeps: recent header
Witness: Action::Accrue
```

Permissionless; a keeper can submit every N blocks. This keeps interest near-continuous and reduces path dependence.

### 7.11 Pause / withdraw reserves

- `Pause`: input `Pause`, output `Pause` with flags; lock = pause guardian; type validates flags.
- `WithdrawReserves`: inputs `MarketState`, `BaseVault`, governance auth; outputs updated state/vault + recipient base xUDT; market type checks `reserves >= amount`.

---

## 8. Authorization and batching

### 8.1 The account/position split

- The **Account** cell is owned by the user's wallet lock. It proves the user's authorization because its lock script runs on input.
- The **UserPosition** cell is market-locked. It cannot be spent by the user directly; it requires the matching Account cell (owner path) or a manager Account + Approval (manager path) or a market-proven liquidation.
- This lets the market support arbitrary user locks (secp256k1, multisig, JoyID, passkey) without knowing the signature scheme.

### 8.2 Intent-based batching

For high throughput, users sign an **Intent**, not a full transaction:

```rust
struct Intent {
    market_id: Byte32,
    owner_lock_hash: Byte32,
    nonce: Uint64,
    expiry: Uint64,
    action: Action,
    max_fee: Uint128,
}
```

- The owner signs `hash(domain || intent)`, where `domain` includes the CKB genesis hash, market ID, and script hash.
- The `IntentLock` (the account cell's lock) verifies the signature using `ckb-auth` or a scheme-specific verifier.
- A permissionless **batcher** collects intents and builds one transaction with:
  - one `MarketState` input/output,
  - one `Account` input/output per user (nonce + 1),
  - one `UserPosition` input/output per user,
  - the affected vaults/asset totals,
  - the intents + signatures in the witness.
- `MarketType` validates the aggregate; each `PositionType` validates its own user; each `AccountType` validates the nonce.
- The batcher cannot forge signatures or change intents. It can censor/reorder; users can self-submit if needed.

This is the CKB-native answer to the singleton bottleneck: **many user actions, one market state update**.

### 8.3 Fee model

- The batcher pays the CKB transaction fee (capacity difference + cycles).
- Users pay the batcher via `max_fee` (in base asset or CKB, settled off-chain or via a fee output).
- For v1, the batcher can be protocol-run/subsidized; later decentralize with a leader auction or a fee market.
- Users need CKB for their account/position capacity. The protocol can subsidize the first account or charge an origination fee.

---

## 9. Invariants

The scripts must enforce these after every transaction:

1. `sum(user.principal) == total_supply_principal - total_borrow_principal`.
2. `sum(user.collateral[i]) == AssetTotals[i].total_supplied`.
3. `MarketState.total_cash == BaseVault.amount`.
4. `CollateralVault[i].amount == AssetTotals[i].total_supplied + collateral_reserves[i]`.
5. `reserves = total_cash - presentValueSupply(supply_index, total_supply_principal) + presentValueBorrow(borrow_index, total_borrow_principal)`.
6. `supply_index` and `borrow_index` are monotonically non-decreasing.
7. `borrow_cf <= liquidate_cf <= 1e18`; `liquidation_factor <= 1e18`; `store_front <= 1e18`.
8. `isBorrowCollateralized(a) => !isLiquidatable(a)`.
9. After `Absorb`, the position has no collateral and a non-negative principal.
10. `BuyCollateral` only when `reserves < target_reserves` (or reserves < 0).
11. No free value: a round trip of supply/withdraw/transfer cannot increase a user's claim.
12. No position can be debited without owner/manager authorization or a valid liquidation.
13. No vault can be spent without the `MarketState` input and a valid market transition.
14. No replay: the account nonce increments exactly once per authorized action.
15. No stale oracle: `header.timestamp - oracle.timestamp <= max_oracle_age`.
16. No duplicate/missing/unknown cells in a transaction.

---

## 10. Interest, time, and oracle

### 10.1 Time

- Every state-changing transaction includes a recent **header dep**.
- `MarketType` reads `header.timestamp`; `dt = timestamp - last_accrual_time`.
- Require `dt > 0` and `dt <= MAX_DT` (e.g., 1 year).
- Require the header to be recent (e.g., within a small number of blocks) to prevent stale accrual.
- A permissionless `Accrue` transaction every N blocks keeps the index fresh.

### 10.2 Interest

Use the index model formulas for parity:

```
utilization = total_borrow_present * 1e18 / total_supply_present
supply_rate = base + slope_low * min(u, kink) + slope_high * max(0, u - kink)
borrow_rate = same with borrow params
supply_index += supply_index * supply_rate * dt / 1e18
borrow_index += borrow_index * borrow_rate * dt / 1e18
```

Scales: `BASE_INDEX_SCALE = 1e15`, `FACTOR_SCALE = 1e18`, `PRICE_SCALE = 1e8` (or 1e18), `BASE_ACCRUAL_SCALE = 1e6`.

the accrual is lazy and path-dependent. On CKB, the batcher/keeper can accrue every block, making it near-continuous. Document the choice; if you want path independence, use `exp` (expensive) or a per-block approximation.

### 10.3 Oracle

- One oracle cell per asset, read as a cell dep.
- `OracleType` authenticates the publisher set; `MarketType` checks freshness, confidence, and deviation.
- CKB does not have Chainlink natively. Options:
  - **Lean Oracle** (testnet committee-signed pull oracle, 1s ticks, TWAP60, covers BTC/ETH/SOL/USDT/CKB) for a testnet MVP.
  - A custom committee/multisig oracle cell for mainnet.
  - A CKB DEX TWAP cell as a fallback.
- Use **base-denominated prices** (collateral per base) to avoid a separate base/USD feed. If the base is a stablecoin, this is natural; if the base is CKB, it is also natural.
- Add a deviation circuit breaker: if the new price moves more than `max_price_deviation` from the last accepted price, pause new borrows/liquidations or require a timelock.

---

## 11. Liquidation architecture

the liquidation is two-step. On CKB, the atomic transaction model allows better:

### 11.1 Absorb

- Consumes the borrower position (liquidation path), asset totals, and (optionally) collateral vaults.
- Seizes all collateral; computes `delta_value = Î£ value * liquidation_factor`.
- Credits the borrower with `max(0, delta_value - debt)` as a base supply position.
- Wipes the debt; updates `total_borrow_principal` and `total_supply_principal`.
- Moves collateral from user collateral to protocol collateral reserves (`AssetTotals.total_supplied` decreases; vault unchanged).
- No base cash moves.

### 11.2 Buy / DEX sale

- **BuyCollateral**: the buyer pays base, receives collateral at the storefront discount; `total_cash` increases; collateral reserves decrease.
- **DEX sale**: the liquidator sells the seized collateral on a CKB DEX in the same transaction; the market script requires the protocol to receive at least its cost. This removes the protocol's inventory risk between absorb and sale.
- **Combined**: absorb + buy + DEX sale in one transaction. The liquidator captures the discount and the DEX spread; the protocol receives its cost.

### 11.3 Bad debt

- If `V * liquidation_factor < D`, the borrower residual is zero; the protocol wipes the debt and takes the loss.
- Reserves can go negative. Define a policy: reserves buffer, insurance fund, supplier haircut, or governance recapitalization.
- `target_reserves` controls when collateral sales are enabled.

---

## 12. Governance and upgrades

### 12.1 Cells

- `MarketConfig` / `AssetConfig`: lock = governance (3-of-5 multisig + timelock).
- `Pause`: lock = pause guardian (smaller multisig, short timelock).
- `CodeCell`: lock = governance; Type ID; upgradeable; freezeable.

### 12.2 Type ID upgrade

- Deploy each script in a code cell with a **Type ID** type script.
- State cells use `hash_type = type` and the code cell's type script hash.
- Upgrading the code cell (same Type ID, new data) changes the code for all state cells.
- State layouts are versioned; migrations are explicit.
- Freeze by changing the code cell's lock to an unspendable lock.

### 12.3 Timelock

- Use CKB's `since` field or a header-timestamp check in the governance lock.
- Config changes are timelocked and evented via cell data.
- The market script checks the config cell's lock hash against the expected governance lock hash.

### 12.4 Emergency

- Pause guardian can set `pause_flags` (supply/transfer/withdraw/absorb/buy).
- Pausing `absorb` during a crash prevents liquidations and can accumulate bad debt; define a recovery plan.
- Pausing `withdraw` traps suppliers; use only for a clear emergency.

---

## 13. Indexer and off-chain services

### 13.1 Indexer

CKB has no account-based logs. The indexer parses cell transitions:

- `MarketState` before/after: indices, totals, cash, pause.
- `UserPosition` before/after: principal, collateral, tracking.
- `AssetTotals`/vaults: supply caps, reserves.
- `Oracle`: prices/timestamps.
- `Action` witness: action type/parameters (for display; verify against state).

Store in a reorg-aware DB. Serve:

- `balanceOf`, `borrowBalanceOf`, health, collateral value.
- utilization, supply/borrow APY.
- reserves, bad debt, liquidation queue.
- account/position discovery by owner lock hash.

Use CKB Indexer for cell queries; build a custom indexer for the marketâ€™s type scripts. Use CCC/Lumos for tx assembly.

### 13.2 Batcher

- API for signed intents.
- Mempool: validate signature, nonce, expiry; simulate against current state.
- Builder: select intents, group by asset/action, include `Accrue`, compute fees.
- Simulator: run scripts via `ckb-testtool`/CKB-VM before submission.
- Submitter: send to CKB node; monitor confirmation; retry/replace.
- Fairness: order by fee/time; separate liquidation channel for priority.

### 13.3 Keeper

- Accrue keeper: `Accrue` every N blocks.
- Liquidation keeper: monitor positions/oracles; build absorb + buy/DEX tx.
- Oracle publisher: update oracle cells; sign prices; monitor deviations.
- Governance bot: execute timelocked proposals.

---

## 14. Capacity and fees

Approximate occupied capacity (1 CKB = 1 byte; min 61 CKB):

| Cell | Data | Lock + type overhead | Approx. capacity |
|---|---:|---:|---:|
| `MarketState` | ~300 B | ~130 B | ~430 CKB |
| `MarketConfig` | ~200 B | ~130 B | ~330 CKB |
| `AssetConfig` | ~150 B | ~130 B | ~280 CKB |
| `AssetTotals` | ~100 B | ~130 B | ~230 CKB |
| `BaseVault` / `CollateralVault` | ~32 B | ~130 B | ~195 CKB |
| `UserPosition` (8 slots) | ~300 B | ~130 B | ~430 CKB |
| `Account` | ~100 B | ~130 B | ~230 CKB |
| `Approval` | ~120 B | ~130 B | ~250 CKB |
| `Oracle` | ~100 B | ~130 B | ~230 CKB |
| `Pause` | ~50 B | ~130 B | ~180 CKB |

For 8 assets, protocol overhead is roughly **7,000â€“9,000 CKB** (â‰ˆ $8â€“11 at $0.0012/CKB). A user with an account + position + 2 collateral slots â‰ˆ 900 CKB (â‰ˆ $1.1). At $0.01/CKB, â‰ˆ $9. CKB price is volatile; treat capacity as a real cost.

CKB has no recurring rent; capacity is locked while the cell is live. Require a minimum position size to cover capacity; allow closing accounts/positions to reclaim it. The batcher pays tx fees; users pay via `max_fee` or the protocol subsidizes.

---

## 15. Security architecture

### 15.1 Threat model

| Threat | Mitigation |
|---|---|
| Malicious user | Signature/account path; nonce; collateralization checks. |
| Malicious batcher | Cannot forge signatures; can censor/reorder; users can self-submit. |
| Malicious oracle | Publisher set; freshness; confidence; deviation circuit breaker; pause/fallback. |
| Malicious token | Allowlist audited xUDT types; measure actual vault delta; reject fee-on-transfer/rebasing unless handled. |
| Compromised governance | Timelock + multisig; code freeze; config bounds; monitoring. |
| Bridge failure | Base asset bridge risk; diversify; caps; circuit breaker. |
| Cell confusion | Strict cell identification by type/args; reject duplicates/extras; script groups. |
| Vault drain | `VaultLock` requires `MarketState` + market transition; independent delta check. |
| Position theft | `PositionLock` owner/manager/liquidation paths; credit-only path. |
| Replay | Account nonce; intent domain (genesis hash, market ID, script hash); expiry. |
| Stale accrual | Recent header dep; `MAX_DT`; `Accrue` keeper. |
| Capacity griefing | Minimum position size; creation fee; close empty positions. |
| Cycle exhaustion | Bound asset count/cells; benchmark; reject oversized batches. |
| Front-running | Commit-reveal/private mempool/batch auction for liquidations; batcher fairness. |

### 15.2 Defense in depth

- `MarketType` validates the aggregate.
- `PositionType` validates each position.
- `VaultLock` validates each vault delta.
- The xUDT type script validates token conservation.
- `AccountType`/`PositionLock` validate authorization.
- `OracleType` validates prices.
- `ConfigType` validates parameter bounds.

No single script is the only guard for user funds.

### 15.3 Audit plan

- Math library: property tests, differential tests against a index model reference model.
- Cell parsing: fuzz arbitrary bytes; test duplicate/missing/extra cells.
- Authorization: test owner/manager/liquidation/credit paths; replay; expired approvals.
- Liquidation: price drops, bad debt, absorb + buy + DEX sale.
- Vault: spend without market state; wrong token type; wrong asset ID.
- Governance: timelock, config bounds, upgrade/freeze.
- Cycle benchmarks: borrow/absorb with max assets; batch sizes.

---

## 16. Repository layout

```
monimkt/
â”œâ”€â”€ ARCHITECTURE.md
â”œâ”€â”€ Cargo.toml
â”œâ”€â”€ contracts/
â”‚   â”œâ”€â”€ market-type/
â”‚   â”‚   â””â”€â”€ src/main.rs
â”‚   â”œâ”€â”€ position-type/
â”‚   â”œâ”€â”€ account-type/
â”‚   â”œâ”€â”€ vault-lock/
â”‚   â”œâ”€â”€ position-lock/
â”‚   â”œâ”€â”€ oracle-type/
â”‚   â”œâ”€â”€ config-type/
â”‚   â”œâ”€â”€ pause-type/
â”‚   â”œâ”€â”€ approval-type/
â”‚   â””â”€â”€ shared/
â”‚       â”œâ”€â”€ math/
â”‚       â”œâ”€â”€ cells/
â”‚       â”œâ”€â”€ errors/
â”‚       â””â”€â”€ constants/
â”œâ”€â”€ schemas/
â”‚   â””â”€â”€ market.mol
â”œâ”€â”€ sdk/
â”‚   â”œâ”€â”€ tx-builder/
â”‚   â”œâ”€â”€ intent/
â”‚   â””â”€â”€ indexer-client/
â”œâ”€â”€ services/
â”‚   â”œâ”€â”€ batcher/
â”‚   â”œâ”€â”€ keeper/
â”‚   â”œâ”€â”€ oracle-publisher/
â”‚   â””â”€â”€ indexer/
â”œâ”€â”€ tests/
â”‚   â”œâ”€â”€ unit/
â”‚   â”œâ”€â”€ integration/
â”‚   â””â”€â”€ fuzz/
â””â”€â”€ docs/
    â”œâ”€â”€ cell-graph.md
    â”œâ”€â”€ tx-templates.md
    â””â”€â”€ security.md
```

---

## 17. Build order

### Phase 0 â€” Model and schemas
- Rust reference model of index model math (principal/index, rates, collateralization, absorb/buy).
- Property tests and index test vectors.
- Molecule schemas for all cells/actions.
- Error code table.

### Phase 1 â€” Single-asset market
- `MarketState`, `MarketConfig`, `BaseVault`, `Account`, `UserPosition`.
- `MarketType`, `PositionType`, `AccountType`, `VaultLock`, `PositionLock`.
- Actions: create account, supply base, withdraw base, borrow, repay, accrue.
- `ckb-testtool` unit/integration tests.
- Local devnet end-to-end.

### Phase 2 â€” Collateral and liquidation
- `AssetConfig`, `AssetTotals`, `CollateralVault`.
- Supply/withdraw/transfer collateral.
- `OracleType` + mock oracle; freshness/deviation checks.
- Absorb; buy collateral; bad debt scenarios.
- Collateralization/liquidation tests.

### Phase 3 â€” Batching and services
- Intent format + `IntentLock`.
- Batcher: mempool, builder, simulator, submitter.
- Indexer: cell parser, views, API.
- Keeper: accrue + liquidation.
- UI/wallet integration via CCC.

### Phase 4 â€” Governance and hardening
- Governance multisig + timelock.
- Type ID upgrade workflow; migration.
- Pause guardian.
- Fuzz/audit; cycle benchmarks; mainnet caps.

### Phase 5 â€” Extensions
- Rewards (on-chain or Merkle distributor).
- Share vault (ERC-4626 analogue).
- Atomic DEX liquidation.
- More assets / Merkleized collateral.
- Cross-chain governance (if desired).

---

## 18. V1 scope and parameters

| Parameter | V1 choice |
|---|---|
| Markets | 1 |
| Base asset | Bridged stablecoin xUDT (or CKB for testnet) |
| Collateral assets | 2â€“4 (max 8) |
| Vaults | 1 base + 1 per collateral (no sharding) |
| Oracle | Mock/Lean Oracle testnet; committee feed for mainnet |
| Time | Header dep + `Accrue` keeper |
| Rewards | Off (v2) |
| Share token | Off (v2) |
| Batching | Single-action first; batcher v1.1 |
| Governance | 3-of-5 multisig + timelock |
| Upgrades | Type ID; freeze option |
| Liquidation | Absorb + buy; DEX sale v1.1 |
| Capacity | Protocol ~7â€“9k CKB; user ~900 CKB |

---

## 19. Why this architecture fits CKB

- **State is cells.** The market is a state machine over cells, not a global contract.
- **Scripts are validation.** Lock scripts authorize; type scripts enforce transitions.
- **The singleton is explicit.** `MarketState` is the global ledger; batching is the scaling strategy.
- **Atomicity is native.** Absorb + buy + DEX sale, flash loans, and multi-action batches are single transactions.
- **First-class assets.** Tokens live in cells; the vault lock is the custody boundary.
- **Upgrades are Type ID.** No proxy admin; code cells are governance-controlled and freezeable.
- **Time is a header dep.** No `block.timestamp`; the market reads a recent header.
- **No reentrancy.** Scripts validate a fixed transaction; the attack surface is cell confusion, which the scripts must reject.

The economic core is index model. The state model is CKB. That is the native port.
