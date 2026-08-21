#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }
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
function retryDelayMs(response, attempt) {
  const retryAfter = response.headers.get('retry-after');
  const seconds = retryAfter && Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60000);
  // Bounded exponential backoff with jitter avoids synchronized retries.
  return Math.min(30000, 1500 * (2 ** attempt)) + Math.floor(Math.random() * 500);
}
async function fetchWithBackoff(label, request, config) {
  const maxRetries = Number.isInteger(config.maxRetries) ? config.maxRetries : 5;
  for (let attempt = 0; ; attempt++) {
    const response = await request();
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt >= maxRetries) return response;
    const delay = retryDelayMs(response, attempt);
    console.warn(`${label} HTTP ${response.status}; retrying in ${Math.ceil(delay / 1000)}s (${attempt + 1}/${maxRetries}).`);
    await response.text(); // release the response body before the next request
    await sleep(delay);
  }
}
async function apiTranslate(records, config, rules) {
  const target = targetLanguageInfo(rules.targetLanguage);
  const endpoint = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
  const payload = {
    model: config.model, temperature: 0, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Translate from English to ' + target.name + '. Return JSON object mapping each id to translated text. Preserve every placeholder exactly.' },
      { role: 'user', content: JSON.stringify(records.map(r => ({ id: r.id, source: r.source, context: r.modId + '/' + r.category + '/' + r.key }))) }
    ]
  };
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.apiKey }, body: JSON.stringify(payload), signal: AbortSignal.timeout((config.requestTimeoutSeconds || 60) * 1000) });
  if (!response.ok) throw new Error('Provider HTTP ' + response.status + ': ' + await response.text());
  const body = await response.json(); const content = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
  if (!content) throw new Error('Provider response missing choices[0].message.content');
  const parsed = JSON.parse(content); return parsed.translations || parsed;
}
async function deepLTranslate(records, config, rules) {
  const target = targetLanguageInfo(rules.targetLanguage);
  const apiBase = (config.baseUrl || 'https://api-free.deepl.com/v2').replace(/\/$/, '');
  const usageResponse = await fetch(apiBase + '/usage', { headers: { 'Authorization': 'DeepL-Auth-Key ' + config.apiKey }, signal: AbortSignal.timeout((config.requestTimeoutSeconds || 60) * 1000) });
  if (!usageResponse.ok) throw new Error('DeepL usage HTTP ' + usageResponse.status + ': ' + await usageResponse.text());
  const usage = await usageResponse.json();
  const requestedCharacters = records.reduce((total, record) => total + Array.from(record.source).length, 0);
  const remainingCharacters = Number(usage.character_limit) - Number(usage.character_count);
  if (Number.isFinite(remainingCharacters) && remainingCharacters < requestedCharacters) {
    throw new Error('DeepL quota insufficient: remaining ' + remainingCharacters + ' characters, requested about ' + requestedCharacters + '. Use a new billing period/key or another provider.');
  }
  const endpoint = apiBase + '/translate';
  const result = {};
  // DeepL accepts multiple text values per request. Conservative chunks keep
  // requests below provider payload limits while preserving per-key mapping.
  for (let start = 0; start < records.length; start += 40) {
    const batch = records.slice(start, start + 40);
    const body = { target_lang: target.providerCode, preserve_formatting: true, text: batch.map(record => record.source) };
    if (config.model && config.model !== 'default') body.model_type = config.model;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Authorization': 'DeepL-Auth-Key ' + config.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout((config.requestTimeoutSeconds || 60) * 1000) });
    if (!response.ok) throw new Error('DeepL HTTP ' + response.status + ': ' + await response.text());
    const payload = await response.json();
    if (!Array.isArray(payload.translations) || payload.translations.length !== batch.length) throw new Error('DeepL response count mismatch');
    batch.forEach((record, index) => { result[record.id] = payload.translations[index].text; });
  }
  return result;
}
async function geminiTranslate(records, config, rules) {
  const target = targetLanguageInfo(rules.targetLanguage);
  const model = config.model || 'gemini-2.5-flash-lite';
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(config.apiKey);
  const result = {};
  // Gemini free-tier request-per-minute limits are commonly tighter than the
  // batch size allows. Space independent batches instead of firing hundreds
  // of requests in one burst; a provider config may raise/lower this value.
  const minimumIntervalMs = Number.isFinite(Number(config.geminiMinIntervalMs)) ? Math.max(0, Number(config.geminiMinIntervalMs)) : 6000;
  let lastRequestAt = 0;
  for (let start = 0; start < records.length; start += 40) {
    const batch = records.slice(start, start + 40);
    const prompt = 'Translate each English value to ' + target.name + '. Return only a JSON object mapping each id to its translated string. Preserve every placeholder exactly. Input: ' + JSON.stringify(batch.map(r => ({ id: r.id, source: r.source, context: r.modId + '/' + r.category + '/' + r.key })));
    const waitMs = minimumIntervalMs - (Date.now() - lastRequestAt);
    if (waitMs > 0) await sleep(waitMs);
    const request = () => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }), signal: AbortSignal.timeout((config.requestTimeoutSeconds || 60) * 1000) });
    lastRequestAt = Date.now();
    const response = await fetchWithBackoff('Gemini batch ' + (Math.floor(start / 40) + 1), request, config);
    if (!response.ok) throw new Error('Gemini HTTP ' + response.status + ': ' + await response.text());
    const payload = await response.json();
    const content = payload.candidates && payload.candidates[0] && payload.candidates[0].content && payload.candidates[0].content.parts && payload.candidates[0].content.parts.map(x => x.text || '').join('');
    if (!content) throw new Error('Gemini response missing candidates[0].content.parts.text');
    const parsed = JSON.parse(content); const translations = parsed.translations || parsed;
    for (const record of batch) result[record.id] = translations[record.id];
  }
  return result;
}
async function main() {
  const manifestPath = arg('--manifest', 'runtime/scan-manifest.json');
  const output = arg('--output', 'runtime/translated-manifest.json');
  const rulesPath = arg('--rules', 'config/rules.example.json');
  const providerPath = arg('--provider', 'config/provider.local.json');
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
  if (providerRecords.length && (dryRun || config.apiKey)) {
    if (dryRun) for (const record of providerRecords) providerMap[record.id] = dryTranslate(record.source, rules);
    else if (config.provider === 'deepl') providerMap = await deepLTranslate(providerRecords, config, rules);
    else if (config.provider === 'gemini') providerMap = await geminiTranslate(providerRecords, config, rules);
    else providerMap = await apiTranslate(providerRecords, config, rules);
  } else if (providerRecords.length) throw new Error('No provider API key. Use --dry-run or configure provider.local.json.');
  const translated = [...direct.filter(r => r.status === 'validated'), ...providerRecords.map(r => {
    const target = providerMap[r.id]; const error = typeof target !== 'string' ? 'missing provider result' : validate(r.source, target);
    return { ...r, target: typeof target === 'string' ? target : null, status: error ? 'needs_review' : 'validated', method: 'provider', reason: error };
  }).map(r => ({ ...r, method: dryRun ? 'dry-run' : r.method })), ...unresolved];
  const reused = reusable.map(r => ({ ...r, status: 'validated', method: 'translation-memory' }));
  const allRecords = [...reused, ...translated];
  const result = { schema: 'pzat-translation-v1', generatedAt: new Date().toISOString(), mode: dryRun ? 'dry-run' : 'provider', targetLanguage: manifest.targetLanguage, summary: { pending: pending.length, reused: reused.length, validated: allRecords.filter(r => r.status === 'validated').length, needsReview: allRecords.filter(r => r.status === 'needs_review').length }, records: allRecords };
  writeJson(output, result); console.log(JSON.stringify({ output, summary: result.summary }, null, 2));
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
