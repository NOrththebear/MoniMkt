#!/usr/bin/env bash
set -euo pipefail

cargo build -p monimkt-market-type --target riscv64imac-unknown-none-elf --release
