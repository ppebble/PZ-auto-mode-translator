require "ISUI/ISPanel"
require "ISUI/ISButton"
require "ISUI/ISLabel"
require "ISUI/ISScrollingListBox"
require "ISUI/ISTextEntryBox"
require "ISUI/ISComboBox"

PZAITranslator = PZAITranslator or {}

-- ISScrollingListBox renders its column header above the list origin. These
-- offsets deliberately leave one header row between controls and list data.
local REVIEW_LIST_Y = 124
local BULK_LIST_Y = 214
local LUA_LIST_Y = 142
local REVIEW_PAGE_SIZE = 200

local function clipText(list, text, width)
    text = tostring(text or "")
    if getTextManager():MeasureStringX(list.font, text) <= width then return text end
    local cut = #text
    while cut > 0 do
        local start = cut
        while start > 1 do
            local byte = string.byte(text, start)
            if byte < 0x80 or byte >= 0xC0 then break end
            start = start - 1
        end
        cut = start - 1
        local candidate = string.sub(text, 1, cut) .. "..."
        if getTextManager():MeasureStringX(list.font, candidate) <= width then return candidate end
    end
    return "..."
end

local function addButton(panel, x, y, w, label, callback)
    local button = ISButton:new(x, y, w, 28, label, panel, callback); button:initialise(); panel:addChild(button); return button
end

local function addEntry(panel, x, y, w, h, value, enabled)
    local entry = ISTextEntryBox:new(value or "", x, y, w, h); entry:initialise(); entry:instantiate(); entry:setEditable(enabled ~= false); panel:addChild(entry); return entry
end

local ReviewPanel = ISPanel:derive("PZAITranslatorReviewPanel")

function ReviewPanel:drawItem(y, item, alt)
    if item.selected then self:drawSelection(0, y, self:getWidth(), item.height) end
    local record = item.item; local c = self.textColor; local w = self:getWidth()
    self:drawText(clipText(self, record.modId, 170), 8, y + 7, c.r, c.g, c.b, c.a, self.font)
    self:drawText(clipText(self, record.category, 90), 185, y + 7, c.r, c.g, c.b, c.a, self.font)
    self:drawText(clipText(self, record.source, math.max(100, w * 0.30)), 285, y + 7, c.r, c.g, c.b, c.a, self.font)
    self:drawText(clipText(self, record.target, math.max(100, w * 0.30)), math.floor(w * 0.60), y + 7, c.r, c.g, c.b, c.a, self.font)
    self:drawTextRight(record.edited and "Edited" or record.status, w - 8, y + 7, record.status == "needs_review" and 1 or c.r, record.status == "needs_review" and 0.4 or c.g, c.b, c.a, self.font)
    return y + item.height
end

function ReviewPanel:initialise()
    ISPanel.initialise(self)
    self.titleLabel = ISLabel:new(16, 12, 22, "Generated translation review", 1, 1, 1, 1, UIFont.Medium, true); self.titleLabel:initialise(); self:addChild(self.titleLabel)
    self.search = addEntry(self, 16, 42, 330, 28, "", true)
    self.filter = ISComboBox:new(360, 42, 190, 28, self, ReviewPanel.refresh); self.filter:initialise(); self.filter:addOption("All generated"); self.filter:addOption("Needs review"); self.filter:addOption("Provider results"); self.filter:addOption("Edited"); self.filter.selected = 2; self:addChild(self.filter)
    addButton(self, 562, 42, 100, "Search", ReviewPanel.refresh)
    self.list = ISScrollingListBox:new(16, REVIEW_LIST_Y, self.width - 32, self.height - REVIEW_LIST_Y - 246); self.list:initialise(); self.list.itemheight = 30; self.list.doDrawItem = self.drawItem
    self.list:addColumn("Mod", 0); self.list:addColumn("Category", 177); self.list:addColumn("Source", 277); self.list:addColumn("Target", math.floor(self.list.width * 0.59)); self.list:addColumn("State", self.list.width - 100)
    self.list.onMouseDown = function(list, x, y) ISScrollingListBox.onMouseDown(list, x, y); self:loadSelected() end
    self:addChild(self.list)
    local formY = self.height - 226
    local sourceLabel = ISLabel:new(16, formY, 18, "Source (read-only)", 0.8, 0.8, 0.8, 1, UIFont.Small, true); sourceLabel:initialise(); self:addChild(sourceLabel)
    self.source = addEntry(self, 16, formY + 22, self.width - 32, 42, "", false); self.source:setMultipleLine(true); self.source:setMaxLines(2)
    local targetLabel = ISLabel:new(16, formY + 70, 18, "Reviewed target", 1, 1, 1, 1, UIFont.Small, true); targetLabel:initialise(); self:addChild(targetLabel)
    self.target = addEntry(self, 16, formY + 92, self.width - 32, 52, "", true); self.target:setMultipleLine(true); self.target:setMaxLines(3)
    addButton(self, 16, self.height - 42, 150, "Save edit", ReviewPanel.saveEdit)
    addButton(self, 174, self.height - 42, 190, "Apply saved edits", ReviewPanel.applyEdits)
    addButton(self, 372, self.height - 42, 110, "Bulk replace", ReviewPanel.openBulk)
    addButton(self, 490, self.height - 42, 90, "Previous", ReviewPanel.previousPage)
    addButton(self, 588, self.height - 42, 90, "Next", ReviewPanel.nextPage)
    addButton(self, self.width - 126, self.height - 42, 110, "Close", ReviewPanel.close)
    self:reload()
end

function ReviewPanel:reload()
    self.records = PZAITranslator.loadReviewRecords(); self.edits = {}; self.byId = {}; self.searchCache = {}; self.page = 1
    for _, edit in ipairs(PZAITranslator.loadReviewEdits()) do self.edits[edit.id] = edit.target end
    for _, record in ipairs(self.records) do
        if self.edits[record.id] ~= nil then record.target = self.edits[record.id]; record.edited = true end
        record.searchText = string.lower((record.modId or "") .. " " .. (record.category or "") .. " " .. (record.key or "") .. " " .. (record.source or "") .. " " .. (record.target or ""))
        self.byId[record.id] = record
    end
    self:refresh(true)
end

function ReviewPanel:refresh(keepPage)
    if not self.list then return end
    if keepPage ~= true then self.page = 1 end
    self.list:clear(); local query = string.lower(self.search:getInternalText() or ""); local mode = self.filter.selected or 1
    local cacheKey = tostring(mode) .. "|" .. query
    local matches = self.searchCache[cacheKey]
    if matches == nil then
        matches = {}
        for _, record in ipairs(self.records or {}) do
            local matchesMode = mode == 1 or (mode == 2 and record.status == "needs_review") or (mode == 3 and record.method == "provider") or (mode == 4 and record.edited)
            if matchesMode and (query == "" or string.find(record.searchText, query, 1, true) ~= nil) then table.insert(matches, record) end
        end
        self.searchCache[cacheKey] = matches
    end
    local pageCount = math.max(1, math.ceil(#matches / REVIEW_PAGE_SIZE))
    self.page = math.min(math.max(self.page or 1, 1), pageCount)
    local first = ((self.page - 1) * REVIEW_PAGE_SIZE) + 1
    local last = math.min(first + REVIEW_PAGE_SIZE - 1, #matches)
    for index = first, last do local record = matches[index]; self.list:addItem(record.source, record) end
    self.matchCount = #matches; self.pageCount = pageCount
    self.titleLabel:setName("Generated translation review - " .. tostring(#matches) .. " result(s), page " .. tostring(self.page) .. "/" .. tostring(pageCount))
end

function ReviewPanel:previousPage() if (self.page or 1) > 1 then self.page = self.page - 1; self:refresh(true) end end
function ReviewPanel:nextPage() if (self.page or 1) < (self.pageCount or 1) then self.page = self.page + 1; self:refresh(true) end end

function ReviewPanel:loadSelected()
    local item = self.list.items[self.list.selected]; self.current = item and item.item or nil
    self.source:setText(self.current and self.current.source or ""); self.target:setText(self.current and self.current.target or "")
end

function ReviewPanel:saveEdit()
    if not self.current then return end
    local target = self.target:getInternalText() or ""; self.edits[self.current.id] = target; self.current.target = target; self.current.edited = true
    self.current.searchText = string.lower((self.current.modId or "") .. " " .. (self.current.category or "") .. " " .. (self.current.key or "") .. " " .. (self.current.source or "") .. " " .. target)
    self.searchCache = {}
    local out = {}; for id, value in pairs(self.edits) do table.insert(out, { id = id, target = value }) end
    PZAITranslator.saveReviewEdits(out); self:refresh(true)
end
function ReviewPanel:applyEdits() self:saveEdit(); PZAITranslator.requestApplyReview() end
function ReviewPanel:openBulk() if PZAITranslator.openBulkCorrectionPanel then PZAITranslator.openBulkCorrectionPanel(self.current) end end
function ReviewPanel:close() self:setVisible(false); self:removeFromUIManager(); PZAITranslator.reviewPanel = nil end
function ReviewPanel:new(x,y,w,h) local o=ISPanel:new(x,y,w,h); setmetatable(o,self); self.__index=self; o.backgroundColor={r=0,g=0,b=0,a=0.94}; o.borderColor={r=1,g=1,b=1,a=0.35}; o.moveWithMouse=true; return o end

local function replaceLiteral(value, needle, replacement)
    if needle == "" then return value end
    local parts = {}; local start = 1
    while true do
        local first, last = string.find(value, needle, start, true)
        if first == nil then table.insert(parts, string.sub(value, start)); break end
        table.insert(parts, string.sub(value, start, first - 1)); table.insert(parts, replacement); start = last + 1
    end
    return table.concat(parts)
end

local BulkPanel = ISPanel:derive("PZAITranslatorBulkCorrectionPanel")
function BulkPanel:drawItem(y,item,alt)
    if item.selected then self:drawSelection(0,y,self:getWidth(),item.height) end
    local r=item.item;local c=self.textColor;local w=self:getWidth()
    self:drawText(clipText(self,r.modId,205),8,y+7,c.r,c.g,c.b,c.a,self.font)
    self:drawText(clipText(self,r.category,95),220,y+7,c.r,c.g,c.b,c.a,self.font)
    self:drawText(clipText(self,r.target,math.max(100,w*0.30)),325,y+7,c.r,c.g,c.b,c.a,self.font)
    self:drawText(clipText(self,r.proposed,math.max(100,w*0.34)),math.floor(w*0.62),y+7,c.r,c.g,c.b,c.a,self.font)
    return y+item.height
end
function BulkPanel:addLabel(x,y,text)
    local label=ISLabel:new(x,y,18,text,0.85,0.85,0.85,1,UIFont.Small,true);label:initialise();self:addChild(label);return label
end
function BulkPanel:initialise()
    ISPanel.initialise(self)
    self.titleLabel=ISLabel:new(16,12,22,"Bulk correct generated translations",1,1,1,1,UIFont.Medium,true);self.titleLabel:initialise();self:addChild(self.titleLabel)
    local note=ISLabel:new(16,40,18,"Literal text replacement only. Preview matches before saving; Workshop and source mods are never changed.",0.8,0.8,0.8,1,UIFont.Small,true);note:initialise();self:addChild(note)
    self:addLabel(16,68,"Find in translated text");self:addLabel(math.floor(self.width/2)+8,68,"Replace with")
    self.findText=addEntry(self,16,90,math.floor(self.width/2)-24,28,"",true);self.replaceText=addEntry(self,math.floor(self.width/2)+8,90,math.floor(self.width/2)-24,28,"",true)
    self:addLabel(16,128,"Mod ID (optional; blank means all mods)");self:addLabel(math.floor(self.width/2)+8,128,"Category (optional; blank means all categories)")
    self.modId=addEntry(self,16,150,math.floor(self.width/2)-24,28,"",true);self.category=addEntry(self,math.floor(self.width/2)+8,150,math.floor(self.width/2)-24,28,"",true)
    self.list=ISScrollingListBox:new(16,BULK_LIST_Y,self.width-32,self.height-BULK_LIST_Y-70);self.list:initialise();self.list.itemheight=30;self.list.doDrawItem=self.drawItem
    self.list:addColumn("Mod",0);self.list:addColumn("Category",212);self.list:addColumn("Current translation",317);self.list:addColumn("After replacement",math.floor(self.list.width*0.61));self:addChild(self.list)
    addButton(self,16,self.height-42,90,"Preview",BulkPanel.preview)
    addButton(self,114,self.height-42,90,"Previous",BulkPanel.previousPage)
    addButton(self,212,self.height-42,90,"Next",BulkPanel.nextPage)
    self.saveButton=addButton(self,310,self.height-42,180,"Save corrections",BulkPanel.saveCorrections)
    addButton(self,498,self.height-42,180,"Apply saved edits",BulkPanel.applyEdits)
    addButton(self,self.width-126,self.height-42,110,"Close",BulkPanel.close)
    self:reload()
end
function BulkPanel:reload()
    self.records=PZAITranslator.reviewPanel and PZAITranslator.reviewPanel.records or PZAITranslator.loadReviewRecords();self.edits={};self.matches={};self.page=1;self.confirmSignature=nil
    for _,edit in ipairs(PZAITranslator.loadReviewEdits())do self.edits[edit.id]=edit.target end
    for _,record in ipairs(self.records or {})do if self.edits[record.id]~=nil then record.target=self.edits[record.id];record.edited=true end end
    self:preview()
end
function BulkPanel:rebuildMatches()
    self.matches={};local needle=self.findText:getInternalText() or "";local replacement=self.replaceText:getInternalText() or "";local modId=self.modId:getInternalText() or "";local category=self.category:getInternalText() or ""
    if needle~="" then
        for _,record in ipairs(self.records or {})do
            local target=record.target or "";local scoped=(modId=="" or record.modId==modId)and(category=="" or record.category==category)
            if scoped and string.find(target,needle,1,true)then table.insert(self.matches,{id=record.id,modId=record.modId,category=record.category,target=target,proposed=replaceLiteral(target,needle,replacement),record=record}) end
        end
    end
    self.signature=needle.."\t"..replacement.."\t"..modId.."\t"..category.."\t"..tostring(#self.matches)
    self.pageCount=math.max(1,math.ceil(#self.matches/REVIEW_PAGE_SIZE));self.page=math.min(math.max(self.page or 1,1),self.pageCount)
end
function BulkPanel:renderPage(message)
    if not self.list then return end
    self.list:clear();local first=((self.page-1)*REVIEW_PAGE_SIZE)+1;local last=math.min(first+REVIEW_PAGE_SIZE-1,#self.matches)
    for index=first,last do local match=self.matches[index];self.list:addItem(match.target,match) end
    self.titleLabel:setName(message or ("Bulk correct generated translations - "..tostring(#self.matches).." match(es), page "..tostring(self.page).."/"..tostring(self.pageCount)))
end
function BulkPanel:preview()
    self.page=1;self.confirmSignature=nil;self.saveButton:setTitle("Save corrections");self:rebuildMatches();self:renderPage()
end
function BulkPanel:previousPage() if(self.page or 1)>1 then self.page=self.page-1;self:renderPage() end end
function BulkPanel:nextPage() if(self.page or 1)<(self.pageCount or 1) then self.page=self.page+1;self:renderPage() end end
function BulkPanel:saveCorrections()
    self:rebuildMatches();if #self.matches==0 then self.confirmSignature=nil;self.saveButton:setTitle("Save corrections");self:renderPage();return false end
    if self.confirmSignature~=self.signature then
        self.confirmSignature=self.signature;self.saveButton:setTitle("Confirm all "..tostring(#self.matches));self:renderPage("Confirm saving all "..tostring(#self.matches).." matching translations; click Confirm all again")
        return false
    end
    for _,match in ipairs(self.matches)do self.edits[match.id]=match.proposed;match.record.target=match.proposed;match.record.edited=true;if PZAITranslator.reviewPanel and PZAITranslator.reviewPanel.byId[match.id]then local r=PZAITranslator.reviewPanel.byId[match.id];r.target=match.proposed;r.edited=true;r.searchText=string.lower((r.modId or "").." "..(r.category or "").." "..(r.key or "").." "..(r.source or "").." "..(r.target or "")) end end
    local out={};for id,target in pairs(self.edits)do table.insert(out,{id=id,target=target})end;PZAITranslator.saveReviewEdits(out)
    self.confirmSignature=nil;self.saveButton:setTitle("Save corrections");self:renderPage("Bulk correct generated translations - saved "..tostring(#self.matches).." edit(s); apply when ready")
    if PZAITranslator.reviewPanel then PZAITranslator.reviewPanel.searchCache={};PZAITranslator.reviewPanel:refresh(true) end
    return true
end
function BulkPanel:applyEdits()
    local hasEdits=false;for _ in pairs(self.edits)do hasEdits=true;break end
    if hasEdits then PZAITranslator.requestApplyReview() end
end
function BulkPanel:close() self:setVisible(false);self:removeFromUIManager();PZAITranslator.bulkPanel=nil end
function BulkPanel:new(x,y,w,h)local o=ISPanel:new(x,y,w,h);setmetatable(o,self);self.__index=self;o.backgroundColor={r=0,g=0,b=0,a=0.94};o.borderColor={r=1,g=1,b=1,a=0.35};o.moveWithMouse=true;return o end

local LuaPanel=ISPanel:derive("PZAITranslatorLuaPanel")
function LuaPanel:drawItem(y,item,alt)
    if item.selected then self:drawSelection(0,y,self:getWidth(),item.height) end;local r=item.item;local c=self.textColor
    self:drawTextCentre(r.selected and "[x]" or "[ ]",24,y+7,c.r,c.g,c.b,c.a,self.font);self:drawText(clipText(self,r.modId,145),48,y+7,c.r,c.g,c.b,c.a,self.font);self:drawText(clipText(self,r.kind,115),200,y+7,c.r,c.g,c.b,c.a,self.font);self:drawText(clipText(self,(r.file or "")..":"..(r.line or ""),280),322,y+7,c.r,c.g,c.b,c.a,self.font);self:drawText(clipText(self,r.source,self:getWidth()-620),610,y+7,c.r,c.g,c.b,c.a,self.font);return y+item.height
end
function LuaPanel:initialise()
    ISPanel.initialise(self);local title=ISLabel:new(16,12,22,"Hardcoded Lua string candidates",1,1,1,1,UIFont.Medium,true);title:initialise();self:addChild(title)
    local note=ISLabel:new(16,40,18,"Review-only detection. Selection never edits Workshop/source mods and is not sent to an API.",1,0.75,0.35,1,UIFont.Small,true);note:initialise();self:addChild(note)
    self.search=addEntry(self,16,68,360,28,"",true)
    self.filter=ISComboBox:new(388,68,210,28,self,LuaPanel.refresh);self.filter:initialise();self.filter:addOption("All candidates");self.filter:addOption("High-confidence UI calls");self.filter:addOption("Display assignments");self.filter:addOption("Selected");self.filter.selected=1;self:addChild(self.filter)
    addButton(self,610,68,100,"Search",LuaPanel.refresh)
    self.list=ISScrollingListBox:new(16,LUA_LIST_Y,self.width-32,self.height-LUA_LIST_Y-70);self.list:initialise();self.list.itemheight=30;self.list.doDrawItem=self.drawItem;self.list:addColumn("Select",0);self.list:addColumn("Mod",40);self.list:addColumn("Type",192);self.list:addColumn("File",314);self.list:addColumn("Literal",602)
    self.list.onMouseDown=function(list,x,y) ISScrollingListBox.onMouseDown(list,x,y);local item=list.items[list.selected];if item then item.item.selected=not item.item.selected;self.selected[item.item.id]=item.item.selected end end;self:addChild(self.list)
    addButton(self,16,self.height-42,170,"Scan selected mods",LuaPanel.scan);addButton(self,194,self.height-42,150,"Save selection",LuaPanel.save);addButton(self,352,self.height-42,110,"Refresh",LuaPanel.reload);addButton(self,self.width-126,self.height-42,110,"Close",LuaPanel.close);self:reload()
end
function LuaPanel:reload() self.records=PZAITranslator.loadLuaCandidates();self.selected=PZAITranslator.loadLuaSelection();for _,r in ipairs(self.records)do r.selected=self.selected[r.id] or false end;self:refresh() end
function LuaPanel:refresh() self.list:clear();local q=string.lower(self.search:getInternalText() or "");local mode=self.filter and self.filter.selected or 1;for _,r in ipairs(self.records or {})do local h=string.lower((r.modId or "").." "..(r.file or "").." "..(r.source or ""));local matchesMode=mode==1 or(mode==2 and r.confidence=="high")or(mode==3 and r.kind=="display-assignment")or(mode==4 and r.selected);if matchesMode and(q=="" or string.find(h,q,1,true))then self.list:addItem(r.source,r)end end end
function LuaPanel:scan() PZAITranslator.requestLuaScan() end
function LuaPanel:save() PZAITranslator.saveLuaSelection(self.selected) end
function LuaPanel:close() self:save();self:setVisible(false);self:removeFromUIManager();PZAITranslator.luaPanel=nil end
function LuaPanel:new(x,y,w,h)local o=ISPanel:new(x,y,w,h);setmetatable(o,self);self.__index=self;o.backgroundColor={r=0,g=0,b=0,a=0.94};o.borderColor={r=1,g=1,b=1,a=0.35};o.moveWithMouse=true;return o end

local function openPanel(field, class, width, height)
    if PZAITranslator[field] then PZAITranslator[field]:bringToTop();return end
    local sw,sh=getCore():getScreenWidth(),getCore():getScreenHeight();local w=math.min(width,sw-60);local h=math.min(height,sh-60);local panel=class:new((sw-w)/2,(sh-h)/2,w,h);panel:initialise();panel:addToUIManager();PZAITranslator[field]=panel
end
function PZAITranslator.openReviewPanel() openPanel("reviewPanel",ReviewPanel,1280,820) end
function PZAITranslator.openBulkCorrectionPanel(record)
    openPanel("bulkPanel",BulkPanel,1180,760)
    if record and PZAITranslator.bulkPanel then PZAITranslator.bulkPanel.modId:setText(record.modId or "");PZAITranslator.bulkPanel.category:setText("") end
end
function PZAITranslator.openLuaCandidatesPanel() openPanel("luaPanel",LuaPanel,1250,800) end
