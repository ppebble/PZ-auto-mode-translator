const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const description = fs.readFileSync(path.join(__dirname, '..', 'docs', 'workshop-description-en.txt'), 'utf8');

assert.match(description, /^\[h1\]PZ AI Translation Generator\[\/h1\]$/m, 'Workshop title must present the product as a translation generator');
assert.doesNotMatch(description, /PZ Auto Mode Translator|AI Translator/, 'Workshop copy must not use the legacy translator branding');
assert.match(description, /https:\/\/github\.com\/ppebble\/PZ-auto-mode-translator\/releases\/latest/, 'Workshop copy must link to the Helper release page');
assert.match(description, /Only pending strings are sent to your selected AI service/, 'Workshop copy must explain that only pending strings reach providers');
assert.match(description, /Never edits Workshop mods or game files/, 'Workshop copy must preserve the source-mod immutability promise');
assert.match(description, /START-TranslationHelper\.vbs/, 'Workshop copy must explain how to start the external Helper');
assert.match(description, /Start new translation/, 'Workshop copy must use the current in-game start label');
assert.match(description, /Resume interrupted translation/, 'Workshop copy must document checkpoint resume');
assert.match(description, /Confirm all N/, 'Workshop copy must document full-match bulk confirmation');
assert.match(description, /return to the main menu and re-enter the world/, 'Workshop copy must explain how generated translations reload');
assert.match(description, /HTTP 429 \/ 456/, 'Workshop copy must retain actionable quota guidance');
assert.match(description, /The API key and Helper are not included in the Steam Workshop download/, 'Workshop copy must state the secret and Helper distribution boundary');
assert.match(description, /No npm dependencies/, 'Workshop copy must explain the reduced npm supply-chain surface');
assert.match(description, /not digitally signed/, 'Workshop copy must disclose the unsigned beta Helper');
assert.match(description, /trusted HTTPS endpoints only/, 'Workshop copy must warn about custom provider trust boundaries');
assert.match(description, /does not retranslate every enabled mod/i, 'Workshop opening must explain the product in player-friendly language');
assert.match(description, /\[h2\]Frequently Asked Questions\[\/h2\]/, 'Workshop safety and data explanations must be grouped as FAQs');
assert.ok(description.indexOf('[h3]Is Translation Helper safe?[/h3]') < description.indexOf('[h3]What text is sent to the AI service?[/h3]'), 'Workshop FAQs must keep safety before provider-data scope');
assert.match(description, /After the first translation, you normally do not need to use \[b\]Start new translation\[\/b\] again/, 'Workshop copy must direct later runs to Resume');
assert.ok(description.indexOf('[h3]1. First-time setup and first translation[/h3]') < description.indexOf('[h3]2. Use Resume for later work[/h3]'), 'Workshop usage must explain first-run setup before later resume');
assert.match(description, /\[h2\]More Project Zomboid Mods by ask13\[\/h2\]/, 'Workshop copy must include the shared creator-mod section');
assert.match(description, /https:\/\/github\.com\/ppebble\/project-zomboid-modding/, 'Creator-mod section must link to the maintained catalog');
assert.doesNotMatch(description, /^\[\]/m, 'Steam list items must use [*], not []');
assert.ok(Buffer.byteLength(description, 'utf8') <= 8000, 'Steam Workshop description must remain within the 8,000-byte UTF-8 limit');

console.log('Workshop description test passed');
