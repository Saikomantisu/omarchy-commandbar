.pragma library

// Works out which Lua to hand `hyprctl eval` so that exactly one binding —
// the configured "hotkey" — opens the bar. Pure: input is `hyprctl binds -j`
// output, so it can be tested without Hyprland.
//
// Bindings are recognised as ours by their description. Nothing is written
// to any config file; Hyprland forgets runtime binds on a config reload,
// which is why CommandBar.qml calls this again after every reload.

var DESCRIPTION = "Command bar"

var MOD_BITS = { SHIFT: 1, CAPS: 2, CTRL: 4, CONTROL: 4, ALT: 8, MOD1: 8, MOD2: 16, MOD3: 32, SUPER: 64, WIN: 64, LOGO: 64, MOD4: 64, MOD5: 128 }
var MOD_ORDER = [["SUPER", 64], ["CTRL", 4], ["ALT", 8], ["SHIFT", 1], ["MOD5", 128], ["MOD3", 32], ["MOD2", 16], ["CAPS", 2]]

// "SUPER + ALT + C" → { mask: 72, key: "C" }; null when empty or unparseable.
function parseCombo(text) {
  var parts = String(text || "").split("+").map(function(p) { return p.trim().toUpperCase() }).filter(function(p) { return p })
  if (parts.length === 0) return null
  var mask = 0, key = ""
  for (var i = 0; i < parts.length; i++) {
    if (MOD_BITS[parts[i]] !== undefined && i < parts.length - 1) mask |= MOD_BITS[parts[i]]
    else if (!key && i === parts.length - 1) key = parts[i]
    else return null
  }
  return key ? { mask: mask, key: key } : null
}

function comboString(mask, key) {
  var names = []
  for (var i = 0; i < MOD_ORDER.length; i++) if (mask & MOD_ORDER[i][1]) names.push(MOD_ORDER[i][0])
  names.push(key)
  return names.join(" + ")
}

function bindKey(b) {
  // Keycode binds ("code:20") report the key in `keycode`.
  return b.key ? String(b.key).toUpperCase() : (b.keycode ? "CODE:" + b.keycode : "")
}

function matches(b, combo) {
  return !!combo && b.modmask === combo.mask && bindKey(b) === combo.key
}

function luaString(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"'
}

// Returns { lua: [statements], conflict: "description" | "", bound: bool }.
function plan(bindsJson, hotkey, command) {
  var binds = []
  try { binds = JSON.parse(bindsJson) || [] } catch (e) { binds = [] }
  var want = parseCombo(hotkey)
  var lua = []
  var have = false

  for (var i = 0; i < binds.length; i++) {
    var b = binds[i]
    if (b.description !== DESCRIPTION) continue
    if (matches(b, want)) have = true
    else lua.push("hl.unbind(" + luaString(comboString(b.modmask, bindKey(b))) + ")")
  }

  if (!want || have) return { lua: lua, conflict: "", bound: have }

  for (var j = 0; j < binds.length; j++) {
    if (binds[j].description !== DESCRIPTION && matches(binds[j], want))
      return { lua: lua, conflict: binds[j].description || binds[j].dispatcher || "another binding", bound: false }
  }

  lua.push("hl.bind(" + luaString(comboString(want.mask, want.key)) + ", hl.dsp.exec_cmd(" + luaString(command)
    + "), { description = " + luaString(DESCRIPTION) + " })")
  lua.push('hl.layer_rule({ match = { namespace = "^omarchy-commandbar$" }, no_anim = true, animation = "none" })')
  return { lua: lua, conflict: "", bound: true }
}

