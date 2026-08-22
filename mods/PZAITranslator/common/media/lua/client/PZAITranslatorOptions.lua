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
local function tickValue(option)
    if option.element ~= nil then return option.element:isSelected(1) end
    return option:getValue()
end

local providerLabels = { "Google Gemini API", "DeepL API", "OpenAI API", "OpenAI-compatible custom" }
local providerValues = { "gemini", "deepl", "openai", "openai-compatible" }
-- These are Project Zomboid translation-directory codes, not provider codes.
local languageValues = { "KO", "JP", "CN", "CH", "ES", "FR", "DE", "IT", "PTBR", "PL", "RU", "TR" }
local modelValues = { "Gemini: gemini-2.5-flash-lite", "Gemini: gemini-2.5-flash", "DeepL: default", "DeepL: prefer_quality_optimized", "DeepL: quality_optimized", "DeepL: latency_optimized", "OpenAI: gpt-5-mini", "OpenAI: gpt-5", "OpenAI: gpt-4.1-mini", "Custom model ID" }
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
options:addDescription("Queue creates a local request. The external helper writes running, complete, or failed status here. Provider-specific models are listed; use Custom model ID only when your provider documents a different model.")
local providerChoice = options:addComboBox("providerChoice", "Provider", "Gemini and DeepL offer free tiers with provider-specific quotas. OpenAI-compatible custom supports services using the Chat Completions protocol.")
for index, label in ipairs(providerLabels) do providerChoice:addItem(label, providerValues[index] == saved.provider) end
local baseUrl = options:addTextEntry("baseUrl", "Custom Base URL", saved.baseUrl, "Only for OpenAI-compatible custom. OpenAI, Gemini, and DeepL use their official endpoints.")
local modelChoice = options:addComboBox("modelChoice", "Translation model", "Choose a model matching the selected provider. DeepL entries choose translation quality/speed mode, not a chat model.")
for _, value in ipairs(modelValues) do
    local selected = value:find(saved.model or "", 1, true) ~= nil and saved.model ~= ""
    if saved.provider == "deepl" and value == "DeepL: " .. (saved.model ~= "" and saved.model or "default") then selected = true end
    modelChoice:addItem(value, selected)
end
local customModel = options:addTextEntry("customModel", "Custom model ID", saved.model, "Only used with Custom model ID.")
local apiKey = options:addTextEntry("apiKey", "API Key", saved.apiKey, "Saved locally by the game. Revoke a key if it is exposed.")
local languageChoice = options:addComboBox("targetLanguage", "Target language", "Project Zomboid language code. JP is Japanese; provider-specific codes are converted by the worker.")
for _, value in ipairs(languageValues) do languageChoice:addItem(value, value == saved.targetLanguage) end
local skipModsWithTarget = options:addTickBox("skipModsWithTarget", "Skip mods that already provide the target language", saved.skipModsWithTarget, "When enabled, a mod with any non-empty target-language JSON translation is not sent to AI. Disable it to fill missing strings in partially translated mods.")
local function statusLabel()
    local state, message = PZAITranslator.status()
    local info = PZAITranslator.statusInfo()
    local labels = {
        idle = "Idle - no translation job requested.",
        needs_configuration = "Configuration required - enter a new API key and provider.",
        queued = "Queued - Helper has not confirmed this job. Start Translation Helper if it stays queued.",
        running = "Running - local helper is processing the job.",
        complete = "Complete - enable PZAITranslationGenerated, return to the main menu, then enter the world again.",
        failed = "Failed - read the message and correct the configuration."
    }
    local total = tonumber(info.total or "0") or 0
    local completed = tonumber(info.completed or "0") or 0
    local reused = tonumber(info.reused or "0") or 0
    local failed = tonumber(info.failed or "0") or 0
    local retries = tonumber(info.retries or "0") or 0
    local waitSeconds = tonumber(info.waitSeconds or "0") or 0
    local estimatedWaitSeconds = tonumber(info.estimatedWaitSeconds or "0") or 0
    local function duration(seconds)
        if seconds < 60 then return tostring(seconds) .. "s" end
        return tostring(math.floor(seconds / 60)) .. "m " .. tostring(seconds % 60) .. "s"
    end
    local progress = total > 0 and (tostring(completed) .. "/" .. tostring(total) .. " | Reused " .. tostring(reused) .. " | Failed " .. tostring(failed) .. " | Retries " .. tostring(retries)) or "No item count yet"
    if estimatedWaitSeconds > 0 then progress = progress .. " | Planned wait ~" .. duration(estimatedWaitSeconds) end
    if waitSeconds > 0 then progress = progress .. " | Next batch in " .. duration(waitSeconds) end
    local failure = state == "failed" and info.errorCode and info.errorCode ~= "" and (" (HTTP " .. tostring(info.errorCode) .. ")") or ""
    return (labels[state] or tostring(state)) .. failure .. " | " .. progress
end
local statusIndicator = options:addTextEntry("statusIndicator", "Translation status", statusLabel(), "Read-only status. Use Refresh status to update it.")
statusIndicator:setEnabled(false)
local statusDetail = options:addTextEntry("statusDetail", "Status detail", "", "Current mod, Helper guidance, and provider result. Read-only.")
statusDetail:setEnabled(false)

local function statusDetailLabel()
    local state, message = PZAITranslator.status()
    local info = PZAITranslator.statusInfo()
    local current = info.currentMod and info.currentMod ~= "" and ("Current mod: " .. info.currentMod .. " | ") or ""
    if state == "queued" then return current .. tostring(message or "") .. " Start Translation Helper if the state does not become Running." end
    return current .. tostring(message or "")
end

local function saveSettings()
    local provider = providerValues[providerChoice:getValue()] or "gemini"
    local selectedModel = selectedValue(modelChoice, modelValues)
    local model = selectedModel:gsub("^[^:]+:%s*", "")
    local accountModel = selectedModel:find("Account:", 1, true) == 1
    if selectedModel == "Custom model ID" then model = textValue(customModel) end
    if accountModel then model = selectedModel:gsub("^Account:%s*", "") end
    if provider == "gemini" and selectedModel:find("Gemini:", 1, true) ~= 1 and not accountModel then model = "gemini-2.5-flash-lite" end
    if provider == "deepl" and selectedModel:find("DeepL:", 1, true) ~= 1 and not accountModel then model = "default" end
    if (provider == "openai" or provider == "openai-compatible") and selectedModel:find("OpenAI:", 1, true) ~= 1 and selectedModel ~= "Custom model ID" and not accountModel then model = "gpt-5-mini" end
    local base = textValue(baseUrl)
    if provider ~= "openai-compatible" then base = "" end
    return PZAITranslator.saveProviderSettings({ provider = provider, baseUrl = base, model = model, apiKey = textValue(apiKey), targetLanguage = selectedValue(languageChoice, languageValues), skipModsWithTarget = tickValue(skipModsWithTarget) })
end

function options:apply() saveSettings() end

local function refreshStatus()
    local label = statusLabel()
    statusIndicator.value = label
    if statusIndicator.element ~= nil then
        statusIndicator.element:setText(label)
    end
    local detail = statusDetailLabel()
    statusDetail.value = detail
    if statusDetail.element ~= nil then statusDetail.element:setText(detail) end
    print("PZAITranslator: " .. label)
end
local function queueTranslation()
    if saveSettings() then PZAITranslator.requestTranslation() end
    refreshStatus()
end
local function testConnection()
    if saveSettings() then PZAITranslator.requestConnectionTest() end
    refreshStatus()
end
options:addButton("testConnection", "Test API: Hello, World!", "Uses the selected provider to translate Hello, World! and reports the result without scanning or generating a pack.", testConnection)
options:addButton("queueTranslation", "Queue translation", "Save settings and queue a local translation job.", queueTranslation)
options:addButton("refreshStatus", "Refresh status", "Read the result written by the local helper.", refreshStatus)

-- MainOptions does not rebuild its page after a button callback. Polling only
-- while this page exists keeps the read-only status indicator live without
-- requiring users to close and reopen Mod Options.
local statusPollTicks = 0
Events.OnTick.Add(function()
    if statusIndicator.element == nil then return end
    statusPollTicks = statusPollTicks + 1
    if statusPollTicks >= 60 then
        statusPollTicks = 0
        refreshStatus()
    end
end)
print("PZAITranslator: OPTIONS_REGISTERED")
