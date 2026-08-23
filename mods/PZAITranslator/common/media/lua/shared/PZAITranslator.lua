PZAITranslator = PZAITranslator or {}
print("PZAITranslator: SHARED_LOADED")
PZAITranslator.VERSION = "0.1.0-dev"
PZAITranslator.state = "idle"
PZAITranslator.storageFile = "PZAITranslator_provider.ini"
PZAITranslator.jobFile = "PZAITranslator_job.ini"
PZAITranslator.claimedJobFile = "PZAITranslator_job.ini.processing"
PZAITranslator.statusFile = "PZAITranslator_status.ini"
PZAITranslator.pauseFile = "PZAITranslator_pause.ini"
PZAITranslator.selectionFile = "PZAITranslator_selection.ini"
PZAITranslator.catalogFile = "PZAITranslator_catalog.ini"
PZAITranslator.reviewFile = "PZAITranslator_review.ini"
PZAITranslator.reviewEditsFile = "PZAITranslator_review_edits.ini"
PZAITranslator.rulesFile = "PZAITranslator_rules.ini"
PZAITranslator.luaCandidatesFile = "PZAITranslator_lua_candidates.ini"
PZAITranslator.luaSelectionFile = "PZAITranslator_lua_selection.ini"

local function encodeControlValue(value)
    return tostring(value or ""):gsub("%%", "%%25"):gsub("\r", "%%0D"):gsub("\n", "%%0A")
end

local function decodeControlValue(value)
    return tostring(value or ""):gsub("%%(%x%x)", function(hex) return string.char(tonumber(hex, 16)) end)
end

local function loadBlocks(fileName, marker)
    local result = {}
    local reader = getFileReader(fileName, true)
    if not reader then return result end
    local current = nil
    while true do
        local line = reader:readLine()
        if line == nil then break end
        local separator = string.find(line, "=", 1, true)
        if separator ~= nil then
            local key = string.sub(line, 1, separator - 1)
            local value = decodeControlValue(string.sub(line, separator + 1))
            if key == marker then
                current = { id = value }; table.insert(result, current)
            elseif current ~= nil then current[key] = value end
        end
    end
    reader:close()
    return result
end

local function saveBlocks(fileName, schema, marker, records)
    local writer = getFileWriter(fileName, true, false)
    if not writer then return false end
    writer:write("schema=" .. tostring(schema) .. "\n")
    for _, record in ipairs(records or {}) do
        writer:write(marker .. "=" .. encodeControlValue(record.id) .. "\n")
        local fields = record.fields or {}
        for _, key in ipairs(record.fieldOrder or {}) do
            if fields[key] ~= nil then writer:write(key .. "=" .. encodeControlValue(fields[key]) .. "\n") end
        end
    end
    writer:close()
    return true
end

local function readStored(fileName)
    local result = {}
    local reader = getFileReader(fileName or PZAITranslator.storageFile, true)
    if not reader then return result end
    while true do
        local line = reader:readLine()
        if line == nil then break end
        local separator = string.find(line, "=", 1, true)
        if separator ~= nil then
            local key = string.sub(line, 1, separator - 1)
            local value = string.sub(line, separator + 1)
            result[key] = value
        end
    end
    reader:close()
    return result
end

function PZAITranslator.loadProviderSettings()
    local stored = readStored()
    return {
        provider = stored.provider or "openai-compatible",
        baseUrl = stored.baseUrl or "https://api.openai.com/v1",
        model = stored.model or "",
        apiKey = stored.apiKey or "",
        targetLanguage = stored.targetLanguage or "KO"
    }
end

function PZAITranslator.saveProviderSettings(settings)
    local writer = getFileWriter(PZAITranslator.storageFile, true, false)
    if not writer then return false end
    writer:write("provider=" .. tostring(settings.provider or "") .. "\n")
    writer:write("baseUrl=" .. tostring(settings.baseUrl or "") .. "\n")
    writer:write("model=" .. tostring(settings.model or "") .. "\n")
    writer:write("apiKey=" .. tostring(settings.apiKey or "") .. "\n")
    writer:write("targetLanguage=" .. tostring(settings.targetLanguage or "KO") .. "\n")
    writer:close()
    return true
end

function PZAITranslator.status()
    local stored = readStored(PZAITranslator.statusFile)
    return stored.state or PZAITranslator.state, stored.message or ""
end

function PZAITranslator.statusInfo()
    return readStored(PZAITranslator.statusFile)
end

function PZAITranslator.statusText()
    local state, message = PZAITranslator.status()
    return tostring(state) .. ": " .. tostring(message)
end

function PZAITranslator.writeStatus(state, message, details)
    local writer = getFileWriter(PZAITranslator.statusFile, true, false)
    if not writer then return false end
    writer:write("state=" .. tostring(state or "idle") .. "\n")
    writer:write("message=" .. tostring(message or "") .. "\n")
    for _, key in ipairs({ "phase", "total", "completed", "reused", "failed", "retries", "currentMod", "batchIndex", "batchCount", "conflicts" }) do
        if details and details[key] ~= nil then writer:write(key .. "=" .. tostring(details[key]) .. "\n") end
    end
    writer:close()
    PZAITranslator.state = state or "idle"
    return true
end

local function controlFileExists(fileName)
    -- The second argument controls file creation. A busy probe must never
    -- create an empty job, otherwise the Helper sees it as a real request.
    local reader = getFileReader(fileName, false)
    if not reader then return false end
    reader:close()
    return true
end

function PZAITranslator.isJobBusy()
    local state = PZAITranslator.status()
    return state == "queued" or state == "running" or controlFileExists(PZAITranslator.jobFile) or controlFileExists(PZAITranslator.claimedJobFile)
end

function PZAITranslator.requestPause()
    local writer = getFileWriter(PZAITranslator.pauseFile, true, false)
    if not writer then return false end
    writer:write("paused=1\n")
    writer:close()
    PZAITranslator.writeStatus("paused", "Pause requested. The current provider request may finish; no later batch will be sent.", { phase = "paused" })
    return true
end

function PZAITranslator.requestTranslation(action)
    if PZAITranslator.isJobBusy() then return false end
    local writer = getFileWriter(PZAITranslator.jobFile, true, false)
    if not writer then return false end
    writer:write("action=" .. (action == "resume" and "resume" or "translate") .. "\n")
    writer:write("targetLanguage=" .. tostring(PZAITranslator.loadProviderSettings().targetLanguage or "KO") .. "\n")
    local selected = PZAITranslator.loadTargetSelection()
    if #selected > 0 then writer:write("includeMods=" .. table.concat(selected, ",") .. "\n") end
    writer:write("requested=1\n")
    writer:close()
    local message = action == "resume" and "Resume queued. Saved completed batches will be reused with the selected model." or "Helper not confirmed yet. If this remains queued, start Translation Helper."
    PZAITranslator.writeStatus("queued", message, { phase = "queued", total = 0, completed = 0, reused = 0, failed = 0, retries = 0, currentMod = "" })
    print("PZAITranslator: JOB_QUEUED")
    return true
end

function PZAITranslator.loadTargetSelection()
    local selected = {}
    local reader = getFileReader(PZAITranslator.selectionFile, true)
    if not reader then return selected end
    while true do
        local line = reader:readLine()
        if line == nil then break end
        if string.sub(line, 1, 4) == "mod=" then table.insert(selected, string.sub(line, 5)) end
    end
    reader:close()
    return selected
end

function PZAITranslator.saveTargetSelection(selected)
    local writer = getFileWriter(PZAITranslator.selectionFile, true, false)
    if not writer then return false end
    for _, modId in ipairs(selected or {}) do writer:write("mod=" .. tostring(modId) .. "\n") end
    writer:close()
    return true
end

function PZAITranslator.loadReviewRecords() return loadBlocks(PZAITranslator.reviewFile, "record") end
function PZAITranslator.loadReviewEdits() return loadBlocks(PZAITranslator.reviewEditsFile, "edit") end
function PZAITranslator.saveReviewEdits(edits)
    local records = {}
    for _, edit in ipairs(edits or {}) do table.insert(records, { id = edit.id, fields = { target = edit.target }, fieldOrder = { "target" } }) end
    return saveBlocks(PZAITranslator.reviewEditsFile, "pzat-review-edits-v1", "edit", records)
end

function PZAITranslator.loadUserRules() return loadBlocks(PZAITranslator.rulesFile, "rule") end
function PZAITranslator.saveUserRules(rules)
    local records = {}
    local order = { "kind", "enabled", "modId", "category", "pattern", "replacement", "priority", "flags" }
    for _, rule in ipairs(rules or {}) do table.insert(records, { id = rule.id, fields = rule, fieldOrder = order }) end
    return saveBlocks(PZAITranslator.rulesFile, "pzat-user-rules-v1", "rule", records)
end

function PZAITranslator.loadLuaCandidates() return loadBlocks(PZAITranslator.luaCandidatesFile, "candidate") end
function PZAITranslator.loadLuaSelection()
    local selected = {}
    for _, record in ipairs(loadBlocks(PZAITranslator.luaSelectionFile, "candidate")) do selected[record.id] = true end
    return selected
end
function PZAITranslator.saveLuaSelection(selected)
    local records = {}
    local candidates = {}; for _, candidate in ipairs(PZAITranslator.loadLuaCandidates()) do candidates[candidate.id] = candidate end
    local order = { "modId", "file", "line", "source", "context", "kind", "confidence" }
    for id, enabled in pairs(selected or {}) do
        if enabled then local candidate = candidates[id] or {}; table.insert(records, { id = id, fields = candidate, fieldOrder = order }) end
    end
    return saveBlocks(PZAITranslator.luaSelectionFile, "pzat-lua-selection-v1", "candidate", records)
end

local function requestLocalAction(action)
    local selected = PZAITranslator.loadTargetSelection()
    if action == "scan_lua" and #selected == 0 then
        PZAITranslator.writeStatus("failed", "Select and save at least one mod before scanning Lua candidates.", { phase = "failed", total = 0, completed = 0, reused = 0, failed = 1, retries = 0, currentMod = "" })
        return false
    end
    if PZAITranslator.isJobBusy() then return false end
    local writer = getFileWriter(PZAITranslator.jobFile, true, false)
    if not writer then return false end
    writer:write("action=" .. tostring(action) .. "\n")
    writer:write("targetLanguage=" .. tostring(PZAITranslator.loadProviderSettings().targetLanguage or "KO") .. "\n")
    if #selected > 0 then writer:write("includeMods=" .. table.concat(selected, ",") .. "\n") end
    writer:write("requested=1\n")
    writer:close()
    PZAITranslator.writeStatus("queued", "Local quality-control job queued.", { phase = "queued", total = 0, completed = 0, reused = 0, failed = 0, retries = 0, currentMod = "" })
    return true
end

function PZAITranslator.requestApplyReview() return requestLocalAction("apply_review") end
function PZAITranslator.requestLuaScan() return requestLocalAction("scan_lua") end

function PZAITranslator.loadTargetCatalog()
    local catalog = {}
    local reader = getFileReader(PZAITranslator.catalogFile, true)
    if not reader then return catalog, nil end
    local current = nil
    local targetLanguage = nil
    while true do
        local line = reader:readLine()
        if line == nil then break end
        local separator = string.find(line, "=", 1, true)
        if separator ~= nil then
            local key = string.sub(line, 1, separator - 1)
            local value = string.sub(line, separator + 1)
            if key == "mod" then
                current = { modId = value, candidates = 0, existing = 0, existing_overlay = 0, existing_generated = 0, pending = 0, sourceChars = 0, apiChars = 0, updatedAt = 0, steamUpdatedAt = 0, metadataSource = "", large = 0 }
                catalog[value] = current
            elseif key == "targetLanguage" then
                targetLanguage = value
            elseif current ~= nil and (key == "candidates" or key == "existing" or key == "existing_overlay" or key == "existing_generated" or key == "pending" or key == "sourceChars" or key == "apiChars" or key == "large" or key == "updatedAt" or key == "steamUpdatedAt") then
                current[key] = tonumber(value) or 0
            elseif current ~= nil and key == "metadataSource" then
                current.metadataSource = value
            end
        end
    end
    reader:close()
    return catalog, targetLanguage
end

function PZAITranslator.requestConnectionTest()
    if PZAITranslator.isJobBusy() then return false end
    local writer = getFileWriter(PZAITranslator.jobFile, true, false)
    if not writer then return false end
    writer:write("action=test_connection\n")
    writer:write("targetLanguage=" .. tostring(PZAITranslator.loadProviderSettings().targetLanguage or "KO") .. "\n")
    writer:write("requested=1\n")
    writer:close()
    PZAITranslator.writeStatus("queued", "Connection test queued. Helper not confirmed yet.", { phase = "queued", total = 1, completed = 0, reused = 0, failed = 0, retries = 0, currentMod = "" })
    print("PZAITranslator: CONNECTION_TEST_QUEUED")
    return true
end
