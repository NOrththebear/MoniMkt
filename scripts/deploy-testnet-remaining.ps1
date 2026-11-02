# Deploy the remaining four scripts once the wallet has ~100,000 more CKB.
$ErrorActionPreference = "Stop"

& "$PSScriptRoot/build-all.ps1"

$target = Join-Path $PSScriptRoot "..\build\testnet-remaining"
Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $target | Out-Null

$release = "target/riscv64imac-unknown-none-elf/release"
$names = @(
  "monimkt-oracle-type",
  "monimkt-asset-config-type",
  "monimkt-asset-totals-type",
  "monimkt-approval-type"
)

foreach ($name in $names) {
  Copy-Item (Join-Path $release $name) $target
}

offckb deploy `
  --network testnet `
  --target $target `
  --type-id `
  --privkey-file .secrets/testnet-deployer.key `
  --output deployments/testnet-remaining `
  -y
