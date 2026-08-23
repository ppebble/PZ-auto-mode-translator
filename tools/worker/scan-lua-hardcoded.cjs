#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { writeRecords } = require('./local-controls.cjs');

function arg(name, fallback) { const index = process.argv.indexOf(name); return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback; }
function decodeLua(value) { return value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\([\\"'])/g, '$1'); }
function candidateId(modId, file, line, source) { return crypto.createHash('sha256').update([modId, file, line, source].join('|')).digest('hex'); }

function detectLuaCandidates(text, file, modId) {
  const candidates = [];
  const constructor = /\b(?:ISLabel|ISButton|ISTickBox|ISComboBox):new\([^\r\n]*?(["'])((?:\\.|(?!\1).)*)\1/;
  const setter = /[.:](?:setTitle|setName|setNameWithoutMoving|setText|addOption|addItem|addView|addDescription)\s*\(\s*(["'])((?:\\.|(?!\1).)*)\1/;
  const displayAssignment = /\b(?:name|title|tooltip|label|text|description)\s*=\s*(["'])((?:\\.|(?!\1).)*)\1/i;
  text.split(/\r?\n/).forEach((raw, index) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('--') || /\bgetText\s*\(/.test(raw)) return;
    let kind = 'ui-constructor'; let match = constructor.exec(raw);
    if (!match) { kind = 'ui-setter'; match = setter.exec(raw); }
    if (!match) { kind = 'display-assignment'; match = displayAssignment.exec(raw); }
    if (!match) return;
    const source = decodeLua(match[2]).trim();
    if (!source || !/[A-Za-z]/.test(source) || /^(?:UI|IGUI|ContextMenu|Tooltip|Sandbox|Recipe|ItemName)_/i.test(source)) return;
    candidates.push({
      id: candidateId(modId, file, index + 1, source), modId, file, line: index + 1,
      source, context: trimmed.slice(0, 240), kind, confidence: kind === 'display-assignment' ? 'medium' : 'high', selected: '0',
    });
  });
  return candidates;
}

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, output); else output.push(full);
  }
  return output;
}

function versionParts(value) { return String(value || '').split('.').map(Number); }
function compareVersion(left, right) {
  const a = versionParts(left); const b = versionParts(right); const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) { const delta = (a[index] || 0) - (b[index] || 0); if (delta) return delta; }
  return 0;
}
function effectiveLuaFiles(modPath, gameVersion) {
  const selected = new Map();
  for (const file of walk(modPath).filter(file => path.extname(file).toLowerCase() === '.lua')) {
    const relative = path.relative(modPath, file); const parts = relative.split(path.sep); const mediaIndex = parts.findIndex(part => part.toLowerCase() === 'media');
    if (mediaIndex < 0 || String(parts[mediaIndex + 1] || '').toLowerCase() !== 'lua') continue;
    const version = mediaIndex > 0 && /^\d+(?:\.\d+)*$/.test(parts[mediaIndex - 1]) ? parts[mediaIndex - 1] : '0';
    if (version !== '0' && compareVersion(version, gameVersion) > 0) continue;
    const logical = parts.slice(mediaIndex).join('/').toLowerCase(); const previous = selected.get(logical);
    if (!previous || compareVersion(version, previous.version) > 0) selected.set(logical, { file, version });
  }
  return [...selected.values()].map(item => item.file);
}

function scanManifest(manifestFile, output) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8').replace(/^\uFEFF/, ''));
  const candidates = [];
  const mods = manifest.modPaths || (manifest.modSummary || []).filter(mod => mod.modPath);
  for (const mod of mods) {
    if (!mod.modPath || !fs.existsSync(mod.modPath)) continue;
    for (const file of effectiveLuaFiles(mod.modPath, manifest.gameVersion || '42.20.0')) {
      const relative = path.relative(mod.modPath, file).replace(/\\/g, '/');
      if (!/(^|\/)media\/lua\//i.test(relative) || /(^|\/)Translate\//i.test(relative)) continue;
      let text; try { text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); } catch { continue; }
      candidates.push(...detectLuaCandidates(text, relative, mod.modId));
    }
  }
  writeRecords(output, 'pzat-lua-candidates-v1', 'candidate', candidates, { generatedAt: new Date().toISOString(), targetLanguage: manifest.targetLanguage || '' });
  return { output, mods: mods.length, candidates: candidates.length };
}

function main() { console.log(JSON.stringify(scanManifest(arg('--manifest', 'runtime/scan-manifest.json'), arg('--output', 'runtime/lua-candidates.ini')), null, 2)); }
module.exports = { detectLuaCandidates, scanManifest };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exit(1); }
}
