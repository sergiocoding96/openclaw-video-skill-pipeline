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
  [switch]$InstallDeps,   # cmake + vcpkg + openblas:x64-windows
  [switch]$RunProbe
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Upstream = Join-Path $RepoRoot "vendor\screenpipe"
$DefaultExe = Join-Path $Upstream "target\release\screenpipe.exe"
# Use a short cargo target dir to avoid Windows path-length issues in CMake builds.
if (-not $env:CARGO_TARGET_DIR) {
  $shortTarget = Join-Path $env:SystemDrive "_sp\\target"
  New-Item -ItemType Directory -Force -Path $shortTarget | Out-Null
  $env:CARGO_TARGET_DIR = $shortTarget
}
$Exe = Join-Path $env:CARGO_TARGET_DIR "release\screenpipe.exe"
$OrtDllDir = Join-Path $Upstream "apps\screenpipe-app-tauri\src-tauri\onnxruntime-win-x64-1.19.2\lib"
$OrtDll = Join-Path $OrtDllDir "onnxruntime.dll"
$OpenBlasDll = if ($env:OPENBLAS_ROOT) { Join-Path $env:OPENBLAS_ROOT "bin\\openblas.dll" } else { $null }
$CargoBin = Join-Path $env:USERPROFILE ".cargo\bin"

function Assert-Command($name, $hint = $null) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "ERROR: required tool not found on PATH: $name"
    if ($hint) { Write-Host $hint }
    exit 1
  }
}

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

# Some crates (e.g. libsamplerate-sys) use cmake-rs -> requires cmake.exe on PATH.
function Install-CMake {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "winget not found. Install CMake manually from https://cmake.org/download/ and re-run."
    exit 1
  }
  Write-Host "Installing CMake via winget (Kitware.CMake) ..."
  winget install -e --id Kitware.CMake --accept-package-agreements --accept-source-agreements
  # winget updates Machine PATH; this process won't see it until restart. Refresh for this session.
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath    = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Assert-CMake {
  if (Get-Command cmake -ErrorAction SilentlyContinue) { return }
  # Prefer Visual Studio's bundled CMake if present (often integrates best with VS Build Tools)
  $vsCmakeBin = "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin"
  if (Test-Path (Join-Path $vsCmakeBin "cmake.exe")) {
    $env:Path = "$vsCmakeBin;$env:Path"
    $env:CMAKE = (Join-Path $vsCmakeBin "cmake.exe")
    if (Get-Command cmake -ErrorAction SilentlyContinue) { return }
  }
  # Common install location when winget MSI doesn't add PATH for current session
  $cmakeDefault = "C:\\Program Files\\CMake\\bin"
  if (Test-Path (Join-Path $cmakeDefault "cmake.exe")) {
    $env:Path = "$cmakeDefault;$env:Path"
    if (Get-Command cmake -ErrorAction SilentlyContinue) { return }
  }
  if ($InstallDeps) { Install-CMake; if (Get-Command cmake -ErrorAction SilentlyContinue) { return } }
  Write-Host ""
  Write-Host "ERROR: cmake is not installed (needed to build native deps like libsamplerate-sys)."
  Write-Host ""
  Write-Host "Fix (pick one):"
  Write-Host "  1) Re-run this script with: -InstallDeps   (winget installs CMake + vcpkg + openblas)"
  Write-Host "  2) Manual: winget install -e --id Kitware.CMake"
  Write-Host "Then CLOSE and REOPEN the terminal."
  exit 1
}

# Many sys crates (clang-sys, bindgen) need libclang.dll. LIBCLANG_PATH must point at LLVM\bin.
function Assert-LibClang {
  if ($env:LIBCLANG_PATH -and (Test-Path (Join-Path $env:LIBCLANG_PATH "libclang.dll"))) {
    Write-Host "OK: libclang found at $env:LIBCLANG_PATH"
    return
  }
  $candidates = @("C:\Program Files\LLVM\bin", "C:\Program Files (x86)\LLVM\bin")
  foreach ($c in $candidates) {
    if (Test-Path (Join-Path $c "libclang.dll")) {
      $env:LIBCLANG_PATH = $c
      Write-Host "OK: auto-set LIBCLANG_PATH=$c"
      return
    }
  }
  Write-Host ""
  Write-Host "ERROR: libclang.dll not found. Some Rust sys crates (bindgen) need it."
  Write-Host "Fix: winget install -e --id LLVM.LLVM"
  Write-Host "Then set: [Environment]::SetEnvironmentVariable('LIBCLANG_PATH','C:\Program Files\LLVM\bin','User')"
  exit 1
}

# Screenpipe's ASR dependency (antirez-asr-sys) compiles with USE_OPENBLAS and needs cblas.h on
# %INCLUDE% plus openblas.lib on %LIB%. Auto-detect from OPENBLAS_ROOT or a vcpkg install.
function Find-OpenBlasRoot {
  # vcpkg's openblas puts headers under include\openblas\cblas.h
  if ($env:OPENBLAS_ROOT -and ((Test-Path (Join-Path $env:OPENBLAS_ROOT "include\cblas.h")) -or (Test-Path (Join-Path $env:OPENBLAS_ROOT "include\openblas\cblas.h")))) {
    return $env:OPENBLAS_ROOT
  }
  $candidates = @()
  if ($env:VCPKG_ROOT) { $candidates += (Join-Path $env:VCPKG_ROOT "installed\x64-windows") }
  $candidates += (Join-Path $env:USERPROFILE "vcpkg\installed\x64-windows")
  foreach ($c in $candidates) {
    if ((Test-Path (Join-Path $c "include\cblas.h")) -or (Test-Path (Join-Path $c "include\openblas\cblas.h"))) { return $c }
  }
  return $null
}

function Try-Configure-OpenBlas {
  $root = Find-OpenBlasRoot
  if (-not $root) { return $false }
  $inc = Join-Path $root "include"
  $incOpenBlas = Join-Path $inc "openblas"
  $lib = Join-Path $root "lib"
  $env:OPENBLAS_ROOT = $root
  # Keep explicit dirs for cmd.exe builds (so we can append, not overwrite, VS INCLUDE/LIB).
  if (Test-Path $incOpenBlas) { $env:OPENBLAS_INCLUDE_DIR = $incOpenBlas }
  elseif (Test-Path $inc) { $env:OPENBLAS_INCLUDE_DIR = $inc }
  if (Test-Path $lib) { $env:OPENBLAS_LIB_DIR = $lib }
  if (Test-Path $incOpenBlas) { $env:INCLUDE = "$incOpenBlas;$env:INCLUDE" }
  if (Test-Path $inc) { $env:INCLUDE = "$inc;$env:INCLUDE" }
  if (Test-Path $lib) { $env:LIB     = "$lib;$env:LIB" }

  # Some build scripts look for libopenblas.lib on Windows; vcpkg ships openblas.lib.
  $openblas = Join-Path $lib "openblas.lib"
  $libopenblas = Join-Path $lib "libopenblas.lib"
  if ((Test-Path $openblas) -and -not (Test-Path $libopenblas)) {
    Copy-Item -Force $openblas $libopenblas
  }
  Write-Host "OK: OpenBLAS at $root (wired into INCLUDE/LIB for this build)"
  return $true
}

function Install-OpenBlasViaVcpkg {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: git is required to clone vcpkg."; exit 1
  }
  $vcpkgRoot = if ($env:VCPKG_ROOT) { $env:VCPKG_ROOT } else { Join-Path $env:USERPROFILE "vcpkg" }
  if (-not (Test-Path (Join-Path $vcpkgRoot ".git"))) {
    Write-Host "Cloning vcpkg into $vcpkgRoot ..."
    git clone https://github.com/microsoft/vcpkg.git $vcpkgRoot
  }
  $bootstrap = Join-Path $vcpkgRoot "bootstrap-vcpkg.bat"
  $vcpkgExe  = Join-Path $vcpkgRoot "vcpkg.exe"
  if (-not (Test-Path $vcpkgExe)) {
    Write-Host "Bootstrapping vcpkg ..."
    & $bootstrap
    if ($LASTEXITCODE -ne 0) { throw "vcpkg bootstrap failed" }
  }
  Write-Host "Installing openblas:x64-windows via vcpkg (this builds from source, ~5-15 min) ..."
  & $vcpkgExe install openblas:x64-windows
  if ($LASTEXITCODE -ne 0) { throw "vcpkg install openblas failed" }
  $env:VCPKG_ROOT    = $vcpkgRoot
  $env:OPENBLAS_ROOT = Join-Path $vcpkgRoot "installed\x64-windows"
  [Environment]::SetEnvironmentVariable("VCPKG_ROOT",    $vcpkgRoot,         "User")
  [Environment]::SetEnvironmentVariable("OPENBLAS_ROOT", $env:OPENBLAS_ROOT, "User")
}

function Hint-OpenBlas {
  Write-Host ""
  Write-Host "ERROR: Missing BLAS headers (cblas.h). antirez-asr-sys compiles with OpenBLAS on Windows."
  Write-Host ""
  Write-Host "Fix (pick one):"
  Write-Host "  1) Re-run this script with: -InstallDeps   (clones vcpkg, builds openblas, sets env)"
  Write-Host "  2) Manual:"
  Write-Host "       git clone https://github.com/microsoft/vcpkg.git `$env:USERPROFILE\vcpkg"
  Write-Host "       & `"`$env:USERPROFILE\vcpkg\bootstrap-vcpkg.bat`""
  Write-Host "       & `"`$env:USERPROFILE\vcpkg\vcpkg.exe`" install openblas:x64-windows"
  Write-Host "       [Environment]::SetEnvironmentVariable('OPENBLAS_ROOT','`$env:USERPROFILE\vcpkg\installed\x64-windows','User')"
  Write-Host "  Then CLOSE and REOPEN the terminal."
  exit 1
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

function Import-VsDevEnvironment {
  # For CMake and bindgen/libclang we need the full MSVC + Windows SDK environment
  # (INCLUDE/LIB/LIBPATH/WindowsSdkDir/etc). Having cl.exe somewhere isn't enough.
  if ($env:VSCMD_VER) {
    Write-Host "OK: VS developer environment already active (VSCMD_VER=$env:VSCMD_VER)"
    return
  }
  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\\Installer\\vswhere.exe"
  if (-not (Test-Path $vswhere)) { return }
  $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $vsPath) { return }
  $vsDevCmd = Join-Path $vsPath "Common7\\Tools\\VsDevCmd.bat"
  if (-not (Test-Path $vsDevCmd)) { return }
  # Keep path around so we can optionally run cargo under cmd.exe with the full VS env.
  $env:SCREENPIPE_VSDEVCMD = $vsDevCmd

  Write-Host "Activating VS dev environment for this build (VsDevCmd.bat)..."
  # Use cmd.exe to "call" the .bat, then dump the environment with `set`.
  # /s ensures the quoting rules are applied correctly.
  $cmdLine = "call `"$vsDevCmd`" -no_logo -arch=x64 -host_arch=x64 && set"
  $out = & cmd.exe /d /s /c $cmdLine
  foreach ($line in $out) {
    $idx = $line.IndexOf("=")
    if ($idx -le 0) { continue }
    $k = $line.Substring(0, $idx)
    $v = $line.Substring($idx + 1)
    if ($k -and $v -ne $null) {
      Set-Item -Path "Env:$k" -Value $v -ErrorAction SilentlyContinue
    }
  }
  if ($env:VSCMD_VER) {
    Write-Host "OK: VS dev environment activated (VSCMD_VER=$env:VSCMD_VER)"
  }
}

function Assert-ClAvailable {
  $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
  if ($cl) { return }
  Write-Host ""
  Write-Host "ERROR: cl.exe is not on PATH in this session."
  Write-Host "Fix: open 'x64 Native Tools Command Prompt for VS 2022' (Start Menu) and re-run -RunProbe."
  Write-Host "Or ensure VsDevCmd.bat activation succeeded and includes VC\\Tools\\MSVC\\...\\bin\\Hostx64\\x64 on PATH."
  exit 1
}

function Assert-Ninja {
  if (Get-Command ninja -ErrorAction SilentlyContinue) { return }
  # Visual Studio Build Tools often bundles Ninja alongside CMake.
  $vsNinjaBin = "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\Ninja"
  if (Test-Path (Join-Path $vsNinjaBin "ninja.exe")) {
    $env:Path = "$vsNinjaBin;$env:Path"
    if (Get-Command ninja -ErrorAction SilentlyContinue) { return }
  }
  Write-Host ""
  Write-Host "ERROR: ninja.exe not found (needed for CMake generator Ninja on Windows)."
  Write-Host "Fix: install Ninja (winget):"
  Write-Host "  winget install -e --id Ninja-build.Ninja"
  exit 1
}

function Force-CMakeToUseMSVC {
  # Some cmake-based sys crates fail to detect compilers unless CC/CXX are set explicitly.
  $cl = Get-Command cl.exe -ErrorAction SilentlyContinue
  if (-not $cl) { return }
  # Prefer forward slashes for CMake cache files (avoid \P escape issues)
  $clPath = ($cl.Source -replace '\\','/')

  # Avoid inheriting strange default flags from the environment (can break try_compile).
  # CL / _CL_ are special env vars consumed by cl.exe.
  if ($env:CL)   { $env:CL = "" }
  if ($env:_CL_) { $env:_CL_ = "" }

  if (-not $env:CC) { $env:CC = $clPath }
  if (-not $env:CXX) { $env:CXX = $clPath }
  # CMake is happier with full paths than bare "cl"
  if (-not $env:CMAKE_C_COMPILER) { $env:CMAKE_C_COMPILER = $clPath }
  if (-not $env:CMAKE_CXX_COMPILER) { $env:CMAKE_CXX_COMPILER = $clPath }
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
Import-VsDevEnvironment
Assert-ClAvailable
Force-CMakeToUseMSVC

# Native dependency preflight (fail fast with actionable fix)
Assert-CMake
Assert-Ninja
Assert-LibClang

$openBlasConfigured = Try-Configure-OpenBlas
if (-not $openBlasConfigured -and $InstallDeps) {
  Install-OpenBlasViaVcpkg
  $openBlasConfigured = Try-Configure-OpenBlas
}
if (-not $openBlasConfigured) {
  # We can't reliably predict if the build will require cblas.h (feature flags can vary),
  # but Screenpipe on Windows commonly hits this, so we provide the fix up front.
  Hint-OpenBlas
}

Write-Host ""
Write-Host "Building Screenpipe (release) — first build can take 15–60 minutes ..."
Push-Location $Upstream
try {
  # Use Visual Studio generator for cmake-based *-sys crates on MSVC.
  $env:CMAKE_GENERATOR = "Visual Studio 17 2022"
  $env:CMAKE_GENERATOR_PLATFORM = "x64"
  $env:CMAKE_GENERATOR_TOOLSET = "host=x64"
  Remove-Item Env:CMAKE_GENERATOR_INSTANCE -ErrorAction SilentlyContinue
  # Work around Windows path-length limits inside cmake try_compile and reduce PDB contention.
  $env:CMAKE_TRY_COMPILE_CONFIGURATION = "Release"
  $env:CMAKE_C_FLAGS_DEBUG = ""
  $env:CMAKE_CXX_FLAGS_DEBUG = ""
  $env:CMAKE_MSVC_DEBUG_INFORMATION_FORMAT = ""
  cargo build --release
  if ($LASTEXITCODE -ne 0) { throw "cargo build failed" }
} finally {
  Pop-Location
}

# Make runtime DLLs co-located with the exe (nice for fresh clones).
$exeDir = Split-Path -Parent $Exe
if (Test-Path $OrtDll) {
  Copy-Item -Force $OrtDll (Join-Path $exeDir "onnxruntime.dll")
}
if ($OpenBlasDll -and (Test-Path $OpenBlasDll)) {
  Copy-Item -Force $OpenBlasDll (Join-Path $exeDir "openblas.dll")
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
$env:Path = "$OrtDllDir;$env:Path"
$logDir = Join-Path $RepoRoot "screenpipe-logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stdoutLog = Join-Path $logDir "screenpipe.stdout.log"
$stderrLog = Join-Path $logDir "screenpipe.stderr.log"

# Start the HTTP API + recorder explicitly on Windows.
$args = @("record", "--port", "3030")
$proc = Start-Process -FilePath $Exe -ArgumentList $args -WorkingDirectory $Upstream -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
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
