# Upstream Screenpipe (local clone)

The Screenpipe engine lives under **`screenpipe/`** (gitignored).

## Fast path (automated)

From the **repo root**, in **PowerShell** (your machine — not the Cursor agent terminal):

```powershell
# First time only if you don't have Rust:
powershell -ExecutionPolicy Bypass -File scripts/setup-screenpipe.ps1 -InstallRust
# Close terminal, open a new one, then:

powershell -ExecutionPolicy Bypass -File scripts/setup-screenpipe.ps1 -RunProbe
```

- **`-InstallRust`** uses `winget` to install `Rustlang.Rustup`. After the first install, **restart the terminal** so `cargo` is on `PATH`.
- **`-RunProbe`** builds `vendor/screenpipe`, starts the server briefly, hits `/health`, and runs `screenpipe-probe.js`.

### MSVC linker required (`link.exe`)

If `cargo build` fails with **`linker link.exe not found`**, install **Visual Studio Build Tools** with the **C++ / MSVC** workload (VS Code is not enough):

```powershell
# Automated (large download; may need admin):
powershell -ExecutionPolicy Bypass -File scripts/setup-screenpipe.ps1 -InstallMsvc
```

Or install manually: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) → enable **Desktop development with C++** (or MSVC v143 x64/x86 build tools). **Restart the terminal** after install, then run `setup-screenpipe.ps1` again.

Further deps (LLVM, CMake, etc.) may be required for Screenpipe itself; see upstream [CONTRIBUTING.md — Windows](https://github.com/screenpipe/screenpipe/blob/main/CONTRIBUTING.md).

## Manual clone

```powershell
git clone --depth 1 https://github.com/screenpipe/screenpipe.git vendor/screenpipe
```

## Manual build / run

```powershell
cd vendor/screenpipe
cargo build --release
.\target\release\screenpipe.exe
```

Or from repo root: `powershell -ExecutionPolicy Bypass -File scripts/run-vendor-screenpipe.ps1`

## Validate (with server running)

```powershell
curl.exe http://127.0.0.1:3030/health
node screenpipe/screenpipe-probe.js --minutes 5 --base-url http://127.0.0.1:3030
```
