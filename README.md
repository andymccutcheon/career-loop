# Career Loop

Daily job matches on your Mac. Install the app, answer a few questions (or paste a resume), press **Turn on Career Loop**, and get a morning digest in a folder on your computer — plus a notification so you know it ran.

## Install (when a release build exists)

1. Download the Mac app from Releases.
2. Open it (allow it in System Settings if macOS asks).
3. Paste a resume **or** answer five short questions.
4. Confirm the search words and location.
5. Press **Turn on Career Loop**.

You do not need Terminal, Homebrew, or any cloud “API key” accounts for the default path.

## Run from source (developers)

```bash
cd apps/desktop
npm install
npm run tauri dev
```

Release build:

```bash
cd apps/desktop
npm run tauri build
```

Requires Node 20+, Rust (rustup), and macOS for a real `.app` bundle. Linux can still run the UI shell for development.

## Where your data lives

On macOS, Career Loop stores digests, logs, and state under:

`~/Library/Application Support/CareerLoop/`

Never under Documents, Desktop, or iCloud Drive.

## What “Turn on Career Loop” does

1. Saves your confirmed search settings.
2. Runs a first scan against public job boards.
3. Writes today’s digest (HTML + Markdown) under `digests/`.
4. Shows an OS notification (even on an empty day).
5. Registers a daily wake-safe schedule from Application Support (you never copy a plist by hand).

## License

MIT — see `LICENSE`.
