# Project status and completion schedule

Last verified locally on the current Windows GNU toolchain. Live CKB testnet
deployment verified on 2026-11-05.

## Verified now

| Milestone | Status | Evidence |
|---|---|---|
| M0 Toolchain | âœ… verified | Rust GNU + RISC-V target, WinLibs gcc, OffCKB devnet |
| M1 Math | âœ… verified | 44 tests (index vectors + properties) |
| M2 Schemas | âœ… verified | 15 tests, Molecule-compatible fixed layouts |
| M3 RUSD supply/withdraw | âœ… verified | secured supply + withdraw, missing-account rejection |
| M4 CKB collateral + borrow | âœ… verified | CKB vault capacity, CKB/RUSD oracle, borrow/repay, collateral supply/withdraw, CF/stale-oracle rejection |
| M5 Liquidation | âœ… verified | `Absorb` and `BuyCollateral`; absorb residual + collateral reserves |
| M6 Approvals / manager | âœ… verified | `Approval` cell, scoped permissions, expiry, manager account path, wrong-permission/expired rejection |
| M7 Batching | â— optional | off-chain intent validation/planning; on-chain batch executor is a throughput optimization, not required for single-user frontend flows |
| M8 Indexer/UI | âœ… frontend MVP | Raw HTML/CSS/JS CCC frontend in `web`; live cell reads, wallet connection, dashboard, supply/withdraw CKB, borrow/repay RUSD exercised on testnet. A dedicated indexer remains optional scale work. |
| M9 Testnet | âœ… deployed | 13 scripts deployed with Type ID; v3-final market with permissive shared-state locks; all core flows plus frontend actions committed live |

Current automated coverage:

| Suite | Tests |
|---|---|
| `monimkt-math` | 44 |
| `monimkt-schemas` | 15 |
| `monimkt-market-core` | 20 |
| `monimkt-batcher` | 5 |
| `monimkt-indexer` | 2 |
| `ckb-testtool` | 26 |
| **Total** | **112** |

Run the gate with:

```powershell
./scripts/test.ps1
./scripts/test-market-type.ps1
```

## Not yet complete

These are real remaining milestones, not bookkeeping:

### M6 â€” approvals / manager permissions
Implemented and verified:
- `Approval` cell type script.
- Scoped manager permissions (supply/withdraw/borrow/transfer/collateral).
- Expiry and position-lock manager path.
- Wrong-permission and expired-approval rejection.

### M7 â€” batching
Foundation verified:
- signed intent shape,
- market/expiry/amount validation,
- duplicate nonce detection,
- fee total and net base delta planning.

Still missing:
- on-chain multi-position batch execution,
- intent signature verification service,
- mempool/simulation/submission service,
- cycle benchmarks for batch size.

### M8 â€” frontend
Implemented in `web`:
- Mobile-first raw HTML/CSS/JS UI with CCC wallet connection,
- live CKB cell reads for market and user position,
- Account/UserPosition initialization,
- RUSD supply/withdraw (base) and CKB supply/withdraw (collateral),
- RUSD borrow/repay,
- health factor, APY, utilization, reserves, wallet balances.

Remaining optional scale work:
- dedicated live CKB RPC indexer with reorg handling,
- historical activity DB,
- keeper/oracle publisher services.

### M9 - testnet deployment
Deployed and smoke-tested on CKB testnet:
- 13 scripts deployed with Type ID, including `config-type`, the v3
  `base-token-lock`, and the permissive `market-state-lock`.
- Live market v3-final, deployer Account, supplier/borrower positions, RUSD
  BaseVault/token cell, CKB Vault, CKB AssetConfig/AssetTotals, and oracle.
- Live flows committed: position creation, supply/withdraw, CKB collateral,
  borrow/repay, oracle update, absorb, and discounted buy-collateral.
- The CCC frontend was exercised end-to-end on testnet for Account/Position
  initialization, RUSD supply/withdraw, CKB collateral supply/withdraw,
  borrow RUSD, and repay RUSD.

The v3-final contract freeze adds `base-token-lock` custody binding, base-vault
asset checks, and pause-flag enforcement. Live testnet liquidation (absorb and
discounted buy) is committed. CKB millisecond header timestamps are converted to
seconds.

See [`TESTNET_DEPLOY.md`](./TESTNET_DEPLOY.md) and
`deployments/testnet-market/market.json`.

### M10 â€” audit / mainnet readiness
Requires an independent audit and operational review. The local test suite is
not a substitute for an audit. Remaining hardening before audit:
- oracle cell canonical type/args and publisher signature,
- asset-config governance lock verification,
- liquidation healthy-position negative test at script level,
- bad-debt scenario at script level,
- cycle benchmarks for max-asset batches,
- fuzzing of cell parsers and malformed transactions,
- incident response and cap parameters.

## Honest completion statement

The **core protocol through liquidation is implemented, locally verified, and
exercised on CKB testnet**. The v3-final contract set is frozen and the
repurposed CKB frontend is functional. Remaining work is operational polish
(indexer at scale, oracle keeper, UX) and an independent auditor; on-chain
batching is optional.
