import { defineConfig } from 'vite';

// Desktop UI must stay browser-only. Do not alias or bundle @career-loop/core —
// Node scan/onboarding/digest/schedule run via Tauri → node packages/core/src/bridge.mjs.

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'esnext',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
