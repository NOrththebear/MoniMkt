# Deploy the core six scripts that fit in the current testnet balance.
$ErrorActionPreference = "Stop"

& "$PSScriptRoot/build-all.ps1"

$target = Join-Path $PSScriptRoot "..\build\testnet-core"
Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $target | Out-Null

$release = "target/riscv64imac-unknown-none-elf/release"
$names = @(
  "monimkt-market-type",
  "monimkt-account-type",
  "monimkt-position-type",
  "monimkt-position-lock",
  "monimkt-vault-lock",
  "monimkt-vault-type"
)

foreach ($name in $names) {
  Copy-Item (Join-Path $release $name) $target
}

offckb deploy `
  --network testnet `
  --target $target `
  --type-id `
  --privkey-file .secrets/testnet-deployer.key `
  --output deployments/testnet-core `
  -y
