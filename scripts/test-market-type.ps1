# Build the RISC-V scripts, then run the ckb-testtool tests.
$ErrorActionPreference = "Stop"
$toolchain = "stable-x86_64-pc-windows-gnu"

. "$PSScriptRoot/env.ps1"

rustup run $toolchain cargo fmt --all --check
if ($LASTEXITCODE -ne 0) { throw "format check failed" }

rustup run $toolchain cargo build `
  -p monimkt-market-type `
  -p monimkt-vault-type `
  -p monimkt-account-type `
  -p monimkt-position-type `
  -p monimkt-position-lock `
  -p monimkt-vault-lock `
  -p monimkt-oracle-type `
  -p monimkt-asset-config-type `
  -p monimkt-asset-totals-type `
  -p monimkt-approval-type `
  -p monimkt-base-token-lock `
  --target riscv64imac-unknown-none-elf `
  --release
if ($LASTEXITCODE -ne 0) { throw "RISC-V build failed" }

rustup run $toolchain cargo test -p monimkt-market-type-tests
if ($LASTEXITCODE -ne 0) { throw "market-type script tests failed" }

rustup run $toolchain cargo clippy -p monimkt-market-type-tests --all-targets -- -D warnings
if ($LASTEXITCODE -ne 0) { throw "market-type test clippy failed" }
