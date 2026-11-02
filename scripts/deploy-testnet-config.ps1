# Deploy the market config type script.
$ErrorActionPreference = "Stop"

& "$PSScriptRoot/build-all.ps1"

$target = Join-Path $PSScriptRoot "..\build\testnet-config"
Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item "target/riscv64imac-unknown-none-elf/release/monimkt-config-type" $target

offckb deploy `
  --network testnet `
  --target $target `
  --type-id `
  --privkey-file .secrets/testnet-deployer.key `
  --output deployments/testnet-config `
  -y
