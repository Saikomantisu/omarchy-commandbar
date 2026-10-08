import Quickshell
import Quickshell.Io
import QtQuick

// Desktop entries, filtered like Omarchy's own launcher: NoDisplay entries
// and the ids in its launcher.hides are left out. Rebuilt whenever apps are
// installed or removed. Also counts how often each app is opened from the
// bar, which orders equally good matches.
Item {
  id: apps
  required property var cache
  property var list: []             // [{ id, name, generic, comment, keywords, icon, actions }]
  property var entries: ({})        // id -> DesktopEntry, for launching actions
  property var hidden: ({})         // ids Omarchy hides from its own launcher
  property var launches: ({})       // id -> times launched from the bar

  signal updated()

  function rebuild() {
    var list = []
    var byId = {}
    var values = DesktopEntries.applications.values || []
    for (var i = 0; i < values.length; i++) {
      var e = values[i]
      var id = String(e.id || "")
      if (!id || e.noDisplay || apps.hidden[id]) continue
      var keywords = []
      try { for (var k = 0; k < e.keywords.length; k++) keywords.push(String(e.keywords[k])) } catch (err) {}
      var actions = []
      try { for (var a = 0; a < e.actions.length; a++) actions.push({ index: a, name: String(e.actions[a].name || "") }) } catch (err) {}
      byId[id] = e
      list.push({
        id: id,
        name: String(e.name || id),
        generic: String(e.genericName || ""),
        comment: String(e.comment || ""),
        keywords: keywords,
        icon: String(e.icon || ""),
        wmclass: String(e.startupClass || ""),
        actions: actions
      })
    }
    apps.entries = byId
    apps.list = list
    apps.updated()
  }

  // Started the way Omarchy's launcher starts apps: under uwsm, in their own
  // scope, with gtk-launch resolving the entry. Actions ("New Window") have no
  // gtk-launch form, so their parsed command runs under uwsm directly.
  function launch(id, actionIndex) {
    var entry = apps.entries[id]
    if (actionIndex !== undefined && actionIndex !== null) {
      var action = entry && entry.actions ? entry.actions[actionIndex] : null
      var cmd = action ? Array.prototype.slice.call(action.command || []) : []
      if (cmd.length === 0) return
      Quickshell.execDetached(["uwsm-app", "--"].concat(cmd))
    } else {
      Quickshell.execDetached(["uwsm-app", "--", "gtk-launch", id + ".desktop"])
    }
    var next = Object.assign({}, apps.launches)
    next[id] = (next[id] || 0) + 1
    apps.launches = next
    apps.cache.write("launches.json", JSON.stringify(next))
  }

  // Only whole-number counts are kept, whatever the file holds.
  function loadLaunches(text) {
    var data = {}
    try { data = JSON.parse(text) || {} } catch (e) {}
    var next = {}
    if (data && typeof data === "object" && !Array.isArray(data))
      for (var id in data) if (Number.isInteger(data[id]) && data[id] > 0) next[id] = data[id]
    apps.launches = next
  }

  Component.onCompleted: {
    debounce.restart()
    apps.cache.read("launches.json", apps.loadLaunches)
  }

  Timer {
    id: debounce
    interval: 300
    onTriggered: apps.rebuild()
  }

  Connections {
    target: DesktopEntries.applications
    function onValuesChanged() { debounce.restart() }
  }

  FileView {
    path: Quickshell.env("OMARCHY_PATH") + "/default/omarchy/launcher.hides"
    watchChanges: true
    printErrors: false
    onLoaded: {
      var next = {}
      var lines = text().split("\n")
      for (var i = 0; i < lines.length; i++) {
        var id = lines[i].trim().replace(/\.desktop$/, "")
        if (id) next[id] = true
      }
      apps.hidden = next
      debounce.restart()
    }
    onFileChanged: reload()
  }
}
