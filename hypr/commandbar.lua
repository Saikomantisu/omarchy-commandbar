-- Command Bar hotkey, loaded from ~/.config/hypr/bindings.lua:
--
--   local cb = os.getenv("HOME") .. "/.config/omarchy/plugins/io.github.saikomantisu.commandbar/hypr/commandbar.lua"
--   local f = io.open(cb); if f then f:close(); dofile(cb) end
--
-- The key comes from "hotkey" in ~/.config/omarchy/extensions/commandbar.json,
-- falling back to the plugin's config.default.json. The plugin reloads
-- Hyprland's config when it changes, so edits apply straight away.
-- "hotkey": "" (or "none") leaves the bar unbound.

local home = os.getenv("HOME") or ""
local plugin = home .. "/.config/omarchy/plugins/io.github.saikomantisu.commandbar"

local function read(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local text = f:read("*a")
  f:close()
  return text
end

-- Just enough JSONC: drop comment lines, then find the "hotkey" string.
local function hotkey_from(path)
  local text = read(path)
  if not text then return nil end
  text = text:gsub("\n%s*//[^\n]*", "\n")
  return text:match('"hotkey"%s*:%s*"([^"]*)"')
end

local key = hotkey_from(home .. "/.config/omarchy/extensions/commandbar.json")
  or hotkey_from(plugin .. "/config.default.json")
  or "SUPER + PERIOD"

if key ~= "" and key:lower() ~= "none" then
  o.bind(key, "Command bar", "omarchy-shell shell toggle io.github.saikomantisu.commandbar")
end

hl.layer_rule({ match = { namespace = "^omarchy-commandbar$" }, no_anim = true, animation = "none" })
