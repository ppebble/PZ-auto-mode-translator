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
options:addDescription("Queue creates a local request. The external helper writes running, complete, or failed status here. Provider-specific models are listed; use Custom model ID only when your provider documents a different model.")
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
local apiKey = options:addTextEntry("apiKey", "API Key", saved.apiKey, "Saved locally by the game. Revoke a key if it is exposed.")
local languageChoice = options:addComboBox("targetLanguage", "Target language", "Project Zomboid language code. JP is Japanese; provider-specific codes are converted by the worker.")
for _, value in ipairs(languageValues) do languageChoice:addItem(value, value == saved.targetLanguage) end
local skipModsWithTarget = options:addTickBox("skipModsWithTarget", "Skip mods that already provide the target language", saved.skipModsWithTarget, "When enabled, a mod with any non-empty target-language JSON translation is not sent to AI. Disable it to fill missing strings in partially translated mods.")
local function statusLabel()
    local state = PZAITranslator.status()
    local info = PZAITranslator.statusInfo()
    local labels = {
        idle = "Idle",
        needs_configuration = "Configuration",
        queued = "Queued",
        running = "Running",
        paused = "Paused",
        complete = "Complete",
        failed = "Failed"
    }
    local total = tonumber(info.total or "0") or 0
    local completed = tonumber(info.completed or "0") or 0
    local reused = tonumber(info.reused or "0") or 0
    local failed = tonumber(info.failed or "0") or 0
    local retries = tonumber(info.retries or "0") or 0
    local waitSeconds = tonumber(info.waitSeconds or "0") or 0
    local estimatedWaitSeconds = tonumber(info.estimatedWaitSeconds or "0") or 0
    local requestCount = tonumber(info.requestCount or "0") or 0
    local batchIndex = tonumber(info.batchIndex or "0") or 0
    local batchCount = tonumber(info.batchCount or "0") or 0
    local function duration(seconds)
        if seconds < 60 then return tostring(seconds) .. "s" end
        return tostring(math.floor(seconds / 60)) .. "m " .. tostring(seconds % 60) .. "s"
    end
    local parts = { labels[state] or tostring(state) }
    if batchCount > 0 then
        table.insert(parts, "Batch " .. tostring(math.max(1, batchIndex)) .. "/" .. tostring(batchCount))
    elseif state == "running" and requestCount > 0 then
        table.insert(parts, "Batches " .. tostring(requestCount))
    end
    if total > 0 then table.insert(parts, "Items " .. tostring(completed) .. "/" .. tostring(total)) end
    if reused > 0 then table.insert(parts, "Reused " .. tostring(reused)) end
    if failed > 0 then table.insert(parts, "Failed " .. tostring(failed)) end
    if retries > 0 then table.insert(parts, "Retries " .. tostring(retries)) end
    if waitSeconds > 0 then table.insert(parts, "Wait " .. duration(waitSeconds))
    elseif state == "running" and estimatedWaitSeconds > 0 then table.insert(parts, "ETA " .. duration(estimatedWaitSeconds)) end
    if state == "failed" and info.errorCode and info.errorCode ~= "" then table.insert(parts, "HTTP " .. tostring(info.errorCode)) end
    return table.concat(parts, " | ")
end
local statusIndicator = options:addTextEntry("statusIndicator", "Translation status", statusLabel(), "Read-only status. Use Refresh status to update it.")
statusIndicator:setEnabled(false)
local statusDetail = options:addTextEntry("statusDetail", "Status detail", "", "Current mod, Helper guidance, and provider result. Read-only.")
statusDetail:setEnabled(false)

local function statusDetailLabel()
    local state = PZAITranslator.status()
    local info = PZAITranslator.statusInfo()
    local parts = {}
    if info.phase and info.phase ~= "" and info.phase ~= state then table.insert(parts, "Phase " .. tostring(info.phase)) end
    if info.currentMod and info.currentMod ~= "" then table.insert(parts, "Mods " .. tostring(info.currentMod)) end
    if state == "queued" then table.insert(parts, "Helper pending") end
    return table.concat(parts, " | ")
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
    if provider == "claude" and selectedModel:find("Claude:", 1, true) ~= 1 and not accountModel then model = "claude-haiku-4-5" end
    if provider == "deepseek" and selectedModel:find("DeepSeek:", 1, true) ~= 1 and not accountModel then model = "deepseek-v4-flash" end
    if provider == "yandex" then model = "yandex-translate-v2" end
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
local function resumeTranslation()
    if saveSettings() then PZAITranslator.requestTranslation("resume") end
    refreshStatus()
end
local function pauseTranslation()
    PZAITranslator.requestPause()
    refreshStatus()
end
local function testConnection()
    if saveSettings() then PZAITranslator.requestConnectionTest() end
    refreshStatus()
end
options:addButton("testConnection", "Test API: Hello, World!", "Uses the selected provider to translate Hello, World! and reports the result without scanning or generating a pack.", testConnection)
options:addButton("queueTranslation", "Start new translation", "Scan the selected mods and translate their missing strings. Saved translations are always reused.", queueTranslation)
options:addButton("pauseTranslation", "Pause after current request", "Stops before the next batch. The current request may complete; saved completed batches will be reused when resumed.", pauseTranslation)
options:addButton("resumeTranslation", "Resume interrupted translation", "After a pause, quota, or provider failure, save the selected model and resume from completed batch checkpoints. Use the same selected mods and target language.", resumeTranslation)
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
