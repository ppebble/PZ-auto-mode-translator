const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
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

const banshee = { modId: '65banshee', category: 'Recipes' };
assert.strictEqual(applyRules('Make 65 Pontiac Banshee Metal Roof', banshee, rules).value, '65 Pontiac Banshee 금속 지붕 제작');
assert.strictEqual(applyRules('Make 65 Pontiac Banshee Rollbar', banshee, rules).value, '65 Pontiac Banshee 롤바 제작');
assert.strictEqual(applyRules('Make 65 Pontiac Banshee Cowl Hood', banshee, rules).value, '65 Pontiac Banshee 카울 보닛 제작');
assert.strictEqual(applyRules('Make 65 Pontiac Banshee Reinforced Front Bumper', banshee, rules).value, '65 Pontiac Banshee 강화 전면 범퍼 제작');
assert.strictEqual(applyRules('Make 65 Pontiac Banshee Front Window Armor', banshee, rules).value, '65 Pontiac Banshee 전면 창문 방어판 제작');
assert.strictEqual(applyRules('Make 65 Pontiac Banshee Rear Windshield Armor', banshee, rules).value, '65 Pontiac Banshee 후면 유리 방어판 제작');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pzat-rule-refresh-'));
try {
  const manifest = path.join(temp, 'scan.json');
  const output = path.join(temp, 'translated.json');
  fs.writeFileSync(manifest, JSON.stringify({
    targetLanguage: 'KO',
    records: [{
      id: '65banshee|Recipes|65bansheeMakeMetalRoof|fixture', modId: '65banshee', category: 'Recipes',
      key: '65bansheeMakeMetalRoof', source: 'Make 65 Pontiac Banshee Metal Roof',
      target: '65 폰티악 반시 금속 지붕 제작', status: 'existing_generated'
    }]
  }), 'utf8');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'worker', 'translate-b42.cjs'), '--manifest', manifest, '--rules', path.join(__dirname, '..', 'config', 'rules.example.json'), '--provider', path.join(temp, 'missing-provider.json'), '--output', output], { stdio: 'pipe' });
  const refreshed = JSON.parse(fs.readFileSync(output, 'utf8')).records[0];
  assert.strictEqual(refreshed.target, '65 Pontiac Banshee 금속 지붕 제작');
  assert.strictEqual(refreshed.method, 'rule');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log('vehicle recipe rules: OK');
