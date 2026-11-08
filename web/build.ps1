# Build the standalone MoniMkt static site into web/dist.
$ErrorActionPreference = "Stop"

node (Join-Path $PSScriptRoot "build.mjs")
if ($LASTEXITCODE -ne 0) { throw "build failed with exit code $LASTEXITCODE" }
