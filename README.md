# MoniMkt

Native CKB lending market: **RUSD** base asset, **CKB** collateral.

- Architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Implementation plan: [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)
- Toolchain setup: [`docs/TOOLCHAIN.md`](./docs/TOOLCHAIN.md)
- Verified status / remaining milestones: [`docs/STATUS.md`](./docs/STATUS.md)
- Contract manifest: [`docs/CONTRACTS.md`](./docs/CONTRACTS.md)
- Testnet runbook: [`docs/TESTNET.md`](./docs/TESTNET.md)
- Mock RUSD token: [`docs/MOCK_RUSD.md`](./docs/MOCK_RUSD.md)
- Testnet deployment status: [`docs/TESTNET_DEPLOY.md`](./docs/TESTNET_DEPLOY.md)
- Frontend connection handoff: [`docs/FRONTEND_CONNECTION.md`](./docs/FRONTEND_CONNECTION.md)
- CKB frontend app: [`web`](./web)

## Current status

- **M0** â€” workspace/toolchain: done
  - GNU Rust toolchain + `riscv64imac-unknown-none-elf`
  - MinGW `gcc` for `ckb-testtool`
  - OffCKB local devnet
- **M1** â€” math library: done (index vectors + property tests)
- **M2** â€” schemas/codec: done (fixed-size Molecule-compatible layout)
- **M3** â€” RUSD supply/withdraw skeleton: done
  - `monimkt-market-core` implements accrue / supply / withdraw transitions
  - `monimkt-market-type` validates `Accrue`, `SupplyBase`, `WithdrawBase`
  - real `account-type`, `position-type`, `position-lock`, `vault-lock`, `vault-type`
  - secured supply + withdraw pass all scripts end-to-end
  - missing-account authorization failure is rejected
- **M4** â€” native CKB collateral and borrow: done (locally verified)
  - borrow / repay / collateral accounting
  - CKB vault `capacity >= occupied + amount`
  - CKB/RUSD oracle + asset config + asset totals
  - `SupplyCollateral` / `WithdrawCollateral`, `Borrow`, `Repay`
  - interest accrual with borrowers
- **M5** â€” liquidation: done (locally verified)
  - `Absorb`
  - `BuyCollateral` with storefront discount and reserve checks
- **M6** â€” approvals / manager permissions: done (locally verified)
  - `Approval` cell type
  - scoped permissions, expiry, manager account path
  - wrong-permission and expired-approval rejection
- **M7** - optional batching: intent validation + batch planning (5 tests); on-chain batch execution is not required for single-user frontend flows
- **M8** - frontend MVP: raw HTML/CSS/JS CCC app in `web`; wallet connection, live CKB reads, dashboard, RUSD supply/withdraw, CKB collateral supply/withdraw, and RUSD borrow/repay exercised on testnet
- **M9** - testnet: v3-final deployed; supply/withdraw, CKB collateral, borrow/repay, oracle update, absorb, buy-collateral, and frontend flows committed; see `docs/TESTNET_DEPLOY.md`
- **M10** - audit: needs an independent auditor before mainnet

## Build and test

```bash
cargo test -p monimkt-math -p monimkt-schemas -p monimkt-market-core
cargo clippy -p monimkt-math -p monimkt-schemas -p monimkt-market-core --all-targets -- -D warnings
cargo fmt --all --check
```

### Windows toolchain note

The default MSVC toolchain requires Visual Studio's `link.exe`. If it is not
installed, use the GNU toolchain:

```powershell
rustup toolchain install stable-x86_64-pc-windows-gnu --profile minimal
rustup component add --toolchain stable-x86_64-pc-windows-gnu rustfmt clippy
```

`ckb-testtool` also needs a host C compiler. Install WinLibs/MinGW, then dot-
source `scripts/env.ps1` so cargo's `cc` crate can find `gcc`.

```powershell
winget install --id BrechtSanders.WinLibs.POSIX.UCRT -e --scope user
. ./scripts/env.ps1
./scripts/test.ps1
./scripts/test-market-type.ps1
```

On Linux/macOS use `./scripts/test.sh` and `./scripts/build-script.sh`.

### Local devnet

```powershell
./scripts/devnet.ps1          # start OffCKB devnet + print accounts
./scripts/devnet.ps1 -Stop    # stop it
./scripts/doctor.ps1          # check Rust, RISC-V target, gcc, OffCKB, RPC
```

The devnet RPC is `http://127.0.0.1:8114`.

## Layout

```
crates/
  math/                 # pure Rust reference math (no_std)
  schemas/              # fixed-size Molecule-compatible cell/action codec
  market-core/          # host-testable accrue / supply / withdraw transitions
  scripts/market-type/  # MarketState type script (RISC-V binary)
  scripts/account-type/ # user account handle (nonce, owner lock)
  scripts/position-type/# user position state guard
  scripts/position-lock/# owner/manager/liquidation authorization
  scripts/vault-lock/   # vault custody boundary
  scripts/vault-type/   # vault state guard
  scripts/oracle-type/  # price feed cell guard
  scripts/asset-config-type/ # per-asset risk parameters
  scripts/asset-totals-type/ # per-asset supplied totals
  scripts/approval-type/ # scoped manager approvals
  scripts/market-type-tests/ # ckb-testtool integration tests
schemas/
  market.mol            # schema source of truth
```

## Build the market-type script

```powershell
rustup run stable-x86_64-pc-windows-gnu cargo build `
  -p monimkt-market-type `
  --target riscv64imac-unknown-none-elf `
  --release
```

The binary is `target/riscv64imac-unknown-none-elf/release/monimkt-market-type`.

## Math conventions

| Constant | Value | Meaning |
|---|---|---|
| `BASE_INDEX_SCALE` | `1e15` | index scale |
| `FACTOR_SCALE` | `1e18` | Rates, collateral factors |
| `PRICE_SCALE` | `1e8` | Base-denominated prices |
| `BASE_ACCRUAL_SCALE` | `1e6` | Reward accrual |
| `SECONDS_PER_YEAR` | `31,536,000` | Rate conversion |

Prices are **base-denominated**: CKB price is RUSD per CKB, scaled by `1e8`.
