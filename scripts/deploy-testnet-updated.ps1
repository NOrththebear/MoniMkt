# Redeploy the updated market-type and vault-lock scripts.
$ErrorActionPreference = "Stop"

& "$PSScriptRoot/build-all.ps1"

$target = Join-Path $PSScriptRoot "..\build\testnet-updated"
Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $target | Out-Null

$release = "target/riscv64imac-unknown-none-elf/release"
$names = @(
  "monimkt-market-type",
  "monimkt-vault-lock"
)

foreach ($name in $names) {
  Copy-Item (Join-Path $release $name) $target
}

offckb deploy `
  --network testnet `
  --target $target `
  --type-id `
  --privkey-file .secrets/testnet-deployer.key `
  --output deployments/testnet-updated `
  -y
