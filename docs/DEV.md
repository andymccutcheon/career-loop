# Developer notes

## Local run

```bash
npm install
cd apps/desktop
npm run tauri dev
```

## Build

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
