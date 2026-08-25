const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const modRoot = path.join(root, "mods", "Lifestyle2DWShowerCompatibility");
const modInfo = fs.readFileSync(path.join(modRoot, "common", "mod.info"), "utf8");
const lua = fs.readFileSync(
  path.join(modRoot, "common", "media", "lua", "client", "Lifestyle2DWShowerCompatibility.lua"),
  "utf8",
);

assert.match(modInfo, /^id=Lifestyle2DWShowerCompatibility$/m);
assert.match(modInfo, /^require=LifestyleHobbies,4123567854998$/m);

assert.match(lua, /require "WardrobeChange"/);
assert.match(lua, /\["tdw:stylehead"\] = true/);
assert.match(lua, /\["tdw:stylekemono"\] = true/);
assert.match(lua, /\["tdw:styleskin"\] = true/);
assert.doesNotMatch(lua, /\["tdw:style(?:vest|acca|accb|accc|body)"\] = true/);
assert.match(lua, /location == TDWRegistries\.Styletail/);
assert.match(lua, /string\.sub\(fullType, 1, 9\) == "Base\.2dw_"/);
assert.match(lua, /originalClothesAboutToChange\(player, object, optiontype\)/);
assert.match(lua, /optiontype ~= START_SHOWER_CHANGE/);
assert.match(lua, /table\.remove\(showerClothes, index\)/);
assert.match(lua, /player:setWornItem\(item:getBodyLocation\(\), item\)/);
assert.match(lua, /local LSUseShower = require "TimedActions\/LSUseShower"/);
assert.match(lua, /local LSUseTub = require "TimedActions\/LSUseTub"/);
assert.match(lua, /local function hasUnprotectedWornClothing\(player\)/);
assert.match(lua, /player:isEquippedClothing\(item\)/);
assert.match(lua, /and not isProtectedItem\(item\)/);
assert.match(lua, /local function ensureOrdinaryClothesRemoved\(player, object\)/);
assert.match(lua, /ClothesAboutToChange\(player, object, START_SHOWER_CHANGE\)/);
assert.match(lua, /function LSUseShower:start\(\)/);
assert.match(lua, /function LSUseTub:start\(\)/);
assert.equal((lua.match(/self\.wearClothes = true/g) || []).length, 2);

const originalCall = lua.indexOf("originalClothesAboutToChange(player, object, optiontype)");
const protectionPass = lua.indexOf("for index = #showerClothes, 1, -1 do");
assert.ok(originalCall >= 0 && protectionPass > originalCall, "Lifestyle must run before protected items are restored");

console.log("Lifestyle + 2D Wardrobe shower compatibility contract passed.");
