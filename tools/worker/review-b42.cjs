#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeRecords, readRecords } = require('./local-controls.cjs');
const { validate } = require('./translate-b42.cjs');

function arg(name, fallback) { const index = process.argv.indexOf(name); return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); }

function exportReview(input, output) {
  const manifest = readJson(input);
  const records = manifest.records.filter(record => ['validated', 'needs_review'].includes(record.status)).map(record => ({
    id: record.id,
    modId: record.modId || '',
    category: record.category || '',
    key: record.key || '',
    source: record.source || '',
    target: record.target || '',
    status: record.status || '',
    method: record.method || '',
    reason: record.reason || '',
  }));
  writeRecords(output, 'pzat-review-v1', 'record', records, { targetLanguage: manifest.targetLanguage || '', generatedAt: new Date().toISOString() });
  return { output, records: records.length, needsReview: records.filter(record => record.status === 'needs_review').length };
}

function updateMemory(file, manifest) {
  if (!file) return;
  let existing = { schema: 'pzat-translation-v1', targetLanguage: manifest.targetLanguage, records: [] };
  if (fs.existsSync(file)) {
    try { existing = readJson(file); } catch {}
  }
  const memory = new Map((existing.targetLanguage === manifest.targetLanguage ? existing.records || [] : []).filter(record => record.id).map(record => [record.id, record]));
  for (const record of manifest.records) {
    if (record.status === 'validated' && typeof record.target === 'string' && record.target.trim()) memory.set(record.id, { id: record.id, status: 'validated', target: record.target });
  }
  writeJson(file, { schema: 'pzat-translation-v1', generatedAt: new Date().toISOString(), targetLanguage: manifest.targetLanguage, records: [...memory.values()] });
}

function applyReviewEdits(input, editsFile, output, memoryFile) {
  const manifest = readJson(input);
  const records = new Map(manifest.records.map(record => [record.id, record]));
  const rejected = []; let applied = 0;
  for (const edit of readRecords(editsFile, 'edit')) {
    const record = records.get(edit.id);
    if (!record) { rejected.push({ id: edit.id, reason: 'record not found' }); continue; }
    const target = String(edit.target || '').trim();
    const error = !target ? 'target is empty' : validate(record.source, target, record);
    if (error) { rejected.push({ id: edit.id, reason: error }); continue; }
    Object.assign(record, { target, status: 'validated', method: 'user-review', reason: null, appliedRules: [] });
    applied++;
  }
  manifest.generatedAt = new Date().toISOString();
  manifest.records = [...records.values()];
  manifest.summary = {
    ...(manifest.summary || {}),
    reused: manifest.records.filter(record => record.status === 'validated' && record.method === 'translation-memory').length,
    validated: manifest.records.filter(record => record.status === 'validated').length,
    needsReview: manifest.records.filter(record => record.status === 'needs_review').length,
  };
  writeJson(output, manifest);
  updateMemory(memoryFile, manifest);
  return { output, applied, rejected: rejected.length, errors: rejected, summary: manifest.summary };
}

function main() {
  const mode = arg('--mode', 'export');
  const input = arg('--input', 'runtime/translated-manifest.json');
  const reportFile = arg('--report', '');
  let result;
  if (mode === 'export') {
    result = exportReview(input, arg('--output', 'runtime/review.ini'));
  } else if (mode === 'apply') {
    result = applyReviewEdits(input, arg('--edits', ''), arg('--output', input), arg('--translation-memory', 'runtime/translation-memory.json'));
  } else {
    throw new Error('Unsupported review mode: ' + mode);
  }
  if (reportFile) writeJson(reportFile, result);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { exportReview, applyReviewEdits };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exit(1); }
}
