# One-shot helper: clone upstream (if missing), optionally install Rust via winget, build Screenpipe,
# optionally start the server briefly and run the repo probe (health + search + frames).
#
# Run from repo root in a normal PowerShell (not Cursor's sandbox):
#   powershell -ExecutionPolicy Bypass -File scripts/setup-screenpipe.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/setup-screenpipe.ps1 -InstallRust
#   powershell -ExecutionPolicy Bypass -File scripts/setup-screenpipe.ps1 -RunProbe
#
# Full upstream Windows deps (LLVM, CMake, VS Build Tools) may still be required for a clean build.
# See: vendor/screenpipe/CONTRIBUTING.md (Windows section).

param(
  [switch]$InstallRust,
  [switch]$InstallMsvc,
  [switch]$RunProbe
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Upstream = Join-Path $RepoRoot "vendor\screenpipe"
$Exe = Join-Path $Upstream "target\release\screenpipe.exe"
$CargoBin = Join-Path $env:USERPROFILE ".cargo\bin"

function Add-CargoToPath {
  if (Test-Path $CargoBin) {
    $env:Path = "$CargoBin;$env:Path"
  }
}

function Test-Cargo {
  Add-CargoToPath
  $cargoExe = Join-Path $CargoBin "cargo.exe"
  if (-not (Test-Path $cargoExe)) { return $false }
  $v = & $cargoExe --version 2>&1
  if ($LASTEXITCODE -ne 0) { return $false }
  Write-Host "OK: $v"
  return $true
}

function Ensure-Clone {
  if (Test-Path (Join-Path $Upstream "Cargo.toml")) {
    Write-Host "Upstream already present: $Upstream"
    return
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $Upstream) | Out-Null
  Write-Host "Cloning screenpipe/screenpipe ..."
  git clone --depth 1 https://github.com/screenpipe/screenpipe.git $Upstream
}

function Install-Rust {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Installing Rust via winget (Rustlang.Rustup) ..."
    winget install -e --id Rustlang.Rustup --accept-package-agreements --accept-source-agreements
    Write-Host "If this was the first install, CLOSE and REOPEN the terminal, then run this script again without -InstallRust."
  } else {
    Write-Host "winget not found. Install Rust from https://rustup.rs/ then re-run."
    exit 1
  }
}

# Rust x86_64-pc-windows-msvc needs the Microsoft linker (link.exe) from Visual Studio Build Tools (C++ workload).
function Test-MsvcLinkerAvailable {
  $link = Get-Command link.exe -ErrorAction SilentlyContinue
  if ($link) { return $true }
  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  if (-not (Test-Path $vswhere)) { return $false }
  $p = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
  if ($LASTEXITCODE -eq 0 -and $p) { return $true }
  return $false
}

function Install-MsvcBuildTools {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "winget not found. Install Visual Studio Build Tools manually:"
    Write-Host "  https://visualstudio.microsoft.com/visual-cpp-build-tools/"
    Write-Host "Select: Desktop development with C++ OR MSVC v143 - VS 2022 C++ x64/x86 build tools"
    exit 1
  }
  Write-Host "Installing Visual Studio 2022 Build Tools (C++ / MSVC workload). This is large (~GB) and may require admin ..."
  winget install -e --id Microsoft.VisualStudio.2022.BuildTools --accept-package-agreements --accept-source-agreements --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  Write-Host ""
  Write-Host "After install completes, OPEN A NEW TERMINAL (or reboot), then run this script again without -InstallMsvc."
  exit 0
}

function Assert-MsvcForRust {
  if (Test-MsvcLinkerAvailable) {
    Write-Host "OK: MSVC linker environment detected (link.exe or VS C++ tools)."
    return
  }
  Write-Host ""
  Write-Host "ERROR: link.exe (MSVC linker) not found. Rust on Windows needs Visual C++ build tools."
  Write-Host "VS Code alone is NOT enough."
  Write-Host ""
  Write-Host "Fix (pick one):"
  Write-Host "  1) Run this script with:  -InstallMsvc   (uses winget; large download)"
  Write-Host "  2) Install manually: https://visualstudio.microsoft.com/visual-cpp-build-tools/"
  Write-Host "     Enable workload: ""Desktop development with C++"" or MSVC v143 build tools"
  Write-Host "  3) Then open a NEW terminal and run this script again."
  Write-Host ""
  exit 1
}

Ensure-Clone

if ($InstallRust) {
  Install-Rust
}

if ($InstallMsvc) {
  Install-MsvcBuildTools
}

Add-CargoToPath
if (-not (Test-Cargo)) {
  Write-Host ""
  Write-Host "ERROR: cargo is not on PATH or failed to run."
  Write-Host "Fix: run this script with -InstallRust, OR install https://rustup.rs/ and reopen the terminal."
  exit 1
}

Assert-MsvcForRust

Write-Host ""
Write-Host "Building Screenpipe (release) — first build can take 15–60 minutes ..."
Push-Location $Upstream
try {
  cargo build --release
  if ($LASTEXITCODE -ne 0) { throw "cargo build failed" }
} finally {
  Pop-Location
}

if (-not (Test-Path $Exe)) {
  Write-Error "Expected binary missing: $Exe"
}

Write-Host ""
Write-Host "Build OK: $Exe"

if (-not $RunProbe) {
  Write-Host ""
  Write-Host "Next: start the server in one terminal:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/run-vendor-screenpipe.ps1"
  Write-Host "Then in another:"
  Write-Host "  curl.exe http://127.0.0.1:3030/health"
  Write-Host "  node screenpipe/screenpipe-probe.js --minutes 5 --base-url http://127.0.0.1:3030"
  exit 0
}

Write-Host ""
Write-Host "Starting Screenpipe briefly for validation ..."
$proc = Start-Process -FilePath $Exe -WorkingDirectory $Upstream -PassThru -WindowStyle Hidden
try {
  $ok = $false
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:3030/health" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
  }
  if (-not $ok) {
    Write-Host "WARN: /health did not respond in time (capture may need an interactive session). Try starting the .exe manually."
  } else {
    Write-Host "OK: GET /health"
    Set-Location $RepoRoot
    node screenpipe/screenpipe-probe.js --minutes 1 --base-url http://127.0.0.1:3030
  }
} finally {
  if (-not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ""
Write-Host "Done."
