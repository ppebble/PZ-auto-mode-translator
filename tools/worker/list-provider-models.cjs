#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function readIni(file) { const value = {}; for (const line of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) { const i = line.indexOf('='); if (i >= 0) value[line.slice(0, i)] = line.slice(i + 1); } return value; }
const zomboidHome = arg('--zomboid-home', path.join(process.env.USERPROFILE || '', 'Zomboid'));
const providerFile = arg('--provider', null);
const config = providerFile ? readJson(providerFile) : readIni(path.join(zomboidHome, 'Lua', 'PZAITranslator_provider.ini'));
const output = arg('--output', 'runtime/provider-models.json');
const catalog = arg('--catalog', path.join(zomboidHome, 'Lua', 'PZAITranslator_models.ini'));
async function main() {
  if (!config.apiKey) throw new Error('Provider API key is required to list account-available models.');
  let models;
  if (config.provider === 'gemini') {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(config.apiKey));
    if (!response.ok) throw new Error('Gemini HTTP ' + response.status + ': ' + await response.text());
    const payload = await response.json();
    models = (payload.models || []).filter(x => (x.supportedGenerationMethods || []).includes('generateContent')).map(x => x.name.replace(/^models\//, '')).sort();
  } else if (config.provider === 'deepl') {
    models = ['default', 'prefer_quality_optimized', 'quality_optimized', 'latency_optimized'];
  } else if (config.provider === 'yandex') {
    // Yandex Translate v2 selects the service, not a per-request model ID.
    models = ['yandex-translate-v2'];
  } else {
    const base = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const response = await fetch(base + '/models', { headers: { Authorization: 'Bearer ' + config.apiKey } });
    if (!response.ok) throw new Error('Provider HTTP ' + response.status + ': ' + await response.text());
    const payload = await response.json(); models = (payload.data || []).map(x => x.id).sort();
  }
  const result = { provider: config.provider, generatedAt: new Date().toISOString(), models };
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2), 'utf8');
  fs.mkdirSync(path.dirname(catalog), { recursive: true }); fs.writeFileSync(catalog, ['provider=' + result.provider, ...models.map(model => 'model=' + model)].join('\n') + '\n', 'utf8');
  console.log(JSON.stringify({ output, catalog, provider: result.provider, count: models.length, models }, null, 2));
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
