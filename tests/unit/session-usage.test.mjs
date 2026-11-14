// T2: authored usage windows; no model, provider, server or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {tripSessionLimitReached} from '../../agent/lib/usage-limits.ts';

const usage = (window) => ({window: {inputTokens: 0, outputTokens: 0, costUsd: 0, ...window}});
test('input budget stops at 30000, including cached input', () => {
  assert.equal(tripSessionLimitReached(usage({inputTokens: 29999})), false);
  assert.equal(tripSessionLimitReached(usage({inputTokens: 30000, cacheReadTokens: 30000})), true);
});
test('output budget stops at 5000', () => {
  assert.equal(tripSessionLimitReached(usage({outputTokens: 4999})), false);
  assert.equal(tripSessionLimitReached(usage({outputTokens: 5000})), true);
});
test('reported token cost stops at 25 cents', () => {
  assert.equal(tripSessionLimitReached(usage({costUsd: 0.2499})), false);
  assert.equal(tripSessionLimitReached(usage({costUsd: 0.25})), true);
});
test('unknown reported cost does not fabricate a charge or erase token limits', () => {
  assert.equal(tripSessionLimitReached(usage({costUsd: undefined})), false);
  assert.equal(tripSessionLimitReached(usage({costUsd: undefined, outputTokens: 5000})), true);
});
test('an approved continuation uses its new window rather than lifetime totals', () => {
  assert.equal(tripSessionLimitReached({...usage({inputTokens: 10}), total: {inputTokens: 90000, outputTokens: 15000, costUsd: 0.75}}), false);
});
