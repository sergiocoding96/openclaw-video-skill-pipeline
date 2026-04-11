# Screenpipe on Windows (Phase 1)

## What does not work here

- **`npm install -g screenpipe`** — the package runs a Unix `postinstall.sh` (`sh` is not available on stock Windows CMD).
- **`npx screenpipe@latest record`** — often hits **`npm warn cleanup ... EPERM`** while npm tries to delete the npx cache (files locked by another process or AV). Official docs also note the **npx CLI path is not the recommended install** anymore.

## What to use instead (recommended)

1. Download the **Screenpipe desktop app** for Windows: [screenpi.pe/onboarding](https://screenpi.pe/onboarding) (`.exe` installer).
2. Install, allow **firewall** access when prompted (needed for `localhost:3030`).
3. Launch Screenpipe from the Start menu; use the **system tray** → **Start recording**.
4. Verify the API:

   ```powershell
   curl.exe http://127.0.0.1:3030/health
   ```

5. Run this repo’s probe (use **cmd** or direct `node` if PowerShell strips `--minutes`):

   ```powershell
   node screenpipe/screenpipe-probe.js --minutes 5 --base-url http://127.0.0.1:3030
   ```

## If you still see EPERM with npx

- Close other terminals and **retry** after deleting  
  `%LOCALAPPDATA%\npm-cache\_npx\e158bcd0e578b626`  
  (only when no `node`/`npm` is using it).
- Exclude `%LOCALAPPDATA%\npm-cache` from real-time AV scanning if cleanup always fails.

Data directory (app): `%APPDATA%\screenpipe\`.
