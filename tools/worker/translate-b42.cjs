#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { requestBatches, configuredCost } = require('./provider-profiles.cjs');
const { unchangedNeedsTranslation, normalizeKnownTranslation } = require('./translation-quality.cjs');
const { loadUserRules, mergeUserRules } = require('./local-controls.cjs');

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
function validatedMemory(file, targetLanguage) {
  if (!file || !fs.existsSync(file)) return new Map();
  try {
    const value = readJson(file);
    if (value.schema !== 'pzat-translation-v1' || value.targetLanguage !== targetLanguage || !Array.isArray(value.records)) return new Map();
    return new Map(value.records.filter(record => record.status === 'validated' && typeof record.target === 'string' && record.target.trim() !== '')
      .map(record => [record.id, { id: record.id, status: 'validated', target: record.target }]));
  } catch { return new Map(); }
}
function updateTranslationMemory(file, targetLanguage, records) {
  if (!file) return;
  const memory = validatedMemory(file, targetLanguage);
  for (const record of records) {
    if (record.status === 'validated' && typeof record.target === 'string' && record.target.trim() !== '') memory.set(record.id, { id: record.id, status: 'validated', target: record.target });
    else if (record.id) memory.delete(record.id);
  }
  writeJson(file, { schema: 'pzat-translation-v1', generatedAt: new Date().toISOString(), targetLanguage, records: [...memory.values()] });
}
function writeStatus(file, values) {
  if (!file) return;
  const ordered = ['state', 'phase', 'message', 'total', 'completed', 'reused', 'failed', 'retries', 'currentMod', 'batchIndex', 'batchCount', 'waitSeconds', 'estimatedWaitSeconds', 'errorCode', 'apiCharacters', 'requestCount', 'estimatedInputTokens', 'estimatedOutputTokens', 'estimatedCostUsd'];
  const lines = ordered.filter(key => values[key] !== undefined && values[key] !== null)
    .map(key => key + '=' + String(values[key]).replace(/[\r\n]/g, ' '));
  lines.push('updatedAt=' + new Date().toISOString());
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}
const languageMap = {
  KO: { name: 'Korean', providerCode: 'KO', yandexCode: 'ko' }, JP: { name: 'Japanese', providerCode: 'JA', yandexCode: 'ja' },
  CN: { name: 'Chinese (Simplified)', providerCode: 'ZH', yandexCode: 'zh' }, CH: { name: 'Chinese (Traditional)', providerCode: 'ZH', yandexCode: 'zh' },
  ES: { name: 'Spanish', providerCode: 'ES', yandexCode: 'es' }, FR: { name: 'French', providerCode: 'FR', yandexCode: 'fr' }, DE: { name: 'German', providerCode: 'DE', yandexCode: 'de' },
  IT: { name: 'Italian', providerCode: 'IT', yandexCode: 'it' }, PTBR: { name: 'Portuguese (Brazil)', providerCode: 'PT-BR', yandexCode: 'pt' }, PL: { name: 'Polish', providerCode: 'PL', yandexCode: 'pl' },
  RU: { name: 'Russian', providerCode: 'RU', yandexCode: 'ru' }, TR: { name: 'Turkish', providerCode: 'TR', yandexCode: 'tr' }
};
function targetLanguageInfo(code) { const info = languageMap[code]; if (!info) throw new Error('Unsupported Project Zomboid target language code: ' + code); return info; }
function compactBatch(batch) { return batch.map((record, index) => ({ i: String(index), t: record.source, k: record.category + '/' + record.key })); }
function expandCompactMap(value, batch) {
  const compact = value && (value.translations || value); const result = {};
  const save = (index, translated) => {
    const text = typeof translated === 'string' ? translated : translated && (translated.text || translated.translation || translated.target || translated.t);
    if (Number.isInteger(Number(index)) && Number(index) >= 0 && Number(index) < batch.length && typeof text === 'string') result[batch[Number(index)].id] = text;
  };
  if (Array.isArray(compact)) {
    for (const entry of compact) if (entry && typeof entry === 'object') save(entry.i ?? entry.id ?? entry.index, entry);
  } else if (compact && typeof compact === 'object') {
    for (const [index, translated] of Object.entries(compact)) save(index, translated);
  }
  return result;
}
function tokens(value) { return (value.match(/%\d+|\{\d+\}|<[^>]+>|\\n/g) || []).sort(); }
function validate(source, target, record = {}) {
  if (tokens(source).join('\u0000') !== tokens(target).join('\u0000')) return 'placeholder mismatch';
  // Newlines are valid UI text; other control characters make the JSON pack unsafe.
  if (/\p{Cc}/u.test(target.replace(/[\n\r\t]/g, ''))) return 'control character';
  if (unchangedNeedsTranslation({ ...record, source }, target)) return 'provider returned untranslated source text';
  return null;
}
function applyRules(source, record, rules) {
  let value = source; const applied = []; const tags = new Set();
  const scoped = rule => {
    const s = rule.scope || {};
    return (!s.modId || s.modId === record.modId)
      && (!s.category || s.category === record.category)
      && (!s.targetLanguage || s.targetLanguage === rules.targetLanguage);
  };
  for (const rule of [...(rules.rules || [])].filter(x => x.enabled && scoped(x)).sort((a,b) => (b.priority || 0) - (a.priority || 0))) {
    const requiredAll = Array.isArray(rule.requiresAllTags) ? rule.requiresAllTags : [];
    const requiredAny = Array.isArray(rule.requiresAnyTags) ? rule.requiresAnyTags : [];
    if (requiredAll.some(tag => !tags.has(tag))) continue;
    if (requiredAny.length && !requiredAny.some(tag => tags.has(tag))) continue;
    if (rule.kind === 'exact' && value === rule.pattern) { value = rule.replacement; applied.push(rule.id); for (const tag of rule.tags || []) tags.add(tag); }
    if (rule.kind === 'glossary' && value.includes(rule.pattern)) { value = value.split(rule.pattern).join(rule.replacement); applied.push(rule.id); for (const tag of rule.tags || []) tags.add(tag); }
    if (rule.kind === 'regex') {
      try { const next = value.replace(new RegExp(rule.pattern, rule.flags || 'g'), rule.replacement); if (next !== value) { value = next; applied.push(rule.id); for (const tag of rule.tags || []) tags.add(tag); } } catch {}
    }
  }
  for (const [sourceTerm, targetTerm] of Object.entries(rules.glossary || {})) {
    if (value.includes(sourceTerm)) { value = value.split(sourceTerm).join(targetTerm); applied.push('glossary:' + sourceTerm); }
  }
  return { value, applied, tags: [...tags] };
}
function dryTranslate(source, rules) { return '[DRY-RUN ' + rules.targetLanguage + '] ' + source; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function pauseRequested(file) { return Boolean(file && fs.existsSync(file)); }
async function waitWithPause(ms, pauseFile, onPause) {
  let remaining = ms;
  while (remaining > 0) { if (pauseRequested(pauseFile)) { onPause(); throw new Error('Translation paused by user. Completed batches were saved.'); } const step = Math.min(1000, remaining); await sleep(step); remaining -= step; }
}
function pacingSettings(provider) {
  // A background game session can tolerate a conservative pace. Keeping every
  // request over one minute apart avoids common per-minute account limits.
  const defaultInterval = 70000;
  return { intervalMs: defaultInterval, modPauseMs: defaultInterval };
}
function batchProgressLabel(batch) {
  const mods = [...new Set((batch || []).map(record => record.modId).filter(Boolean))];
  if (mods.length <= 1) return mods[0] || '';
  return `${mods[0]} + ${mods.length - 1} queued mod(s)`;
}
function estimatedWaitSeconds(batches, pacing) {
  let ms = 0;
  for (let index = 1; index < batches.length; index++) ms += Math.max(pacing.intervalMs, batches[index - 1][0].modId !== batches[index][0].modId ? pacing.modPauseMs : 0);
  return Math.ceil(ms / 1000);
}
function createPacer(pacing, progress, plannedWaitSeconds, pauseFile) {
  let lastRequestAt = 0; let lastMod = null;
  return async batch => {
    if (pauseRequested(pauseFile)) { progress(null, batchProgressLabel(batch), { phase: 'paused', message: 'Paused before the next provider request.' }); throw new Error('Translation paused by user. Completed batches were saved.'); }
    if (lastRequestAt > 0) {
      const minimum = lastMod !== batch[0].modId ? Math.max(pacing.intervalMs, pacing.modPauseMs) : pacing.intervalMs;
      const waitMs = Math.max(0, lastRequestAt + minimum - Date.now());
      if (waitMs > 0) {
        progress(null, batchProgressLabel(batch), { phase: 'waiting', waitSeconds: Math.ceil(waitMs / 1000), estimatedWaitSeconds: plannedWaitSeconds, message: `Rate-limit pacing: waiting ${Math.ceil(waitMs / 1000)}s before the next batch.` });
        await waitWithPause(waitMs, pauseFile, () => progress(null, batchProgressLabel(batch), { phase: 'paused', message: 'Paused while waiting. Completed batches were saved.' }));
      }
    }
    lastRequestAt = Date.now(); lastMod = batch[0].modId;
  };
}
function retryDelayMs(response, attempt) {
  const retryAfter = response.headers.get('retry-after');
  const seconds = retryAfter && Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60000);
  // Bounded exponential backoff with jitter avoids synchronized retries.
  return Math.min(30000, 1500 * (2 ** attempt)) + Math.floor(Math.random() * 500);
}
async function fetchWithBackoff(label, request, config, onRetry) {
  const maxRetries = Number.isInteger(config.maxRetries) ? config.maxRetries : 5;
  for (let attempt = 0; ; attempt++) {
    const response = await request();
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt >= maxRetries) return response;
    const delay = retryDelayMs(response, attempt);
    // The PowerShell Helper treats stderr as a terminating worker failure.
    // A retry notice is progress, so keep it on stdout and let the retry run.
    console.log(`${label} HTTP ${response.status}; retrying in ${Math.ceil(delay / 1000)}s (${attempt + 1}/${maxRetries}).`);
    if (onRetry) onRetry(response.status, attempt + 1, delay);
    await response.text(); // release the response body before the next request
    await sleep(delay);
  }
}
async function apiTranslate(batches, config, rules, progress, plannedWaitSeconds, onBatch, pauseFile) {
  const target = targetLanguageInfo(rules.targetLanguage);
  const baseUrl = config.provider === 'deepseek' ? 'https://api.deepseek.com' : (config.baseUrl || 'https://api.openai.com/v1');
  const endpoint = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const result = {}; const pace = createPacer(pacingSettings('openai'), progress, plannedWaitSeconds, pauseFile); let processed = 0;
  for (const batch of batches) {
    await pace(batch); if (progress) progress(processed, batchProgressLabel(batch), { estimatedWaitSeconds: plannedWaitSeconds });
    const payload = { model: config.model, temperature: 0, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: 'Translate English to ' + target.name + '. Return JSON mapping each i to text. Preserve placeholders exactly.' },
      { role: 'user', content: JSON.stringify(compactBatch(batch)) }
    ] };
    if (config.provider === 'deepseek') payload.thinking = { type: 'disabled' };
    const request = () => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.apiKey }, body: JSON.stringify(payload), signal: AbortSignal.timeout((config.requestTimeoutSeconds || 60) * 1000) });
    const response = await fetchWithBackoff('OpenAI batch', request, config, (status, attempt, delay) => progress && progress(processed, batchProgressLabel(batch), { status, attempt, delay, retry: true, estimatedWaitSeconds: plannedWaitSeconds }));
    if (!response.ok) throw new Error('Provider HTTP ' + response.status + ': ' + await response.text());
    const body = await response.json(); const content = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
    if (!content) throw new Error('Provider response missing choices[0].message');
    const parsedBody = JSON.parse(content); Object.assign(result, expandCompactMap(parsedBody, batch)); processed += batch.length; if (onBatch) onBatch(result);
    if (progress) progress(processed, batchProgressLabel(batch), { estimatedWaitSeconds: plannedWaitSeconds });
  }
  return result;
}
async function claudeTranslate(batches, config, rules, progress, plannedWaitSeconds, onBatch, pauseFile) {
  const target = targetLanguageInfo(rules.targetLanguage);
  const endpoint = 'https://api.anthropic.com/v1/messages';
  const result = {}; const pace = createPacer(pacingSettings('claude'), progress, plannedWaitSeconds, pauseFile); let processed = 0;
  for (const batch of batches) {
    await pace(batch);
    if (progress) progress(processed, batchProgressLabel(batch), { estimatedWaitSeconds: plannedWaitSeconds });
    const body = {
      model: config.model || 'claude-haiku-4-5', max_tokens: Number(config.maxOutputTokens || 32768),
      system: 'Translate English to ' + target.name + '. Return only JSON mapping each i to text. Preserve placeholders exactly.',
      messages: [{ role: 'user', content: JSON.stringify(compactBatch(batch)) }]
    };
    const request = () => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body), signal: AbortSignal.timeout((config.requestTimeoutSeconds || 60) * 1000) });
    const response = await fetchWithBackoff('Claude batch', request, config, (status, attempt, delay) => progress && progress(processed, batch[0].modId, { status, attempt, delay, retry: true, estimatedWaitSeconds: plannedWaitSeconds }));
    if (!response.ok) throw new Error('Claude HTTP ' + response.status + ': ' + await response.text());
    const payload = await response.json(); const content = (payload.content || []).filter(part => part.type === 'text').map(part => part.text || '').join('');
    if (!content) throw new Error('Claude response missing text content');
    const parsed = JSON.parse(content); Object.assign(result, expandCompactMap(parsed, batch));
    processed += batch.length; if (onBatch) onBatch(result);
    if (progress) progress(processed, batch[batch.length - 1] && batch[batch.length - 1].modId, { estimatedWaitSeconds: plannedWaitSeconds });
  }
  return result;
}
async function deepLTranslate(batches, config, rules, progress, plannedWaitSeconds, onBatch, pauseFile) {
  const target = targetLanguageInfo(rules.targetLanguage);
  const apiBase = (config.baseUrl || 'https://api-free.deepl.com/v2').replace(/\/$/, '');
  const usageResponse = await fetch(apiBase + '/usage', { headers: { 'Authorization': 'DeepL-Auth-Key ' + config.apiKey }, signal: AbortSignal.timeout((config.requestTimeoutSeconds || 60) * 1000) });
  if (!usageResponse.ok) throw new Error('DeepL usage HTTP ' + usageResponse.status + ': ' + await usageResponse.text());
  const usage = await usageResponse.json();
  const requestedCharacters = batches.flat().reduce((total, record) => total + Array.from(record.source).length, 0);
  const remainingCharacters = Number(usage.character_limit) - Number(usage.character_count);
  if (Number.isFinite(remainingCharacters) && remainingCharacters < requestedCharacters) {
    throw new Error('DeepL quota insufficient: remaining ' + remainingCharacters + ' characters, requested about ' + requestedCharacters + '. Use a new billing period/key or another provider.');
  }
  const endpoint = apiBase + '/translate';
  const result = {};
  // DeepL accepts multiple text values per request. Conservative chunks keep
  // requests below provider payload limits while preserving per-key mapping.
  const pace = createPacer(pacingSettings('deepl'), progress, plannedWaitSeconds, pauseFile); let processed = 0;
  for (const batch of batches) {
    await pace(batch);
    if (progress) progress(processed, batchProgressLabel(batch), { estimatedWaitSeconds: plannedWaitSeconds });
    const body = { target_lang: target.providerCode, preserve_formatting: true, text: batch.map(record => record.source) };
    if (config.model && config.model !== 'default') body.model_type = config.model;
    const request = () => fetch(endpoint, { method: 'POST', headers: { 'Authorization': 'DeepL-Auth-Key ' + config.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout((config.requestTimeoutSeconds || 60) * 1000) });
    const response = await fetchWithBackoff('DeepL batch', request, config, (status, attempt, delay) => progress && progress(processed, batchProgressLabel(batch), { status, attempt, delay, retry: true, estimatedWaitSeconds: plannedWaitSeconds }));
    if (!response.ok) throw new Error('DeepL HTTP ' + response.status + ': ' + await response.text());
    const payload = await response.json();
    if (!Array.isArray(payload.translations) || payload.translations.length !== batch.length) throw new Error('DeepL response count mismatch');
    batch.forEach((record, index) => { result[record.id] = payload.translations[index].text; });
    processed += batch.length; if (onBatch) onBatch(result);
    if (progress) progress(processed, batchProgressLabel(batch), { estimatedWaitSeconds: plannedWaitSeconds });
  }
  return result;
}
async function geminiTranslate(batches, config, rules, progress, plannedWaitSeconds, onBatch, pauseFile) {
  const target = targetLanguageInfo(rules.targetLanguage);
  const model = config.model || 'gemini-2.5-flash-lite';
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(config.apiKey);
  const result = {};
  // Requests are deliberately spaced rather than burst, regardless of the
  // selected Gemini model or account tier.
  const pace = createPacer(pacingSettings('gemini'), progress, plannedWaitSeconds, pauseFile); let processed = 0;
  for (const batch of batches) {
    await pace(batch);
    if (progress) progress(processed, batchProgressLabel(batch), { estimatedWaitSeconds: plannedWaitSeconds });
    const prompt = 'Translate every human-readable English phrase to ' + target.name + '. Preserve vehicle model names and other proper nouns, but translate surrounding recipe verbs, vehicle parts, storage labels, descriptions, and settings. Do not return a natural-language source unchanged. Return only JSON mapping each i to text and preserve placeholders exactly. Input: ' + JSON.stringify(compactBatch(batch));
    const request = () => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }), signal: AbortSignal.timeout((config.requestTimeoutSeconds || 120) * 1000) });
    const response = await fetchWithBackoff('Gemini batch', request, config, (status, attempt, delay) => progress && progress(processed, batchProgressLabel(batch), { status, attempt, delay, retry: true, estimatedWaitSeconds: plannedWaitSeconds }));
    if (!response.ok) throw new Error('Gemini HTTP ' + response.status + ': ' + await response.text());
    const payload = await response.json();
    const content = payload.candidates && payload.candidates[0] && payload.candidates[0].content && payload.candidates[0].content.parts && payload.candidates[0].content.parts.map(x => x.text || '').join('');
    if (!content) throw new Error('Gemini response missing candidates[0].content.parts.text');
    const parsed = JSON.parse(content); Object.assign(result, expandCompactMap(parsed, batch));
    processed += batch.length; if (onBatch) onBatch(result);
    if (progress) progress(processed, batchProgressLabel(batch), { estimatedWaitSeconds: plannedWaitSeconds });
  }
  return result;
}
async function yandexTranslate(batches, config, rules, progress, plannedWaitSeconds, onBatch, pauseFile) {
  const target = targetLanguageInfo(rules.targetLanguage);
  const endpoint = 'https://translate.api.cloud.yandex.net/translate/v2/translate';
  const result = {}; const pace = createPacer(pacingSettings('yandex'), progress, plannedWaitSeconds, pauseFile); let processed = 0;
  for (const batch of batches) {
    await pace(batch);
    if (progress) progress(processed, batchProgressLabel(batch), { estimatedWaitSeconds: plannedWaitSeconds });
    const body = { texts: batch.map(record => record.source), targetLanguageCode: target.yandexCode, format: 'PLAIN_TEXT' };
    // API-key authorization represents a service account; Yandex documents
    // that folderId must be omitted for this form of authorization.
    const request = () => fetch(endpoint, { method: 'POST', headers: { Authorization: 'Api-Key ' + config.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout((config.requestTimeoutSeconds || 60) * 1000) });
    const response = await fetchWithBackoff('Yandex batch', request, config, (status, attempt, delay) => progress && progress(processed, batchProgressLabel(batch), { status, attempt, delay, retry: true, estimatedWaitSeconds: plannedWaitSeconds }));
    if (!response.ok) throw new Error('Yandex HTTP ' + response.status + ': ' + await response.text());
    const payload = await response.json();
    if (!Array.isArray(payload.translations) || payload.translations.length !== batch.length) throw new Error('Yandex response count mismatch');
    batch.forEach((record, index) => { result[record.id] = payload.translations[index].text; });
    processed += batch.length; if (onBatch) onBatch(result);
    if (progress) progress(processed, batchProgressLabel(batch), { estimatedWaitSeconds: plannedWaitSeconds });
  }
  return result;
}
async function main() {
  const manifestPath = arg('--manifest', 'runtime/scan-manifest.json');
  const output = arg('--output', 'runtime/translated-manifest.json');
  const translationMemoryPath = arg('--translation-memory', 'runtime/translation-memory.json');
  const rulesPath = arg('--rules', 'config/rules.example.json');
  const userRulesPath = arg('--user-rules', '');
  const providerPath = arg('--provider', 'config/provider.local.json');
  const statusFile = arg('--status-file', '');
  const pauseFile = arg('--pause-file', '');
  const dryRun = process.argv.includes('--dry-run');
  const manifest = readJson(manifestPath);
  const rules = { ...mergeUserRules(readJson(rulesPath), loadUserRules(userRulesPath)), targetLanguage: manifest.targetLanguage };
  const config = fs.existsSync(providerPath) && fs.statSync(providerPath).size > 0 ? readJson(providerPath) : {};
  const reusable = [];
  const refreshedRules = [];
  for (const record of manifest.records.filter(r => r.status === 'existing_generated' && typeof r.target === 'string')) {
    const ruleResult = applyRules(record.source, record, rules);
    const error = ruleResult.value === record.source ? null : validate(record.source, ruleResult.value, record);
    if (ruleResult.value !== record.source && !error) refreshedRules.push({ ...record, target: ruleResult.value, status: 'validated', method: 'rule', appliedRules: ruleResult.applied });
    else reusable.push(record);
  }
  const pending = manifest.records.filter(r => r.status === 'pending'); const direct = []; const unresolved = [];
  for (const record of pending) {
    const ruleResult = applyRules(record.source, record, rules);
    const blocked = (rules.doNotTranslate || []).some(term => record.source.includes(term));
    if (blocked) { unresolved.push({ ...record, status: 'needs_review', reason: 'do-not-translate' }); continue; }
    if (ruleResult.value !== record.source) {
      const error = validate(record.source, ruleResult.value, record);
      if (error) unresolved.push({ ...record, status: 'needs_review', reason: error });
      else direct.push({ ...record, target: ruleResult.value, status: 'validated', method: 'rule', appliedRules: ruleResult.applied });
    } else direct.push({ ...record, target: null, status: 'pending_provider', method: null, appliedRules: [] });
  }
  const providerRecords = direct.filter(r => r.status === 'pending_provider'); let providerMap = {};
  const providerName = ['deepl', 'gemini', 'yandex', 'claude', 'deepseek', 'openai-compatible'].includes(config.provider) ? config.provider : 'openai';
  const providerBatches = requestBatches(providerRecords, providerName);
  const plannedWaitSeconds = estimatedWaitSeconds(providerBatches, pacingSettings(providerName));
  const usage = configuredCost(providerRecords, providerName, config.costEstimate || {});
  const baseCompleted = reusable.length + refreshedRules.length + direct.filter(r => r.status === 'validated').length;
  const baseFailed = unresolved.length;
  const total = reusable.length + refreshedRules.length + pending.length;
  let retries = 0;
  let currentBatchIndex = providerBatches.length > 0 ? 1 : 0;
  const updateProgress = (processed, currentMod, details = {}) => {
    if (details.retry) retries++;
    if (processed !== null && processed !== undefined && providerBatches.length > 0) {
      let boundary = 0; currentBatchIndex = providerBatches.length;
      for (let index = 0; index < providerBatches.length; index++) {
        boundary += providerBatches[index].length;
        if (processed < boundary) { currentBatchIndex = index + 1; break; }
      }
    }
    writeStatus(statusFile, {
      state: 'running', phase: details.phase || 'translating', message: details.message || (details.retry ? `Retrying after HTTP ${details.status} (${details.attempt}/5).` : 'Translating selected mod text.'),
      total, completed: baseCompleted + (processed || 0), reused: reusable.length, failed: baseFailed, retries, currentMod: currentMod || '', batchIndex: currentBatchIndex, batchCount: providerBatches.length, waitSeconds: details.waitSeconds || 0, estimatedWaitSeconds: details.estimatedWaitSeconds || plannedWaitSeconds, apiCharacters: usage.sourceChars, requestCount: usage.requestCount, estimatedInputTokens: usage.inputTokens, estimatedOutputTokens: usage.outputTokens, estimatedCostUsd: usage.estimatedCostUsd === null ? '' : usage.estimatedCostUsd.toFixed(6)
    });
  };
  updateProgress(0, providerRecords[0] && providerRecords[0].modId, { phase: 'estimating', message: `Plan: ${usage.sourceChars} API characters, ${usage.requestCount} request(s), about ${usage.inputTokens} input tokens${usage.estimatedCostUsd === null ? '; cost estimate unavailable until account rates are configured.' : `, about $${usage.estimatedCostUsd.toFixed(4)}`}.`, estimatedWaitSeconds: plannedWaitSeconds });
  const buildResult = map => {
    const translated = [...refreshedRules, ...direct.filter(r => r.status === 'validated'), ...providerRecords.map(r => {
      const target = normalizeKnownTranslation(r, map[r.id]); const error = typeof target !== 'string' ? 'missing provider result' : validate(r.source, target, r);
      return { ...r, target: typeof target === 'string' ? target : null, status: error ? 'needs_review' : 'validated', method: 'provider', reason: error };
    }).map(r => ({ ...r, method: dryRun ? 'dry-run' : r.method })), ...unresolved];
    const reused = reusable.map(r => ({ ...r, status: 'validated', method: 'translation-memory' }));
    const allRecords = [...reused, ...translated];
    return { schema: 'pzat-translation-v1', generatedAt: new Date().toISOString(), mode: dryRun ? 'dry-run' : 'provider', targetLanguage: manifest.targetLanguage, summary: { pending: pending.length, reused: reused.length, validated: allRecords.filter(r => r.status === 'validated').length, needsReview: allRecords.filter(r => r.status === 'needs_review').length }, records: allRecords };
  };
  const checkpoint = map => updateTranslationMemory(translationMemoryPath, manifest.targetLanguage, buildResult(map).records);
  if (providerRecords.length && (dryRun || config.apiKey)) {
    if (dryRun) for (const record of providerRecords) providerMap[record.id] = dryTranslate(record.source, rules);
    else if (config.provider === 'deepl') providerMap = await deepLTranslate(providerBatches, config, rules, updateProgress, plannedWaitSeconds, checkpoint, pauseFile);
    else if (config.provider === 'gemini') providerMap = await geminiTranslate(providerBatches, config, rules, updateProgress, plannedWaitSeconds, checkpoint, pauseFile);
    else if (config.provider === 'yandex') providerMap = await yandexTranslate(providerBatches, config, rules, updateProgress, plannedWaitSeconds, checkpoint, pauseFile);
    else if (config.provider === 'claude') providerMap = await claudeTranslate(providerBatches, config, rules, updateProgress, plannedWaitSeconds, checkpoint, pauseFile);
    else providerMap = await apiTranslate(providerBatches, config, rules, updateProgress, plannedWaitSeconds, checkpoint, pauseFile);
  } else if (providerRecords.length) throw new Error('No provider API key. Use --dry-run or configure provider.local.json.');
  const missingProviderResults = providerRecords.filter(record => typeof providerMap[record.id] !== 'string');
  if (missingProviderResults.length) throw new Error('Provider returned incomplete results: ' + missingProviderResults.length + ' of ' + providerRecords.length + ' records are missing. Completed batches were saved; resume after checking the provider/model.');
  const result = buildResult(providerMap);
  checkpoint(providerMap);
  writeJson(output, result);
  writeStatus(statusFile, { state: 'running', phase: 'validating', message: 'Validating translated text.', total, completed: result.summary.validated, reused: result.summary.reused, failed: result.summary.needsReview, retries, currentMod: '', batchIndex: providerBatches.length, batchCount: providerBatches.length, apiCharacters: usage.sourceChars, requestCount: usage.requestCount, estimatedInputTokens: usage.inputTokens, estimatedOutputTokens: usage.outputTokens, estimatedCostUsd: usage.estimatedCostUsd === null ? '' : usage.estimatedCostUsd.toFixed(6) });
  console.log(JSON.stringify({ output, summary: result.summary }, null, 2));
}
module.exports = { applyRules, validate };

if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exit(1); });
