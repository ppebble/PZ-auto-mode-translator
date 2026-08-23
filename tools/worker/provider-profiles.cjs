#!/usr/bin/env node
'use strict';

// These limits are deliberately below documented request ceilings. They are
// fixed in the Helper rather than exposed as a game option: users should not
// have to tune provider quota math to translate a mod.
const PROFILES = Object.freeze({
  // Gemini quota varies by model/project tier. 8k source characters leaves a
  // large TPM margin even for conservative accounts; pacing handles RPM.
  gemini: Object.freeze({ maxItems: 100, maxChars: 8000 }),
  // DeepL accepts a 128 KiB request and multiple text values. This stays well
  // beneath that payload boundary while retaining useful request efficiency.
  deepl: Object.freeze({ maxItems: 100, maxChars: 10000 }),
  // OpenAI model limits depend on the account tier; 8k source characters is
  // comfortably below the documented Tier-1 TPM and model context limits.
  openai: Object.freeze({ maxItems: 100, maxChars: 8000 }),
  // DeepSeek exposes an OpenAI-compatible chat endpoint. Keep the same small
  // source payload and disable thinking in the adapter to avoid translation
  // output consuming a reasoning budget.
  deepseek: Object.freeze({ maxItems: 100, maxChars: 8000 }),
  // Claude's Messages API requires an explicit output-token cap. A smaller
  // 6k-character batch leaves headroom for both JSON ids and translated text.
  claude: Object.freeze({ maxItems: 50, maxChars: 6000 }),
  // A custom OpenAI-compatible endpoint has no reliable common quota contract.
  'openai-compatible': Object.freeze({ maxItems: 20, maxChars: 3000 }),
  // Yandex Translate permits at most 10,000 characters in texts per request.
  // Reserve 20% for provider-side accounting and request metadata.
  yandex: Object.freeze({ maxItems: 100, maxChars: 8000 })
});

function providerBatchProfile(provider) {
  return PROFILES[provider] || PROFILES['openai-compatible'];
}

function recordChars(record) { return Array.from(record.source || '').length; }

function requestBatches(records, provider) {
  const { maxItems, maxChars } = providerBatchProfile(provider);
  const batches = []; let batch = []; let chars = 0;
  for (const record of records) {
    const length = recordChars(record);
    // Never combine mods: this keeps progress, pause, and resume reporting
    // clear to the player.
    if (batch.length && (batch[0].modId !== record.modId || batch.length >= maxItems || chars + length > maxChars)) {
      batches.push(batch); batch = []; chars = 0;
    }
    batch.push(record); chars += length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

module.exports = { PROFILES, providerBatchProfile, requestBatches, recordChars };
