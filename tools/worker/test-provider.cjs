#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
const config = readJson(arg('--provider', 'runtime/provider-from-game.json'));
const outputFile = arg('--output', null);
const targetLanguage = arg('--target-language', 'KO');
const language = { KO: 'Korean', JP: 'Japanese', CN: 'Chinese (Simplified)', CH: 'Chinese (Traditional)', ES: 'Spanish', FR: 'French', DE: 'German', IT: 'Italian', PTBR: 'Portuguese (Brazil)', PL: 'Polish', RU: 'Russian', TR: 'Turkish' }[targetLanguage] || targetLanguage;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fetchWithBackoff(label, request) {
  for (let attempt = 0; ; attempt++) {
    const response = await request();
    if (response.ok || response.status !== 429 || attempt >= 5) return response;
    const retryAfter = Number(response.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 60000) : Math.min(30000, 1500 * (2 ** attempt)) + Math.floor(Math.random() * 500);
    console.warn(`${label} HTTP 429; retrying in ${Math.ceil(delay / 1000)}s (${attempt + 1}/5).`);
    await response.text(); await sleep(delay);
  }
}
async function main() {
  if (!config.apiKey) throw new Error('API key is empty.');
  let responseText;
  if (config.provider === 'deepl') {
    const base = (config.baseUrl || 'https://api-free.deepl.com/v2').replace(/\/$/, '');
    const response = await fetch(base + '/translate', { method: 'POST', headers: { Authorization: 'DeepL-Auth-Key ' + config.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: ['Hello, World!'], target_lang: targetLanguage === 'JP' ? 'JA' : targetLanguage === 'PTBR' ? 'PT-BR' : targetLanguage === 'CN' || targetLanguage === 'CH' ? 'ZH' : targetLanguage }), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('DeepL HTTP ' + response.status + ': ' + await response.text());
    responseText = (await response.json()).translations[0].text;
  } else if (config.provider === 'gemini') {
    const model = config.model || 'gemini-2.5-flash-lite';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(config.apiKey);
    const response = await fetchWithBackoff('Gemini connection test', () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with exactly this text translated into ' + language + ': Hello, World!' }] }] }), signal: AbortSignal.timeout(30000) }));
    if (!response.ok) throw new Error('Gemini HTTP ' + response.status + ': ' + await response.text());
    responseText = (await response.json()).candidates?.[0]?.content?.parts?.map(x => x.text || '').join('');
  } else if (config.provider === 'yandex') {
    const code = { KO: 'ko', JP: 'ja', CN: 'zh', CH: 'zh', ES: 'es', FR: 'fr', DE: 'de', IT: 'it', PTBR: 'pt', PL: 'pl', RU: 'ru', TR: 'tr' }[targetLanguage] || targetLanguage.toLowerCase();
    const response = await fetchWithBackoff('Yandex connection test', () => fetch('https://translate.api.cloud.yandex.net/translate/v2/translate', { method: 'POST', headers: { Authorization: 'Api-Key ' + config.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ texts: ['Hello, World!'], targetLanguageCode: code, format: 'PLAIN_TEXT' }), signal: AbortSignal.timeout(30000) }));
    if (!response.ok) throw new Error('Yandex HTTP ' + response.status + ': ' + await response.text());
    responseText = (await response.json()).translations?.[0]?.text;
  } else if (config.provider === 'claude') {
    const response = await fetchWithBackoff('Claude connection test', () => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: config.model || 'claude-haiku-4-5', max_tokens: 256, system: 'Reply with only the requested translation.', messages: [{ role: 'user', content: 'Translate Hello, World! into ' + language + '.' }] }), signal: AbortSignal.timeout(30000) }));
    if (!response.ok) throw new Error('Claude HTTP ' + response.status + ': ' + await response.text());
    responseText = ((await response.json()).content || []).filter(part => part.type === 'text').map(part => part.text || '').join('');
  } else {
    const base = (config.provider === 'deepseek' ? 'https://api.deepseek.com' : (config.baseUrl || 'https://api.openai.com/v1')).replace(/\/$/, '');
    const body = { model: config.model, messages: [{ role: 'user', content: 'Reply with exactly this text translated into ' + language + ': Hello, World!' }], temperature: 0 };
    if (config.provider === 'deepseek') body.thinking = { type: 'disabled' };
    const response = await fetch(base + '/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Provider HTTP ' + response.status + ': ' + await response.text());
    responseText = (await response.json()).choices?.[0]?.message?.content;
  }
  if (!responseText) throw new Error('Provider returned no test text.');
  const result = { ok: true, provider: config.provider, model: config.model || 'default', targetLanguage, input: 'Hello, World!', output: String(responseText).trim().slice(0, 120) };
  if (outputFile) { fs.mkdirSync(require('node:path').dirname(outputFile), { recursive: true }); fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf8'); }
  console.log(JSON.stringify({ ok: true, outputFile }));
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
