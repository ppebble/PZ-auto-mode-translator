#!/usr/bin/env node
'use strict';

function normalized(value) { return String(value || '').trim().replace(/\s+/g, ' '); }

function normalizeKnownTranslation(record, target) {
  if (typeof target !== 'string') return target;
  const source = normalized(record && record.source);
  const key = String(record && record.key || '');
  const category = String(record && record.category || '').toLowerCase();
  const salvageContext = /salvag/i.test(source) || /salvag/i.test(key);
  if (salvageContext && ['recipes', 'ig_ui', 'sandbox'].includes(category)) return target.replace(/수집/g, '해체');
  return target;
}

function unchangedNeedsTranslation(record, target) {
  if (!record || normalized(record.source) !== normalized(target)) return false;
  const source = normalized(record.source);
  if (!/[A-Za-z]/.test(source)) return false;
  // Script-derived recipe identifiers are not human translation sources.
  if (source === normalized(record.key)) return false;
  // Vehicle model names are identities; translate surrounding UI and parts,
  // but do not force a localized model name.
  if (String(record.category).toLowerCase() === 'ig_ui' && /vehiclename/i.test(String(record.key))) return false;
  return true;
}

function reusableGeneratedTarget(record, target) {
  const normalizedTarget = normalizeKnownTranslation(record, target);
  return typeof normalizedTarget === 'string' && normalizedTarget.trim() && !unchangedNeedsTranslation(record, normalizedTarget) ? normalizedTarget : null;
}

module.exports = { unchangedNeedsTranslation, reusableGeneratedTarget, normalizeKnownTranslation };
