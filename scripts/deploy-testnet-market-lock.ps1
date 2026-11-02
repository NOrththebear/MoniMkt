# Deploy the permissive MarketState lock.
$ErrorActionPreference = "Stop"
& "$PSScriptRoot/build-all.ps1"

$target = Join-Path $PSScriptRoot "..\build\testnet-market-lock"
Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item "target/riscv64imac-unknown-none-elf/release/monimkt-market-state-lock" $target

offckb deploy `
  --network testnet `
  --target $target `
  --type-id `
  --privkey-file .secrets/testnet-deployer.key `
  --output deployments/testnet-market-lock `
  -y
