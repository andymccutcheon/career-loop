import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { appSupportRoot, ensureDataPlane } from '../src/paths.mjs';

test('app support never uses Documents', () => {
  const root = appSupportRoot('/Users/demo');
  assert.equal(root.includes('Documents'), false);
  assert.equal(root.includes('Desktop'), false);
  if (process.platform === 'darwin' || true) {
    // path helper always returns Application Support style for darwin;
    // when running on Linux helper uses XDG — still not Documents.
    assert.equal(/Documents|Desktop|iCloud/i.test(root), false);
  }
});

test('ensureDataPlane creates digests under support root', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-paths-'));
  const { root, digests } = ensureDataPlane(tmp);
  assert.ok(fs.existsSync(digests));
  assert.ok(digests.startsWith(root));
});
