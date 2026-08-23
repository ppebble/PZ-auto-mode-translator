#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function encodeIniValue(value) {
  return String(value ?? '').replace(/%/g, '%25').replace(/=/g, '%3D').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function decodeIniValue(value) {
  return String(value ?? '').replace(/%([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function writeRecords(file, schema, marker, records, metadata = {}) {
  const lines = ['schema=' + encodeIniValue(schema)];
  for (const [key, value] of Object.entries(metadata)) lines.push(key + '=' + encodeIniValue(value));
  for (const record of records || []) {
    lines.push(marker + '=' + encodeIniValue(record.id || ''));
    for (const [key, value] of Object.entries(record)) {
      if (key === 'id' || value === undefined || value === null) continue;
      lines.push(key + '=' + encodeIniValue(value));
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return { file, records: (records || []).length };
}

function readRecords(file, marker) {
  if (!file || !fs.existsSync(file)) return [];
  const records = []; let current = null;
  for (const raw of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const separator = raw.indexOf('=');
    if (separator < 0) continue;
    const key = raw.slice(0, separator); const value = decodeIniValue(raw.slice(separator + 1));
    if (key === marker) {
      current = { id: value }; records.push(current);
    } else if (current) current[key] = value;
  }
  return records;
}

function loadUserRules(file) {
  return readRecords(file, 'rule').filter(record => record.id && record.pattern).map(record => ({
    id: record.id,
    enabled: record.enabled !== '0',
    kind: record.kind === 'glossary' ? 'glossary' : (record.kind === 'exact' ? 'exact' : 'regex'),
    pattern: record.pattern,
    replacement: record.replacement || '',
    priority: Number(record.priority || 500),
    flags: record.flags || 'g',
    scope: {
      ...(record.modId ? { modId: record.modId } : {}),
      ...(record.category ? { category: record.category } : {}),
    },
    userDefined: true,
  }));
}

function mergeUserRules(base, userRules) {
  const incoming = userRules || [];
  const ids = new Set(incoming.map(rule => rule.id));
  return {
    ...base,
    rules: [...(base.rules || []).filter(rule => !ids.has(rule.id)), ...incoming],
    glossary: { ...(base.glossary || {}) },
    doNotTranslate: [...(base.doNotTranslate || [])],
  };
}

module.exports = { encodeIniValue, decodeIniValue, writeRecords, readRecords, loadUserRules, mergeUserRules };
