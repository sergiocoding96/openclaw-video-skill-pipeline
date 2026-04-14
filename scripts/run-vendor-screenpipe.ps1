# Build (if needed) and run upstream Screenpipe from vendor/screenpipe.
# Requires Rust: https://rustup.rs/ and deps from screenpipe CONTRIBUTING.md (Windows section).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$upstream = Join-Path $root "vendor\screenpipe"
$exe = Join-Path $upstream "target\release\screenpipe.exe"
$cargo = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
if (Test-Path $cargo) {
  $env:Path = "$(Split-Path $cargo);$env:Path"
}

if (-not (Test-Path $upstream)) {
  Write-Error "Missing $upstream — clone: git clone --depth 1 https://github.com/screenpipe/screenpipe.git `"$upstream`""
}

if (-not (Test-Path $exe)) {
  Write-Host "Building Screenpipe (release)..."
  Push-Location $upstream
  try {
    cargo build --release
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $exe)) {
  Write-Error "Build did not produce $exe"
}

Write-Host "Starting Screenpipe: $exe"
Write-Host "API: http://127.0.0.1:3030  (Ctrl+C to stop)"
& $exe @args
