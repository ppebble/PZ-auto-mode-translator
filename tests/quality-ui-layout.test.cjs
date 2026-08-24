const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'mods', 'PZAITranslator', 'common', 'media', 'lua', 'client', 'PZAITranslatorQualityUI.lua'),
  'utf8',
);

assert.match(source, /local REVIEW_LIST_Y = 124/, 'review list must reserve room for its controls and header');
assert.match(source, /local BULK_LIST_Y = 214/, 'bulk correction list must reserve room for labeled controls and its header');
assert.match(source, /local LUA_LIST_Y = 142/, 'Lua list must reserve room for its controls and header');
assert.match(source, /local REVIEW_PAGE_SIZE = 200/, 'review list must cap rows created per page');
assert.match(source, /self\.filter\.selected = 2/, 'review should open on the small needs-review set');
assert.doesNotMatch(source, /self\.search\.onTextChange/, 'large review searches must not rebuild the table for every keystroke');
assert.match(source, /function ReviewPanel:nextPage\(\)/, 'review results must be pageable');
assert.match(source, /self\.searchCache\[cacheKey\]/, 'review searches must reuse cached filtered result sets');
assert.match(source, /function BulkPanel:preview\(\)/, 'bulk corrections must be previewed before saving');
assert.match(source, /function BulkPanel:previousPage\(\)/, 'bulk correction previews must expose every result page');
assert.match(source, /function BulkPanel:nextPage\(\)/, 'bulk correction previews must expose every result page');
assert.match(source, /function BulkPanel:saveCorrections\(\)/, 'bulk corrections must save explicit review edits');
assert.match(source, /Confirm all /, 'bulk corrections must require an explicit all-match confirmation');
assert.match(source, /self\.applyButton:setEnable\(hasEntries\(self\.edits\) and not busy\)/, 'review and bulk apply buttons must disable without saved edits or while another job is active');
assert.match(source, /self\.scanButton:setEnable\(#PZAITranslator\.loadTargetSelection\(\) > 0 and not busy\)/, 'Lua scan must disable without selected mods or while another job is active');
assert.match(source, /local busy = PZAITranslator\.isJobBusy\(\)/, 'quality panels must share one busy read per status-poll cycle');
assert.match(source, /self\.previousButton:setEnable\(\(self\.page or 1\) > 1\)/, 'quality pagination must disable Previous on the first page');
assert.match(source, /self\.nextButton:setEnable\(\(self\.page or 1\) < \(self\.pageCount or 1\)\)/, 'quality pagination must disable Next on the last page');
assert.doesNotMatch(source, /function BulkPanel:applyEdits\(\)[\s\S]{0,120}saveCorrections/, 'apply must use already-confirmed saved edits instead of silently saving a fresh full match set');
assert.match(source, /string\.find\(value, needle, start, true\)/, 'bulk corrections must use literal text matching, not regex');
assert.doesNotMatch(source, /next\(self\.edits\)/, 'Kahlua does not expose the standard Lua next function');
assert.match(source, /for _ in pairs\(self\.edits\)do hasEdits=true;break end/, 'apply must check saved edits using Kahlua-compatible iteration');
assert.doesNotMatch(source, /PZAITranslatorRulesPanel|openRulesPanel|User regex and glossary/, 'regex authoring must not be exposed in the game UI');

const optionsSource = fs.readFileSync(
  path.join(__dirname, '..', 'mods', 'PZAITranslator', 'common', 'media', 'lua', 'client', 'PZAITranslatorOptions.lua'),
  'utf8',
);
assert.match(optionsSource, /Bulk correct translations/, 'options must expose plain-language bulk correction');
assert.doesNotMatch(optionsSource, /Edit user regex\/glossary/, 'options must not expose regex authoring');
assert.match(optionsSource, /local function layoutActionButtons\(\)/, 'mod option action buttons must use an explicit compact layout');
assert.match(optionsSource, /element:setX\(/, 'mod option action buttons must be arranged in columns after PZAPI creates them');
assert.match(optionsSource, /Events\.OnTick\.Remove\(layoutActionButtonsOnce\)/, 'button layout must unregister itself after the first successful pass');
assert.match(optionsSource, /option\.element ~= nil and option\.element\.selected or option:getValue\(\)/, 'dependent controls must read the live combo selection before Apply');
assert.match(optionsSource, /baseUrl:setEnabled\(customProvider\)/, 'custom base URL must only be editable for the OpenAI-compatible custom provider');
assert.match(optionsSource, /customModel:setEnabled\(customProvider and visibleSelectedValue\(modelChoice, modelValues\) == "Custom model ID"\)/, 'custom model ID must require both the custom provider and custom model selection');
assert.match(optionsSource, /providerChoice\.onChange = refreshCustomInputState/, 'changing provider must immediately refresh custom input availability');
assert.match(optionsSource, /modelChoice\.onChange = refreshCustomInputState/, 'changing model must immediately refresh custom model availability');
assert.match(optionsSource, /layoutActionButtonsOnce\(\)[\s\S]*refreshCustomInputState\(\)[\s\S]*Events\.OnTick\.Remove/, 'initial custom input state must be refreshed after PZAPI creates the controls');
assert.doesNotMatch(optionsSource, /testButton/, 'quality-tool layout must not reference the connection-test button moved to character info');
assert.doesNotMatch(optionsSource, /options:addButton\("queueTranslation"|options:addButton\("pauseTranslation"|options:addButton\("resumeTranslation"/, 'job controls must not be duplicated in Mod Options');
assert.doesNotMatch(optionsSource, /options:addButton\("testConnection"|options:addButton\("refreshStatus"/, 'runtime controls must not be duplicated in Mod Options');
assert.doesNotMatch(optionsSource, /statusIndicator|statusDetail/, 'runtime status fields must only be shown on the character info dashboard');

const characterSource = fs.readFileSync(
  path.join(__dirname, '..', 'mods', 'PZAITranslator', 'common', 'media', 'lua', 'client', 'PZAITranslatorUI.lua'),
  'utf8',
);
const modInfo = fs.readFileSync(
  path.join(__dirname, '..', 'mods', 'PZAITranslator', 'common', 'mod.info'),
  'utf8',
);
const englishUi = fs.readFileSync(
  path.join(__dirname, '..', 'mods', 'PZAITranslator', 'common', 'media', 'lua', 'shared', 'Translate', 'EN', 'UI.json'),
  'utf8',
);
const koreanUi = fs.readFileSync(
  path.join(__dirname, '..', 'mods', 'PZAITranslator', 'common', 'media', 'lua', 'shared', 'Translate', 'KO', 'UI.json'),
  'utf8',
);
assert.match(modInfo, /^name=PZ AI Translation Generator$/m, 'mod selection must use the generator product name');
assert.match(modInfo, /^id=PZAITranslator$/m, 'the existing internal mod ID must remain stable');
assert.match(englishUi, /"UI_PZAutoModeTranslator_Title": "PZ AI Translation Generator"/, 'English Mod Options must use the generator product name');
assert.match(koreanUi, /"UI_PZAutoModeTranslator_Title": "PZ AI 번역팩 생성기"/, 'Korean Mod Options must identify the product as a translation-pack generator');
assert.match(characterSource, /"AI Translation Generator"/, 'character info must use the generator product name');
assert.match(characterSource, /Manage translation targets/, 'character info dashboard must own target selection');
assert.match(characterSource, /Start new translation/, 'character info dashboard must own new jobs');
assert.match(characterSource, /Resume interrupted translation/, 'character info dashboard must own resume');
assert.match(characterSource, /Pause after current request/, 'character info dashboard must own pause');
assert.match(characterSource, /Test API: Hello, World!/, 'character info dashboard must own connection tests');
assert.match(characterSource, /Refresh status/, 'character info dashboard must own status refresh');
assert.match(characterSource, /Status detail:/, 'character info dashboard must show detailed status');
assert.match(characterSource, /local DASHBOARD_MIN_WIDTH = 620/, 'AI Translation Generator tab must request a protection-style wide information window');
assert.match(characterSource, /self:setWidthAndParentWidth\(math\.max\(self\.width, DASHBOARD_MIN_WIDTH\)\)/, 'AI Translation Generator tab must expand its parent information window');
assert.match(characterSource, /view\.startButton:setEnable\(not busy\)/, 'job-start controls must be disabled while a job is queued or running');
assert.match(characterSource, /PZAITranslator\.refreshQualityActionStates\(\)/, 'the existing status poll must also refresh quality-action availability');
assert.match(characterSource, /Conflicts /, 'generated-pack conflicts must be visible on the in-game dashboard');
assert.match(characterSource, /local buttonX = 16[\s\S]*local buttonWidth = math\.min\(300, math\.max\(180, view\.width - 32\)\)[\s\S]*local buttonGap = 6/, 'character info dashboard must use a single responsive narrow-safe button column');
assert.doesNotMatch(characterSource, /ISButton:new\(278,|ISButton:new\(422,/, 'character info dashboard buttons must not use additional columns');
assert.doesNotMatch(characterSource, /Edit regex and glossary|openRulesPanel/, 'the removed regex editor must not remain in the character info tab');
assert.doesNotMatch(characterSource, /Review generated translations|Review hardcoded Lua strings/, 'quality screens must only be exposed from Mod Options');

console.log('quality UI layout test passed');
