local adapterSkinIndexes = {
    ["Base.2dw_skinmaskp"] = 3, -- FemaleBody04 / pink adapter
    ["Base.2dw_skinmaskw"] = 4, -- FemaleBody05 / white adapter
}

local applyingAdapter = false

local function findWornAdapter(player)
    local wornItems = player:getWornItems()
    for index = 0, wornItems:size() - 1 do
        local item = wornItems:get(index):getItem()
        local skinIndex = item and adapterSkinIndexes[item:getFullType()]
        if skinIndex then
            return item, skinIndex
        end
    end

    return nil, nil
end

local function applyWornAdapter(player)
    if applyingAdapter or not player then
        return
    end

    local adapter, skinIndex = findWornAdapter(player)
    if not adapter then
        return
    end

    local humanVisual = player:getHumanVisual()
    if not humanVisual then
        return
    end

    applyingAdapter = true

    -- The current 2D Wardrobe XML mask item is documented as non-functional
    -- on Build 42 and can hide or corrupt other clothing. Keep the item in the
    -- inventory, but use its intended FemaleBody04/05 texture as a real skin
    -- tone instead of rendering the broken clothing layer.
    player:removeWornItem(adapter, false)
    humanVisual:setSkinTextureIndex(skinIndex)
    player:getInventory():setDrawDirty(true)
    player:resetModelNextFrame()

    if isClient() then
        sendVisual(player)
    end

    triggerEvent("OnClothingUpdated", player)
    print("[2DWSkinAdapterFix] Applied skin index " .. tostring(skinIndex)
        .. " from " .. adapter:getFullType() .. " and unequipped the broken adapter")

    applyingAdapter = false
end

local function onCreatePlayer(_, player)
    applyWornAdapter(player)
end

Events.OnClothingUpdated.Add(applyWornAdapter)
Events.OnCreatePlayer.Add(onCreatePlayer)

