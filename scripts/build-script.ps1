# Build the RISC-V market-type script.
$ErrorActionPreference = "Stop"
$toolchain = "stable-x86_64-pc-windows-gnu"

rustup run $toolchain cargo build `
  -p monimkt-market-type `
  --target riscv64imac-unknown-none-elf `
  --release
if ($LASTEXITCODE -ne 0) { throw "RISC-V build failed" }
