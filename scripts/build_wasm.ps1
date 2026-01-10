param(
  [switch]$Release = $true
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$crateName = 'bbphysic-wasm'
$target = 'wasm32-unknown-unknown'

Write-Host "[BBPhysic] Ensuring Rust target $target ..."
rustup target add $target | Out-String | Write-Host

$profileArg = if ($Release) { '--release' } else { '' }

Write-Host "[BBPhysic] Building $crateName ($target) ..."
Push-Location $repoRoot
cargo build -p $crateName --target $target $profileArg
Pop-Location

$profileDir = if ($Release) { 'release' } else { 'debug' }
$wasmIn = Join-Path $repoRoot "target\$target\$profileDir\bbphysic_wasm.wasm"
$wasmOutDir = Join-Path $repoRoot "blockbench-plugin\dist"
$wasmOut = Join-Path $wasmOutDir "bbphysic.wasm"

if (!(Test-Path $wasmIn)) {
  throw "WASM not found: $wasmIn"
}

New-Item -ItemType Directory -Force -Path $wasmOutDir | Out-Null
Copy-Item -Force $wasmIn $wasmOut
Write-Host "[BBPhysic] Copied wasm -> $wasmOut"
