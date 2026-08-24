#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { PROFILES, providerBatchProfile, requestBatches, configuredCost } = require('../tools/worker/provider-profiles.cjs');
assert.deepEqual(providerBatchProfile('gemini'), { maxItems: 1600, maxChars: 64000 });
assert.deepEqual(providerBatchProfile('deepl'), { maxItems: 1600, maxChars: 64000 });
assert.deepEqual(providerBatchProfile('openai'), { maxItems: 1600, maxChars: 64000 });
assert.deepEqual(providerBatchProfile('deepseek'), { maxItems: 1600, maxChars: 64000 });
assert.deepEqual(providerBatchProfile('claude'), { maxItems: 1600, maxChars: 64000 });
assert.deepEqual(providerBatchProfile('yandex'), { maxItems: 1600, maxChars: 10000 });
assert.deepEqual(providerBatchProfile('unknown'), { maxItems: 400, maxChars: 16000 });
const records = [
  { modId: 'one', source: 'a'.repeat(7999) }, { modId: 'one', source: 'b'.repeat(2) }, { modId: 'two', source: 'c' }
];
assert.deepEqual(requestBatches(records, 'gemini').map(batch => batch.length), [3]);
assert.deepEqual(requestBatches(Array.from({ length: 1601 }, (_, index) => ({ modId: index % 2 ? 'one' : 'two', source: 'short' })), 'gemini').map(batch => batch.length), [1600, 1]);
const damnLibSizedRecords = Array.from({ length: 1428 }, (_, index) => ({ modId: 'damnlib', source: 'x'.repeat(index === 0 ? 612 : 27) }));
assert.equal(damnLibSizedRecords.reduce((total, record) => total + record.source.length, 0), 39141);
assert.deepEqual(requestBatches(damnLibSizedRecords, 'gemini').map(batch => batch.length), [1428]);
assert.equal(requestBatches(damnLibSizedRecords, 'openai').length, 1);
assert.equal(requestBatches(damnLibSizedRecords, 'deepseek').length, 1);
assert.equal(requestBatches(damnLibSizedRecords, 'claude').length, 1);
assert.equal(requestBatches(damnLibSizedRecords, 'deepl').length, 1);
assert.equal(requestBatches(damnLibSizedRecords, 'yandex').length, 4);
assert.equal(requestBatches(damnLibSizedRecords, 'unknown').length, 4);
assert.deepEqual(requestBatches(records, 'deepl').map(batch => batch.length), [3]);
assert.deepEqual(requestBatches(records, 'yandex').map(batch => batch.length), [3]);
for (const provider of ['gemini', 'openai', 'deepseek', 'claude', 'deepl', 'yandex', 'unknown']) {
  const mixedMods = Array.from({ length: 300 }, (_, index) => ({ modId: 'mod-' + index, source: 'short text' }));
  assert.equal(requestBatches(mixedMods, provider).length, 1, provider + ' should combine small queued mods');
}
assert.deepEqual(configuredCost([{ modId: 'one', source: 'abcd' }], 'gemini', { enabled: true, usdPerMillionInputTokens: 1, usdPerMillionOutputTokens: 2 }), { sourceChars: 4, requestCount: 1, inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0.000003 });
assert.deepEqual(configuredCost([{ modId: 'one', source: 'abcd' }], 'deepl', { enabled: true, usdPerMillionCharacters: 25 }), { sourceChars: 4, requestCount: 1, inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0.0001 });
console.log('provider profiles test passed');
