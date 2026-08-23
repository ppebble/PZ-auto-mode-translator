#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyRules } = require('../tools/worker/translate-b42.cjs');
const { writeRecords, readRecords, loadUserRules, mergeUserRules } = require('../tools/worker/local-controls.cjs');
const { exportReview, applyReviewEdits } = require('../tools/worker/review-b42.cjs');
const { detectLuaCandidates, scanManifest } = require('../tools/worker/scan-lua-hardcoded.cjs');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pzat-quality-controls-'));
try {
  const rulesIni = path.join(temp, 'rules.ini');
  writeRecords(rulesIni, 'pzat-user-rules-v1', 'rule', [
    { id: 'recipe-make', kind: 'regex', enabled: '1', category: 'Recipes', pattern: '^Make (.+)$', replacement: '$1 제작', priority: '500', flags: 'g' },
    { id: 'front-bumper', kind: 'glossary', enabled: '1', category: 'Recipes', pattern: 'Front Bumper', replacement: '전면 범퍼', priority: '600' },
  ]);
  assert.equal(readRecords(rulesIni, 'rule')[0].replacement, '$1 제작');
  const merged = mergeUserRules({ rules: [], glossary: {}, doNotTranslate: [] }, loadUserRules(rulesIni));
  assert.equal(merged.rules.length, 2);
  assert.deepEqual(applyRules('Make Test Front Bumper', { modId: 'car', category: 'Recipes' }, merged).value, 'Test 전면 범퍼 제작');
  assert.deepEqual(applyRules('Front Bumper', { modId: 'car', category: 'IG_UI' }, merged).value, 'Front Bumper');

  const manifestPath = path.join(temp, 'translated.json');
  const reviewIni = path.join(temp, 'review.ini');
  const editsIni = path.join(temp, 'review-edits.ini');
  const outputPath = path.join(temp, 'reviewed.json');
  const memoryPath = path.join(temp, 'memory.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schema: 'pzat-translation-v1', targetLanguage: 'KO', mode: 'provider',
    summary: { pending: 2, reused: 0, validated: 1, needsReview: 1 },
    records: [
      { id: 'one', modId: 'mod', category: 'UI', key: 'One', source: 'Hello %1', target: null, status: 'needs_review', method: 'provider', reason: 'placeholder mismatch' },
      { id: 'two', modId: 'mod', category: 'UI', key: 'Two', source: 'World', target: '세계', status: 'validated', method: 'provider', reason: null },
    ],
  }, null, 2));
  assert.equal(exportReview(manifestPath, reviewIni).records, 2);
  assert.equal(readRecords(reviewIni, 'record')[0].source, 'Hello %1');
  writeRecords(editsIni, 'pzat-review-edits-v1', 'edit', [
    { id: 'one', target: '안녕하세요 %1' },
    { id: 'two', target: '' },
  ]);
  const applied = applyReviewEdits(manifestPath, editsIni, outputPath, memoryPath);
  assert.deepEqual({ applied: applied.applied, rejected: applied.rejected }, { applied: 1, rejected: 1 });
  const reviewed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(reviewed.records[0].target, '안녕하세요 %1');
  assert.equal(reviewed.records[0].method, 'user-review');
  assert.equal(reviewed.summary.needsReview, 0);
  assert.equal(JSON.parse(fs.readFileSync(memoryPath, 'utf8')).records.some(record => record.id === 'one'), true);

  const lua = [
    'local title = ISLabel:new(10, 10, 20, "Unsafe title", 1, 1, 1, 1, UIFont.Small, true)',
    'button:setTitle("Explicit button")',
    'local translated = getText("UI_AlreadySafe")',
    '-- label:setName("Comment only")',
    'local ordinary = "internal-id"',
    'name = "Shopping Cart"',
  ].join('\n');
  const candidates = detectLuaCandidates(lua, 'media/lua/client/Test.lua', 'sample');
  assert.deepEqual(candidates.map(candidate => candidate.source), ['Unsafe title', 'Explicit button', 'Shopping Cart']);
  assert.deepEqual(candidates.map(candidate => candidate.line), [1, 2, 6]);
  assert.deepEqual(candidates.map(candidate => candidate.confidence), ['high', 'high', 'medium']);
  assert.equal(candidates.every(candidate => candidate.selected === '0'), true);
  const modRoot = path.join(temp, 'SampleMod');
  fs.mkdirSync(path.join(modRoot, 'media', 'lua', 'client'), { recursive: true });
  fs.writeFileSync(path.join(modRoot, 'media', 'lua', 'client', 'Test.lua'), lua);
  fs.mkdirSync(path.join(modRoot, '42.20', 'media', 'lua', 'client'), { recursive: true });
  fs.writeFileSync(path.join(modRoot, '42.20', 'media', 'lua', 'client', 'Test.lua'), lua.replace('Unsafe title', 'Current title'));
  const luaManifest = path.join(temp, 'lua-manifest.json'); const luaIni = path.join(temp, 'lua-candidates.ini');
  fs.writeFileSync(luaManifest, JSON.stringify({ targetLanguage: 'KO', gameVersion: '42.20.3', modPaths: [{ modId: 'sample', modPath: modRoot }] }));
  assert.deepEqual(scanManifest(luaManifest, luaIni), { output: luaIni, mods: 1, candidates: 3 });
  assert.equal(readRecords(luaIni, 'candidate')[1].file, '42.20/media/lua/client/Test.lua');
  assert.equal(readRecords(luaIni, 'candidate')[0].source, 'Current title');

  console.log('quality controls test passed');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
