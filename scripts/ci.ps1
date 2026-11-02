# Full local CI gate.
$ErrorActionPreference = "Stop"

Write-Host "== Host crates =="
& "$PSScriptRoot/test.ps1"

Write-Host "`n== RISC-V scripts + ckb-testtool =="
& "$PSScriptRoot/test-market-type.ps1"

Write-Host "`nAll local checks passed."
