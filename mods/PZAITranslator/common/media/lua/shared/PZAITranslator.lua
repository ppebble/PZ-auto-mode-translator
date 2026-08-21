PZAITranslator = PZAITranslator or {}
print("PZAITranslator: SHARED_LOADED")
PZAITranslator.VERSION = "0.1.0-dev"
PZAITranslator.state = "idle"
PZAITranslator.storageFile = "PZAITranslator_provider.ini"
PZAITranslator.jobFile = "PZAITranslator_job.ini"
PZAITranslator.statusFile = "PZAITranslator_status.ini"
PZAITranslator.selectionFile = "PZAITranslator_selection.ini"

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
        targetLanguage = stored.targetLanguage or "KO",
        skipModsWithTarget = stored.skipModsWithTarget ~= "0"
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
    writer:write("skipModsWithTarget=" .. (settings.skipModsWithTarget == false and "0" or "1") .. "\n")
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

function PZAITranslator.writeStatus(state, message)
    local writer = getFileWriter(PZAITranslator.statusFile, true, false)
    if not writer then return false end
    writer:write("state=" .. tostring(state or "idle") .. "\n")
    writer:write("message=" .. tostring(message or "") .. "\n")
    writer:close()
    PZAITranslator.state = state or "idle"
    return true
end

function PZAITranslator.requestTranslation()
    local writer = getFileWriter(PZAITranslator.jobFile, true, false)
    if not writer then return false end
    writer:write("action=translate\n")
    writer:write("targetLanguage=" .. tostring(PZAITranslator.loadProviderSettings().targetLanguage or "KO") .. "\n")
    writer:write("skipModsWithTarget=" .. (PZAITranslator.loadProviderSettings().skipModsWithTarget == false and "0" or "1") .. "\n")
    local selected = PZAITranslator.loadTargetSelection()
    if #selected > 0 then writer:write("includeMods=" .. table.concat(selected, ",") .. "\n") end
    writer:write("requested=1\n")
    writer:close()
    PZAITranslator.writeStatus("queued", "Waiting for the local translation helper.")
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

function PZAITranslator.requestConnectionTest()
    local writer = getFileWriter(PZAITranslator.jobFile, true, false)
    if not writer then return false end
    writer:write("action=test_connection\n")
    writer:write("targetLanguage=" .. tostring(PZAITranslator.loadProviderSettings().targetLanguage or "KO") .. "\n")
    writer:write("requested=1\n")
    writer:close()
    PZAITranslator.writeStatus("queued", "Connection test queued: Hello, World!")
    print("PZAITranslator: CONNECTION_TEST_QUEUED")
    return true
end
