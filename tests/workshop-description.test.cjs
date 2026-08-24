const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const description = fs.readFileSync(path.join(__dirname, '..', 'docs', 'workshop-description-ko.txt'), 'utf8');

assert.match(description, /^\[h1\]PZ AI Translation Generator\[\/h1\]$/m, 'Workshop title must present the product as a translation generator');
assert.doesNotMatch(description, /PZ Auto Mode Translator|AI Translator/, 'Workshop copy must not use the legacy translator branding');
assert.match(description, /https:\/\/github\.com\/ppebble\/PZ-auto-mode-translator\/releases\/latest/, 'Workshop copy must link to the Helper release page');
assert.match(description, /pending 항목만/, 'Workshop copy must explain that only pending strings reach providers');
assert.match(description, /원본 모드를 수정하지/, 'Workshop copy must preserve the source-mod immutability promise');
assert.match(description, /START-TranslationHelper\.vbs/, 'Workshop copy must explain how to start the external Helper');
assert.match(description, /Start new translation/, 'Workshop copy must use the current in-game start label');
assert.match(description, /Resume interrupted translation/, 'Workshop copy must document checkpoint resume');
assert.match(description, /Confirm all N/, 'Workshop copy must document full-match bulk confirmation');
assert.match(description, /메인 화면으로 나간 뒤 월드에 다시 입장/, 'Workshop copy must explain how generated translations reload');
assert.match(description, /HTTP 429 \/ 456/, 'Workshop copy must retain actionable quota guidance');
assert.match(description, /API 키와 Helper는 창작마당 배포물에 포함되지/, 'Workshop copy must state the secret and Helper distribution boundary');

console.log('Workshop description test passed');
