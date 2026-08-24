#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { unchangedNeedsTranslation, reusableGeneratedTarget, normalizeKnownTranslation } = require('../tools/worker/translation-quality.cjs');
const { validate } = require('../tools/worker/translate-b42.cjs');

const recipe = { category: 'Recipes', key: 'Recipe_Test', source: 'Make Test Front Bumper' };
assert.equal(unchangedNeedsTranslation(recipe, recipe.source), true);
assert.equal(validate(recipe.source, recipe.source, recipe), 'provider returned untranslated source text');
assert.equal(reusableGeneratedTarget(recipe, recipe.source), null);
assert.equal(unchangedNeedsTranslation({ category: 'IG_UI', key: 'IGUI_VehiclePartTrunk', source: 'Trunk Storage' }, 'Trunk Storage'), true);
assert.equal(unchangedNeedsTranslation({ category: 'Recipes', key: 'internalMakeDoor', source: 'internalMakeDoor' }, 'internalMakeDoor'), false);
assert.equal(unchangedNeedsTranslation({ category: 'IG_UI', key: 'IGUI_VehicleNameTest', source: "'65 Test Car" }, "'65 Test Car"), false);
assert.equal(unchangedNeedsTranslation(recipe, '테스트 전면 범퍼 제작'), false);

assert.equal(normalizeKnownTranslation({ category: 'Recipes', key: 'Salvage_Vehicle_Doors', source: 'Salvage Vehicle Doors' }, '차량 문 수집'), '차량 문 해체');
assert.equal(normalizeKnownTranslation({ category: 'IG_UI', key: 'IGUI_CraftingCategories_Salvage', source: 'Salvage' }, '수집'), '해체');
assert.equal(normalizeKnownTranslation({ category: 'Sandbox', key: 'Sandbox_VRO_EnableFullVehicleSalvaging', source: 'Full Vehicle Salvaging' }, '전체 차량 수집'), '전체 차량 해체');
assert.equal(normalizeKnownTranslation({ category: 'UI', key: 'CollectItems', source: 'Collect Items' }, '아이템 수집'), '아이템 수집');
assert.equal(reusableGeneratedTarget({ category: 'Recipes', key: 'Salvage_Vehicle_Tires', source: 'Salvage Vehicle Tires' }, '차량 타이어 수집'), '차량 타이어 해체');

console.log('translation quality test passed');
