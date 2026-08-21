PZAIProbe = PZAIProbe or {}

local function writeProbeFile()
    local writer = getFileWriter("PZAIProbe_persistence.txt", true, false)
    if not writer then
        print("PZAIProbe: FILE_WRITER_FAILED")
        return
    end
    writer:write("probe-created\n")
    writer:close()
    print("PZAIProbe: FILE_WRITER_OK")
end

local function readProbeFile()
    local reader = getFileReader("PZAIProbe_persistence.txt", true)
    if not reader then
        print("PZAIProbe: FILE_READER_FAILED")
        return
    end
    local line = reader:readLine()
    reader:close()
    print("PZAIProbe: FILE_READER=" .. tostring(line))
end

local function runProbe()
    print("PZAIProbe: TRANSLATION=" .. tostring(getText("UI_PZAIProbe_English")))
    writeProbeFile()
    readProbeFile()
end

Events.OnGameStart.Add(runProbe)
