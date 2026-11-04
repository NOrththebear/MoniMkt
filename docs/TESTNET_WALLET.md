# Testnet deployer wallet

Generated locally for CKB testnet only.

## Address

```
ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq0du7vk92qzka79twzpsdtwe0g3e77x8ush4mfuf
```

Lock script:

```
code_hash: 0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8
hash_type: type
args:      0xede79962a802b77c55b8418356ecbd11cfbc63f2
```

## Private key

Stored at:

```
.secrets/testnet-deployer.key
```

`.secrets/` is gitignored. Back it up somewhere safe. This wallet is for
**testnet only**; never use it on mainnet.

## Current balances

Verified on testnet:

```
CKB total:  781,621.26501155
CKB free:   307,645.26501155
CKB typed:  473,976.00000000
Mock RUSD:  998,768.00000000
```

All scripts and the v3-final market cells are deployed, including the permissive
MarketState/AssetTotals locks. There is no current funding gap. See
[`TESTNET_DEPLOY.md`](./TESTNET_DEPLOY.md) for the deployment record.

## Fund it

### CKB testnet

1. Open `https://faucet.nervos.org`.
2. Paste the address above.
3. Request testnet CKB.
4. You will need enough CKB for script cells, market cells, and fees.
   Request the faucet maximum if possible.

### RUSD testnet

1. Open `https://testnet0815.stablepp.xyz/faucet`.
2. Connect or import the testnet wallet if required.
3. Claim testnet RUSD.
4. Send the RUSD to the address above if the faucet pays a different address.

RUSD testnet type hash (verify before deployment):

```
0x45b32a2bc4285d0a09678eb11960ddc8707bc2779887a09d482e9bfe9a2cdf52
```

## Verify balance

```powershell
offckb balance ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq0du7vk92qzka79twzpsdtwe0g3e77x8ush4mfuf --network testnet
```

If the RPC is unavailable, check the address on a CKB testnet explorer.

## Regenerate

```powershell
node scripts/generate-testnet-wallet.js
```

This overwrites the `.secrets` files with a new wallet.
