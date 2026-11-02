# Deploy the multi-cell base-token custody lock.
$ErrorActionPreference = "Stop"
& "$PSScriptRoot/build-all.ps1"
$target = Join-Path $PSScriptRoot "..\build\testnet-base-token-v2"
Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item "target/riscv64imac-unknown-none-elf/release/monimkt-base-token-lock" $target
offckb deploy --network testnet --target $target --type-id --privkey-file .secrets/testnet-deployer.key --output deployments/testnet-base-token-v2 -y
