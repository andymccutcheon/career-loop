import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bridge = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/bridge.mjs');

function runBridge(command, payload) {
  return spawnSync(process.execPath, [bridge, command], {
    input: JSON.stringify(payload ?? {}),
    encoding: 'utf8',
  });
}

test('bridge proposeFromAnswers returns a candidate-facing proposal', () => {
  const r = runBridge('proposeFromAnswers', {
    answers: {
      location: 'Boise, ID',
      remote: 'remote',
      seniority: 'senior',
      functions: 'product marketing',
      companies: '',
    },
  });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.source, 'answers');
  assert.match(out.plainLanguageSummary, /product marketing/i);
  assert.equal(/Resend|GitHub Actions|YAML|Cursor|Claude/i.test(out.plainLanguageSummary), false);
});

test('bridge confirmPortals keeps Remote on allow, never always_allow', () => {
  const proposed = runBridge('proposeFromAnswers', {
    answers: { location: 'Boise, ID', remote: 'remote', functions: 'design' },
  });
  assert.equal(proposed.status, 0, proposed.stderr);
  const proposal = JSON.parse(proposed.stdout);
  const confirmed = runBridge('confirmPortals', {
    proposal,
    edits: { fields: { functions: 'product design', location: 'Boise, ID' } },
  });
  assert.equal(confirmed.status, 0, confirmed.stderr);
  const portals = JSON.parse(confirmed.stdout);
  assert.ok(portals.location_filter.allow.includes('Remote'));
  assert.equal(portals.location_filter.always_allow, undefined);
  assert.ok(portals.title_filter.positive.includes('product design'));
});

test('bridge rejects unknown commands', () => {
  const r = runBridge('notACommand', {});
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown bridge command/);
});

test('bridge turnOnCareerLoop skipScan writes under a temp home', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'career-loop-'));
  const r = runBridge('turnOnCareerLoop', {
    answers: { location: 'Boise, ID', remote: 'remote', functions: 'product marketing' },
    home,
    skipScan: true,
    skipSchedule: true,
  });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.primary_action, 'Turn on Career Loop');
  assert.equal(out.scan.new_count, 0);
  assert.equal(out.digest.claimed_email_sent, false);
  assert.ok(String(out.data_root || '').includes('CareerLoop'));
});
