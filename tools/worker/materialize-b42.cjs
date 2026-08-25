#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function writeUtf8(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, 'utf8'); }
function escapeLuaString(value) { return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t'); }
function legacyTableForLanguage(tableName, language) { return String(tableName || '').replace(/_?EN$/i, suffix => (suffix.startsWith('_') ? '_' : '') + language); }
const jsonSourceCache = new Map();
function jsonSourceFile(record) {
  if (!record.modPath || !record.category) return null;
  const root = record.layout === 'version' && record.layoutVersion
    ? path.join(record.modPath, String(record.layoutVersion))
    : (record.layout === 'common' ? path.join(record.modPath, 'common') : record.modPath);
  return path.join(root, 'media', 'lua', 'shared', 'Translate', 'EN', record.category + '.json');
}
function hasMatchingJsonSource(record) {
  if (record.sourceFormat !== 'legacy-lua') return false;
  const file = jsonSourceFile(record);
  if (!file || !fs.existsSync(file)) return false;
  if (!jsonSourceCache.has(file)) {
    try { jsonSourceCache.set(file, readJson(file)); }
    catch { jsonSourceCache.set(file, null); }
  }
  const source = jsonSourceCache.get(file);
  return Boolean(source && source[record.key] === record.source);
}
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
  // Manifests produced before JSON/legacy duplicate preference was fixed may
  // mark a B42 JSON key as legacy. Promote an exact JSON twin during rebuild
  // so review-only edits cannot make a working translation disappear.
  const sourceFormat = record.sourceFormat === 'legacy-lua' && !hasMatchingJsonSource(record) ? 'legacy-lua' : 'json';
  const bucketId = sourceFormat + '|' + String(record.category).toLowerCase();
  if (!values.has(bucketId)) values.set(bucketId, { category: record.category, sourceFormat, legacyTable: record.legacyTable, map: new Map(), omitted: new Set() });
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
for (const { category, sourceFormat, legacyTable, map } of values.values()) {
  const languageDir = path.join(output, 'common', 'media', 'lua', 'shared', 'Translate', data.targetLanguage);
  const ordered = [...map.entries()].sort((a,b) => a[0].localeCompare(b[0]));
  const file = sourceFormat === 'legacy-lua'
    ? path.join(languageDir, category + '_' + data.targetLanguage + '.txt')
    : path.join(languageDir, category + '.json');
  if (sourceFormat === 'legacy-lua') writeUtf8(file, legacyTableForLanguage(legacyTable || (category + '_EN'), data.targetLanguage) + ' = {\n' + ordered.map(([key, record]) => '\t' + key + ' = "' + escapeLuaString(record.target) + '",').join('\n') + '\n}\n');
  else writeUtf8(file, JSON.stringify(Object.fromEntries(ordered.map(([key, record]) => [key, record.target])), null, 2) + '\n');
  files++; keys += map.size;
}
const packName = 'PZ AI Generated Translation (' + data.targetLanguage + ')';
writeUtf8(path.join(output, 'common', 'mod.info'), 'name=' + packName + '\nid=' + packId + '\ndescription=Generated B42.20+ ' + languageName + ' translations (' + keys + ' entries).\n');
const report = { schema: 'pzat-pack-v1', packName, sourceMode: data.mode || 'unknown', targetLanguage: data.targetLanguage, output, files, keys, conflicts };
writeUtf8(path.join(output, 'pack-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
