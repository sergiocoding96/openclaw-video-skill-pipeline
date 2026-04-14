# Screenpipe on Windows (Phase 1)

The engine and UI are **open source (MIT)** at [github.com/screenpipe/screenpipe](https://github.com/screenpipe/screenpipe). You do **not** need the commercial onboarding page to run Screenpipe—you can **build from source** (or install published CLI via npm, see below).

**Clone location in this repo:** put the upstream tree at **`vendor/screenpipe/`** (gitignored). See **`vendor/README.md`**, **`scripts/setup-screenpipe.ps1`** (clone + optional Rust / MSVC install + build + optional probe), and **`scripts/run-vendor-screenpipe.ps1`** (run the built `screenpipe.exe`).

If **`cargo`** reports **`link.exe` not found**, install **Visual C++ Build Tools** (MSVC). The script can trigger a winget install: **`-InstallMsvc`** — see **`vendor/README.md`**.

## Option A — Build from source (recommended if you want full OSS control)

Follow the **Windows** section of upstream [CONTRIBUTING.md](https://github.com/screenpipe/screenpipe/blob/main/CONTRIBUTING.md) (same steps, abbreviated here):

1. **Prerequisites:** `winget` available ([install winget](https://winget.pro/winget-install-powershell/) if needed).
2. **Install toolchain** (PowerShell; some steps may need admin once):

   ```powershell
   winget install -e --id Microsoft.VisualStudio.2022.BuildTools
   winget install -e --id Rustlang.Rustup
   winget install -e --id LLVM.LLVM
   winget install -e --id Kitware.CMake
   winget install -e --id GnuWin32.UnZip
   winget install -e --id Git.Git
   winget install -e --id JernejSimoncic.Wget
   winget install -e --id 7zip.7zip
   irm https://bun.sh/install.ps1 | iex
   ```

3. **Environment variables** (then **open a new terminal**):

   ```powershell
   [System.Environment]::SetEnvironmentVariable('LIBCLANG_PATH', 'C:\Program Files\LLVM\bin', 'User')
   [System.Environment]::SetEnvironmentVariable('PATH', "$([System.Environment]::GetEnvironmentVariable('PATH', 'User'));C:\Program Files (x86)\GnuWin32\bin", 'User')
   ```

4. **Clone and build the Rust engine:**

   ```powershell
   git clone https://github.com/screenpipe/screenpipe.git
   cd screenpipe
   cargo build --release
   ```

5. **Run the engine** (starts the local API, default port **3030**):

   ```powershell
   .\target\release\screenpipe.exe
   ```

   To avoid clashing with another install:  
   `.\target\release\screenpipe.exe --port 3035 --data-dir $env:TEMP\screenpipe-dev`  
   (then point `SCREENPIPE_URL` / `--base-url` at that port).

6. **Optional — build the desktop shell (Tauri)** after the engine builds:

   ```powershell
   cd apps\screenpipe-app-tauri
   bun install
   bun tauri build
   ```

7. **Verify the API**, then run this repo’s probe:

   ```powershell
   curl.exe http://127.0.0.1:3030/health
   node screenpipe/screenpipe-probe.js --minutes 5 --base-url http://127.0.0.1:3030
   ```

**Data:** by default, upstream uses `%APPDATA%\screenpipe\` (see upstream docs).

---

## Option B — Prebuilt binaries without the onboarding store

Check **[GitHub Releases](https://github.com/screenpipe/screenpipe/releases)** for Windows assets (e.g. app installers or bundles). Those are **not** the same as “buy from onboarding,” but availability and naming change per release—read the release notes.

---

## Option C — `npx screenpipe@latest record` (quick try; often rough on Windows)

Upstream documents `npx screenpipe@latest record` for a fast CLI path. On Windows you may hit:

- **`npm install -g screenpipe`** failing (`postinstall.sh` expects `sh`).
- **`npm warn cleanup ... EPERM`** under `%LOCALAPPDATA%\npm-cache\_npx\` (locked files / AV).

If npx is painful, prefer **Option A** or **B**.

---

## If you still see EPERM with npx

- Close other terminals and delete the stuck folder under `%LOCALAPPDATA%\npm-cache\_npx\` when nothing is using it.
- Exclude `%LOCALAPPDATA%\npm-cache` from real-time AV if cleanup always fails.

---

## Commercial installer (optional)

The [onboarding / store](https://screenpi.pe/onboarding) link is a **packaged desktop app** distribution—not required to use the **MIT-licensed** code in the GitHub repo.
