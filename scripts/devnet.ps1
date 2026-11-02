param(
    [switch]$Stop
)

$ErrorActionPreference = "Stop"

if ($Stop) {
    offckb node stop
    exit 0
}

offckb node --daemon
Write-Host "`nDevnet accounts:"
offckb accounts
