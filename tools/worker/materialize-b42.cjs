#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function writeUtf8(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, 'utf8'); }
const input = arg('--input', 'runtime/translated-manifest.json');
const output = arg('--output', 'runtime/generated-pack');
const packId = arg('--pack-id', 'PZAITranslationGenerated');
const data = readJson(input);
const allowDryRun = process.argv.includes('--allow-dry-run');
if (data.mode === 'dry-run' && !allowDryRun) {
  throw new Error('Refusing to materialize dry-run text. Run a real provider translation, or use --allow-dry-run only for pack-format testing.');
}
const values = new Map();
const conflicts = [];
for (const record of data.records.filter(r => r.status === 'validated' && typeof r.target === 'string')) {
  // PZ translation category file names are case-insensitive on Windows. Keep
  // one bucket for UI/ui etc. and never let an arbitrary active-mod order
  // decide a conflicting global translation key.
  const bucketId = String(record.category).toLowerCase();
  if (!values.has(bucketId)) values.set(bucketId, { category: record.category, map: new Map(), omitted: new Set() });
  const bucket = values.get(bucketId);
  if (bucket.omitted.has(record.key)) continue;
  if (bucket.map.has(record.key) && bucket.map.get(record.key).target !== record.target) {
    const previous = bucket.map.get(record.key);
    conflicts.push({ category: bucket.category, key: record.key, previous: previous.target, previousModId: previous.modId, next: record.target, modId: record.modId });
    bucket.map.delete(record.key);
    bucket.omitted.add(record.key);
  } else if (!bucket.map.has(record.key)) bucket.map.set(record.key, record);
}
const languageNames = { KO: 'Korean', JP: 'Japanese', CN: 'Chinese Simplified', CH: 'Chinese Traditional', ES: 'Spanish', FR: 'French', DE: 'German', IT: 'Italian', PTBR: 'Portuguese Brazilian', PL: 'Polish', RU: 'Russian', TR: 'Turkish' };
const languageName = languageNames[data.targetLanguage] || data.targetLanguage;
fs.rmSync(output, { recursive: true, force: true });
let files = 0; let keys = 0;
for (const { category, map } of values.values()) {
  const file = path.join(output, 'common', 'media', 'lua', 'shared', 'Translate', data.targetLanguage, category + '.json');
  const object = Object.fromEntries([...map.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([key, record]) => [key, record.target]));
  writeUtf8(file, JSON.stringify(object, null, 2) + '\n');
  files++; keys += map.size;
}
const packName = 'PZ AI ' + languageName + ' Translation Pack';
writeUtf8(path.join(output, 'common', 'mod.info'), 'name=' + packName + '\nid=' + packId + '\ndescription=Generated B42.20+ ' + languageName + ' translations (' + keys + ' entries).\n');
const report = { schema: 'pzat-pack-v1', packName, sourceMode: data.mode || 'unknown', targetLanguage: data.targetLanguage, output, files, keys, conflicts };
writeUtf8(path.join(output, 'pack-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
