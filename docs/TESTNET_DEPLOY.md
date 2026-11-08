# CKB testnet deployment status (v3-final-r2)

Live market: **v3-final-r2** at
`0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380`.
Machine-readable record: `deployments/testnet-market/market.json`.

v1 and v2 are abandoned. v3 is the contract-frozen deployment. The repurposed
CKB frontend lives in `web` and uses the v3 cells directly.

`r2` replaces the original base-token custody lock with a multi-cell version and
fixes wallet-signed RUSD flows. The key integration detail is that **xUDT token
inputs must not carry `WitnessArgs.inputType`**; the market action witness is only
attached to the state, position, vault, and account inputs. The frontend now
does this automatically.

## Deployed scripts (Type ID)

| Script | Final code hash | Tx |
|---|---|---|
| `monimkt-market-type` | `0x9172f13db28292479142728fbeca4e60bc4b40724cd4791a382ad715b58fda33` | `0xcd9d81e249f1398fc6dfc40548cdd0f2f538de4e7ebca7b4a839c28d70b1492f` |
| `monimkt-market-state-lock` | `0x9a1b42f1c001b18e524ca766f83f8db0da351fdb5d91dc929ae9097499371ba5` | `0x0b3f2837364a2f94001ecf6028e9957bf074e8817961fe87755c8ad8c0ded49e` |
| `monimkt-base-token-lock` (r2) | `0xb7cd9a37752b68ac47aab635e884b8c211cb5973aa3e2d5f9a174aac2d4c1f68` | `0x1b885d13d10ba59e7a1f214cb9bd277951751ed361c4da4c997c4a0be57e94b1` |
| `monimkt-account-type` | `0x5b5c9ef26e0aa0ad5ab42250338b7b4db5710a21226c086f9f0b5a1c3cf02b12` | `0xf72f1e264525a5122a3e14b81094a01e64b08534b0faef211520cf533422c98e` |
| `monimkt-position-type` | `0xa0f58d96515fb400d098e29c0a09d2ff58c8db1cbd64a285eeb7ad71a335bbdc` | `0xeddfa8c566ee439c1760ed19c13b21a4aad0d899b7e4f5cb570d69b4917c8f28` |
| `monimkt-position-lock` | `0xcf4242a372739fe07e348782f1c5b365e08fbbefbd9eca4494b9c7071adfde90` | `0x35e4ef7cfb92227518a4cbbb7237e606b2a68b74b9a95e8474937fa45c050ec2` |
| `monimkt-vault-type` | `0x7cb11e5aa57978f74e3d2526a4bbc289fbb04e6e0a7b6cfba145fcc20b31980c` | `0x8d696b4daf41bf6d36f29eb243b5a6bfb548e56da6c6b73fa8f05b74ab2eee2a` |
| `monimkt-vault-lock` | `0x8868ee05f78a75052162ba833cbdd4437d2be9957618287b67030c1b64dfdf51` | `0x9a448f8a65c61031c183148a0e4692e3531a4793854189591c3916f37e60dbdb` |
| `monimkt-oracle-type` | `0x0bd6c8139235be080d920271ab2afdbee9af6badc78ade2eed661f4c407a2adf` | `0x676d2e33ddfa4960e3d9a60b7992416383f62d32dc7d6f3ac3e6a8d59b23dee8` |
| `monimkt-asset-config-type` | `0xd20914d2863601569206fce44b94e3ff98e2a7c6453b519ee0e89790ba6ab283` | `0x7898b5c1720b5b3a5ec231f03da41614b69e3838578bc3b856fee111fbadd5fc` |
| `monimkt-asset-totals-type` | `0xef551fc012c9d5f1df7c89e94dd953455567e82e60c955d1c8a060b6a288b4d8` | `0x7a1254abddd616f1057123ed50b816d9e6d03ce19bfa2beb9a905d71912131b0` |
| `monimkt-approval-type` | `0x5920bee56487e7e82dfb872f8157a5d53c7add1953ba033261516a2ef1ab92ae` | `0x431f9fd843dcc470c8f0c305ef28519b60127f17a1166a82113ff3bec49b8a12` |
| `monimkt-config-type` | `0x84f9fb69145250ac3bc7cd6a2c46f6f0405a6d3d3c3b13ec097ce15e8f575e5d` | `0xa8eeba5f4df04d88321096df03866702e6a93be3e4deaa5387b8640779811d60` |

Deployment records:

- `deployments/testnet-core/scripts.json`
- `deployments/testnet-remaining/scripts.json`
- `deployments/testnet-updated/scripts.json`
- `deployments/testnet-timefix/scripts.json`
- `deployments/testnet-config/scripts.json`
- `deployments/testnet-final/scripts.json`
- `deployments/testnet-base-token-v2/scripts.json` (r2 custody lock)

## v3 contract freeze changes

- **Base-token custody binding:** `base-token-lock` independently requires the
  RUSD token-cell delta to equal the base-vault state delta. The token cannot be
  moved without the market transition, and the market cannot claim tokens that
  are not in custody.
- **Base-vault identity checks:** `market-type` rejects base vaults whose
  `asset_id` does not match `MarketState.base_asset_id`, and rejects changes to
  `base_asset_id`.
- **Pause enforcement:** `market-type` enforces the five pause flags. The
  governance `PAUSE` action updates `MarketState.pause_flags`; supply, withdraw,
  transfer, absorb, and buy actions are rejected while their flag is set.
- **Permissive shared state:** `MarketState` and `AssetTotals` use the
  `market-state-lock`. The lock is intentionally permissive; `market-type`
  validates every transition, so users can submit their own transactions
  without the deployer signing the shared state cells.
- **Millisecond timestamps:** CKB header timestamps are converted to seconds.

## r2 custody and wallet integration

- **Multi-cell custody:** the r2 `base-token-lock` sums every RUSD token cell
  with the canonical custody lock and compares the net token delta to the base
  vault delta. This avoids xUDT restrictions around increasing one aggregate
  token cell.
- **Witness split:** wallet-signed transactions attach the market action witness
  to the state, position, vault, and account inputs. RUSD token inputs keep an
  empty `inputType`; xUDT rejects a non-empty extension.
- **Canonical custody cell:** the r2 custody cell was seeded at
  `0x6c55aeeea3a87d1a19b5bcc64c1177f1b50d88f8e0937319a3b90dc8f63533bb:0`.
  Its current outpoint is recorded in `deployments/testnet-market/market.json`;
  the frontend discovers it dynamically by the r2 custody lock. Older custody
  cells are abandoned and ignored.

## Market v3-final-r2

| Field | Value |
|---|---|
| Market ID | `0x70e26d96e2b61a1c8e33104ccaf066e18e1e371737b0c4871738874627ba7481` |
| Base asset | Mock RUSD, asset ID `0xe016940e96b9ad2d6505d06996a24f84dbc319ce1a0b0a619aa6af26ce190a3a` |
| Base decimals | 8 |
| Collateral | CKB, asset ID `0x434b42...0000` |
| Config type hash | `0xf8caed6fa96fea950a25899596cdcee66b79ede10f844867e73edf6b060dc3b9` |
| Create market tx | `0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380` |

### Live cells

| Cell | Outpoint |
|---|---|
| MarketConfig | `0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380:0` |
| CKB AssetConfig | `0x8ca00bb3086bdb6dc0a0ab7504697250b1d07aa98551837f3faa0bb2e7e67380:1` |
| Oracle CKB | `0xc09a19de468edff4d4cece9347ef5a66967312afa022b7d26ada980a3b165fa3:0` |
| CKB AssetTotals | `0x988eaaa057b2a33d1c484960ac982b1f1bcf7c8ef86b2f5ffc0a36bfb66af604:4` |
| MarketState | `0x988eaaa057b2a33d1c484960ac982b1f1bcf7c8ef86b2f5ffc0a36bfb66af604:0` |
| RUSD BaseVault state | `0xa82b98062f3ffbe9c08bd0ee4f6e608e60877d6c653ea473b093ffb8831b9014:3` |
| RUSD base token cell (r2) | `0xa82b98062f3ffbe9c08bd0ee4f6e608e60877d6c653ea473b093ffb8831b9014:4` |
| CKB Vault state | `0x988eaaa057b2a33d1c484960ac982b1f1bcf7c8ef86b2f5ffc0a36bfb66af604:3` |
| Deployer Account | `0xada507b2ce031e66135f15e56a4871043febe6e4a4bdbbdcebf63e6c3da2e896:2` |
| Deployer Position | `0xada507b2ce031e66135f15e56a4871043febe6e4a4bdbbdcebf63e6c3da2e896:1` |
| Supplier Position | `0x049882b7a102d5bd8cdf9199b5dcea6e17b81d1044ae1d95b563011b8dd5d246:1` |

## Live smoke tests

| Flow | Tx | Result |
|---|---|---|
| Create supplier position | `0x7ddc0f945367f2f9e9edd3abe68f15712bf93f72882d0d572d3f061cac387832` | committed |
| Supply 100 RUSD | `0x049882b7a102d5bd8cdf9199b5dcea6e17b81d1044ae1d95b563011b8dd5d246` | committed |
| Create borrower position | `0x4ef719b768bb8da5ad65d58b9096339785da800fbdfb0ec91710f4e8e0a01af7` | committed |
| Supply 1,000 CKB collateral | `0x9ca39f8494a3c4368b6ffadca63771537121fdcc54b9a526bbe47ca171f06490` | committed |
| Borrow 40 RUSD | `0xcef0da2cc25b56ab642594d8a354dbc02c5d0fbfb1158d6b26fcb3b7b193ec15` | committed |
| Oracle crash to 0.02 RUSD/CKB | `0x1bf15d4c78baf84e106ceb730068e12416327ba6e722d290299e7a5708fbc7e3` | committed |
| Absorb underwater borrower | `0xee7dafae208076bbda8afdfd8979fa2f346bb9a4255d1693f4e41457fb17d7fd` | committed |
| Buy 526.31578947 CKB at discount | `0xfef3caa84761d90cd21090a8bc0e3e7989c1646e75d8319754df4b8900eff1e2` | committed |
| Deploy permissive `market-state-lock` | `0x0b3f2837364a2f94001ecf6028e9957bf074e8817961fe87755c8ad8c0ded49e` | committed |
| Migrate MarketState lock | `0x775f780dffc812b41f7b21e692f53195a841dc2357ea80d4f3b49ac748c94451` | committed |
| Migrate AssetTotals lock | `0x26c3ff9b83b4fcfa56c7485eccc33b32f622c8f15d69b5acf8329f434a7a1b8b` | committed |
| Frontend supply CKB | `0x36e106215321623563f3b37cb054e17039cac4fbee00202e1b5d261cc341cf21` | committed |
| Frontend borrow RUSD | `0xdf88ca337b67ddb03f4dbded577f68310cd80c491621bf5ce20c1c16f614a591` | committed |
| Frontend repay RUSD | `0xf7f3f88cd88fee3abcb6953c21151693cbed04a848b40294632ac8fa1373180f` | committed |
| Frontend withdraw CKB | `0xcb74ceec31f838f9f33725777d0958b20190b8068c3a67ed8ab27c7bf6720038` | committed |
| Frontend supply RUSD | `0xeaefbd9b7f7e84d1f20698a9685debdeadeecb9b59e0c0ef54279504ba347444` | committed |
| Frontend withdraw RUSD | `0xada507b2ce031e66135f15e56a4871043febe6e4a4bdbbdcebf63e6c3da2e896` | committed |
| Deploy r2 base-token-lock | `0x1b885d13d10ba59e7a1f214cb9bd277951751ed361c4da4c997c4a0be57e94b1` | committed |
| Create r2 custody cell | `0x6c55aeeea3a87d1a19b5bcc64c1177f1b50d88f8e0937319a3b90dc8f63533bb` | committed |
| Refresh oracle | `0x88d75bbca3677eae78f711a6c80bce785cd16b724d46600125ad45cf14f6ff87` | committed |
| Real CKB/USD feed migration | `0xd5f4176d3a5d90c0381df455f823312329cef725c809947d593acd17f037eacc` | committed |
| Rotate oracle to dedicated updater lock | `0xc09a19de468edff4d4cece9347ef5a66967312afa022b7d26ada980a3b165fa3` | committed |
| r2 e2e supply RUSD | `0x1c89e51fd2830676f8098e5c5fab228161f794a87bfa73eb9a9d0b9b5e058596` | committed |
| r2 e2e supply CKB | `0x0ae545da64f69b6acba829c77c02d79ec6ec713ccc69925b79bfb656a8e0470f` | committed |
| r2 e2e borrow RUSD | `0x7cfee58767f02ed4e9bbb1738522a1b52f43c2f2998b45afb3fb0456b7d00329` | committed |
| r2 e2e repay RUSD | `0x94d1644a75c7a2a37694fd218fa62e5393630cfacebabe6f21df50ca0c1c414c` | committed |
| r2 e2e withdraw RUSD | `0xa82b98062f3ffbe9c08bd0ee4f6e608e60877d6c653ea473b093ffb8831b9014` | committed |
| r2 e2e withdraw CKB | `0x988eaaa057b2a33d1c484960ac982b1f1bcf7c8ef86b2f5ffc0a36bfb66af604` | committed |
| Static-site e2e supply RUSD | `0xfe3209cf57710cb10e0e2c8f3287735193b2cc8556698c8bf05ba3e497098c4c` | committed |

Earlier v2 flows (supply/withdraw/borrow/repay) also committed:

- supply: `0xac2fcb3bfa6699953a8550f98d5f752324d66473754e4977df6bbd613bd7f707`
- withdraw: `0x858f167c1f51562cdecffa059f248553a024068d413cea2518c0d935c030cc84`
- collateral: `0x6f5c2b19438a49a674dfea781f4fb569c8c5e5433dd2aec1946bd0cb2cfd2449`
- borrow: `0xe9eaa207ee0bf0a6ad3ae1af826491cb8c8e035817d5c0bffab62dca9c9aa59b`
- repay: `0x15f7b0ea726d937ee81ecb01db579997ad88cf5162a99c7082ed7beae34730af`

Current v3-final-r2 state:

```
supply_index           1,000,007,600,583,377
borrow_index           1,000,000,062,375,689
total_supply_principal 1,599.99246704 RUSD
total_borrow_principal 0
total_cash             1,570.00000000 RUSD
last_accrual_time      1793899107
RUSD base vault        1,670.00000000 RUSD
RUSD base token cell   1,670.00000000 RUSD
CKB total supplied     1,239.00000000 CKB
CKB vault amount       1,712.68421053 CKB
CKB vault capacity     4,712.68421053 CKB
deployer account nonce 8
deployer position      139.00000000 CKB collateral, 0 debt
oracle                 0.00094360 RUSD/CKB
```

## Wallet state

```
Address:    ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq0du7vk92qzka79twzpsdtwe0g3e77x8ush4mfuf
CKB total:  740,521.26170934
CKB free:   233,627.26170934
CKB typed:  506,894.00000000
Mock RUSD:  985,599.00000000
```

## Reproduce / inspect

```powershell
node scripts/testnet-balance.js
node scripts/inspect-testnet-market.js
cd oracle && node keeper.mjs                      # dry run
node scripts/testnet-absorb.js                     # dry run
node scripts/testnet-buy-collateral.js             # dry run
```

The deployment/flow scripts use `.secrets/testnet-deployer.key`.

## What remains

The CKB frontend is implemented in `web`:
wallet connection, Account/Position initialization, cell reads, dashboard,
RUSD supply/withdraw, CKB collateral supply/withdraw, and RUSD borrow/repay
were exercised end-to-end.

Remaining is production polish:

- a dedicated indexer/API for scale and historical activity,

- Telegram/UX polish,
- independent audit and mainnet parameter approval.

On-chain batching is an optional throughput feature, not required for the
single-user frontend flow.
