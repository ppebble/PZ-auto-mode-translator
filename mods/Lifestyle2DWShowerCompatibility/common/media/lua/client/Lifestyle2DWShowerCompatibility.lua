require "WardrobeChange"

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
