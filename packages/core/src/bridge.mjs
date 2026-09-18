#!/usr/bin/env node
/**
 * Node sidecar for the desktop shell.
 *
 * Rust (Tauri) invokes this process. The Vite/browser bundle must never
 * import this file or any other @career-loop/core module.
 *
 * Usage:
 *   node bridge.mjs <command>   # JSON payload on stdin
 *
 * Commands: proposeFromAnswers | proposeFromResume | confirmPortals | turnOnCareerLoop
 */
import { proposeFromAnswers, proposeFromResume, confirmPortals } from './onboarding.mjs';
import { turnOnCareerLoop } from './loop.mjs';

const COMMANDS = {
  proposeFromAnswers: (payload) => proposeFromAnswers(payload?.answers ?? payload ?? {}),
  proposeFromResume: (payload) => proposeFromResume(payload?.resumeText ?? payload?.resume_text ?? ''),
  confirmPortals: (payload) => confirmPortals(payload?.proposal, payload?.edits ?? true),
  turnOnCareerLoop: (payload) => turnOnCareerLoop(payload ?? {}),
};

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function main() {
  const command = process.argv[2];
  if (!command || command === '-h' || command === '--help') {
    process.stderr.write('Usage: node bridge.mjs <command> < payload.json\n');
    process.exit(command ? 0 : 2);
  }
  const handler = COMMANDS[command];
  if (!handler) {
    throw new Error(`unknown bridge command: ${command}`);
  }
  const payload = await readStdin();
  const result = await handler(payload);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
