# MoniMkt contract manifest

Contract-only scope. Frontend, wallet UI, and live indexer are deferred.

## Scripts

| Script | Args | Cell data | Responsibility |
|---|---|---|---|
| `market-type` | `market_id || config_type_hash || position_code_hash || vault_code_hash || oracle_code_hash || asset_config_code_hash || asset_totals_code_hash` (224) | `MarketState` | Global accounting, interest, all market actions |
| `config-type` | `market_id` (32) | `MarketConfig` | Market config identity |
| `market-state-lock` | none | none | Permissive lock for `MarketState`/`AssetTotals`; `market-type` enforces transitions |
| `account-type` | `market_id || owner_lock_hash` (64) | `Account` | User handle, nonce, owner lock binding |
| `position-type` | `market_id || owner_lock_hash || market_type_code_hash` (96) | `UserPosition` | Position identity, nonce, requires MarketState |
| `position-lock` | `market_id || owner_lock_hash || account_type_code_hash || market_type_code_hash || approval_type_code_hash` (160) | â€” | Owner/manager/liquidation authorization |
| `vault-lock` | `market_id || asset_id || market_type_code_hash || vault_type_code_hash` (128) | `Vault` | Custody boundary and amount direction |
| `base-token-lock` | `market_id || base_asset_id || market_type_code_hash || vault_type_code_hash` (128) | xUDT amount (u128) | Binds the base token-cell delta to the base-vault delta |
| `vault-type` | `market_id || asset_id || kind` (65) | `Vault` | Vault identity; CKB `capacity >= occupied + amount` |
| `oracle-type` | `asset_id || publisher_set_hash` (64) | `Oracle` | Price identity/sanity |
| `asset-config-type` | `market_id || asset_id` (64) | `AssetConfig` | Risk parameter bounds |
| `asset-totals-type` | `market_id || asset_id` (64) | `AssetTotals` | Per-asset supplied totals |
| `approval-type` | `market_id || owner_lock_hash || manager_lock_hash || account_type_code_hash` (128) | `Approval` | Scoped manager permissions |

## Actions validated by `market-type`

- `Accrue`
- `SupplyBase`
- `WithdrawBase`
- `Repay`
- `Borrow`
- `SupplyCollateral`
- `WithdrawCollateral`
- `Absorb`
- `BuyCollateral`

## Verified end-to-end

| Flow | Test |
|---|---|
| Accrue | `accrue.rs` |
| RUSD supply/withdraw | `secured_supply.rs` |
| Missing-account rejection | `secured_supply.rs` |
| CKB collateral supply/withdraw | `collateral_ckb.rs` |
| Borrow / repay against CKB | `borrow_ckb.rs` |
| CF rejection | `borrow_ckb.rs` |
| Stale oracle rejection | `borrow_ckb.rs` |
| CKB vault capacity | `ckb_vault.rs` |
| Absorb underwater position | `collateral_ckb.rs` |
| Buy collateral at discount | `collateral_ckb.rs` |
| Manager approval | `manager_approval.rs` |
| Wrong permission / expired approval | `manager_approval.rs` |
| Base-token/vault custody equality | `base_token_lock.rs` |
| Pause update and paused-action rejection | `pause.rs` |

## Optional throughput feature

**On-chain multi-user batching** is not implemented. The current market script
validates one action and one position per transaction. The batcher policy
library (`monimkt-batcher`) plans intents, but the batch executor in
`market-type` is still missing.

This does not block the single-user frontend flows. It is an optional throughput
feature.

## Live testnet

Market v3-final is deployed on CKB testnet, and the repurposed CKB frontend is
in `web`. See
[`TESTNET_DEPLOY.md`](./TESTNET_DEPLOY.md) for code hashes, cell outpoints, and
the committed smoke-test transactions.

## Remaining work

- Frontend polish and transaction lifecycle UX
- Live CKB RPC indexer / reorg handling
- Independent audit before mainnet
- Optional batcher service

## Build and verify

```powershell
./scripts/ci.ps1
cd web
npm install
npm run build
```

This builds every RISC-V script, runs all host + `ckb-testtool` tests, and
produces the CKB frontend production build.
