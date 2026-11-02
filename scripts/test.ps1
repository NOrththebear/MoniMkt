# Run the host-testable suites with the GNU toolchain on Windows.
# The default MSVC toolchain may lack link.exe (Visual Studio Build Tools).
$ErrorActionPreference = "Stop"
$toolchain = "stable-x86_64-pc-windows-gnu"
$packages = @(
    "monimkt-math",
    "monimkt-schemas",
    "monimkt-market-core",
    "monimkt-batcher",
    "monimkt-indexer"
)

function Invoke-Checked {
    param([string[]]$CargoArgs)
    rustup run $toolchain cargo @CargoArgs
    if ($LASTEXITCODE -ne 0) {
        throw "cargo $($CargoArgs -join ' ') failed with exit code $LASTEXITCODE"
    }
}

Invoke-Checked @("fmt", "--all", "--check")

$clippyArgs = @("clippy")
foreach ($p in $packages) { $clippyArgs += @("-p", $p) }
$clippyArgs += @("--all-targets", "--", "-D", "warnings")
Invoke-Checked $clippyArgs

$testArgs = @("test")
foreach ($p in $packages) { $testArgs += @("-p", $p) }
Invoke-Checked $testArgs
