#!/usr/bin/env node
'use strict';

function normalized(value) { return String(value || '').trim().replace(/\s+/g, ' '); }

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
  return typeof target === 'string' && target.trim() && !unchangedNeedsTranslation(record, target) ? target : null;
}

module.exports = { unchangedNeedsTranslation, reusableGeneratedTarget };
