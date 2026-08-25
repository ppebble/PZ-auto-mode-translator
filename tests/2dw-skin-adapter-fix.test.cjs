const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const modRoot = path.join(root, "mods", "2DWSkinAdapterFix");
const modInfo = fs.readFileSync(path.join(modRoot, "common", "mod.info"), "utf8");
const lua = fs.readFileSync(
  path.join(modRoot, "common", "media", "lua", "client", "2DWSkinAdapterFix.lua"),
  "utf8",
);

assert.match(modInfo, /^id=2DWSkinAdapterFix$/m);
assert.match(modInfo, /^require=42_VSGirlBodySFW,4123567854998$/m);
assert.match(lua, /\["Base\.2dw_skinmaskp"\] = 3/);
assert.match(lua, /\["Base\.2dw_skinmaskw"\] = 4/);
assert.match(lua, /player:removeWornItem\(adapter, false\)/);
assert.match(lua, /humanVisual:setSkinTextureIndex\(skinIndex\)/);
assert.match(lua, /Events\.OnClothingUpdated\.Add\(applyWornAdapter\)/);
assert.match(lua, /Events\.OnCreatePlayer\.Add\(onCreatePlayer\)/);
assert.match(lua, /if isClient\(\) then\s+sendVisual\(player\)/);

const removePosition = lua.indexOf("player:removeWornItem(adapter, false)");
const updatePosition = lua.indexOf("humanVisual:setSkinTextureIndex(skinIndex)");
assert.ok(removePosition >= 0 && updatePosition > removePosition, "broken adapter must be removed before applying skin");

console.log("2D Wardrobe skin adapter fix contract passed.");
