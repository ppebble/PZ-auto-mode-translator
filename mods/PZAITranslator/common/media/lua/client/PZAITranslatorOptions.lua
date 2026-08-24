print("PZAITranslator: OPTIONS_BEGIN")
require "PZAPI/ModOptions"

PZAITranslator = PZAITranslator or {}
local saved = PZAITranslator.loadProviderSettings()
local optionTitle = getText("UI_PZAutoModeTranslator_Title")
local options = PZAPI.ModOptions:create("PZAITranslator", optionTitle)

local function textValue(option)
    if option.element ~= nil then return option.element:getInternalText() end
    return option:getValue()
end
local function selectedValue(option, values)
    return values[option:getValue()] or values[1]
end
local function visibleSelectedValue(option, values)
    local index = option.element ~= nil and option.element.selected or option:getValue()
    return values[index] or values[1]
end
local providerLabels = { "Google Gemini API", "DeepL API", "OpenAI API", "Claude API", "DeepSeek API", "Yandex Cloud Translate API", "OpenAI-compatible custom" }
local providerValues = { "gemini", "deepl", "openai", "claude", "deepseek", "yandex", "openai-compatible" }
-- These are Project Zomboid translation-directory codes, not provider codes.
local languageValues = { "KO", "JP", "CN", "CH", "ES", "FR", "DE", "IT", "PTBR", "PL", "RU", "TR" }
local modelValues = { "Gemini: gemini-2.5-flash-lite", "Gemini: gemini-2.5-flash", "DeepL: default", "DeepL: prefer_quality_optimized", "DeepL: quality_optimized", "DeepL: latency_optimized", "OpenAI: gpt-5-mini", "OpenAI: gpt-5", "OpenAI: gpt-4.1-mini", "Claude: claude-haiku-4-5", "Claude: claude-sonnet-5", "DeepSeek: deepseek-v4-flash", "DeepSeek: deepseek-v4-pro", "Yandex: yandex-translate-v2", "Custom model ID" }
local function addAccountModels()
    local reader = getFileReader("PZAITranslator_models.ini", true)
    if not reader then return end
    local catalogProvider = nil
    local models = {}
    while true do
        local line = reader:readLine()
        if line == nil then break end
        if string.sub(line, 1, 9) == "provider=" then catalogProvider = string.sub(line, 10) end
        if string.sub(line, 1, 6) == "model=" then table.insert(models, string.sub(line, 7)) end
    end
    reader:close()
    if catalogProvider ~= saved.provider then return end
    for _, model in ipairs(models) do table.insert(modelValues, "Account: " .. model) end
end
addAccountModels()

options:addTitle(optionTitle)
options:addDescription("Configure the provider here. Select mods, control translation jobs, test the connection, and read Helper status from Character Info > AI Translator.")
local providerChoice = options:addComboBox("providerChoice", "Provider", "The Helper sends requests through your own provider account and API key. Each provider applies its own quota and billing rules. OpenAI-compatible custom supports the Chat Completions protocol.")
for index, label in ipairs(providerLabels) do providerChoice:addItem(label, providerValues[index] == saved.provider) end
local baseUrl = options:addTextEntry("baseUrl", "Custom Base URL", saved.baseUrl, "Only for OpenAI-compatible custom. Gemini, DeepL, OpenAI, Claude, DeepSeek, and Yandex use their official endpoints.")
local modelChoice = options:addComboBox("modelChoice", "Translation model", "Choose a model matching the selected provider. DeepL entries choose translation quality/speed mode, not a chat model.")
for _, value in ipairs(modelValues) do
    local selected = value:find(saved.model or "", 1, true) ~= nil and saved.model ~= ""
    if saved.provider == "deepl" and value == "DeepL: " .. (saved.model ~= "" and saved.model or "default") then selected = true end
    if saved.provider == "claude" and value == "Claude: " .. (saved.model ~= "" and saved.model or "claude-haiku-4-5") then selected = true end
    if saved.provider == "deepseek" and value == "DeepSeek: " .. (saved.model ~= "" and saved.model or "deepseek-v4-flash") then selected = true end
    if saved.provider == "yandex" and value == "Yandex: yandex-translate-v2" then selected = true end
    modelChoice:addItem(value, selected)
end
local customModel = options:addTextEntry("customModel", "Custom model ID", saved.model, "Only used with Custom model ID.")
local function refreshCustomInputState()
    local customProvider = visibleSelectedValue(providerChoice, providerValues) == "openai-compatible"
    baseUrl:setEnabled(customProvider)
    customModel:setEnabled(customProvider and visibleSelectedValue(modelChoice, modelValues) == "Custom model ID")
end
providerChoice.onChange = refreshCustomInputState
modelChoice.onChange = refreshCustomInputState
refreshCustomInputState()
local apiKey = options:addTextEntry("apiKey", "API Key", saved.apiKey, "Saved locally by the game. Revoke a key if it is exposed.")
local languageChoice = options:addComboBox("targetLanguage", "Target language", "Project Zomboid language code. JP is Japanese; provider-specific codes are converted by the worker.")
for _, value in ipairs(languageValues) do languageChoice:addItem(value, value == saved.targetLanguage) end
local function saveSettings()
    local provider = providerValues[providerChoice:getValue()] or "gemini"
    local selectedModel = selectedValue(modelChoice, modelValues)
    local model = selectedModel:gsub("^[^:]+:%s*", "")
    local accountModel = selectedModel:find("Account:", 1, true) == 1
    if selectedModel == "Custom model ID" then model = textValue(customModel) end
    if accountModel then model = selectedModel:gsub("^Account:%s*", "") end
    if provider == "gemini" and selectedModel:find("Gemini:", 1, true) ~= 1 and not accountModel then model = "gemini-2.5-flash-lite" end
    if provider == "deepl" and selectedModel:find("DeepL:", 1, true) ~= 1 and not accountModel then model = "default" end
    if provider == "claude" and selectedModel:find("Claude:", 1, true) ~= 1 and not accountModel then model = "claude-haiku-4-5" end
    if provider == "deepseek" and selectedModel:find("DeepSeek:", 1, true) ~= 1 and not accountModel then model = "deepseek-v4-flash" end
    if provider == "yandex" then model = "yandex-translate-v2" end
    if (provider == "openai" or provider == "openai-compatible") and selectedModel:find("OpenAI:", 1, true) ~= 1 and selectedModel ~= "Custom model ID" and not accountModel then model = "gpt-5-mini" end
    local base = textValue(baseUrl)
    if provider ~= "openai-compatible" then base = "" end
    return PZAITranslator.saveProviderSettings({ provider = provider, baseUrl = base, model = model, apiKey = textValue(apiKey), targetLanguage = selectedValue(languageChoice, languageValues) })
end

function options:apply() saveSettings() end

local function openReview() if PZAITranslator.openReviewPanel then PZAITranslator.openReviewPanel() end end
local function openBulkCorrection() if PZAITranslator.openBulkCorrectionPanel then PZAITranslator.openBulkCorrectionPanel() end end
local function openLuaCandidates() if PZAITranslator.openLuaCandidatesPanel then PZAITranslator.openLuaCandidatesPanel() end end
options:addTitle("Quality tools")
local reviewButton = options:addButton("reviewTranslations", "Review generated translations", "Inspect provider, rule, and review-needed results. Save corrections locally, then apply them without another provider request.", openReview)
local bulkButton = options:addButton("bulkCorrectTranslations", "Bulk correct translations", "Preview and replace a repeated mistake across generated translations without regex syntax or another provider request.", openBulkCorrection)
local luaButton = options:addButton("reviewLuaCandidates", "Review hardcoded Lua strings", "Detect likely hardcoded UI literals in selected mods. This review-only list never modifies source mods or sends strings to an API.", openLuaCandidates)

-- PZAPI ModOptions creates every button on its own row and has no row/column
-- option. These are the final controls on this page, so they can be compacted
-- safely after MainOptions creates their elements without patching vanilla UI.
local function layoutActionButtons()
    if reviewButton.element == nil or bulkButton.element == nil or luaButton.element == nil then return false end
    local buttons = { reviewButton, bulkButton, luaButton }
    local anchorX = reviewButton.element:getX()
    local anchorY = reviewButton.element:getY()
    local buttonWidth = 250
    local columnGap = 12
    local rowGap = 6
    local rowHeight = reviewButton.element:getHeight() + rowGap
    for index, option in ipairs(buttons) do
        local column = (index - 1) % 2
        local row = math.floor((index - 1) / 2)
        local element = option.element
        element:setX(anchorX + column * (buttonWidth + columnGap))
        element:setY(anchorY + row * rowHeight)
        element:setWidth(buttonWidth)
    end
    return true
end

local function layoutActionButtonsOnce()
    if not layoutActionButtons() then return end
    refreshCustomInputState()
    Events.OnTick.Remove(layoutActionButtonsOnce)
end
Events.OnTick.Add(layoutActionButtonsOnce)
print("PZAITranslator: OPTIONS_REGISTERED")
