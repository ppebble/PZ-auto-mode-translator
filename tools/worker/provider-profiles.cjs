#!/usr/bin/env node
'use strict';

const PROFILES = Object.freeze({
  // Gemini free-tier translation jobs commonly exhaust RPD long before RPM or
  // TPM.  A 16k-character response remains comfortably below its context
  // window while halving request pressure for a mod split only by the old
  // 100-item cap.
  gemini: Object.freeze({ maxItems: 200, maxChars: 16000 }),
  deepl: Object.freeze({ maxItems: 100, maxChars: 10000 }),
  openai: Object.freeze({ maxItems: 100, maxChars: 8000 }),
  deepseek: Object.freeze({ maxItems: 100, maxChars: 8000 }),
  claude: Object.freeze({ maxItems: 50, maxChars: 6000 }),
  'openai-compatible': Object.freeze({ maxItems: 20, maxChars: 3000 }),
  yandex: Object.freeze({ maxItems: 100, maxChars: 8000 })
});

function providerBatchProfile(provider) { return PROFILES[provider] || PROFILES['openai-compatible']; }
function recordChars(record) { return Array.from(record.source || '').length; }
function requestBatches(records, provider) {
  const { maxItems, maxChars } = providerBatchProfile(provider);
  const batches = []; let batch = []; let chars = 0;
  for (const record of records) {
    const length = recordChars(record);
    // Never combine mods: progress, pause, and resume remain understandable.
    if (batch.length && (batch[0].modId !== record.modId || batch.length >= maxItems || chars + length > maxChars)) {
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
