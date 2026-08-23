#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { unchangedNeedsTranslation, reusableGeneratedTarget } = require('../tools/worker/translation-quality.cjs');
const { validate } = require('../tools/worker/translate-b42.cjs');

const recipe = { category: 'Recipes', key: 'Recipe_Test', source: 'Make Test Front Bumper' };
assert.equal(unchangedNeedsTranslation(recipe, recipe.source), true);
assert.equal(validate(recipe.source, recipe.source, recipe), 'provider returned untranslated source text');
assert.equal(reusableGeneratedTarget(recipe, recipe.source), null);
assert.equal(unchangedNeedsTranslation({ category: 'IG_UI', key: 'IGUI_VehiclePartTrunk', source: 'Trunk Storage' }, 'Trunk Storage'), true);
assert.equal(unchangedNeedsTranslation({ category: 'Recipes', key: 'internalMakeDoor', source: 'internalMakeDoor' }, 'internalMakeDoor'), false);
assert.equal(unchangedNeedsTranslation({ category: 'IG_UI', key: 'IGUI_VehicleNameTest', source: "'65 Test Car" }, "'65 Test Car"), false);
assert.equal(unchangedNeedsTranslation(recipe, '테스트 전면 범퍼 제작'), false);

console.log('translation quality test passed');
