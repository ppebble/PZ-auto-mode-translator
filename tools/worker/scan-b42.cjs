#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const LARGE_MOD_API_CHARS = 20000;
const path = require('node:path');
const crypto = require('node:crypto');
const { reusableGeneratedTarget } = require('./translation-quality.cjs');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const zomboidHome = arg('--zomboid-home', path.join(process.env.USERPROFILE || '', 'Zomboid'));
const output = arg('--output', path.join(process.cwd(), 'runtime', 'scan-manifest.json'));
const targetLanguage = arg('--target-language', 'KO').toUpperCase();
const catalog = arg('--catalog', path.join(zomboidHome, 'Lua', 'PZAITranslator_catalog.ini'));
const steamWorkshopRoot = arg('--steam-workshop-root', path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam', 'steamapps', 'workshop', 'content', '108600'));
const steamAppWorkshop = arg('--steam-appworkshop', path.join(path.dirname(path.dirname(steamWorkshopRoot)), 'appworkshop_108600.acf'));
const excluded = new Set((arg('--exclude', 'PZAITranslator') || '').split(',').map(x => x.trim()).filter(Boolean));
const included = new Set((arg('--include-mods', '') || '').split(',').map(x => x.trim()).filter(Boolean));
const noCatalog = process.argv.includes('--no-catalog');
const skipModsWithTarget = process.argv.includes('--skip-mods-with-target');
const translationMemoryPath = arg('--translation-memory', path.join(process.cwd(), 'runtime', 'translation-memory.json'));
const defaultList = path.join(zomboidHome, 'mods', 'default.txt');
const versionFile = path.join(zomboidHome, 'version.txt');
const gameVersion = arg('--game-version', fs.existsSync(versionFile) ? readText(versionFile).trim().split(/\s+/)[0] : '42.20.0');
const roots = [
  path.join(zomboidHome, 'mods'),
  path.join(zomboidHome, 'Workshop'),
  steamWorkshopRoot,
].filter(fs.existsSync);

function readText(file) { return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); }
function sha256(text) { return crypto.createHash('sha256').update(text, 'utf8').digest('hex'); }
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
function activeIds(text) {
  // Parse one physical line at a time.  The old multiline regex consumed the
  // newline after a trailing comma, so RegExp#matchAll resumed on the next
  // line and silently skipped every second active mod.
  return text.split(/\r?\n/)
    .map(line => line.match(/^\s*mod\s*=\s*(.*?)\s*,?\s*$/i))
    .filter(Boolean).map(match => match[1].trim()).filter(Boolean);
}
function modInfoId(file) {
  try {
    const line = readText(file).split(/\r?\n/).find(x => /^\s*id\s*=/.test(x));
    return line ? line.replace(/^\s*id\s*=\s*/, '').trim() : null;
  } catch { return null; }
}
function parseVdf(text) {
  const tokens = [...text.matchAll(/"((?:\\.|[^"\\])*)"|([{}])/g)].map(match => match[1] === undefined ? match[2] : match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  let index = 0;
  function object() {
    const result = {};
    while (index < tokens.length && tokens[index] !== '}') {
      const key = tokens[index++];
      if (tokens[index] === '{') { index++; result[key] = object(); if (tokens[index] === '}') index++; }
      else result[key] = tokens[index++] || '';
    }
    return result;
  }
  return object();
}
function workshopMetadata() {
  if (!fs.existsSync(steamAppWorkshop)) return new Map();
  try {
    const app = parseVdf(readText(steamAppWorkshop)).AppWorkshop || {};
    const entries = app.WorkshopItemsInstalled || app.WorkshopItemDetails || {};
    return new Map(Object.entries(entries).map(([id, item]) => [id, Number(item.timeupdated) || 0]));
  } catch { return new Map(); }
}
function modUpdatedMetadata(modDir, workshopTimes) {
  let localUpdatedAt = 0;
  try { localUpdatedAt = Math.floor(fs.statSync(modDir).mtimeMs / 1000); } catch {}
  const relative = path.relative(steamWorkshopRoot, modDir);
  const workshopId = !relative.startsWith('..') && !path.isAbsolute(relative) ? relative.split(path.sep)[0] : null;
  const workshopUpdatedAt = workshopId && /^\d+$/.test(workshopId) ? (workshopTimes.get(workshopId) || 0) : 0;
  return workshopUpdatedAt > 0
    ? { updatedAt: workshopUpdatedAt, steamUpdatedAt: workshopUpdatedAt, metadataSource: 'steam_install_update', workshopId }
    : { updatedAt: localUpdatedAt, steamUpdatedAt: 0, metadataSource: 'local_file', workshopId: null };
}
function resolveMods(ids) {
  const index = new Map();
  for (const root of roots) {
    for (const info of walk(root).filter(x => path.basename(x).toLowerCase() === 'mod.info')) {
      const id = modInfoId(info);
      if (id && !index.has(id)) { const folder = path.dirname(info); const leaf = path.basename(folder).toLowerCase(); const root = (leaf === 'common' || /^\d/.test(leaf)) ? path.dirname(folder) : folder; index.set(id, root); }
    }
  }
  const workshopTimes = workshopMetadata();
  return ids.map(id => {
    const dir = index.get(id) || null;
    return { id, dir, ...(dir ? modUpdatedMetadata(dir, workshopTimes) : { updatedAt: 0, steamUpdatedAt: 0, metadataSource: 'unresolved', workshopId: null }) };
  });
}
function compareVersions(a, b) {
  const aa = a.split('.').map(Number); const bb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) { const d = (aa[i] || 0) - (bb[i] || 0); if (d) return d; }
  return 0;
}
function findTranslateRoots(modDir) {
  const roots = new Set();
  for (const file of walk(modDir)) {
    let dir = path.dirname(file);
    while (dir.startsWith(modDir) && dir !== path.dirname(dir)) {
      if (path.basename(dir).toLowerCase() === 'translate') roots.add(dir);
      dir = path.dirname(dir);
    }
  }
  const candidates = [...roots].map(translateRoot => {
    const parts = path.relative(modDir, translateRoot).split(path.sep).map(x => x.toLowerCase());
    if (parts.includes('common')) return { translateRoot, layout: 'common', version: null, rank: 1 };
    const version = parts.find(x => /^\d+(?:\.\d+)*$/.test(x));
    // Many B42-compatible Workshop mods still place their fallback media tree at
    // the mod root. Keep it as the lowest-precedence layout, then let common and
    // the selected B42 version replace matching keys.
    return version ? { translateRoot, layout: 'version', version, rank: 2 } : { translateRoot, layout: 'legacy', version: null, rank: 0 };
  });
  const versionCandidates = candidates.filter(x => x.layout === 'version' && compareVersions(x.version, '42') >= 0 && compareVersions(x.version, gameVersion) <= 0);
  const selectedVersion = versionCandidates.map(x => x.version).sort(compareVersions).at(-1) || null;
  return candidates.filter(x => x.layout === 'legacy' || x.layout === 'common' || x.version === selectedVersion)
    .sort((a, b) => a.rank - b.rank || String(a.translateRoot).localeCompare(String(b.translateRoot)));
}
function layoutInfo(modDir, file) {
  const parts = path.relative(modDir, file).split(path.sep).map(x => x.toLowerCase());
  if (parts.includes('common')) return { layout: 'common', version: null, rank: 1 };
  const version = parts.find(x => /^\d+(?:\.\d+)*$/.test(x));
  return version ? { layout: 'version', version, rank: 2 } : { layout: 'legacy', version: null, rank: 0 };
}
function selectEffectiveFiles(modDir, files) {
  const candidates = files.map(file => ({ file, ...layoutInfo(modDir, file) }));
  const versions = candidates.filter(x => x.layout === 'version' && compareVersions(x.version, '42') >= 0 && compareVersions(x.version, gameVersion) <= 0)
    .map(x => x.version).sort(compareVersions);
  const selectedVersion = versions.at(-1) || null;
  return candidates.filter(x => x.layout === 'legacy' || x.layout === 'common' || x.version === selectedVersion);
}
function craftRecipeNames(file) {
  const text = readText(file);
  // Build 42 uses the recipe identifier after `craftRecipe` as the display
  // lookup key.  Third-party scripts frequently use human-readable keys with
  // spaces (for example, "Salvage Vehicle Doors").
  return [...text.matchAll(/^\s*craftRecipe\s+(.+?)\s*(?:\r?\n)?\s*\{/gmi)]
    .map(match => match[1].trim()).filter(Boolean);
}
function removeTrailingCommas(text) {
  return text.replace(/,(\s*[}\]])/g, '$1');
}
function parseObject(file) {
  const text = readText(file);
  try { return { text, value: JSON.parse(text), error: null, normalized: false }; }
  catch (firstError) {
    try { return { text, value: JSON.parse(removeTrailingCommas(text)), error: null, normalized: true }; }
    catch (error) { return { text, value: null, error: String(error.message || firstError.message || error), normalized: false }; }
  }
}
function unescapeLuaString(value) {
  return value.replace(/\\\\([\\\\"'nrt])/g, (_, escaped) => ({ n: '\n', r: '\r', t: '\t' }[escaped] || escaped));
}
function parseLegacyTranslation(file, language) {
  const text = readText(file);
  const suffix = new RegExp('_' + language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
  const category = path.basename(file, '.txt').replace(suffix, '');
  // File names and table names are not consistently paired in Workshop mods:
  // `IG_UI_EN.txt` commonly contains `IGUI_EN`, and `Recipes_EN.txt` may use
  // `RecipesEN`. The table name is what PZ loads, so retain it for output.
  const header = text.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=?\s*\{/m);
  if (!category || !header) return { value: null, category, error: 'expected Lua translation table' };
  const value = {};
  for (const match of text.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"((?:\\.|[^"\\])*)"\s*,?\s*(?:--.*)?$/gm)) value[match[1]] = unescapeLuaString(match[2]);
  return { value, category, tableName: header[1], error: null };
}
function legacyTranslationFiles(dir, language) {
  if (!fs.existsSync(dir)) return [];
  const suffix = '_' + language.toLowerCase() + '.txt';
  return fs.readdirSync(dir).filter(file => file.toLowerCase().endsWith(suffix));
}
function isTranslatable(value) {
  return typeof value === 'string' && value.trim() !== '';
}
function hasTargetTranslation(modDir) {
  return findTranslateRoots(modDir).some(rootInfo => {
    const targetDir = path.join(rootInfo.translateRoot, targetLanguage);
    if (!fs.existsSync(targetDir)) return false;
    return fs.readdirSync(targetDir).some(file => {
      if (!file.toLowerCase().endsWith('.json')) return false;
      if (path.basename(file, '.json').toLowerCase() === 'mod') return false;
      const parsed = parseObject(path.join(targetDir, file));
      return !parsed.error && parsed.value && !Array.isArray(parsed.value) && typeof parsed.value === 'object'
        && Object.values(parsed.value).some(isTranslatable);
    }) || legacyTranslationFiles(targetDir, targetLanguage).some(file => {
      const parsed = parseLegacyTranslation(path.join(targetDir, file), targetLanguage);
      if (parsed.category && parsed.category.toLowerCase() === 'mod') return false;
      return !parsed.error && Object.values(parsed.value).some(isTranslatable);
    });
  });
}
function loadTranslationMemory(file) {
  if (!file || !fs.existsSync(file)) return new Map();
  try {
    const data = JSON.parse(readText(file));
    if (data.schema !== 'pzat-translation-v1' || data.targetLanguage !== targetLanguage || !Array.isArray(data.records)) return new Map();
    return new Map(data.records.filter(record => record.status === 'validated' && typeof record.target === 'string' && record.target.trim() !== '')
      .map(record => [record.id, record.target]));
  } catch { return new Map(); }
}
function effectiveTargetMap(mods) {
  const map = new Map();
  for (const mod of mods) {
    if (!mod.dir) continue;
    for (const rootInfo of findTranslateRoots(mod.dir)) {
      const dir = path.join(rootInfo.translateRoot, targetLanguage);
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir).filter(x => x.toLowerCase().endsWith('.json'))) {
        const parsed = parseObject(path.join(dir, file));
        if (parsed.error || !parsed.value || Array.isArray(parsed.value)) continue;
        const category = path.basename(file, '.json').toLowerCase();
        if (category === 'mod') continue;
        for (const [key, value] of Object.entries(parsed.value)) if (isTranslatable(value)) map.set(category + '|' + key, { target: value, modId: mod.id });
      }
      for (const file of legacyTranslationFiles(dir, targetLanguage)) {
        const parsed = parseLegacyTranslation(path.join(dir, file), targetLanguage);
        if (parsed.error || !parsed.value) continue;
        const category = parsed.category.toLowerCase();
        if (category === 'mod') continue;
        for (const [key, value] of Object.entries(parsed.value)) if (isTranslatable(value)) map.set(category + '|' + key, { target: value, modId: mod.id });
      }
    }
  }
  return map;
}
function writeCatalog(file, result) {
  // Keep the catalog deliberately flat so game-side Lua can read it with the
  // same line-based API used for the provider and model settings. `mod=` starts
  // a new record; the following counters belong to that mod.
  const lines = [
    'schema=pzat-catalog-v1',
    'generatedAt=' + result.generatedAt,
    'targetLanguage=' + result.targetLanguage,
  ];
  for (const stat of result.modSummary) {
    lines.push('mod=' + stat.modId);
    for (const key of ['candidates', 'existing', 'existing_overlay', 'existing_generated', 'pending', 'sourceChars', 'apiChars', 'large', 'updatedAt', 'steamUpdatedAt', 'metadataSource']) {
      lines.push(key + '=' + (stat[key] || 0));
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, lines.join('\n') + '\n', 'utf8');
  try { fs.renameSync(temporary, file); }
  catch (error) {
    // A few Windows file systems do not replace an existing destination on
    // rename. The fallback is still safe because the complete replacement has
    // already been written to a sibling temporary file.
    if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error;
    fs.rmSync(file, { force: true }); fs.renameSync(temporary, file);
  }
}
function main() {
  if (!fs.existsSync(defaultList)) throw new Error(`Active mod list not found: ${defaultList}`);
  const ids = activeIds(readText(defaultList));
  const mods = resolveMods(ids);
  const records = new Map();
  const errors = [];
  const memory = loadTranslationMemory(translationMemoryPath);
  const overlays = effectiveTargetMap(mods);
  const summary = { gameVersion, activeMods: ids.length, resolvedMods: 0, unresolvedMods: 0, excludedMods: 0, skippedModsWithTarget: 0, translateRoots: 0, files: 0, scriptFiles: 0, craftRecipes: 0, existing: 0, existing_overlay: 0, existing_generated: 0, reused: 0, pending: 0, normalizedJson: 0, errors: 0 };

  for (const mod of mods) {
    if (excluded.has(mod.id) || (included.size > 0 && !included.has(mod.id))) { summary.excludedMods++; continue; }
    if (!mod.dir) { summary.unresolvedMods++; errors.push({ modId: mod.id, error: 'mod.info not resolved' }); continue; }
    summary.resolvedMods++;
    if (skipModsWithTarget && hasTargetTranslation(mod.dir)) { summary.skippedModsWithTarget++; continue; }
    for (const rootInfo of findTranslateRoots(mod.dir)) { summary.translateRoots++;
      const translateRoot = rootInfo.translateRoot;
      const enDir = path.join(translateRoot, 'EN');
      if (!fs.existsSync(enDir)) continue;
      for (const sourceFile of fs.readdirSync(enDir).filter(x => x.toLowerCase().endsWith('.json'))) {
        const sourcePath = path.join(enDir, sourceFile);
        const category = path.basename(sourceFile, '.json');
        if (category.toLowerCase() === 'mod') continue;
        const source = parseObject(sourcePath);
        summary.files++;
        if (source.error || !source.value || Array.isArray(source.value) || typeof source.value !== 'object') {
          summary.errors++;
          errors.push({ modId: mod.id, category, file: sourcePath, error: source.error || 'expected JSON object' });
          continue;
        }
        if (source.normalized) summary.normalizedJson++;
        const targetPath = path.join(translateRoot, targetLanguage, sourceFile);
        let target = {};
        if (fs.existsSync(targetPath)) {
          const parsed = parseObject(targetPath);
          if (parsed.error || !parsed.value || Array.isArray(parsed.value) || typeof parsed.value !== 'object') {
            summary.errors++;
            errors.push({ modId: mod.id, category, file: targetPath, error: parsed.error || 'invalid target JSON object' });
            continue;
          }
          if (parsed.normalized) summary.normalizedJson++;
          target = parsed.value;
        }
        for (const [key, value] of Object.entries(source.value)) {
          if (!isTranslatable(value)) continue;
          const id = `${mod.id}|${category}|${key}|${sha256(value)}`;
          const qualityRecord = { category, key, source: value };
          const reusedTarget = reusableGeneratedTarget(qualityRecord, memory.get(id));
          const overlay = overlays.get(category.toLowerCase() + '|' + key);
          const externalOverlay = overlay && overlay.modId !== mod.id && overlay.modId !== 'PZAITranslationGenerated';
          const generatedOverlay = overlay && overlay.modId === 'PZAITranslationGenerated';
          const generatedTarget = generatedOverlay ? reusableGeneratedTarget(qualityRecord, overlay.target) : null;
          const status = isTranslatable(target[key]) ? 'existing' : (externalOverlay ? 'existing_overlay' : ((reusedTarget || generatedTarget) ? 'existing_generated' : 'pending'));
          summary[status]++;
          // Version-specific B42 files intentionally replace common files for the same key.
          records.set(`${mod.id}|${category.toLowerCase()}|${key}`, {
            id,
            modId: mod.id, modPath: mod.dir, category, sourceFile,
            layout: rootInfo.layout, layoutVersion: rootInfo.version,
            key, source: value, target: isTranslatable(target[key]) ? target[key] : (reusedTarget || generatedTarget || (externalOverlay ? overlay.target : null)),
            targetLanguage, sourceHash: sha256(value), status,
          });
        }
      }
      for (const sourceFile of legacyTranslationFiles(enDir, 'EN')) {
        const sourcePath = path.join(enDir, sourceFile);
        const source = parseLegacyTranslation(sourcePath, 'EN');
        const category = source.category;
        if (category && category.toLowerCase() === 'mod') continue;
        summary.files++;
        if (source.error || !source.value) {
          summary.errors++;
          errors.push({ modId: mod.id, category, file: sourcePath, error: source.error || 'invalid Lua translation table' });
          continue;
        }
        const targetPath = path.join(translateRoot, targetLanguage, category + '_' + targetLanguage + '.txt');
        const target = fs.existsSync(targetPath) ? parseLegacyTranslation(targetPath, targetLanguage) : { value: {} };
        if (target.error || !target.value) {
          summary.errors++;
          errors.push({ modId: mod.id, category, file: targetPath, error: target.error || 'invalid target Lua translation table' });
          continue;
        }
        for (const [key, value] of Object.entries(source.value)) {
          if (!isTranslatable(value)) continue;
          const recordKey = `${mod.id}|${category.toLowerCase()}|${key}`;
          const existingRecord = records.get(recordKey);
          // Many B42 mods ship JSON and legacy Lua translations with the same
          // keys for cross-version compatibility. Within the same effective
          // root, keep B42 JSON authoritative and collect only legacy-only
          // keys. A later version-specific root may still replace common data.
          if (existingRecord && existingRecord.layout === rootInfo.layout && existingRecord.layoutVersion === rootInfo.version) continue;
          const id = `${mod.id}|${category}|${key}|${sha256(value)}`;
          const qualityRecord = { category, key, source: value };
          const reusedTarget = reusableGeneratedTarget(qualityRecord, memory.get(id));
          const overlay = overlays.get(category.toLowerCase() + '|' + key);
          const externalOverlay = overlay && overlay.modId !== mod.id && overlay.modId !== 'PZAITranslationGenerated';
          const generatedOverlay = overlay && overlay.modId === 'PZAITranslationGenerated';
          const generatedTarget = generatedOverlay ? reusableGeneratedTarget(qualityRecord, overlay.target) : null;
          const status = isTranslatable(target.value[key]) ? 'existing' : (externalOverlay ? 'existing_overlay' : ((reusedTarget || generatedTarget) ? 'existing_generated' : 'pending'));
          summary[status]++;
          records.set(recordKey, {
            id, modId: mod.id, modPath: mod.dir, category, sourceFile,
            layout: rootInfo.layout, layoutVersion: rootInfo.version,
            key, source: value, target: isTranslatable(target.value[key]) ? target.value[key] : (reusedTarget || generatedTarget || (externalOverlay ? overlay.target : null)),
            targetLanguage, sourceHash: sha256(value), status, sourceFormat: 'legacy-lua', legacyTable: source.tableName,
          });
        }
      }
    }
    // B42 crafting recipes are authored in media/scripts rather than in
    // Translate/EN JSON.  Emit compatible Recipes.json entries for their
    // identifiers so the generated overlay can localize the crafting window.
    const scriptFiles = walk(mod.dir).filter(file => {
      if (path.extname(file).toLowerCase() !== '.txt') return false;
      const parts = path.relative(mod.dir, file).split(path.sep).map(x => x.toLowerCase());
      return parts.includes('media') && parts.includes('scripts');
    });
    for (const script of selectEffectiveFiles(mod.dir, scriptFiles)) {
      summary.scriptFiles++;
      let names;
      try { names = craftRecipeNames(script.file); }
      catch (error) { summary.errors++; errors.push({ modId: mod.id, file: script.file, error: String(error.message || error) }); continue; }
      for (const key of names) {
        const recordKey = `${mod.id}|recipes|${key}`;
        const legacyRecordKey = `${mod.id}|recipes|Recipe_${key}`;
        const legacyRecord = records.get(legacyRecordKey);
        // A proper Translate/EN/Recipes.json entry is the higher-quality
        // source when the mod supplies one; scripts fill only missing keys.
        // Some B42 mods still ship the older Recipes_EN.txt key shape
        // (`Recipe_<craftRecipe id>`). Bridge its human-readable source and
        // validated target into the raw B42 Recipes.json key instead of
        // translating the internal camel-case identifier as a second item.
        if (records.has(recordKey)) {
          if (legacyRecord) records.delete(legacyRecordKey);
          continue;
        }
        summary.craftRecipes++;
        if (legacyRecord) records.delete(legacyRecordKey);
        const source = legacyRecord ? legacyRecord.source : key;
        const id = `${mod.id}|Recipes|${key}|${sha256(source)}`;
        const overlay = overlays.get('recipes|' + key);
        const generatedOverlay = overlay && overlay.modId === 'PZAITranslationGenerated';
        const externalOverlay = overlay && overlay.modId !== mod.id && !generatedOverlay;
        const qualityRecord = { category: 'Recipes', key, source };
        const memoryTarget = reusableGeneratedTarget(qualityRecord, memory.get(id));
        const generatedTarget = generatedOverlay && overlay.target !== key ? reusableGeneratedTarget(qualityRecord, overlay.target) : null;
        // A matching legacy target is the authoritative display text. This
        // also replaces stale generated JSON values that merely repeat `key`.
        const bridgedTarget = legacyRecord && isTranslatable(legacyRecord.target) && legacyRecord.target !== key ? legacyRecord.target : null;
        const target = externalOverlay ? overlay.target : (bridgedTarget || memoryTarget || generatedTarget || null);
        const status = externalOverlay ? 'existing_overlay' : (target ? 'existing_generated' : 'pending');
        records.set(recordKey, {
          id,
          modId: mod.id, modPath: mod.dir, category: 'Recipes',
          sourceFile: '@scripts/' + path.relative(mod.dir, script.file).replace(/\\/g, '/'),
          layout: script.layout, layoutVersion: script.version,
          key, source, target,
          targetLanguage, sourceHash: sha256(source), status, sourceKind: 'craftRecipe',
          legacySourceKey: legacyRecord ? legacyRecord.key : null,
        });
      }
    }
  }
  const finalRecords = [...records.values()];
  summary.existing = finalRecords.filter(x => x.status === 'existing').length;
  summary.existing_overlay = finalRecords.filter(x => x.status === 'existing_overlay').length;
  summary.existing_generated = finalRecords.filter(x => x.status === 'existing_generated').length;
  summary.reused = finalRecords.filter(x => x.status === 'existing_generated').length;
  summary.pending = finalRecords.filter(x => x.status === 'pending').length;
  const perMod = new Map();
  const eligibleMods = mods.filter(mod => mod.dir && !excluded.has(mod.id) && (included.size === 0 || included.has(mod.id)));
  for (const mod of eligibleMods) {
    perMod.set(mod.id, { modId: mod.id, candidates: 0, existing: 0, existing_overlay: 0, existing_generated: 0, reused: 0, pending: 0, craftRecipes: 0, sourceChars: 0, apiChars: 0, updatedAt: mod.updatedAt, steamUpdatedAt: mod.steamUpdatedAt, metadataSource: mod.metadataSource, large: 0 });
  }
  for (const record of finalRecords) {
    const stat = perMod.get(record.modId); stat.candidates++; stat[record.status]++; stat.sourceChars += Array.from(record.source).length; if (record.status === 'pending') stat.apiChars += Array.from(record.source).length; if (record.sourceKind === 'craftRecipe') stat.craftRecipes++;
  }
  for (const stat of perMod.values()) stat.large = stat.apiChars >= LARGE_MOD_API_CHARS ? 1 : 0;
  const result = { schema: 'pzat-scan-v1', generatedAt: new Date().toISOString(), targetLanguage, gameVersion, excluded: [...excluded], included: [...included], skipModsWithTarget, translationMemory: { path: translationMemoryPath, reused: summary.reused }, summary, modPaths: eligibleMods.map(mod => ({ modId: mod.id, modPath: mod.dir })), modSummary: [...perMod.values()].sort((a, b) => a.modId.localeCompare(b.modId)), errors, records: finalRecords };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2), 'utf8');
  if (!noCatalog) writeCatalog(catalog, result);
  console.log(JSON.stringify({ output, catalog, summary, errors: errors.length }, null, 2));
}
main();
