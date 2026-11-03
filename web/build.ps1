# Build the raw HTML/CSS/JS MoniMkt site.
$ErrorActionPreference = "Stop"

$site = Split-Path -Parent $MyInvocation.MyCommand.Path
$tailwind = Join-Path $site "node_modules\.bin\tailwindcss.cmd"
$esbuild = Join-Path $site "node_modules\.bin\esbuild.cmd"

New-Item -ItemType Directory -Force (Join-Path $site "assets") | Out-Null
Remove-Item (Join-Path $site "assets\chunks") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $site "assets\main.js") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $site "assets\styles.css") -Force -ErrorAction SilentlyContinue

Push-Location $site
try {
  & $tailwind -c (Join-Path $site "tailwind.config.ts") -i (Join-Path $site "src\input.css") -o (Join-Path $site "assets\styles.css") --minify
  if ($LASTEXITCODE -ne 0) { throw "tailwind build failed" }

  $outdir = Join-Path $site "assets"
  & $esbuild (Join-Path $site "src\main.js") --bundle --splitting --format=esm "--outdir=$outdir" "--entry-names=[name]" "--chunk-names=chunks/[name]-[hash]" --minify --platform=browser --target=es2020
  if ($LASTEXITCODE -ne 0) { throw "esbuild failed" }

  node (Join-Path $site "build-html.mjs")
  if ($LASTEXITCODE -ne 0) { throw "html generation failed" }

  Copy-Item (Join-Path $site "public\monimkt.svg") (Join-Path $site "assets\monimkt.svg") -Force
  $font = Join-Path $site "public\inter-latin.woff2"
  if (Test-Path $font) {
    Copy-Item $font (Join-Path $site "assets\inter-latin.woff2") -Force
  }
  Write-Host "Static site built in $site"
} finally {
  Pop-Location
}
