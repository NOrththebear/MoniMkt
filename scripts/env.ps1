# Locate a MinGW gcc (WinLibs) and expose it to cargo/cc.
# Dot-source this file: `. ./scripts/env.ps1`

$candidates = @(
    "$PSScriptRoot\..\.toolchains\winlibs\mingw64\bin\gcc.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.UCRT_*\mingw64\bin\gcc.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.MCF.UCRT_*\mingw64\bin\gcc.exe",
    "$env:LOCALAPPDATA\Programs\mingw64\bin\gcc.exe",
    "C:\mingw64\bin\gcc.exe",
    "C:\ProgramData\chocolatey\lib\mingw\tools\install\mingw64\bin\gcc.exe"
)

$gcc = Get-ChildItem $candidates -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1

if (-not $gcc) {
    throw "gcc not found. Install WinLibs/MinGW or set CC manually."
}

$env:CC = $gcc.FullName
$env:PATH = "$($gcc.DirectoryName);$env:PATH"

$ar = Join-Path $gcc.DirectoryName "ar.exe"
if (Test-Path $ar) { $env:AR = $ar }

$gxx = Join-Path $gcc.DirectoryName "g++.exe"
if (Test-Path $gxx) { $env:CXX = $gxx }

Write-Host "CC = $($env:CC)"
if ($env:AR) { Write-Host "AR = $($env:AR)" }
