# Build all MoniMkt RISC-V contract scripts and print their sizes.
$ErrorActionPreference = "Stop"
$toolchain = "stable-x86_64-pc-windows-gnu"

rustup run $toolchain cargo build `
  -p monimkt-market-type `
  -p monimkt-market-state-lock `
  -p monimkt-account-type `
  -p monimkt-position-type `
  -p monimkt-position-lock `
  -p monimkt-vault-lock `
  -p monimkt-base-token-lock `
  -p monimkt-vault-type `
  -p monimkt-oracle-type `
  -p monimkt-asset-config-type `
  -p monimkt-asset-totals-type `
  -p monimkt-approval-type `
  -p monimkt-config-type `
  --target riscv64imac-unknown-none-elf `
  --release
if ($LASTEXITCODE -ne 0) { throw "RISC-V build failed" }

$dir = "target/riscv64imac-unknown-none-elf/release"
Get-ChildItem $dir -File |
  Where-Object { $_.Name -like "monimkt-*" } |
  Sort-Object Name |
  Select-Object Name, Length |
  Format-Table -AutoSize
