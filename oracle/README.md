# MoniMkt oracle keeper

The keeper publishes a live CKB/USD price into the MoniMkt oracle cell on CKB
testnet.

## Price sources

The keeper reads three independent public feeds:

- Binance `CKBUSDT`
- Gate.io `CKB_USDT`
- CoinGecko `nervos-network` / USD

It requires at least **two valid sources**, sorts the results, and publishes the
median. This avoids a single exchange outage or bad print moving the market.

The on-chain price is stored as RUSD per CKB with exponent `-8`. Mock RUSD is
treated as USD for testnet purposes.

## Safety rules

- At least two sources must respond.
- Price must be finite and non-zero.
- The published price must not deviate more than `MAX_DEVIATION_BPS` from the
  current oracle. Default: `2000` bps (20%).
- `--force` bypasses the deviation guard for a deliberate feed migration.
- The timestamp is set slightly in the past to avoid a local-clock-ahead
  rejection from CKB.
- The workflow runs every 15 minutes; the market accepts prices up to one hour
  old.

## Run locally

```powershell
cd oracle
npm install
node keeper.mjs                 # dry run
node keeper.mjs --send          # publish
node keeper.mjs --send --force  # only for explicit feed migration
```

The keeper reads `CKB_ORACLE_KEY` from the environment, then falls back to
`.secrets/oracle.key` or `.secrets/testnet-deployer.key`. Neither secrets
directory is committed.

## GitHub Actions

The scheduled workflow is `.github/workflows/oracle.yml`.

Add this repository secret:

```text
CKB_ORACLE_KEY = <hex private key that owns the oracle cell lock>
```

Then enable Actions. The workflow runs at `*/15 * * * *` and can also be started
manually from the Actions tab.

> Scheduled GitHub Actions are paused after long repository inactivity. Keep the
> repository active or run the keeper on a dedicated scheduler in production.

## Dedicated oracle key

The oracle cell has been rotated to a dedicated oracle-updater lock. Only that
key is stored in the `CKB_ORACLE_KEY` repository secret; the deployer key is not
used by scheduled updates.

The keeper preserves the existing oracle cell lock when it publishes an update.
The oracle key is funded with CKB for transaction fees.

## Current feed

The initial live migration from the manual `0.02` test price to the market feed
was committed with:

```text
oracle feed tx: 0xd5f4176d3a5d90c0381df455f823312329cef725c809947d593acd17f037eacc
```

The oracle lock was then rotated to the dedicated updater key:

```text
oracle lock rotation tx: 0xc09a19de468edff4d4cece9347ef5a66967312afa022b7d26ada980a3b165fa3
```

The first real feed value was approximately `0.00094360 RUSD/CKB`.

## Frontend

The dashboard shows the oracle price and freshness. Borrow and CKB-withdraw
screens show a blocking warning when the feed is older than
`MarketConfig.max_oracle_age`.
