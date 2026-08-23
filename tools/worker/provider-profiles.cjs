#!/usr/bin/env node
'use strict';

const PROFILES = Object.freeze({
  // Generative providers have enough context/output capacity for a DAMN
  // Lib-sized request. Large batches conserve request quotas; incomplete
  // responses remain resumable from the last completed checkpoint.
  gemini: Object.freeze({ maxItems: 1600, maxChars: 64000 }),
  openai: Object.freeze({ maxItems: 1600, maxChars: 64000 }),
  deepseek: Object.freeze({ maxItems: 1600, maxChars: 64000 }),
  claude: Object.freeze({ maxItems: 1600, maxChars: 64000 }),
  // DeepL permits request bodies up to 128 KiB. Keep substantial headroom for
  // JSON framing, escaping, and request options.
  deepl: Object.freeze({ maxItems: 1600, maxChars: 64000 }),
  // Unknown OpenAI-compatible endpoints can have much smaller context/output
  // windows, so enlarge the fallback without assuming frontier-model limits.
  'openai-compatible': Object.freeze({ maxItems: 400, maxChars: 16000 }),
  // Yandex Translate caps the combined source strings at 10,000 characters.
  yandex: Object.freeze({ maxItems: 1600, maxChars: 10000 })
});

function providerBatchProfile(provider) { return PROFILES[provider] || PROFILES['openai-compatible']; }
function recordChars(record) { return Array.from(record.source || '').length; }
function requestBatches(records, provider) {
  const { maxItems, maxChars } = providerBatchProfile(provider);
  const batches = []; let batch = []; let chars = 0;
  for (const record of records) {
    const length = recordChars(record);
    // Combine queued mods for every provider. Record IDs retain mod ownership,
    // so checkpoints and generated output remain correctly partitioned even
    // when one provider request covers several mods.
    if (batch.length && (batch.length >= maxItems || chars + length > maxChars)) {
      batches.push(batch); batch = []; chars = 0;
    }
    batch.push(record); chars += length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function configuredCost(records, provider, estimate = {}) {
  const sourceChars = records.reduce((total, record) => total + recordChars(record), 0);
  const requestCount = requestBatches(records, provider).length;
  const inputTokens = Math.ceil(sourceChars / 4);
  const outputTokens = Math.ceil(inputTokens * Number(estimate.outputTokenMultiplier || 1));
  const characterRate = Number(estimate.usdPerMillionCharacters);
  const inputRate = Number(estimate.usdPerMillionInputTokens);
  const outputRate = Number(estimate.usdPerMillionOutputTokens);
  let estimatedCostUsd = null;
  if (estimate.enabled === true && Number.isFinite(characterRate) && characterRate >= 0) estimatedCostUsd = sourceChars / 1e6 * characterRate;
  else if (estimate.enabled === true && Number.isFinite(inputRate) && inputRate >= 0 && Number.isFinite(outputRate) && outputRate >= 0) estimatedCostUsd = inputTokens / 1e6 * inputRate + outputTokens / 1e6 * outputRate;
  if (estimatedCostUsd !== null) estimatedCostUsd = Number(estimatedCostUsd.toFixed(8));
  return { sourceChars, requestCount, inputTokens, outputTokens, estimatedCostUsd };
}

module.exports = { PROFILES, providerBatchProfile, requestBatches, recordChars, configuredCost };
