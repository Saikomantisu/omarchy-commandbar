import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import QtQuick
import "../lib/Hotkey.js" as Hotkey

// The bar binds its own hotkey in the running Hyprland (hyprctl eval), so
// installing the plugin is enough: no config file is edited. Hyprland drops
// runtime binds when its config reloads, so this re-runs after every
// reload, after config changes, and at startup. lib/Hotkey.js decides what
// to bind or unbind; a key that something else already uses is left alone.
Item {
  id: binding
  property var config: ({})
  // Set once both config files have reported in, so a user's own "hotkey"
  // is used from the start.
  property bool ready: false
  readonly property string toggleCommand: "omarchy-shell shell toggle io.github.saikomantisu.commandbar"
  property bool queued: false
  property string bound: ""           // what we bound, so unloading can unbind it
  property string warnedConflict: ""  // notify once per key, not on every reload

  function ensure() {
    if (!binding.ready) return
    // Wait for the previous bind to land too: reading the binds before it has
    // would see the key as free and bind it a second time.
    if (bindsProc.running || evalProc.running) { binding.queued = true; return }
    bindsProc.running = true
  }

  function reconcile(bindsJson) {
    var hotkey = String(binding.config.hotkey || "").trim()
    var p = Hotkey.plan(bindsJson, hotkey, binding.toggleCommand)
    if (p.lua.length > 0) { evalProc.command = ["hyprctl", "eval", p.lua.join("\n")]; evalProc.running = true }
    binding.bound = p.bound ? hotkey : ""
    if (p.conflict && binding.warnedConflict !== hotkey) {
      binding.warnedConflict = hotkey
      console.warn("commandbar: " + hotkey + " is already used by \"" + p.conflict + "\"; not binding it")
      Quickshell.execDetached(["notify-send", "-a", "Command Bar", "Command Bar has no hotkey",
        hotkey + " already opens \"" + p.conflict + "\". Set a different \"hotkey\" in ~/.config/omarchy/extensions/commandbar.json."])
    }
    if (!evalProc.running) binding.runQueued()
  }

  function runQueued() {
    if (binding.queued) { binding.queued = false; binding.ensure() }
  }

  Process {
    id: evalProc
    onExited: binding.runQueued()
  }

  // The short delay lets a previous instance's unbind land first when the
  // plugin is reloaded.
  onReadyChanged: if (binding.ready) startTimer.start()

  Timer {
    id: startTimer
    interval: 600
    onTriggered: binding.ensure()
  }

  Process {
    id: bindsProc
    command: ["hyprctl", "binds", "-j"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: binding.reconcile(String(text || ""))
    }
  }

  Connections {
    target: Hyprland
    function onRawEvent(event) {
      if (event && String(event.name) === "configreloaded") binding.ensure()
    }
  }

  // Unloading (plugin disabled, removed or reloaded) takes the binding with it.
  // A reloaded plugin binds again after the startup delay above.
  Component.onDestruction: {
    var combo = Hotkey.parseCombo(binding.bound)
    if (combo) Quickshell.execDetached(["hyprctl", "eval",
      "hl.unbind(" + Hotkey.luaString(Hotkey.comboString(combo.mask, combo.key)) + ")"])
  }
}
