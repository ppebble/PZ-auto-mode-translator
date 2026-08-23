require "ISUI/ISPanel"
require "ISUI/ISButton"
require "ISUI/ISLabel"
require "ISUI/ISScrollingListBox"
require "ISUI/ISTextEntryBox"
require "ISUI/ISComboBox"
require "ISUI/ISRichTextPanel"
require "PZAITranslatorQualityUI"

PZAITranslator = PZAITranslator or {}
local Selector = ISPanel:derive("PZAITranslatorSelector")

function Selector:truncateCellText(text, maxWidth)
    if getTextManager():MeasureStringX(self.font, text) <= maxWidth then return text end
    local suffix = "..."
    local cut = #text
    while cut > 0 do
        -- Remove a whole UTF-8 character so Korean mod names cannot be split
        -- into invalid byte sequences while making room for the ellipsis.
        local start = cut
        while start > 1 do
            local byte = string.byte(text, start)
            if byte < 0x80 or byte >= 0xC0 then break end
            start = start - 1
        end
        cut = start - 1
        local candidate = string.sub(text, 1, cut) .. suffix
        if getTextManager():MeasureStringX(self.font, candidate) <= maxWidth then return candidate end
    end
    return suffix
end

function Selector:drawTargetItem(y, item, alt)
    if not item.height then item.height = self.itemheight end
    if item.height <= 0 then return y + item.height end
    local textColor = self.textColor
    if item.selected then
        self:drawSelection(0, y, self:getWidth(), item.height)
        textColor = self.selectedTextColor
    elseif self.mouseoverselected == item.index and self:isMouseOver() and not self:isMouseOverScrollBar() then
        self:drawMouseOverHighlight(0, y, self:getWidth(), item.height - 1)
    end
    self:drawRectBorder(0, y, self:getWidth(), item.height, 0.5, self.borderColor.r, self.borderColor.g, self.borderColor.b)
    local entry = item.item
    local stat = entry.stat
    local textY = y + (self.itemPadY or (item.height - self.fontHgt) / 2)
    local candidatesRight, translatedRight = self:getWidth() - 285, self:getWidth() - 185
    local apiRight, warningX = self:getWidth() - 75, self:getWidth() - 65
    self:drawTextCentre(entry.selected and "[x]" or "[ ]", 24, textY, textColor.r, textColor.g, textColor.b, textColor.a, self.font)
    local nameRight = self:getWidth() - 360
    -- doDrawItem is invoked with the ISScrollingListBox as self, not Selector.
    -- Keep the measurement helper on Selector and pass the list's font explicitly.
    self:drawText(Selector.truncateCellText(self, entry.name or "", math.max(20, nameRight - 56)), 48, textY, textColor.r, textColor.g, textColor.b, textColor.a, self.font)
    if stat then
        self:drawTextRight(tostring(stat.candidates or 0), candidatesRight, textY, textColor.r, textColor.g, textColor.b, textColor.a, self.font)
        self:drawTextRight(tostring(entry.existing or 0), translatedRight, textY, textColor.r, textColor.g, textColor.b, textColor.a, self.font)
        local apiColor = (stat.apiChars or 0) > 0 and { r = 1, g = 0.82, b = 0.28, a = 1 } or textColor
        self:drawTextRight(tostring(stat.apiChars or 0), apiRight, textY, apiColor.r, apiColor.g, apiColor.b, apiColor.a, self.font)
        if stat.large == 1 then self:drawText("LARGE", warningX, textY, 1, 0.45, 0.25, 1, self.font) end
    else
        self:drawTextRight("--", candidatesRight, textY, textColor.r, textColor.g, textColor.b, textColor.a, self.font)
        self:drawTextRight("--", translatedRight, textY, textColor.r, textColor.g, textColor.b, textColor.a, self.font)
        self:drawTextRight("--", apiRight, textY, textColor.r, textColor.g, textColor.b, textColor.a, self.font)
        self:drawText("No scan", warningX, textY, 0.75, 0.75, 0.75, 1, self.font)
    end
    return y + item.height
end

function Selector:initialise()
    ISPanel.initialise(self)
    self.title = ISLabel:new(12, 10, 20, "Translation targets", 1, 1, 1, 1, UIFont.Medium, true)
    self.title:initialise(); self:addChild(self.title)
    local label = ISLabel:new(20, 40, 18, "Search:", 1, 1, 1, 1, UIFont.Small, true); label:initialise(); self:addChild(label)
    self.searchEntry = ISTextEntryBox:new("", label:getRight() + 8, 34, self.width - 730, 28)
    self.searchEntry.font = UIFont.Small; self.searchEntry.onTextChange = function() self:refresh() end; self.searchEntry:initialise(); self.searchEntry:instantiate(); self.searchEntry:setClearButton(true); self:addChild(self.searchEntry)
    self.filterChoice = ISComboBox:new(self.width - 500, 34, 200, 28, self, Selector.refresh)
    self.filterChoice:initialise(); self.filterChoice:addOption("All mods"); self.filterChoice:addOption("Needs API translation"); self.filterChoice:addOption("Has existing translation"); self.filterChoice:addOption("Large API load (20k+ chars)"); self.filterChoice:addOption("Selected mods"); self.filterChoice.selected = 1; self:addChild(self.filterChoice)
    self.sortChoice = ISComboBox:new(self.width - 280, 34, 260, 28, self, Selector.refresh)
    self.sortChoice:initialise(); self.sortChoice:addOption("Load order"); self.sortChoice:addOption("Recently updated"); self.sortChoice:addOption("Recent Steam install/update"); self.sortChoice:addOption("Most API characters"); self.sortChoice:addOption("Most API candidates"); self.sortChoice.selected = 1; self:addChild(self.sortChoice)
    -- ISScrollingListBox renders its column header one row above its origin.
    -- Leave a full row below the search/filter controls so it cannot overlap them.
    self.list = ISScrollingListBox:new(20, 112, self.width - 40, self.height - 178)
    self.list:initialise(); self.list.itemheight = math.max(34, getTextManager():getFontHeight(UIFont.Small) + 12); self.list.itemPadY = math.floor((self.list.itemheight - self.list.fontHgt) / 2) - 1
    self.list.doDrawItem = self.drawTargetItem
    self.list:addColumn("Select", 0); self.list:addColumn("Mod", 48)
    self.list:addColumn("Candidates", self.list.width - 360); self.list:addColumn("Translated", self.list.width - 270)
    self.list:addColumn("API chars", self.list.width - 165); self.list:addColumn("Warning", self.list.width - 65)
    self.list.onMouseDown = function(list, x, y)
        ISScrollingListBox.onMouseDown(list, x, y)
        local item = list.items[list.selected]
        if item then
            item.item.selected = not item.item.selected; self.selectedById[item.item.id] = item.item.selected
            item.text = item.item.name
            self:updateSelectionTitle()
        end
    end
    self:addChild(self.list)
    self.allButton = ISButton:new(12, self.height - 42, 100, 28, "All", self, Selector.selectAll); self.allButton:initialise(); self:addChild(self.allButton)
    self.noneButton = ISButton:new(118, self.height - 42, 100, 28, "None", self, Selector.selectNone); self.noneButton:initialise(); self:addChild(self.noneButton)
    self.largeButton = ISButton:new(330, self.height - 42, 130, 28, "Select large mods", self, Selector.selectLarge); self.largeButton:initialise(); self:addChild(self.largeButton)
    self.refreshButton = ISButton:new(224, self.height - 42, 100, 28, "Refresh", self, Selector.refresh); self.refreshButton:initialise(); self:addChild(self.refreshButton)
    self.saveButton = ISButton:new(self.width - 212, self.height - 42, 95, 28, "Save", self, Selector.save); self.saveButton:initialise(); self:addChild(self.saveButton)
    self.closeButton = ISButton:new(self.width - 111, self.height - 42, 95, 28, "Close", self, Selector.close); self.closeButton:initialise(); self:addChild(self.closeButton)
    self:refresh()
end
function Selector:updateSelectionTitle()
    local selectedCount = 0
    for _, selected in pairs(self.selectedById or {}) do if selected then selectedCount = selectedCount + 1 end end
    self.title:setNameWithoutMoving("Translation targets - selected " .. tostring(selectedCount) .. " mod(s)")
end
function Selector:refresh()
    self.selectedById = self.selectedById or {}
    for _, item in ipairs(self.list.items) do self.selectedById[item.item.id] = item.item.selected end
    local stored = {}; local useStored = false
    for _, id in ipairs(PZAITranslator.loadTargetSelection()) do stored[id] = true; useStored = true end
    self.list:clear()
    local mods = getActivatedMods()
    local catalog, catalogLanguage = PZAITranslator.loadTargetCatalog()
    if catalogLanguage ~= nil and catalogLanguage ~= PZAITranslator.loadProviderSettings().targetLanguage then catalog = {} end
    local filter = string.lower(self.searchEntry and self.searchEntry:getInternalText() or "")
    -- ISComboBox exposes the selected index as a field in Build 42; unlike
    -- ModOptions controls it does not implement getValue().
    local filterMode = self.filterChoice and self.filterChoice.selected or 1
    local sortMode = self.sortChoice and self.sortChoice.selected or 1
    local entries = {}
    for i = 0, mods:size() - 1 do
        local id = mods:get(i)
        if id ~= "PZAITranslator" and id ~= "PZAITranslationGenerated" then
            local info = getModInfoByID(id); local name = info and info:getName() or id
            local selected = self.selectedById[id] ~= nil and self.selectedById[id] or (useStored and stored[id] or false)
            self.selectedById[id] = selected
            local stat = catalog[id]
            local existing = stat and ((stat.existing or 0) + (stat.existing_overlay or 0) + (stat.existing_generated or 0)) or 0
            local matchesText = filter == "" or string.find(string.lower(name .. " " .. id), filter, 1, true)
            local matchesMode = filterMode == 1 or (filterMode == 2 and stat and stat.pending > 0) or (filterMode == 3 and stat and existing > 0) or (filterMode == 4 and stat and stat.large == 1) or (filterMode == 5 and selected)
            if matchesText and matchesMode then table.insert(entries, { id = id, name = name, selected = selected, existing = existing, stat = stat, loadOrder = i }) end
        end
    end
    table.sort(entries, function(a, b)
        local aStat, bStat = a.stat or {}, b.stat or {}
        local aValue, bValue
        if sortMode == 2 then aValue, bValue = aStat.updatedAt or 0, bStat.updatedAt or 0
        elseif sortMode == 3 then aValue, bValue = aStat.steamUpdatedAt or 0, bStat.steamUpdatedAt or 0
        elseif sortMode == 4 then aValue, bValue = aStat.apiChars or 0, bStat.apiChars or 0
        elseif sortMode == 5 then aValue, bValue = aStat.pending or 0, bStat.pending or 0
        else aValue, bValue = a.loadOrder, b.loadOrder end
        if aValue ~= bValue then
            if sortMode == 1 then return aValue < bValue end
            return aValue > bValue
        end
        return a.id < b.id
    end)
    for _, entry in ipairs(entries) do self.list:addItem(entry.name, entry) end
    self:updateSelectionTitle()
end
function Selector:selectAll()
    for _, item in ipairs(self.list.items) do
        if not (item.item.stat and item.item.stat.large == 1) then
            item.item.selected = true; self.selectedById[item.item.id] = true
            item.text = item.item.name
        end
    end
    self:updateSelectionTitle()
end
function Selector:selectLarge()
    for _, item in ipairs(self.list.items) do
        if item.item.stat and item.item.stat.large == 1 then
            item.item.selected = true; self.selectedById[item.item.id] = true
            item.text = item.item.name
        end
    end
    self:updateSelectionTitle()
end
function Selector:selectNone()
    for _, item in ipairs(self.list.items) do
        item.item.selected = false; self.selectedById[item.item.id] = false
            item.text = item.item.name
    end
    self:updateSelectionTitle()
end
function Selector:save()
    local out = {}; for id, selected in pairs(self.selectedById) do if selected then table.insert(out, id) end end
    PZAITranslator.saveTargetSelection(out); self:updateSelectionTitle()
end
function Selector:close() self:save(); self:setVisible(false); self:removeFromUIManager(); PZAITranslator.selector = nil end
function Selector:new(x, y, w, h)
    local o = ISPanel:new(x, y, w, h); setmetatable(o, self); self.__index = self
    o.backgroundColor = {r=0, g=0, b=0, a=0.9}; o.borderColor = {r=1, g=1, b=1, a=0.35}; o.moveWithMouse = true
    return o
end
function PZAITranslator.openTargetSelector()
    if PZAITranslator.selector then PZAITranslator.selector:bringToTop(); return end
    local screenW, screenH = getCore():getScreenWidth(), getCore():getScreenHeight()
    local w,h = math.min(1300, math.max(900, screenW - 80)), math.min(900, math.max(700, screenH - 80))
    local panel = Selector:new((screenW-w)/2, (screenH-h)/2, w,h)
    panel:initialise(); panel:addToUIManager(); PZAITranslator.selector = panel
end

local TAB_INDEX = 3
local DASHBOARD_MIN_WIDTH = 620
local DASHBOARD_MIN_HEIGHT = 500
local DashboardPanel = ISPanel:derive("PZAITranslatorDashboardPanel")

function DashboardPanel:prerender()
    -- Match the vanilla clothing-protection view: the active content asks the
    -- tab panel and character-info window for enough room to display itself.
    self:setWidthAndParentWidth(math.max(self.width, DASHBOARD_MIN_WIDTH))
    self:setHeightAndParentHeight(math.max(self.height, DASHBOARD_MIN_HEIGHT))
    ISPanel.prerender(self)
end

function DashboardPanel:new(x, y, width, height)
    local o = ISPanel:new(x, y, width, height)
    setmetatable(o, self); self.__index = self
    return o
end

local function dashboardStatusText()
    local state = PZAITranslator.status()
    local info = PZAITranslator.statusInfo()
    local labels = { idle = "Idle", needs_configuration = "Configuration", queued = "Queued", running = "Running", paused = "Paused", complete = "Complete", failed = "Failed" }
    local parts = { labels[state] or tostring(state) }
    local batchIndex = tonumber(info.batchIndex or "0") or 0
    local batchCount = tonumber(info.batchCount or "0") or 0
    local completed = tonumber(info.completed or "0") or 0
    local total = tonumber(info.total or "0") or 0
    local reused = tonumber(info.reused or "0") or 0
    local failed = tonumber(info.failed or "0") or 0
    local retries = tonumber(info.retries or "0") or 0
    local conflicts = tonumber(info.conflicts or "0") or 0
    local waitSeconds = tonumber(info.waitSeconds or "0") or 0
    local estimatedWaitSeconds = tonumber(info.estimatedWaitSeconds or "0") or 0
    if state == "running" and batchCount > 0 then table.insert(parts, "Batch " .. tostring(math.max(1, batchIndex)) .. "/" .. tostring(batchCount)) end
    if total > 0 then table.insert(parts, "Items " .. tostring(completed) .. "/" .. tostring(total)) end
    if reused > 0 then table.insert(parts, "Reused " .. tostring(reused)) end
    if failed > 0 then table.insert(parts, "Failed " .. tostring(failed)) end
    if retries > 0 then table.insert(parts, "Retries " .. tostring(retries)) end
    if conflicts > 0 then table.insert(parts, "Conflicts " .. tostring(conflicts)) end
    if waitSeconds > 0 then table.insert(parts, "Wait " .. tostring(waitSeconds) .. "s")
    elseif state == "running" and estimatedWaitSeconds > 0 then table.insert(parts, "ETA " .. tostring(estimatedWaitSeconds) .. "s") end
    if state == "failed" and info.errorCode and info.errorCode ~= "" then table.insert(parts, "HTTP " .. tostring(info.errorCode)) end
    return table.concat(parts, " | ")
end
local function dashboardStatusDetailText()
    local state = PZAITranslator.status()
    local info = PZAITranslator.statusInfo()
    local parts = {}
    if info.message and info.message ~= "" then table.insert(parts, tostring(info.message)) end
    if info.phase and info.phase ~= "" and info.phase ~= state then table.insert(parts, "Phase " .. tostring(info.phase)) end
    if info.currentMod and info.currentMod ~= "" then table.insert(parts, "Mods " .. tostring(info.currentMod)) end
    if state == "queued" then table.insert(parts, "Helper pending") end
    return table.concat(parts, " | ")
end
local function refreshDashboard(view)
    if not view then return end
    local state = PZAITranslator.status()
    local busy = PZAITranslator.isJobBusy()
    if view.startButton then view.startButton:setEnable(not busy) end
    if view.resumeButton then view.resumeButton:setEnable(not busy) end
    if view.testButton then view.testButton:setEnable(not busy) end
    if view.pauseButton then view.pauseButton:setEnable(state == "running") end
    if view.statusLabel then view.statusLabel:setNameWithoutMoving("Status: " .. dashboardStatusText()) end
    if view.statusDetail then
        view.statusDetail.text = dashboardStatusDetailText()
        view.statusDetail:paginate()
    end
end
local function startTranslation(view)
    PZAITranslator.requestTranslation()
    refreshDashboard(view)
end
local function resumeTranslation(view)
    PZAITranslator.requestTranslation("resume")
    refreshDashboard(view)
end
local function pauseTranslation(view)
    PZAITranslator.requestPause()
    refreshDashboard(view)
end
local function testConnection(view)
    PZAITranslator.requestConnectionTest()
    refreshDashboard(view)
end
local function installCharacterTab()
if ISCharacterInfoWindow and not PZAITranslator.charTabHooked then
    PZAITranslator.charTabHooked = true
    local original = ISCharacterInfoWindow.createChildren
    function ISCharacterInfoWindow:createChildren(...)
        local result = original(self, ...)
        local ok, err = pcall(function()
            if not self.panel or not self.panel.viewList then return end
            local view = DashboardPanel:new(0, 8, math.max(self.width, DASHBOARD_MIN_WIDTH), math.max(self.height - 8, DASHBOARD_MIN_HEIGHT)); view:initialise()
            local title = ISLabel:new(16, 18, 20, "AI Translator", 1, 1, 1, 1, UIFont.Medium, true); title:initialise(); view:addChild(title)
            local info = ISLabel:new(16, 52, 18, "Translation jobs. Provider and review tools: Mod Options.", 0.8, 0.8, 0.8, 1, UIFont.Small, true); info:initialise(); view:addChild(info)
            local buttonX = 16
            local buttonWidth = math.min(300, math.max(180, view.width - 32))
            local buttonHeight = 28
            local buttonGap = 6
            local buttonY = 86
            local function addDashboardButton(label, callback)
                local dashboardButton = ISButton:new(buttonX, buttonY, buttonWidth, buttonHeight, label, view, callback)
                dashboardButton:initialise(); view:addChild(dashboardButton)
                buttonY = buttonY + buttonHeight + buttonGap
                return dashboardButton
            end
            addDashboardButton("Manage translation targets", PZAITranslator.openTargetSelector)
            view.startButton = addDashboardButton("Start new translation", startTranslation)
            view.resumeButton = addDashboardButton("Resume interrupted translation", resumeTranslation)
            view.pauseButton = addDashboardButton("Pause after current request", pauseTranslation)
            view.testButton = addDashboardButton("Test API: Hello, World!", testConnection)
            addDashboardButton("Refresh status", refreshDashboard)
            view.statusLabel = ISLabel:new(16, buttonY + 10, 18, "Status: " .. dashboardStatusText(), 1, 1, 1, 1, UIFont.Small, true); view.statusLabel:initialise(); view:addChild(view.statusLabel)
            local detailY = buttonY + 34
            local detailLabel = ISLabel:new(16, detailY, 18, "Status detail:", 0.8, 0.8, 0.8, 1, UIFont.Small, true); detailLabel:initialise(); view:addChild(detailLabel)
            view.statusDetail = ISRichTextPanel:new(16, detailY + 20, math.max(180, view.width - 32), 70)
            view.statusDetail:initialise(); view.statusDetail:instantiate(); view.statusDetail:noBackground(); view.statusDetail.autosetheight = false; view:addChild(view.statusDetail)
            refreshDashboard(view)
            PZAITranslator.characterDashboard = view
            self.panel:addView("AI Translator", view)
            local list = self.panel.viewList; if #list > TAB_INDEX then local entry=table.remove(list,#list); table.insert(list,TAB_INDEX,entry) end
        end)
        if not ok then print("PZAITranslator: character tab failed: " .. tostring(err)) end
        return result
    end
end
end
installCharacterTab()
Events.OnGameStart.Add(installCharacterTab)

local dashboardPollTicks = 0
Events.OnTick.Add(function()
    local view = PZAITranslator.characterDashboard
    if not view or view.statusLabel == nil then return end
    dashboardPollTicks = dashboardPollTicks + 1
    if dashboardPollTicks >= 60 then
        dashboardPollTicks = 0
        refreshDashboard(view)
    end
end)
