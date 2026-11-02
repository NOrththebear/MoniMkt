# Check the local MoniMkt toolchain.
$ErrorActionPreference = "Continue"

Write-Host "== Rust =="
rustc --version
cargo --version

Write-Host "`n== Targets (GNU toolchain) =="
rustup target list --installed --toolchain stable-x86_64-pc-windows-gnu

Write-Host "`n== C compiler =="
$cc = Get-Command gcc, clang, cc -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cc) {
    Write-Host "$($cc.Name): $($cc.Source)"
} else {
    $gcc = Get-ChildItem @(
        "$PSScriptRoot\..\.toolchains\winlibs\mingw64\bin\gcc.exe",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_*\mingw64\bin\gcc.exe",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.MCF.UCRT_*\mingw64\bin\gcc.exe",
        "C:\mingw64\bin\gcc.exe"
    ) -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($gcc) {
        Write-Host "gcc (not on PATH): $($gcc.FullName)"
        Write-Host "Run: . ./scripts/env.ps1"
    } else {
        Write-Warning "No host C compiler found. ckb-testtool will not build."
    }
}

Write-Host "`n== OffCKB =="
offckb --version

Write-Host "`n== Devnet RPC =="
try {
    $body = '{"id":1,"jsonrpc":"2.0","method":"get_tip_block_number","params":[]}'
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:8114" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 5
    Write-Host "tip block: $($response.result)"
} catch {
    Write-Warning "Devnet RPC is not reachable. Start it with: ./scripts/devnet.ps1"
}
