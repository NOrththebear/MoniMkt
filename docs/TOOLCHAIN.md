# Toolchain setup

MoniMkt uses three separate toolchains:

1. **Host Rust** for the pure crates (`math`, `schemas`, `market-core`).
2. **RISC-V Rust** for the CKB scripts (`scripts/*`).
3. **OffCKB** for a local CKB devnet.

`ckb-testtool` additionally needs a host C compiler (`gcc` or `clang`) because
one of its dependencies (`blake2b-rs`) builds C code.

## Windows

The default MSVC Rust toolchain needs Visual Studio's `link.exe`. If it is not
installed, use the GNU toolchain:

```powershell
rustup toolchain install stable-x86_64-pc-windows-gnu --profile minimal
rustup component add --toolchain stable-x86_64-pc-windows-gnu rustfmt clippy
rustup target add riscv64imac-unknown-none-elf --toolchain stable-x86_64-pc-windows-gnu
```

Install WinLibs/MinGW for `ckb-testtool`:

```powershell
winget install --id BrechtSanders.WinLibs.POSIX.UCRT -e --scope user
. ./scripts/env.ps1
gcc --version
```

`scripts/env.ps1` finds the WinLibs `gcc.exe`, prepends its directory to
`PATH`, and sets `CC`/`AR`/`CXX`. It checks the repository-local
`.toolchains/winlibs/mingw64` first, then the WinGet installation paths. Dot-
source it in any shell that builds `ckb-testtool`.

If `winget` is slow or unavailable, extract the WinLibs zip into
`.toolchains/winlibs` manually; `.toolchains/` is gitignored.

## Linux / macOS

```bash
rustup target add riscv64imac-unknown-none-elf
cargo install ckb-testtool   # only if you need the test harness as a binary
```

## Local devnet

```powershell
npm install -g @offckb/cli
./scripts/devnet.ps1          # start
./scripts/devnet.ps1 -Stop    # stop
```

The devnet RPC is `http://127.0.0.1:8114`. `offckb accounts` prints the
pre-funded test accounts.

## RISC-V build flags

`.cargo/config.toml` sets:

```toml
[target.riscv64imac-unknown-none-elf]
rustflags = [
    "-C", "target-feature=+zba,+zbb,+zbc,+zbs",
    "-C", "passes=lower-atomic",
]
```

`passes=lower-atomic` lowers atomics to the `__atomic_*` functions provided by
`ckb-std`'s `dummy-atomic` feature. Do **not** use `-C target-feature=-a` on
this toolchain; it triggers an LLVM `AtomicLoadAdd` selection error in the
`bytes` crate. `+zba/+zbb/+zbc/+zbs` match the CKB Rust templates.

## Build and test

```powershell
# Host-testable crates
./scripts/test.ps1

# RISC-V script + ckb-testtool smoke test
./scripts/test-market-type.ps1

# Just the RISC-V binary
./scripts/build-script.ps1

# Check the whole toolchain
./scripts/doctor.ps1
```

## Troubleshooting

### `linker 'link.exe' not found`

The default MSVC toolchain is active but Visual Studio Build Tools are missing.
Use `rustup run stable-x86_64-pc-windows-gnu cargo ...` (the scripts do this).

### `failed to find tool "gcc.exe"` when building `ckb-testtool`

Install WinLibs/MinGW and run `. ./scripts/env.ps1` before `cargo test`.
Verify with `Get-Command gcc`.

### `Clang compiler not found` when building `ckb-std`

The default `ckb-std` features include `libc`, whose build script compiles C
with clang. The script crates disable those features:

```toml
ckb-std = { version = "1.1.0", default-features = false, features = [
  "allocator", "ckb-types", "calc-hash", "dummy-atomic",
] }
```

If you enable `libc` or `dlopen-c`, install clang and set `CLANG`.

### `moleculec` fails on Windows

`moleculec` currently fails to link on a minimal Windows GNU environment
(`-lktmw32` missing). The repository uses a fixed-size, Molecule-compatible
codec in `crates/schemas` instead. The source schema remains in
`schemas/market.mol`; a Linux/CI environment with `moleculec` can generate
bindings later.
