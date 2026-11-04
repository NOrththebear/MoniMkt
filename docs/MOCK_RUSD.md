# Mock RUSD (CKB testnet)

Issued with the standard CKB testnet xUDT script. This is a **mock** token for
MoniMkt testing, not the real Stable++ RUSD.

## Token

| Field | Value |
|---|---|
| Name | Mock RUSD |
| Standard | xUDT |
| Decimals | 8 |
| Issued amount | `100000000000000` raw = `1,000,000.00000000` Mock RUSD |
| Receiver | `ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq0du7vk92qzka79twzpsdtwe0g3e77x8ush4mfuf` |
| Issue tx | `0xd410b6f5ef2b192ca0bc89a730b035649e01f11775fddaacb8f2b2f2f83d00fb` |

## Type script

```
code_hash: 0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb
hash_type: type
args:      0x17a32809302cdca3ffdfde54659dc6d0e3e2d7ce6d8e79616cc72e4e4eff6d2c
```

**Asset ID (type script hash):**

```
0xe016940e96b9ad2d6505d06996a24f84dbc319ce1a0b0a619aa6af26ce190a3a
```

Use this as `base_asset_id` in the market, with `base_decimals = 8`.

## Current balance

Verified by scanning live cells after the v2 market smoke tests:

```
deployer wallet:       998,768.00000000 Mock RUSD
v3 base token cell:        170.00000000 Mock RUSD
v2 abandoned token cell:    61.00000000 Mock RUSD
v1 abandoned seed cell:      1.00000000 Mock RUSD
total issued:        1,000,000.00000000 Mock RUSD
```

The v1/v2 cells belong to abandoned markets. See
[`TESTNET_DEPLOY.md`](./TESTNET_DEPLOY.md).

## Mint more

The xUDT owner is the deployer wallet lock. Use:

```powershell
offckb udt issue <raw-amount> `
  --network testnet `
  --udt-kind xudt `
  --type-args 0x17a32809302cdca3ffdfde54659dc6d0e3e2d7ce6d8e79616cc72e4e4eff6d2c `
  --to ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq0du7vk92qzka79twzpsdtwe0g3e77x8ush4mfuf `
  --privkey-file .secrets/testnet-deployer.key
```

`<raw-amount>` is in 8-decimal units. For example, `100000000000` =
`1,000.00000000` Mock RUSD.

## Important

- This token is for testnet only.
- It is not the real RUSD type hash. Real RUSD testnet is
  `0x45b32a2bc4285d0a09678eb11960ddc8707bc2779887a09d482e9bfe9a2cdf52`.
- Before mainnet, replace the mock base asset with real RUSD or another audited
  stablecoin.
