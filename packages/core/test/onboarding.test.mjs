import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proposeFromAnswers,
  confirmPortals,
  sanitizeLocationFilter,
} from '../src/onboarding.mjs';

test('Remote lands in allow, not always_allow', () => {
  const proposal = proposeFromAnswers({
    location: 'Boise, ID',
    remote: 'remote',
    seniority: 'senior',
    functions: 'product marketing',
    companies: '',
  });
  const portals = confirmPortals(proposal);
  assert.ok(portals.location_filter.allow.includes('Remote'));
  assert.equal(portals.location_filter.always_allow, undefined);
});

test('US / USA / United States / North America never in allow', () => {
  const proposal = proposeFromAnswers({
    location: 'United States',
    remote: 'remote',
    functions: 'engineering',
  });
  const portals = confirmPortals(proposal);
  for (const token of portals.location_filter.allow || []) {
    assert.equal(/^(us|usa|united states|north america)$/i.test(token), false, token);
  }
});

test('sanitize strips compound US Remote and restores bare Remote', () => {
  const cleaned = sanitizeLocationFilter({
    allow: ['US Remote', 'United States Remote', 'Remote'],
    always_allow: ['Remote'],
  }, { remote: 'remote' });
  assert.ok(cleaned.allow.includes('Remote'));
  assert.equal(cleaned.always_allow, undefined);
  assert.equal(cleaned.allow.some((t) => /us|united states/i.test(t) && /remote/i.test(t)), false);
});
