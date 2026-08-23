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
const status = path.join(root, 'status.ini');
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
function legacyMod(id, translations) {
  const base = path.join(home, 'mods', id, 'common');
  const translate = path.join(base, 'media', 'lua', 'shared', 'Translate');
  fs.mkdirSync(translate, { recursive: true });
  fs.writeFileSync(path.join(base, 'mod.info'), `name=${id}\nid=${id}\n`, 'utf8');
  for (const [language, values] of Object.entries(translations)) {
    const category = 'IG_UI';
    const rows = Object.entries(values).map(([key, value]) => `\t${key} = "${value}",`).join('\n');
    const dir = path.join(translate, language);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${category}_${language}.txt`), `${category}_${language} = {\n${rows}\n}\n`, 'utf8');
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
  assert.deepEqual({ ...stat, updatedAt: 0 }, { modId: 'MainMod', candidates: 4, existing: 1, existing_overlay: 1, existing_generated: 1, reused: 0, pending: 1, craftRecipes: 0, sourceChars: 47, apiChars: 9, large: 0, updatedAt: 0, steamUpdatedAt: 0, metadataSource: 'local_file' });
  assert.ok(stat.updatedAt > 0);
  for (const emptyMod of manifest.modSummary.filter(item => item.modId !== 'MainMod')) assert.equal(emptyMod.candidates, 0);
  const catalogLines = ['schema=pzat-catalog-v1', 'generatedAt=' + manifest.generatedAt, 'targetLanguage=KO'];
  for (const item of manifest.modSummary) catalogLines.push('mod=' + item.modId, 'candidates=' + item.candidates, 'existing=' + item.existing, 'existing_overlay=' + item.existing_overlay, 'existing_generated=' + item.existing_generated, 'pending=' + item.pending, 'sourceChars=' + item.sourceChars, 'apiChars=' + item.apiChars, 'large=' + item.large, 'updatedAt=' + item.updatedAt, 'steamUpdatedAt=' + item.steamUpdatedAt, 'metadataSource=' + item.metadataSource);
  assert.equal(fs.readFileSync(catalog, 'utf8'), catalogLines.join('\n') + '\n');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'translate-b42.cjs'), '--manifest', output, '--rules', path.join(__dirname, '..', 'config', 'rules.example.json'), '--output', translated, '--translation-memory', resumeMemory, '--status-file', status, '--dry-run'], { stdio: 'pipe' });
  const statusText = fs.readFileSync(status, 'utf8');
  assert.match(statusText, /apiCharacters=9/);
  assert.match(statusText, /requestCount=1/);
  assert.match(statusText, /estimatedInputTokens=3/);
  const pauseFile = path.join(root, 'pause.ini');
  const pausedStatus = path.join(root, 'paused-status.ini');
  const provider = path.join(root, 'provider.json');
  fs.writeFileSync(pauseFile, 'paused=1\n', 'utf8');
  fs.writeFileSync(provider, JSON.stringify({ provider: 'openai', baseUrl: 'http://127.0.0.1:1', model: 'test', apiKey: 'test' }), 'utf8');
  const paused = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'translate-b42.cjs'), '--manifest', output, '--rules', path.join(__dirname, '..', 'config', 'rules.example.json'), '--provider', provider, '--output', path.join(root, 'paused-output.json'), '--translation-memory', path.join(root, 'paused-memory.json'), '--status-file', pausedStatus, '--pause-file', pauseFile], { encoding: 'utf8' });
  assert.notEqual(paused.status, 0);
  assert.match(fs.readFileSync(pausedStatus, 'utf8'), /phase=paused/);  const translation = JSON.parse(fs.readFileSync(translated, 'utf8'));
  assert.deepEqual(translation.summary, { pending: 1, reused: 1, validated: 2, needsReview: 0 });
  assert.deepEqual(translation.records.map(record => [record.key, record.method]).sort(), [
    ['generated', 'translation-memory'], ['pending', 'dry-run']
  ]);
  const resume = JSON.parse(fs.readFileSync(resumeMemory, 'utf8'));
  assert.equal(resume.records.some(record => record.id.endsWith(hash('Needs API')) && record.target === '[DRY-RUN KO] Needs API'), true);
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'scan-b42.cjs'), '--zomboid-home', home, '--output', output, '--translation-memory', resumeMemory, '--include-mods', 'MainMod', '--no-catalog'], { stdio: 'pipe' });
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).summary.pending, 0);
  assert.match(fs.readFileSync(catalog, 'utf8'), /mod=ExternalOverlay/);

  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'scan-b42.cjs'), '--zomboid-home', home, '--output', output, '--translation-memory', memory, '--include-mods', 'MainMod', '--skip-mods-with-target'], { stdio: 'pipe' });
  const skipped = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(skipped.summary.skippedModsWithTarget, 1);
  assert.deepEqual(skipped.records, []);

  legacyMod('LegacyVehicle', {
    EN: { IGUI_VehicleNameLegacy: '89 LAND ROVER Defender', IGUI_VehiclePartLegacySeat: 'Seat' },
    KO: { IGUI_VehiclePartLegacySeat: '좌석' },
  });
  fs.writeFileSync(path.join(home, 'mods', 'default.txt'), 'mod=LegacyVehicle\n', 'utf8');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'scan-b42.cjs'), '--zomboid-home', home, '--output', output, '--translation-memory', memory], { stdio: 'pipe' });
  const legacy = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.deepEqual(legacy.modSummary[0] && { candidates: legacy.modSummary[0].candidates, existing: legacy.modSummary[0].existing, pending: legacy.modSummary[0].pending }, { candidates: 2, existing: 1, pending: 1 });
  const legacyRecord = legacy.records.find(record => record.key === 'IGUI_VehicleNameLegacy');
  assert.equal(legacyRecord.sourceFormat, 'legacy-lua');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'translate-b42.cjs'), '--manifest', output, '--rules', path.join(__dirname, '..', 'config', 'rules.example.json'), '--output', translated, '--dry-run'], { stdio: 'pipe' });
  const legacyPack = path.join(root, 'legacy-pack');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'materialize-b42.cjs'), '--input', translated, '--output', legacyPack, '--allow-dry-run'], { stdio: 'pipe' });
  assert.match(fs.readFileSync(path.join(legacyPack, 'common', 'media', 'lua', 'shared', 'Translate', 'KO', 'IG_UI_KO.txt'), 'utf8'), /IGUI_VehicleNameLegacy = "\[DRY-RUN KO\] 89 LAND ROVER Defender",/);

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
  mod('OversizeMod', { EN: { oversized: 'x'.repeat(20000) } });
  fs.writeFileSync(path.join(home, 'mods', 'default.txt'), 'mod=OversizeMod\n', 'utf8');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'scan-b42.cjs'), '--zomboid-home', home, '--output', output], { stdio: 'pipe' });
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).modSummary[0].large, 1);  console.log('scan catalog test passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
