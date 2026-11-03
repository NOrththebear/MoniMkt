// MoniMkt v3-final testnet configuration.
// Source of truth: ../../deployments/testnet-market/market.json

export const CKB_RPC_URL = "https://testnet.ckb.dev";
export const EXPLORER_URL = "https://pudge.explorer.nervos.org";

export const MARKET_ID =
  "0x70e26d96e2b61a1c8e33104ccaf066e18e1e371737b0c4871738874627ba7481";
export const CONFIG_TYPE_HASH =
  "0xf8caed6fa96fea950a25899596cdcee66b79ede10f844867e73edf6b060dc3b9";
export const RUSD_ASSET_ID =
  "0xe016940e96b9ad2d6505d06996a24f84dbc319ce1a0b0a619aa6af26ce190a3a";
export const CKB_ASSET_ID =
  "0x434b420000000000000000000000000000000000000000000000000000000000";
export const RUSD_XUDT_ARGS =
  "0x17a32809302cdca3ffdfde54659dc6d0e3e2d7ce6d8e79616cc72e4e4eff6d2c";
export const PUBLISHER_SET_HASH =
  "0x" +
  // sha256("monimkt-testnet-oracle-publishers")
  "8756583891514c7200e1decb0fa90170f4de1bec26634ddc84350d60e2fcec64";

export const SCRIPT_CODE = {
  marketType:
    "0x9172f13db28292479142728fbeca4e60bc4b40724cd4791a382ad715b58fda33",
  marketStateLock:
    "0x9a1b42f1c001b18e524ca766f83f8db0da351fdb5d91dc929ae9097499371ba5",
  baseTokenLock:
    "0xb7cd9a37752b68ac47aab635e884b8c211cb5973aa3e2d5f9a174aac2d4c1f68",
  accountType:
    "0x5b5c9ef26e0aa0ad5ab42250338b7b4db5710a21226c086f9f0b5a1c3cf02b12",
  positionType:
    "0xa0f58d96515fb400d098e29c0a09d2ff58c8db1cbd64a285eeb7ad71a335bbdc",
  positionLock:
    "0xcf4242a372739fe07e348782f1c5b365e08fbbefbd9eca4494b9c7071adfde90",
  vaultType:
    "0x7cb11e5aa57978f74e3d2526a4bbc289fbb04e6e0a7b6cfba145fcc20b31980c",
  vaultLock:
    "0x8868ee05f78a75052162ba833cbdd4437d2be9957618287b67030c1b64dfdf51",
  oracleType:
    "0x0bd6c8139235be080d920271ab2afdbee9af6badc78ade2eed661f4c407a2adf",
  assetConfigType:
    "0xd20914d2863601569206fce44b94e3ff98e2a7c6453b519ee0e89790ba6ab283",
  assetTotalsType:
    "0xef551fc012c9d5f1df7c89e94dd953455567e82e60c955d1c8a060b6a288b4d8",
  approvalType:
    "0x5920bee56487e7e82dfb872f8157a5d53c7add1953ba033261516a2ef1ab92ae",
  configType:
    "0x84f9fb69145250ac3bc7cd6a2c46f6f0405a6d3d3c3b13ec097ce15e8f575e5d",
} as const;

export const SCRIPT_DEPS = [
  ["0xcd9d81e249f1398fc6dfc40548cdd0f2f538de4e7ebca7b4a839c28d70b1492f", 0], // market-type
  ["0x0b3f2837364a2f94001ecf6028e9957bf074e8817961fe87755c8ad8c0ded49e", 0], // market-state-lock
  ["0x1b885d13d10ba59e7a1f214cb9bd277951751ed361c4da4c997c4a0be57e94b1", 0], // base-token-lock
  ["0xf72f1e264525a5122a3e14b81094a01e64b08534b0faef211520cf533422c98e", 0], // account-type
  ["0xeddfa8c566ee439c1760ed19c13b21a4aad0d899b7e4f5cb570d69b4917c8f28", 0], // position-type
  ["0x35e4ef7cfb92227518a4cbbb7237e606b2a68b74b9a95e8474937fa45c050ec2", 0], // position-lock
  ["0x8d696b4daf41bf6d36f29eb243b5a6bfb548e56da6c6b73fa8f05b74ab2eee2a", 0], // vault-type
  ["0x9a448f8a65c61031c183148a0e4692e3531a4793854189591c3916f37e60dbdb", 0], // vault-lock
  ["0x676d2e33ddfa4960e3d9a60b7992416383f62d32dc7d6f3ac3e6a8d59b23dee8", 0], // oracle-type
  ["0x7898b5c1720b5b3a5ec231f03da41614b69e3838578bc3b856fee111fbadd5fc", 0], // asset-config-type
  ["0x7a1254abddd616f1057123ed50b816d9e6d03ce19bfa2beb9a905d71912131b0", 0], // asset-totals-type
  ["0x431f9fd843dcc470c8f0c305ef28519b60127f17a1166a82113ff3bec49b8a12", 0], // approval-type
  ["0xa8eeba5f4df04d88321096df03866702e6a93be3e4deaa5387b8640779811d60", 0], // config-type
] as const;

export const MARKET_CONFIG = {
  supplyKink: 800_000_000_000_000_000n,
  borrowKink: 800_000_000_000_000_000n,
  supplySlopeLow: 35_000_000_000_000_000n,
  supplySlopeHigh: 400_000_000_000_000_000n,
  supplyBase: 10_000_000_000_000_000n,
  borrowSlopeLow: 40_000_000_000_000_000n,
  borrowSlopeHigh: 500_000_000_000_000_000n,
  borrowBase: 0n,
  storeFront: 500_000_000_000_000_000n,
  baseBorrowMin: 100_000_000n,
  targetReserves: 1_000_000_000_000n,
  maxOracleAge: 3600n,
  baseDecimals: 8,
} as const;

export const CKB_ASSET_CONFIG = {
  scale: 100_000_000n,
  borrowCf: 500_000_000_000_000_000n,
  liquidateCf: 600_000_000_000_000_000n,
  liquidationFactor: 900_000_000_000_000_000n,
  supplyCap: 5_000_000_000_000_000n,
} as const;

export const FACTOR = 10n ** 18n;
export const INDEX = 10n ** 15n;
export const PRICE_SCALE = 10n ** 8n;
export const SECONDS_PER_YEAR = 31_536_000n;

export const MIN_WITHDRAW_CKB = 61n * 100_000_000n;
