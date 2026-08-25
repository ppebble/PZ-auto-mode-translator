require "WardrobeChange"
local LSUseShower = require "TimedActions/LSUseShower"
local LSUseTub = require "TimedActions/LSUseTub"

local START_SHOWER_CHANGE = "isBathNoLaundryStart"

-- These are 2D Wardrobe's character face, character-feature, and skin-adapter
-- body locations. Ordinary 2D Wardrobe clothing and accessories are removed.
local protectedLocations = {
    ["tdw:stylehead"] = true,
    ["tdw:stylekemono"] = true,
    ["tdw:styleskin"] = true,
}

local function is2DWItem(item)
    if not item or not item.getFullType then
        return false
    end

    local fullType = item:getFullType()
    return type(fullType) == "string" and string.sub(fullType, 1, 9) == "Base.2dw_"
end

local function isProtectedLocation(location)
    if not location then
        return false
    end

    if TDWRegistries then
        if location == TDWRegistries.Stylehair
            or location == TDWRegistries.Styletail
            or location == TDWRegistries.Styleskin then
            return true
        end
    end

    return protectedLocations[tostring(location)] == true
end

local function isProtectedItem(item)
    return is2DWItem(item)
        and item.getBodyLocation
        and isProtectedLocation(item:getBodyLocation())
end

local function hasUnprotectedWornClothing(player)
    local items = player:getInventory():getItems()
    for index = 0, items:size() - 1 do
        local item = items:get(index)
        if player:isEquippedClothing(item)
            and not item:isHidden()
            and item:getType() ~= "NeuralHat"
            and not isProtectedItem(item) then
            return true
        end
    end

    return false
end

local originalClothesAboutToChange = ClothesAboutToChange

if originalClothesAboutToChange and not Lifestyle2DWShowerCompatibilityInstalled then
    Lifestyle2DWShowerCompatibilityInstalled = true

    function ClothesAboutToChange(player, object, optiontype)
        originalClothesAboutToChange(player, object, optiontype)

        if optiontype ~= START_SHOWER_CHANGE or not player then
            return
        end

        local playerData = player:getModData()
        local showerClothes = playerData and playerData.ShowerClothes
        if type(showerClothes) ~= "table" then
            return
        end

        local restoredAny = false
        for index = #showerClothes, 1, -1 do
            local item = showerClothes[index]
            if isProtectedItem(item) then
                table.remove(showerClothes, index)
                player:setWornItem(item:getBodyLocation(), item)
                restoredAny = true
            end
        end

        if restoredAny then
            player:getInventory():setDrawDirty(true)
            player:resetModelNextFrame()
            triggerEvent("OnClothingUpdated", player)
        end
    end
end

local function ensureOrdinaryClothesRemoved(player, object)
    local playerData = player and player:getModData()
    local showerClothes = playerData and playerData.ShowerClothes

    -- Lifestyle already completed its normal clothing-change action.
    if type(showerClothes) == "table" and #showerClothes > 0 then
        return false
    end

    -- Lifestyle's context-menu precheck can miss equipped items whose current
    -- script has no ClothingItem. Its removal function does not require that
    -- field, so use the same equipped-clothing rule here as a fallback.
    if not player or not hasUnprotectedWornClothing(player) then
        return false
    end

    ClothesAboutToChange(player, object, START_SHOWER_CHANGE)
    showerClothes = player:getModData().ShowerClothes

    if type(showerClothes) == "table" and #showerClothes > 0 then
        print("[Lifestyle2DW] Applied fallback ordinary-clothing removal")
        return true
    end

    return false
end

if LSUseShower and not Lifestyle2DWShowerStartPatched then
    Lifestyle2DWShowerStartPatched = true
    local originalShowerStart = LSUseShower.start

    function LSUseShower:start()
        if ensureOrdinaryClothesRemoved(self.character, self.showerObject) then
            self.wearClothes = true
        end
        originalShowerStart(self)
    end
end


if LSUseTub and not Lifestyle2DWTubStartPatched then
    Lifestyle2DWTubStartPatched = true
    local originalTubStart = LSUseTub.start

    function LSUseTub:start()
        if ensureOrdinaryClothesRemoved(self.character, self.mainTubObj) then
            self.wearClothes = true
        end
        originalTubStart(self)
    end
end
