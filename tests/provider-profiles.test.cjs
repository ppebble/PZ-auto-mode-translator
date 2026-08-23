#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { PROFILES, providerBatchProfile, requestBatches } = require('../tools/worker/provider-profiles.cjs');

assert.deepEqual(providerBatchProfile('gemini'), { maxItems: 100, maxChars: 8000 });
assert.deepEqual(providerBatchProfile('deepl'), { maxItems: 100, maxChars: 10000 });
assert.deepEqual(providerBatchProfile('openai'), { maxItems: 100, maxChars: 8000 });
assert.deepEqual(providerBatchProfile('deepseek'), { maxItems: 100, maxChars: 8000 });
assert.deepEqual(providerBatchProfile('claude'), { maxItems: 50, maxChars: 6000 });
assert.deepEqual(providerBatchProfile('yandex'), { maxItems: 100, maxChars: 8000 });
assert.deepEqual(providerBatchProfile('unknown'), PROFILES['openai-compatible']);

const records = [
  { modId: 'A', source: 'a'.repeat(5000) }, { modId: 'A', source: 'b'.repeat(4000) },
  { modId: 'B', source: 'c'.repeat(1) }
];
assert.deepEqual(requestBatches(records, 'gemini').map(batch => batch.length), [1, 1, 1]);
assert.deepEqual(requestBatches(records, 'deepl').map(batch => batch.length), [2, 1]);
assert.deepEqual(requestBatches(records, 'yandex').map(batch => batch.length), [1, 1, 1]);
console.log('provider profiles test passed');
