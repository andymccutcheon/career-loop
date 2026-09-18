# Career Loop

Daily job matches on your Mac. Install the app, answer a few questions (or paste a resume), press **Turn on Career Loop**, and get a morning digest in a folder on your computer — plus a notification so you know it ran.

You never write YAML or config files.

## Install

Download the Mac app from the [v0.1.0 Release](https://github.com/andymccutcheon/career-loop/releases/tag/v0.1.0). This first build is **Apple silicon only** (M1 and later — `aarch64`). There is no Intel Mac download yet.

The app is **unsigned and not notarized**, so macOS Gatekeeper may warn on first launch. That is expected. Use **right-click → Open** (do not rely on Terminal).

1. Download the `.dmg` (`Career.Loop_0.1.0_aarch64.dmg`).
2. Open the disk image and drag **Career Loop** to Applications.
3. First launch: in Finder, **right-click Career Loop → Open**, then confirm Open.
4. Paste a resume **or** answer five short questions.
5. Confirm the search words and location.
6. Press **Turn on Career Loop**.

You do not need Terminal, Homebrew, or any cloud “API key” accounts for the default path.

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

Working on Career Loop from source? See [docs/DEV.md](docs/DEV.md).
