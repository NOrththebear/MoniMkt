# Deploy all MoniMkt scripts to CKB testnet with Type ID.
# Requires enough CKB in .secrets/testnet-deployer.key (about 265,000 CKB).
$ErrorActionPreference = "Stop"

& "$PSScriptRoot/build-all.ps1"

$target = Join-Path $PSScriptRoot "..\build\testnet"
Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $target | Out-Null

$release = "target/riscv64imac-unknown-none-elf/release"
Get-ChildItem $release -File |
  Where-Object { $_.Name -like "monimkt-*" -and $_.Extension -ne ".d" } |
  Copy-Item -Destination $target

offckb deploy `
  --network testnet `
  --target $target `
  --type-id `
  --privkey-file .secrets/testnet-deployer.key `
  --output deployments/testnet `
  -y
