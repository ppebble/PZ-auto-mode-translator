const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { applyRules } = require('../tools/worker/translate-b42.cjs');

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'rules.example.json'), 'utf8'));
const recipe = { modId: '89defender', category: 'Recipes' };

const bumper = applyRules('Make 89 LR Defender Front Bumper', recipe, rules);
assert.strictEqual(bumper.value, '89 랜드로버 디펜더 전면 범퍼 제작');
assert.deepStrictEqual(bumper.tags, ['vehicle-recipe-term']);
assert.deepStrictEqual(bumper.applied, ['vehicle-name-89-lr-defender', 'vehicle-recipe-front-bumper', 'vehicle-recipe-make-suffix']);

const tire = applyRules('Make 89 LR Defender Dakar Tire', recipe, rules);
assert.strictEqual(tire.value, '89 랜드로버 디펜더 다카르 타이어 제작');

const unknown = applyRules('Make Wooden Chair', recipe, rules);
assert.strictEqual(unknown.value, 'Make Wooden Chair');
assert.deepStrictEqual(unknown.applied, []);

const wrongCategory = applyRules('Make 89 LR Defender Front Bumper', { ...recipe, category: 'UI' }, rules);
assert.strictEqual(wrongCategory.value, 'Make 89 LR Defender Front Bumper');

console.log('vehicle recipe rules: OK');
