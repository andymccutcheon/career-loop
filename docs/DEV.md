# Developer notes

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
