# Developer notes

## Unsigned Mac install (power users)

The published v0.1.0 app is unsigned and not notarized. The stranger / first-launch path is **right-click → Open** in Finder — that belongs in README and Release notes, not a Terminal command.

If you already double-clicked and macOS blocked the app, you can clear the quarantine flag after install:

```bash
xattr -dr com.apple.quarantine "/Applications/Career Loop.app"
```

Then open the app normally. A `.zip` build (`Career-Loop-0.1.0-macos-aarch64.zip`) is also on the [v0.1.0 Release](https://github.com/andymccutcheon/career-loop/releases/tag/v0.1.0) if you prefer not to use the `.dmg`.

## Run from source

Requires Node 20+, Rust (`rustup`), and macOS for a real `.app` bundle. Linux can still run the UI shell for development.

```bash
npm install
cd apps/desktop
npm run tauri dev
```

## Release build

```bash
cd apps/desktop
npm run tauri build
```

macOS needs Xcode CLT + Rust (`rustup`). Linux needs webkit2gtk / pkg-config (see Tauri docs).

## UI / Node boundary

`apps/desktop/src` is browser-only. It must not import `@career-loop/core` (or `node:fs` / `node:crypto` / `node:child_process`). The UI talks to Tauri `invoke` commands; Rust shells out to `packages/core/src/bridge.mjs`. Plain `vite` / `vite preview` uses local stub responses so the form still works.

## Core only (no GUI)

```bash
node --input-type=module -e "
import { turnOnCareerLoop } from './packages/core/src/loop.mjs';
const r = await turnOnCareerLoop({
  answers: { location: 'Boise, ID', remote: 'remote', functions: 'product marketing' },
  skipSchedule: true,
  scheduleDryRun: true,
});
console.log(JSON.stringify(r, null, 2));
"
```

Data lands under OS app-support (`CareerLoop/`), never Documents.
