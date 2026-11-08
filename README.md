# MoniMkt

**Native lending and borrowing on Nervos CKB.**  
RUSD is the base asset. CKB is the collateral. Every position is a CKB cell.

MoniMkt is a cell-native credit market: no rollup, no bridge, and no wrapped
execution environment. Market state, user positions, custody vaults, and price
feeds are CKB cells, and the market rules are enforced by CKB lock and type
scripts.

---

## Overview

MoniMkt brings an index-based lending market to CKB:

- **Lenders** supply RUSD and earn interest from borrowers.
- **Borrowers** deposit CKB collateral and borrow RUSD against it.
- **Liquidators** absorb unhealthy positions and buy seized collateral at a
  protocol-defined discount.
- **Managers** can be granted scoped, expiring permissions through on-chain
  approval cells.

The market uses signed principals, global supply and borrow indices,
utilization-based interest curves, collateral factors, and a liquidation engine.
All accounting is validated on-chain by `market-type`; the frontend reads live
cells directly from CKB.

## Live deployment

MoniMkt is live on **CKB testnet**.

| Item | Value |
|---|---|
| Market | `v3-final-r2` |
| Network | CKB testnet |
| Market ID | `0x70e26d96e2b61a1c8e33104ccaf066e18e1e371737b0c4871738874627ba7481` |
| Market create tx | `0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380` |
| Base asset | Mock RUSD (xUDT, 8 decimals) |
| Collateral | CKB |
| Frontend | [`web`](./web) |
| Manifest | [`deployments/testnet-market/market.json`](./deployments/testnet-market/market.json) |
| Deployment record | [`docs/TESTNET_DEPLOY.md`](./docs/TESTNET_DEPLOY.md) |

> This is a testnet deployment. It has not been independently audited and must
> not be used with real funds.

## Features

### Market

- RUSD supply and withdraw
- CKB collateral supply and withdraw
- RUSD borrow and repay
- Lazy interest accrual with supply and borrow indices
- Utilization-based, piecewise-linear rate curves
- Per-asset risk parameters and supplied totals
- Oracle price feed with freshness checks
- Pause flags for supply, withdraw, transfer, absorb, and buy operations
- Health-factor and borrow-limit enforcement

### Liquidation

- `Absorb` for underwater positions
- `BuyCollateral` with a protocol-defined storefront discount
- Collateral reserve and capacity checks
- Bad-debt accounting and protocol PnL

### Authorization

- User-owned `Account` and `Position` cells
- Owner, manager, and liquidation authorization in `position-lock`
- Scoped manager approvals with expiry
- Missing, wrong, and expired approvals rejected on-chain

### Frontend

- Raw HTML/CSS/JavaScript, no application framework runtime
- CCC wallet connection (JoyID, OKX, and compatible wallets)
- Live CKB cell reads for market and user state
- Supply, withdraw, borrow, and repay flows
- Transaction lifecycle UI: preparing, confirm in wallet, confirming on CKB,
  confirmed, or rejected
- Compact mobile-first dashboard and activity view

## Architecture at a glance

| Cell | Responsibility |
|---|---|
| `MarketState` | Global indices, totals, cash, pause flags |
| `AssetTotals` | Per-asset supplied totals |
| `BaseVault` | RUSD custody and base-asset accounting |
| `CkbVault` | CKB collateral custody and capacity accounting |
| `Account` | User-owned handle with nonce and authorization |
| `Position` | Signed principal, tracking, collateral |
| `Approval` | Scoped manager capability |
| `Oracle` | Price, timestamp, and publisher set |
| `MarketConfig` | Market-level parameters |
| `AssetConfig` | Per-asset risk parameters |

The shared `MarketState` and `AssetTotals` cells use a permissive shared-state
lock so any user can include them in a transaction. Security comes from
`market-type`, which validates every transition. Custody, position, and account
locks enforce authorization and cell ownership.

### RUSD custody

RUSD is a standard xUDT. The `base-token-lock` binds the net RUSD token-cell
delta to the base-vault state delta, so the market cannot claim tokens that are
not in custody and tokens cannot leave custody without a matching market
transition.

The r2 custody lock supports multiple token cells. Token inputs deliberately
carry an empty `WitnessArgs.inputType`; the market action witness is attached
only to the state, position, vault, and account inputs. This is required by xUDT
and is handled by the frontend transaction builder.

## Repository layout

```text
crates/
  math/                         Pure Rust lending math and reference tests
  schemas/                      Fixed-size cell and action codecs
  market-core/                  Host-testable market transitions
  batcher/                      Intent validation and batch planning
  indexer/                      Read-only market and position views
  scripts/
    market-type/                Market transition and accounting guard
    account-type/               User account handle
    position-type/              Position state guard
    position-lock/              Owner, manager, and liquidation authorization
    vault-type/                 Vault state guard
    vault-lock/                 Vault custody boundary
    base-token-lock/            RUSD custody binding
    market-state-lock/          Permissive shared-state lock
    oracle-type/                Price feed guard
    asset-config-type/          Per-asset risk parameters
    asset-totals-type/          Per-asset supplied totals
    approval-type/              Scoped manager approvals
    config-type/                Market configuration
    market-type-tests/          ckb-testtool integration tests
schemas/
  market.mol                    Schema source of truth
scripts/                        Deployment, testnet, and operations tooling
deployments/                    Testnet deployment records and cell manifests
web/                            Raw HTML/CSS/JS wallet and market frontend
docs/                           Architecture, contracts, testnet, and handoff docs
```

## Quick start

### Prerequisites

- Rust with the GNU host toolchain
- `riscv64imac-unknown-none-elf` target
- A host C compiler for `ckb-testtool` (WinLibs/MinGW on Windows)
- Node.js 20+ for the frontend
- OffCKB for a local devnet

See [`docs/TOOLCHAIN.md`](./docs/TOOLCHAIN.md) for platform setup.

### Run the test suites

```bash
cargo test -p monimkt-math -p monimkt-schemas -p monimkt-market-core
cargo clippy -p monimkt-math -p monimkt-schemas -p monimkt-market-core --all-targets -- -D warnings
cargo fmt --all --check
```

On Windows, the scripted gate also builds the RISC-V scripts and runs the
`ckb-testtool` integration suite:

```powershell
. ./scripts/env.ps1
./scripts/test.ps1
./scripts/test-market-type.ps1
```

On Linux/macOS:

```bash
./scripts/test.sh
./scripts/build-script.sh
```

### Run the frontend

```powershell
cd web
npm install
npm run build
node serve.mjs
```

Open <http://localhost:3000>. The deployable output is written to `web/dist/`.

### Deploy to Vercel

The repository includes a Hobby-compatible `vercel.json`:

- Framework preset: **Other**
- Install command: `cd web && npm ci --no-audit --no-fund`
- Build command: `node web/build.mjs`
- Output directory: `web/dist`

Import the repository into Vercel and deploy. The site is fully static; no
serverless functions are required. Clean URLs, caching, and baseline security
headers are configured in `vercel.json`.

For any other static host, upload the contents of `web/dist/`.

### Run a local devnet

```powershell
./scripts/devnet.ps1          # start OffCKB devnet and print accounts
./scripts/devnet.ps1 -Stop    # stop it
./scripts/doctor.ps1          # check Rust, target, gcc, OffCKB, RPC
```

The local devnet RPC is `http://127.0.0.1:8114`.

## Testnet operations

Refresh the CKB price oracle:

```powershell
node scripts/testnet-oracle.js --price 0.02 --send
```

Inspect the live market:

```powershell
node scripts/inspect-testnet-market.js
```

The oracle has a one-hour freshness window. Borrow and liquidation transactions
are rejected with a market-config error when the feed is stale.

## Testing and verification

Current automated coverage:

| Suite | Tests |
|---|---:|
| `monimkt-math` | 44 |
| `monimkt-schemas` | 15 |
| `monimkt-market-core` | 20 |
| `monimkt-batcher` | 5 |
| `monimkt-indexer` | 2 |
| `ckb-testtool` integration tests | 26 |
| **Total** | **112** |

The integration suite covers:

- Market creation and state transitions
- RUSD supply and withdraw
- CKB collateral supply and withdraw
- Borrow and repay
- Oracle freshness and collateral-factor checks
- Absorb and discounted collateral purchase
- Account, position, vault, and approval authorization
- RUSD custody binding
- Pause enforcement and genesis validation

Live testnet smoke transactions are recorded in
[`docs/TESTNET_DEPLOY.md`](./docs/TESTNET_DEPLOY.md).

## Documentation

- [Architecture](./ARCHITECTURE.md)
- [Contracts and script responsibilities](./docs/CONTRACTS.md)
- [Testnet runbook](./docs/TESTNET.md)
- [Testnet deployment record](./docs/TESTNET_DEPLOY.md)
- [Frontend integration](./docs/FRONTEND_CONNECTION.md)
- [Mock RUSD](./docs/MOCK_RUSD.md)
- [Toolchain setup](./docs/TOOLCHAIN.md)

## Production readiness

The contracts and frontend are implemented and exercised end-to-end on CKB
testnet. Before mainnet consideration:

- complete an independent security audit,
- add a production indexer/API for historical activity and scale,
- operate an oracle publisher/keeper with monitoring,
- finalize mainnet risk parameters and governance,
- harden deployment, incident response, and key management.

## Safety notice

MoniMkt is experimental testnet software. Scripts, parameters, and deployment
records may change. Do not deposit funds you cannot afford to lose. Nothing in
this repository is financial advice or a mainnet commitment.
