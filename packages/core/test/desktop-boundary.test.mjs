import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const desktopSrc = path.join(repoRoot, 'apps/desktop/src');

function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (/\.(js|mjs|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('desktop UI source never imports @career-loop/core or node builtins', () => {
  const files = walkJs(desktopSrc);
  assert.ok(files.length > 0, 'expected desktop UI source files');
  const forbidden =
    /(?:from|import)\s+['"]@career-loop\/core(?:\/[^'"]*)?['"]|(?:from|import)\s+['"]node:(?:fs|crypto|child_process|os|path|url)['"]|(?:from|import)\s+['"](?:fs|crypto|child_process)['"]/;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(forbidden.test(text), false, `${path.relative(repoRoot, file)} imports Node core`);
  }
});
