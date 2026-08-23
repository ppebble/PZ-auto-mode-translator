#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { PROFILES, providerBatchProfile, requestBatches, configuredCost } = require('../tools/worker/provider-profiles.cjs');
assert.deepEqual(providerBatchProfile('gemini'), { maxItems: 200, maxChars: 16000 });
assert.deepEqual(providerBatchProfile('deepl'), { maxItems: 100, maxChars: 10000 });
assert.deepEqual(providerBatchProfile('openai'), { maxItems: 100, maxChars: 8000 });
assert.deepEqual(providerBatchProfile('deepseek'), { maxItems: 100, maxChars: 8000 });
assert.deepEqual(providerBatchProfile('claude'), { maxItems: 50, maxChars: 6000 });
assert.deepEqual(providerBatchProfile('yandex'), { maxItems: 100, maxChars: 8000 });
assert.deepEqual(providerBatchProfile('unknown'), PROFILES['openai-compatible']);
const records = [
  { modId: 'one', source: 'a'.repeat(7999) }, { modId: 'one', source: 'b'.repeat(2) }, { modId: 'two', source: 'c' }
];
assert.deepEqual(requestBatches(records, 'gemini').map(batch => batch.length), [3]);
assert.deepEqual(requestBatches(records, 'deepl').map(batch => batch.length), [2, 1]);
assert.deepEqual(requestBatches(records, 'yandex').map(batch => batch.length), [1, 1, 1]);
assert.deepEqual(configuredCost([{ modId: 'one', source: 'abcd' }], 'gemini', { enabled: true, usdPerMillionInputTokens: 1, usdPerMillionOutputTokens: 2 }), { sourceChars: 4, requestCount: 1, inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0.000003 });
assert.deepEqual(configuredCost([{ modId: 'one', source: 'abcd' }], 'deepl', { enabled: true, usdPerMillionCharacters: 25 }), { sourceChars: 4, requestCount: 1, inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0.0001 });
console.log('provider profiles test passed');
