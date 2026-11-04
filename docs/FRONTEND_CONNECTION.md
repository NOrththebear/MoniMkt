# Frontend connection

The shipped CKB frontend is a raw HTML/CSS/JavaScript app in `web`. It uses CCC
for wallet connection and CKB transaction assembly. There is no account-based
runtime, no React, and no Next.js server.

## Run and build

```powershell
cd web
npm install
.\build.ps1
node serve.mjs
```

Open <http://localhost:3000>. To deploy, upload the HTML pages and `web/assets/`
to any static host.

## Network and market

```
RPC:        https://testnet.ckb.dev
Network:    CKB testnet
Market ID:  0x70e26d96e2b61a1c8e33104ccaf066e18e1e371737b0c4871738874627ba7481
Market tx:  0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380
Manifest:   deployments/testnet-market/market.json
```

## Implemented app flow

- CCC wallet connect/disconnect (JoyID, OKX, and other compatible wallets)
- Account + UserPosition initialization
- Live cell discovery for MarketState, MarketConfig, AssetConfig, AssetTotals,
  Oracle, BaseVault, base token cell, CKB Vault, Account, and Position
- Supply RUSD (base asset) and supply CKB (collateral) as separate actions
- Borrow RUSD
- Repay RUSD
- Withdraw RUSD supply and withdraw CKB collateral as separate actions
- Dashboard with APY, utilization, reserves, health factor, and wallet balances
- Transaction lifecycle UI: preparing, confirm in wallet, confirming on CKB,
  confirmed, or rejected

## Source layout

- `web/lib/ckb-config.ts` â€” IDs, scripts, cell deps, parameters
- `web/lib/ckb-market.ts` â€” cell reads, math, transaction builders
- `web/src/main.js` â€” page rendering, wallet state, transaction UX
- `web/src/wallet.js` â€” lazy-loaded CCC wallet connector
- `web/src/input.css` â€” theme tokens and global styles
- `web/assets/` â€” built static assets

## Shared-state locks

`MarketState` and `AssetTotals` use the permissive `market-state-lock` so any
user can include them in a transaction. Security comes from `market-type`, which
validates the transition. Vault/token/position/account locks still enforce
custody and authorization.

## RUSD witness rule

RUSD is standard xUDT. Its token inputs must have an **empty
`WitnessArgs.inputType`**; a non-empty inputType is interpreted as an invalid
extension and the transaction fails with xUDT error 8. The frontend therefore
attaches the market action witness only to the state, position, vault, and
account inputs, and leaves token inputs with an empty witness until CCC adds the
lock signature.

The canonical custody token cell uses the r2 multi-cell `base-token-lock`
(`0xb7cd9a37...`). The frontend discovers it by lock script, not by a hardcoded
outpoint.

## Remaining polish

- dedicated live indexer/API for historical activity and scale,
- oracle publisher/keeper automation,
- Telegram/mobile UX polish,
- independent audit before mainnet.
