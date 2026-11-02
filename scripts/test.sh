#!/usr/bin/env bash
set -euo pipefail

PACKAGES=(-p monimkt-math -p monimkt-schemas -p monimkt-market-core -p monimkt-batcher -p monimkt-indexer)

cargo fmt --all --check
cargo clippy "${PACKAGES[@]}" --all-targets -- -D warnings
cargo test "${PACKAGES[@]}"
