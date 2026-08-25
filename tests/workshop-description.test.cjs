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
assert.match(description, /npm 외부 패키지 없음/, 'Workshop copy must explain the reduced npm supply-chain surface');
assert.match(description, /Windows 개발자 서명이 적용되어 있지 않습니다/, 'Workshop copy must disclose the unsigned beta Helper');
assert.match(description, /신뢰할 수 있는 HTTPS 주소만 사용/, 'Workshop copy must warn about custom provider trust boundaries');
assert.match(description, /이 모드는 활성 모드 전체를 다시 번역하지 않습니다!/, 'Workshop opening must explain the product in player-friendly language');
assert.match(description, /\[h2\]자주 묻는 질문 \(Q&A\)\[\/h2\]/, 'Workshop safety and data explanations must be grouped as Q&A');
assert.ok(description.indexOf('[h3]Q. Translation Helper는 안전한가요?[/h3]') < description.indexOf('[h3]Q. 어떤 문장을 AI에 보내나요?[/h3]'), 'Workshop Q&A must keep safety before provider-data scope');
assert.match(description, /최초 번역 이후에는 (?:보통|일반적으로) \[b\]Start new translation을 다시 누를 필요가 없습니다/, 'Workshop copy must direct later runs to Resume');
assert.ok(description.indexOf('[h3]1. 최초 1회 설정과 첫 번역[/h3]') < description.indexOf('[h3]2. 이후 작업은 Resume 사용[/h3]'), 'Workshop usage must explain first-run setup before later resume');
assert.doesNotMatch(description, /^\[\]/m, 'Steam list items must use [*], not []');
assert.ok(Buffer.byteLength(description, 'utf8') <= 8000, 'Steam Workshop description must remain within the 8,000-byte UTF-8 limit');

console.log('Workshop description test passed');
