# CKB testnet deployment runbook

This is the M9 checklist. It requires real testnet credentials and funds.

## Current live instance

Market v3-final is deployed on CKB testnet. The deployer Account, supplier and
borrower positions, Mock RUSD BaseVault/token cell, CKB Vault, CKB
AssetConfig/AssetTotals, oracle, MarketConfig, and MarketState cells are live.
Position creation, supply/withdraw, CKB collateral, borrow/repay, oracle update,
absorb, and discounted buy-collateral have committed on chain.

- Deployment record: [`TESTNET_DEPLOY.md`](./TESTNET_DEPLOY.md)
- Machine-readable cells: `deployments/testnet-market/market.json`
- Inspect: `node scripts/inspect-testnet-market.js`

The CKB frontend is implemented in `web` with CCC wallet
flows, live cell reads, and supply/borrow/repay/withdraw. Remaining work is
indexer/ops polish and audit.

## Inputs

| Input | Value / source |
|---|---|
| CKB testnet RPC | current CKB testnet (Aggron/Pudge) |
| CKB faucet | `https://faucet.nervos.org` |
| RUSD testnet type hash | `0x45b32a2bc4285d0a09678eb11960ddc8707bc2779887a09d482e9bfe9a2cdf52` |
| RUSD decimals | 8 |
| RUSD faucet | `https://testnet0815.stablepp.xyz/faucet` |
| Deployer account | funded CKB testnet key |
| Governance | 3-of-5 multisig + timelock |
| Pause guardian | separate multisig |
| Oracle publisher | testnet publisher key / committee |

Verify the RUSD type hash before deploying; the issuer can upgrade the token.

## Deployment order

1. Deploy script code cells with Type ID:
   - market-type
   - account-type
   - position-type
   - position-lock
   - vault-lock
   - vault-type
   - asset-config-type
   - asset-totals-type
   - oracle-type
2. Create governance/config cells:
   - MarketConfig
   - Pause
3. Create per-asset cells:
   - CKB AssetConfig
   - CKB AssetTotals
   - CKB Vault (capacity-backed)
4. Create RUSD BaseVault (xUDT custody).
5. Create the CKB/RUSD oracle cell.
6. Create the MarketState genesis cell with:
   - market_id
   - base_asset_id = RUSD type hash
   - supply/borrow indices = 1e15
   - last_accrual_time = current header time
   - config hash
7. Fund the market with test RUSD liquidity.
8. Create a test account and position.
9. Run smoke tests:
   - supply RUSD,
   - supply CKB collateral,
   - borrow RUSD,
   - repay,
   - withdraw RUSD/CKB,
   - accrue,
   - absorb an underwater position,
   - buy collateral.
10. Start indexer/keeper/batcher services.
11. Monitor reserves, oracle freshness, failed transactions, liquidation queue.

## Security gates before testnet

- Oracle cell type args must equal `asset_id || trusted_publisher_set`.
- Asset-config cell type args must equal `market_id || asset_id` and be
  governance-controlled.
- RUSD issuer/upgrade risk reviewed.
- Testnet caps set low.
- Pause guardian can pause supply/transfer/withdraw/absorb/buy.

## Automation status

Script deployment and the live transaction templates are automated in
`scripts/deploy-testnet-*.ps1` and `scripts/testnet-*.js`. The v3-final market is
already deployed.

Remaining operational work:

- live indexer/API for scale and history,
- keeper/batcher/oracle-publisher services if desired,
- independent audit.
