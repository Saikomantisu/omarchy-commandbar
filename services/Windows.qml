import Quickshell
import Quickshell.Io
import QtQuick

// Hyprland's windows, taken each time the bar opens. focusHistoryID orders
// them by recency (0 is the window you were just in).
Item {
  id: windows
  property var list: []             // [{ address, cls, title, workspace, focus }]

  signal updated()

  function refresh() {
    if (!proc.running) proc.running = true
  }

  // The same dispatch Omarchy's launch-or-focus uses: the Lua form first,
  // then the classic one. The address is checked to be Hyprland's hex form.
  function focus(address) {
    if (!/^0x[0-9a-fA-F]+$/.test(String(address))) return
    Quickshell.execDetached(["bash", "-c",
      "hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$1\\\" })\" >/dev/null 2>&1 || hyprctl dispatch focuswindow \"address:$1\"",
      "_", address])
  }

  Process {
    id: proc
    command: ["hyprctl", "clients", "-j"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var out = []
        try {
          var list = JSON.parse(text)
          for (var i = 0; i < list.length; i++) {
            var c = list[i]
            if (!c.mapped || c.hidden) continue
            out.push({
              address: String(c.address || ""),
              cls: String(c["class"] || c.initialClass || ""),
              title: String(c.title || ""),
              workspace: String((c.workspace && c.workspace.name) || ""),
              focus: typeof c.focusHistoryID === "number" ? c.focusHistoryID : 99
            })
          }
        } catch (e) {
          console.warn("commandbar: bad hyprctl clients output: " + e)
        }
        windows.list = out
        windows.updated()
      }
    }
  }
}
