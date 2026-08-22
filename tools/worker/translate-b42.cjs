#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
function writeStatus(file, values) {
  if (!file) return;
  const ordered = ['state', 'phase', 'message', 'total', 'completed', 'reused', 'failed', 'retries', 'currentMod', 'waitSeconds', 'estimatedWaitSeconds', 'errorCode'];
  const lines = ordered.filter(key => values[key] !== undefined && values[key] !== null)
    .map(key => key + '=' + String(values[key]).replace(/[\r\n]/g, ' '));
  lines.push('updatedAt=' + new Date().toISOString());
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}
const languageMap = {
  KO: { name: 'Korean', providerCode: 'KO' }, JP: { name: 'Japanese', providerCode: 'JA' },
  CN: { name: 'Chinese (Simplified)', providerCode: 'ZH' }, CH: { name: 'Chinese (Traditional)', providerCode: 'ZH' },
  ES: { name: 'Spanish', providerCode: 'ES' }, FR: { name: 'French', providerCode: 'FR' }, DE: { name: 'German', providerCode: 'DE' },
  IT: { name: 'Italian', providerCode: 'IT' }, PTBR: { name: 'Portuguese (Brazil)', providerCode: 'PT-BR' }, PL: { name: 'Polish', providerCode: 'PL' },
  RU: { name: 'Russian', providerCode: 'RU' }, TR: { name: 'Turkish', providerCode: 'TR' }
};
function targetLanguageInfo(code) { const info = languageMap[code]; if (!info) throw new Error('Unsupported Project Zomboid target language code: ' + code); return info; }
function tokens(value) { return (value.match(/%\d+|\{\d+\}|<[^>]+>|\\n/g) || []).sort(); }
function validate(source, target) {
  if (tokens(source).join('\u0000') !== tokens(target).join('\u0000')) return 'placeholder mismatch';
  // Newlines are valid UI text; other control characters make the JSON pack unsafe.
  if (/\p{Cc}/u.test(target.replace(/[\n\r\t]/g, ''))) return 'control character';
  return null;
}
function applyRules(source, record, rules) {
  let value = source; const applied = [];
  const scoped = rule => { const s = rule.scope || {}; return (!s.modId || s.modId === record.modId) && (!s.category || s.category === record.category); };
  for (const rule of [...(rules.rules || [])].filter(x => x.enabled && scoped(x)).sort((a,b) => (b.priority || 0) - (a.priority || 0))) {
    if (rule.kind === 'exact' && value === rule.pattern) { value = rule.replacement; applied.push(rule.id); }
    if (rule.kind === 'regex') {
      try { const next = value.replace(new RegExp(rule.pattern, rule.flags || 'g'), rule.replacement); if (next !== value) { value = next; applied.push(rule.id); } } catch {}
    }
  }
  for (const [sourceTerm, targetTerm] of Object.entries(rules.glossary || {})) {
    if (value.includes(sourceTerm)) { value = value.split(sourceTerm).join(targetTerm); applied.push('glossary:' + sourceTerm); }
  }
  return { value, applied };
}
function dryTranslate(source, rules) { return '[DRY-RUN ' + rules.targetLanguage + '] ' + source; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function recordChars(record) { return Array.from(record.source || '').length; }
function requestBatches(records, config) {
  const maxItems = Math.max(1, Math.min(100, Number(config.batchSize) || 20));
  const maxChars = Math.max(100, Number(config.maxBatchChars) || 3000);
  const batches = []; let batch = []; let chars = 0;
  for (const record of records) {
    const length = recordChars(record);
    if (batch.length && (batch[0].modId !== record.modId || batch.length >= maxItems || chars + length > maxChars)) {
      batches.push(batch); batch = []; chars = 0;
    }
    batch.push(record); chars += length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
function pacingSettings(config, provider) {
  // A background game session can tolerate a conservative pace. Keeping every
  // request over one minute apart avoids common per-minute free-tier limits.
  const defaultInterval = 70000;
  return {
    intervalMs: Math.max(0, Number(config.minRequestIntervalMs) || defaultInterval),
    modPauseMs: Math.max(0, Number(config.modPauseMs) || 70000),
  };
}
function estimatedWaitSeconds(batches, pacing) {
  let ms = 0;
  for (let index = 1; index < batches.length; index++) ms += Math.max(pacing.intervalMs, batches[index - 1][0].modId !== batches[index][0].modId ? pacing.modPauseMs : 0);
  return Math.ceil(ms / 1000);
}
function createPacer(pacing, progress, plannedWaitSeconds) {
  let lastRequestAt = 0; let lastMod = null;
  return async batch => {
    if (lastRequestAt > 0) {
      const minimum = lastMod !== batch[0].modId ? Math.max(pacing.intervalMs, pacing.modPauseMs) : pacing.intervalMs;
      const waitMs = Math.max(0, lastRequestAt + minimum - Date.now());
      if (waitMs > 0) {
        progress(null, batch[0].modId, { phase: 'waiting', waitSeconds: Math.ceil(waitMs / 1000), estimatedWaitSeconds: plannedWaitSeconds, message: `Rate-limit pacing: waiting ${Math.ceil(waitMs / 1000)}s before the next batch.` });
        await sleep(waitMs);
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
    console.warn(`${label} HTTP ${response.status}; retrying in ${Math.ceil(delay / 1000)}s (${attempt + 1}/${maxRetries}).`);
    if (onRetry) onRetry(response.status, attempt + 1, delay);
    await response.text(); // release the response body before the next request
    await sleep(delay);
  }
}
async function apiTranslate(batches, config, rules, progress, plannedWaitSeconds) {
  const target = targetLanguageInfo(rules.targetLanguage);
  const endpoint = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
  const result = {}; const pace = createPacer(pacingSettings(config, 'openai'), progress, plannedWaitSeconds); let processed = 0;
  for (const batch of batches) {
    await pace(batch); if (progress) progress(processed, batch[0].modId, { estimatedWaitSeconds: plannedWaitSeconds });
    const payload = { model: config.model, temperature: 0, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: 'Translate from English to ' + target.name + '. Return JSON object mapping each id to translated text. Preserve every placeholder exactly.' },
      { role: 'user', content: JSON.stringify(batch.map(r => ({ id: r.id, source: r.source, context: r.modId + '/' + r.category + '/' + r.key }))) }
    ] };
    const request = () => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.apiKey }, body: JSON.stringify(payload), signal: AbortSignal.timeout((config.requestTimeoutSeconds || 60) * 1000) });
    const response = await fetchWithBackoff('OpenAI batch', request, config, (status, attempt, delay) => progress && progress(processed, batch[0].modId, { status, attempt, delay, retry: true, estimatedWaitSeconds: plannedWaitSeconds }));
    if (!response.ok) throw new Error('Provider HTTP ' + response.status + ': ' + await response.text());
    const body = await response.json(); const content = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
    if (!content) throw new Error('Provider response missing choices[0].message');
    const parsedBody = JSON.parse(content); Object.assign(result, parsedBody.translations || parsedBody); processed += batch.length;
    if (progress) progress(processed, batch[batch.length - 1].modId, { estimatedWaitSeconds: plannedWaitSeconds });
  }
  return result;
}
async function deepLTranslate(batches, config, rules, progress, plannedWaitSeconds) {
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
  const pace = createPacer(pacingSettings(config, 'deepl'), progress, plannedWaitSeconds); let processed = 0;
  for (const batch of batches) {
    await pace(batch);
    if (progress) progress(processed, batch[0] && batch[0].modId, { estimatedWaitSeconds: plannedWaitSeconds });
    const body = { target_lang: target.providerCode, preserve_formatting: true, text: batch.map(record => record.source) };
    if (config.model && config.model !== 'default') body.model_type = config.model;
    const request = () => fetch(endpoint, { method: 'POST', headers: { 'Authorization': 'DeepL-Auth-Key ' + config.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout((config.requestTimeoutSeconds || 60) * 1000) });
    const response = await fetchWithBackoff('DeepL batch', request, config, (status, attempt, delay) => progress && progress(processed, batch[0].modId, { status, attempt, delay, retry: true, estimatedWaitSeconds: plannedWaitSeconds }));
    if (!response.ok) throw new Error('DeepL HTTP ' + response.status + ': ' + await response.text());
    const payload = await response.json();
    if (!Array.isArray(payload.translations) || payload.translations.length !== batch.length) throw new Error('DeepL response count mismatch');
    batch.forEach((record, index) => { result[record.id] = payload.translations[index].text; });
    processed += batch.length;
    if (progress) progress(processed, batch[batch.length - 1] && batch[batch.length - 1].modId, { estimatedWaitSeconds: plannedWaitSeconds });
  }
  return result;
}
async function geminiTranslate(batches, config, rules, progress, plannedWaitSeconds) {
  const target = targetLanguageInfo(rules.targetLanguage);
  const model = config.model || 'gemini-2.5-flash-lite';
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(config.apiKey);
  const result = {};
  // Gemini free-tier request-per-minute limits are commonly tighter than the
  // batch size allows. Space independent batches instead of firing hundreds
  // of requests in one burst; a provider config may raise/lower this value.
  const geminiConfig = { ...config, minRequestIntervalMs: Number.isFinite(Number(config.geminiMinIntervalMs)) ? Number(config.geminiMinIntervalMs) : config.minRequestIntervalMs };
  const pace = createPacer(pacingSettings(geminiConfig, 'gemini'), progress, plannedWaitSeconds); let processed = 0;
  for (const batch of batches) {
    await pace(batch);
    if (progress) progress(processed, batch[0] && batch[0].modId, { estimatedWaitSeconds: plannedWaitSeconds });
    const prompt = 'Translate each English value to ' + target.name + '. Return only a JSON object mapping each id to its translated string. Preserve every placeholder exactly. Input: ' + JSON.stringify(batch.map(r => ({ id: r.id, source: r.source, context: r.modId + '/' + r.category + '/' + r.key })));
    const request = () => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }), signal: AbortSignal.timeout((config.requestTimeoutSeconds || 60) * 1000) });
    const response = await fetchWithBackoff('Gemini batch', request, config, (status, attempt, delay) => progress && progress(processed, batch[0] && batch[0].modId, { status, attempt, delay, retry: true, estimatedWaitSeconds: plannedWaitSeconds }));
    if (!response.ok) throw new Error('Gemini HTTP ' + response.status + ': ' + await response.text());
    const payload = await response.json();
    const content = payload.candidates && payload.candidates[0] && payload.candidates[0].content && payload.candidates[0].content.parts && payload.candidates[0].content.parts.map(x => x.text || '').join('');
    if (!content) throw new Error('Gemini response missing candidates[0].content.parts.text');
    const parsed = JSON.parse(content); const translations = parsed.translations || parsed;
    for (const record of batch) result[record.id] = translations[record.id];
    processed += batch.length;
    if (progress) progress(processed, batch[batch.length - 1] && batch[batch.length - 1].modId, { estimatedWaitSeconds: plannedWaitSeconds });
  }
  return result;
}
async function main() {
  const manifestPath = arg('--manifest', 'runtime/scan-manifest.json');
  const output = arg('--output', 'runtime/translated-manifest.json');
  const rulesPath = arg('--rules', 'config/rules.example.json');
  const providerPath = arg('--provider', 'config/provider.local.json');
  const statusFile = arg('--status-file', '');
  const dryRun = process.argv.includes('--dry-run');
  const manifest = readJson(manifestPath); const rules = { ...readJson(rulesPath), targetLanguage: manifest.targetLanguage };
  const config = fs.existsSync(providerPath) && fs.statSync(providerPath).size > 0 ? readJson(providerPath) : {};
  const reusable = manifest.records.filter(r => r.status === 'existing_generated' && typeof r.target === 'string');
  const pending = manifest.records.filter(r => r.status === 'pending'); const direct = []; const unresolved = [];
  for (const record of pending) {
    const ruleResult = applyRules(record.source, record, rules);
    const blocked = (rules.doNotTranslate || []).some(term => record.source.includes(term));
    if (blocked) { unresolved.push({ ...record, status: 'needs_review', reason: 'do-not-translate' }); continue; }
    if (ruleResult.value !== record.source) {
      const error = validate(record.source, ruleResult.value);
      if (error) unresolved.push({ ...record, status: 'needs_review', reason: error });
      else direct.push({ ...record, target: ruleResult.value, status: 'validated', method: 'rule', appliedRules: ruleResult.applied });
    } else direct.push({ ...record, target: null, status: 'pending_provider', method: null, appliedRules: [] });
  }
  const providerRecords = direct.filter(r => r.status === 'pending_provider'); let providerMap = {};
  const providerName = config.provider === 'deepl' ? 'deepl' : config.provider === 'gemini' ? 'gemini' : 'openai';
  const providerBatches = requestBatches(providerRecords, config);
  const plannedWaitSeconds = estimatedWaitSeconds(providerBatches, pacingSettings(config.provider === 'gemini' && Number.isFinite(Number(config.geminiMinIntervalMs)) ? { ...config, minRequestIntervalMs: Number(config.geminiMinIntervalMs) } : config, providerName));
  const baseCompleted = reusable.length + direct.filter(r => r.status === 'validated').length;
  const baseFailed = unresolved.length;
  const total = reusable.length + pending.length;
  let retries = 0;
  const updateProgress = (processed, currentMod, details = {}) => {
    if (details.retry) retries++;
    writeStatus(statusFile, {
      state: 'running', phase: details.phase || 'translating', message: details.message || (details.retry ? `Retrying after HTTP ${details.status} (${details.attempt}/5).` : 'Translating selected mod text.'),
      total, completed: baseCompleted + (processed || 0), reused: reusable.length, failed: baseFailed, retries, currentMod: currentMod || '', waitSeconds: details.waitSeconds || 0, estimatedWaitSeconds: details.estimatedWaitSeconds || plannedWaitSeconds
    });
  };
  updateProgress(0, providerRecords[0] && providerRecords[0].modId, { estimatedWaitSeconds: plannedWaitSeconds });
  if (providerRecords.length && (dryRun || config.apiKey)) {
    if (dryRun) for (const record of providerRecords) providerMap[record.id] = dryTranslate(record.source, rules);
    else if (config.provider === 'deepl') providerMap = await deepLTranslate(providerBatches, config, rules, updateProgress, plannedWaitSeconds);
    else if (config.provider === 'gemini') providerMap = await geminiTranslate(providerBatches, config, rules, updateProgress, plannedWaitSeconds);
    else providerMap = await apiTranslate(providerBatches, config, rules, updateProgress, plannedWaitSeconds);
  } else if (providerRecords.length) throw new Error('No provider API key. Use --dry-run or configure provider.local.json.');
  const translated = [...direct.filter(r => r.status === 'validated'), ...providerRecords.map(r => {
    const target = providerMap[r.id]; const error = typeof target !== 'string' ? 'missing provider result' : validate(r.source, target);
    return { ...r, target: typeof target === 'string' ? target : null, status: error ? 'needs_review' : 'validated', method: 'provider', reason: error };
  }).map(r => ({ ...r, method: dryRun ? 'dry-run' : r.method })), ...unresolved];
  const reused = reusable.map(r => ({ ...r, status: 'validated', method: 'translation-memory' }));
  const allRecords = [...reused, ...translated];
  const result = { schema: 'pzat-translation-v1', generatedAt: new Date().toISOString(), mode: dryRun ? 'dry-run' : 'provider', targetLanguage: manifest.targetLanguage, summary: { pending: pending.length, reused: reused.length, validated: allRecords.filter(r => r.status === 'validated').length, needsReview: allRecords.filter(r => r.status === 'needs_review').length }, records: allRecords };
  writeJson(output, result);
  writeStatus(statusFile, { state: 'running', phase: 'validating', message: 'Validating translated text.', total, completed: result.summary.validated, reused: reused.length, failed: result.summary.needsReview, retries, currentMod: '' });
  console.log(JSON.stringify({ output, summary: result.summary }, null, 2));
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
