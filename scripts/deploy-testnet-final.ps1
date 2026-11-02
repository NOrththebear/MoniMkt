# Deploy the final contract-freeze scripts.
$ErrorActionPreference = "Stop"

& "$PSScriptRoot/build-all.ps1"

$target = Join-Path $PSScriptRoot "..\build\testnet-final"
Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $target | Out-Null

$release = "target/riscv64imac-unknown-none-elf/release"
foreach ($name in @("monimkt-market-type", "monimkt-base-token-lock")) {
  Copy-Item (Join-Path $release $name) $target
}

offckb deploy `
  --network testnet `
  --target $target `
  --type-id `
  --privkey-file .secrets/testnet-deployer.key `
  --output deployments/testnet-final `
  -y
