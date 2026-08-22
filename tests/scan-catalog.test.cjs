#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pzat-catalog-'));
const home = path.join(root, 'Zomboid');
const output = path.join(root, 'scan.json');
const translated = path.join(root, 'translated.json');
const catalog = path.join(home, 'Lua', 'PZAITranslator_catalog.ini');
const memory = path.join(root, 'memory.json');
const resumeMemory = path.join(root, 'resume-memory.json');
const hash = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

function mod(id, translations) {
  const base = path.join(home, 'mods', id, 'common');
  fs.mkdirSync(path.join(base, 'media', 'lua', 'shared', 'Translate'), { recursive: true });
  fs.writeFileSync(path.join(base, 'mod.info'), `name=${id}\nid=${id}\n`, 'utf8');
  for (const [language, values] of Object.entries(translations)) {
    const dir = path.join(base, 'media', 'lua', 'shared', 'Translate', language);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'UI.json'), JSON.stringify(values), 'utf8');
  }
}

try {
  fs.mkdirSync(path.join(home, 'mods'), { recursive: true });
  fs.writeFileSync(path.join(home, 'mods', 'default.txt'), 'mod=MainMod\nmod=ExternalOverlay\nmod=PZAITranslationGenerated\n', 'utf8');
  mod('MainMod', { EN: { existing: 'Own target', overlay: 'External target', generated: 'Memory target', pending: 'Needs API' }, KO: { existing: 'Already Korean' } });
  mod('ExternalOverlay', { KO: { overlay: 'External Korean' } });
  mod('PZAITranslationGenerated', { KO: { generated: 'Generated Korean' } });
  const recordId = `MainMod|UI|generated|${hash('Memory target')}`;
  fs.writeFileSync(memory, JSON.stringify({ schema: 'pzat-translation-v1', targetLanguage: 'KO', records: [{ id: recordId, status: 'validated', target: 'Memory Korean' }] }), 'utf8');

  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'scan-b42.cjs'), '--zomboid-home', home, '--output', output, '--translation-memory', memory], { stdio: 'pipe' });
  const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(manifest.modSummary.length, 3);
  const stat = manifest.modSummary.find(item => item.modId === 'MainMod');
  assert.deepEqual({ ...stat, updatedAt: 0 }, { modId: 'MainMod', candidates: 4, existing: 1, existing_overlay: 1, existing_generated: 1, reused: 0, pending: 1, craftRecipes: 0, sourceChars: 47, apiChars: 9, updatedAt: 0, steamUpdatedAt: 0, metadataSource: 'local_file' });
  assert.ok(stat.updatedAt > 0);
  for (const emptyMod of manifest.modSummary.filter(item => item.modId !== 'MainMod')) assert.equal(emptyMod.candidates, 0);
  const catalogLines = ['schema=pzat-catalog-v1', 'generatedAt=' + manifest.generatedAt, 'targetLanguage=KO'];
  for (const item of manifest.modSummary) catalogLines.push('mod=' + item.modId, 'candidates=' + item.candidates, 'existing=' + item.existing, 'existing_overlay=' + item.existing_overlay, 'existing_generated=' + item.existing_generated, 'pending=' + item.pending, 'sourceChars=' + item.sourceChars, 'apiChars=' + item.apiChars, 'updatedAt=' + item.updatedAt, 'steamUpdatedAt=' + item.steamUpdatedAt, 'metadataSource=' + item.metadataSource);
  assert.equal(fs.readFileSync(catalog, 'utf8'), catalogLines.join('\n') + '\n');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'translate-b42.cjs'), '--manifest', output, '--rules', path.join(__dirname, '..', 'config', 'rules.example.json'), '--output', translated, '--translation-memory', resumeMemory, '--dry-run'], { stdio: 'pipe' });
  const translation = JSON.parse(fs.readFileSync(translated, 'utf8'));
  assert.deepEqual(translation.summary, { pending: 1, reused: 1, validated: 2, needsReview: 0 });
  assert.deepEqual(translation.records.map(record => [record.key, record.method]).sort(), [
    ['generated', 'translation-memory'], ['pending', 'dry-run']
  ]);
  const resume = JSON.parse(fs.readFileSync(resumeMemory, 'utf8'));
  assert.equal(resume.records.some(record => record.id.endsWith(hash('Needs API')) && record.target === '[DRY-RUN KO] Needs API'), true);
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'scan-b42.cjs'), '--zomboid-home', home, '--output', output, '--translation-memory', resumeMemory, '--include-mods', 'MainMod'], { stdio: 'pipe' });
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).summary.pending, 0);

  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'scan-b42.cjs'), '--zomboid-home', home, '--output', output, '--translation-memory', memory, '--include-mods', 'MainMod', '--skip-mods-with-target'], { stdio: 'pipe' });
  const skipped = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(skipped.summary.skippedModsWithTarget, 1);
  assert.deepEqual(skipped.records, []);

  const steamRoot = path.join(root, 'Steam', 'steamapps', 'workshop', 'content', '108600');
  const steamAcf = path.join(root, 'Steam', 'steamapps', 'workshop', 'appworkshop_108600.acf');
  const workshopMod = path.join(steamRoot, '123456', 'mods', 'WorkshopMod', 'common');
  fs.mkdirSync(path.join(workshopMod, 'media', 'lua', 'shared', 'Translate', 'EN'), { recursive: true });
  fs.writeFileSync(path.join(workshopMod, 'mod.info'), 'name=WorkshopMod\nid=WorkshopMod\n', 'utf8');
  fs.writeFileSync(path.join(workshopMod, 'media', 'lua', 'shared', 'Translate', 'EN', 'UI.json'), JSON.stringify({ title: 'Workshop title' }), 'utf8');
  fs.writeFileSync(steamAcf, '"AppWorkshop"\n{\n  "WorkshopItemsInstalled"\n  {\n    "123456"\n    {\n      "timeupdated" "1700000000"\n    }\n  }\n}\n', 'utf8');
  fs.writeFileSync(path.join(home, 'mods', 'default.txt'), 'mod=WorkshopMod\n', 'utf8');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'scan-b42.cjs'), '--zomboid-home', home, '--output', output, '--steam-workshop-root', steamRoot], { stdio: 'pipe' });
  const workshop = JSON.parse(fs.readFileSync(output, 'utf8')).modSummary[0];
  assert.equal(workshop.updatedAt, 1700000000);
  assert.equal(workshop.steamUpdatedAt, 1700000000);
  assert.equal(workshop.metadataSource, 'steam_install_update');
  console.log('scan catalog test passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
