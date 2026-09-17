# 🐞 Debug Information

Since Fredy **22.5.0** there is a built-in way to capture everything Fredy logs into the database for
a limited time and download it as a single zip file. This is the recommended way to attach
diagnostics to a bug report. Logs are not bundled automatically, for privacy reasons.

## How it works

- Debug logging is **opt-in** and admin-only. As long as it is off, Fredy behaves exactly as before
  (console output only, nothing in the DB).
- When you turn it on, every log line (`debug`, `info`, `warn`, `error`) is additionally written into
  the `debug_logs` SQLite table. The console keeps logging at its usual level.
- The recorded data is hard-capped at **5 MiB** via a rolling buffer: once the cap is hit, the oldest
  entries are dropped automatically so the newest ones always survive.
- The on/off flag is persisted, so debug logging stays on across restarts (and you will see the
  warning banner everywhere until you turn it off again).

## Capturing a debug bundle

1. Open Fredy as an **admin** and go to **Administration → Debug**.
2. Click **"Enable debug logging"**. A red banner appears on every page while recording is on.
3. **Reproduce the bug.**
4. Come back to **Administration → Debug** and check the progress bar; if it stayed at 0 %, nothing
   was captured.
5. Click **"Download debug information"**. You get a zip named
   `YYYY-MM-DD-FredyDebug-<version>.zip` containing two files:
   - `logs.txt` - every log line captured while recording was on, prefixed with timestamp and level.
   - `sys.txt` - runtime snapshot (Fredy version, Node.js version, OS, Docker detection, CPU, memory,
     sanitized settings). Proxy credentials and session secrets are **stripped** before export.
6. Attach the zip to the bug report.
7. Optional but recommended: click **"Disable debug logging"** to stop recording, and **"Delete
   stored debug logs"** once you have sent the zip so the DB does not keep them around.

## What is *not* included

- passwords and privacy relevant things
- anything Fredy itself does not pass through its `logger`. If a third-party library writes directly
  to `process.stderr`, that output stays on the console only.
