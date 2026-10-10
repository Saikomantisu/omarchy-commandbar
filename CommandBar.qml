import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "lib/Engine.js" as Engine
import "lib/tzcities.js" as Tz
import "lib/Hotkey.js" as Hotkey

// Spotlight-style command bar. The UI and the data it needs (config, exchange
// rates, zone offsets) live here; what a query *means* is decided by the
// providers in providers/, run through lib/Engine.js.
Item {
  id: root

  property var shell: null
  property var manifest: null

  property bool opened: false
  property int selectedIndex: 0
  property var results: []

  readonly property string home: Quickshell.env("HOME")
  readonly property string pluginDir: String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "").replace(/\/$/, "")
  readonly property string userConfigPath: home + "/.config/omarchy/extensions/commandbar.json"
  readonly property string ratesUrl: "https://open.er-api.com/v6/latest/USD"
  readonly property int ratesMaxBytes: 256 * 1024

  property var defaultConfig: ({})
  property var userConfig: ({})
  readonly property var config: Engine.deepMerge(defaultConfig, userConfig)

  property var rates: null          // { rates, updated, next, stale }
  property string ratesStatus: ""
  property real ratesAttemptAt: 0

  property var zones: ({})          // { "Asia/Tokyo": { offset: 540, abbr: "JST" } }
  property real zonesFetchedAt: 0
  property string localZone: ""     // the system's IANA zone, e.g. "Europe/Berlin"

  property var emojis: []           // Omarchy's emojis.json: [{ e, k }]
  property var processes: null      // [{ pid, rss, cpu, name, args }], fetched on demand
  property real processesFetchedAt: 0
  property var apps: []             // [{ id, name, generic, comment, keywords, icon, actions }]
  property var appEntries: ({})     // id -> DesktopEntry, for launching actions
  property var hiddenApps: ({})     // ids Omarchy hides from its own launcher
  property var launches: ({})       // id -> times launched from the bar
  property var windows: []          // [{ address, cls, title, workspace, focus }], taken on open
  property string agent: ""         // Omarchy's default agent: claude, codex, …; "" until one is picked

  // Menu surface tokens, so themes that style the Omarchy menu style this too.
  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color border: Color.menu.border
  property var borderSpec: Border.surfaceSpec("menu", "border", border, Math.max(1, Style.space(2)))
  property color scrim: Color.menu.scrim
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  readonly property int cornerRadius: Style.cornerRadius
  property string fontFamily: Style.font.menuFamily
  property int contentMargin: Style.spacing.panelPadding
  readonly property int inputFont: Style.font.heading
  property int inputHeight: Math.max(Style.space(38), inputFont + Style.spacing.controlPaddingY * 2)
  property int rowHeight: Math.max(Style.space(48), Style.font.subtitle + Style.font.bodySmall + Style.spacing.md * 2)
  property int heroHeight: Math.max(Style.space(76), Style.font.displayLarge + Style.font.bodySmall + Style.spacing.md * 3)
  property int sectionHeight: Math.max(Style.space(26), Style.font.caption + Style.spacing.md * 2)
  property int footerHeight: Math.max(Style.space(32), Style.font.caption + Style.spacing.md * 2)
  readonly property int tileSize: Math.max(Style.space(30), Style.font.iconLarge + Style.space(12))
  readonly property int tileRadius: root.cornerRadius > 0 ? Style.space(7) : 0
  // Results show up to 7 rows before scrolling; the ? list is allowed to
  // grow so it fits without scrolling, as far as the screen allows.
  readonly property int maxRows: 7
  // Alt+1 … Alt+9 run the first nine results; the ? list doesn't have them.
  readonly property int quickKeys: root.showingHelp ? 0 : 9
  readonly property bool showingHelp: root.rows.length > 0 && !!root.rows[0].help
  readonly property var selectedRow: root.rows[root.selectedIndex] || null
  readonly property bool noResults: root.rows.length === 0 && input.text.trim() !== ""
  property var mode: null           // { label, icon } while a prefix like ":" or "w " is typed
  // Last pointer position in window coordinates. Rows only take the selection
  // on hover when this changes, so a list that grows or scrolls under a
  // resting pointer (the tall ? list) doesn't move the selection.
  property point lastPointer: Qt.point(-1, -1)
  function rowSize(row) {
    return (row.hero ? root.heroHeight : root.rowHeight) + (row.section ? root.sectionHeight : 0)
  }
  readonly property real listHeight: {
    var total = 0
    for (var i = 0; i < root.rows.length && (root.showingHelp || i < root.maxRows); i++)
      total += root.rowSize(root.rows[i])
    return Math.min(total, panel.height * 0.6)
  }
  property int cardWidth: Math.min(Style.space(640), panel.width - Style.gapsOut * 2)

  // Nothing is listed until there's a query, so an empty bar is just the input.
  readonly property var rows: results

  // ---------------------------------------------------------------- lifecycle

  // payloadJson may carry a starting query, so a keybind or script can open
  // the bar in a mode: '{"query": ":"}' for emoji, '{"query": "kill "}'.
  function open(payloadJson) {
    var payload = {}
    try { payload = JSON.parse(payloadJson || "{}") || {} } catch (e) {}
    if (typeof payload.query === "string") {
      input.text = payload.query
      input.cursorPosition = payload.query.length
    }
    root.opened = true
    root.selectedIndex = 0
    root.lastPointer = Qt.point(-1, -1)
    root.refreshZones()
    root.refreshWindows()
    root.refreshAgent()   // picked up when it changes, even after the shell started
    root.recompute()   // the kept query may be time-sensitive ("time", "3pm to tokyo")
    // Like Spotlight: the last query comes back selected, so typing replaces it
    // and an arrow key keeps it.
    var given = typeof payload.query === "string"
    Qt.callLater(function() { input.forceActiveFocus(); if (!given) input.selectAll() })
  }

  function close() {
    root.opened = false
    root.saveLastQuery()
  }

  function dismiss() {
    root.opened = false
    root.saveLastQuery()
    if (root.shell && typeof root.shell.hide === "function")
      root.shell.hide((root.manifest && root.manifest.id) || "io.github.saikomantisu.commandbar")
  }

  // After an action (open, run, copy) the bar starts empty next time; only a
  // plain close (Esc, clicking outside) keeps the query for later.
  function finish() {
    input.text = ""
    root.selectedIndex = 0
    root.dismiss()
  }

  function toggle() {
    if (root.opened) root.dismiss()
    else root.open("{}")
  }

  // ---------------------------------------------------------------- queries

  function recompute() {
    root.results = Engine.run(input.text, root.config, {
      rates: root.rates,
      ratesStatus: root.ratesStatus,
      zones: root.zones,
      localZone: root.localZone,
      emojis: root.emojis,
      processes: root.processes,
      apps: root.apps,
      windows: root.windows,
      launches: root.launches,
      agent: root.agent,
      requestProcesses: root.requestProcesses,
      requestRates: root.refreshRates
    })
    root.mode = Engine.mode(input.text, root.config)
    if (root.selectedIndex >= root.rows.length) root.selectedIndex = Math.max(0, root.rows.length - 1)
    if (root.rows.length > 0) list.positionViewAtIndex(root.selectedIndex, ListView.Contain)
  }

  function move(delta) {
    var n = root.rows.length
    if (n === 0) return
    root.selectedIndex = (root.selectedIndex + delta + n) % n
    list.positionViewAtIndex(root.selectedIndex, ListView.Contain)
  }

  function complete(row) {
    var text = row.complete
    if (!text) return false
    input.text = text
    // Example-style commands ("12*8 + 15%") come in selected, so the answer
    // shows right away and typing replaces it; mode prefixes (":", "kill ")
    // leave the cursor at the end.
    if (row.select) input.selectAll()
    else input.cursorPosition = text.length
    root.selectedIndex = 0
    return true
  }

  function activate(index) {
    var row = root.rows[index]
    if (!row) return
    if (row.run) {
      root.finish()
      if (row.run.kind === "app") root.launchApp(row.run.target, row.run.action)
      else if (row.run.kind === "window") root.focusWindow(row.run.target)
      else if (row.run.kind === "open") Quickshell.execDetached(["xdg-open", row.run.target])
      else if (row.run.kind === "agent") Quickshell.execDetached([root.pluginDir + "/bin/commandbar-agent", row.run.target])
      else Quickshell.execDetached(["bash", "-c", row.run.target])
      return
    }
    if (row.complete && !row.copy) { root.complete(row); return }
    if (!row.copy) return
    root.finish()
    Quickshell.execDetached(["bash", "-c", "printf %s " + Util.shellQuote(row.copy) + " | wl-copy"])
  }

  // What Enter does to a row, for the footer: "Open", "Switch", "Copy"…
  function actionLabel(row) {
    if (!row) return ""
    if (row.actionLabel) return row.actionLabel
    var label = ""
    if (row.run) label = row.run.label || (row.run.kind === "open" ? "open" : "run")
    else if (row.complete && !row.copy) label = "try it"
    else if (row.copy) label = "copy"
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : ""
  }

  // Tab fills the query in when that's something other than what Enter does.
  function canComplete(row) {
    return !!row && !!row.complete && !!(row.run || row.copy)
  }

  // Inside a help topic ("?units") or a help search, Esc and Backspace go
  // back to the list of topics instead of editing the text.
  readonly property bool inHelpTopic: /^\s*\?\s*\S/.test(input.text)
  function helpBack() {
    input.text = "?"
    input.cursorPosition = 1
    root.selectedIndex = 0
  }

  onConfigChanged: {
    if (root.opened) root.recompute()
    root.zonesFetchedAt = 0   // the zone list may have changed
    root.ensureHotkey()
  }

  // ---------------------------------------------------------------- hotkey

  // The bar binds its own hotkey in the running Hyprland (hyprctl eval), so
  // installing the plugin is enough: no config file is edited. Hyprland drops
  // runtime binds when its config reloads, so this re-runs after every
  // reload, after config changes, and at startup. lib/Hotkey.js decides what
  // to bind or unbind; a key that something else already uses is left alone.
  readonly property string toggleCommand: "omarchy-shell shell toggle io.github.saikomantisu.commandbar"
  property bool configsLoaded: false
  property bool hotkeyQueued: false
  property string boundHotkey: ""     // what we bound, so unloading can unbind it
  property string warnedConflict: ""  // notify once per key, not on every reload

  function ensureHotkey() {
    if (!root.configsLoaded) return
    // Wait for the previous bind to land too: reading the binds before it has
    // would see the key as free and bind it a second time.
    if (bindsProc.running || evalProc.running) { root.hotkeyQueued = true; return }
    bindsProc.running = true
  }

  function reconcileHotkey(bindsJson) {
    var hotkey = String(root.config.hotkey || "").trim()
    var p = Hotkey.plan(bindsJson, hotkey, root.toggleCommand)
    if (p.lua.length > 0) { evalProc.command = ["hyprctl", "eval", p.lua.join("\n")]; evalProc.running = true }
    root.boundHotkey = p.bound ? hotkey : ""
    if (p.conflict && root.warnedConflict !== hotkey) {
      root.warnedConflict = hotkey
      console.warn("commandbar: " + hotkey + " is already used by \"" + p.conflict + "\"; not binding it")
      Quickshell.execDetached(["notify-send", "-a", "Command Bar", "Command Bar has no hotkey",
        hotkey + " already opens \"" + p.conflict + "\". Set a different \"hotkey\" in ~/.config/omarchy/extensions/commandbar.json."])
    }
    if (!evalProc.running) root.runQueuedHotkey()
  }

  function runQueuedHotkey() {
    if (root.hotkeyQueued) { root.hotkeyQueued = false; root.ensureHotkey() }
  }

  Process {
    id: evalProc
    onExited: root.runQueuedHotkey()
  }

  Process {
    id: bindsProc
    command: ["hyprctl", "binds", "-j"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.reconcileHotkey(String(text || ""))
    }
  }

  Connections {
    target: Hyprland
    function onRawEvent(event) {
      if (event && String(event.name) === "configreloaded") root.ensureHotkey()
    }
  }

  // Unloading (plugin disabled, removed or reloaded) takes the binding with it.
  // A reloaded plugin binds again after the startup delay below.
  Component.onDestruction: {
    var combo = Hotkey.parseCombo(root.boundHotkey)
    if (combo) Quickshell.execDetached(["hyprctl", "eval",
      "hl.unbind(" + Hotkey.luaString(Hotkey.comboString(combo.mask, combo.key)) + ")"])
  }

  // Both config files report in before the first bind, so a user's own
  // "hotkey" is used from the start. The short delay lets a previous
  // instance's unbind land first when the plugin is reloaded.
  property int configLoads: 0
  function configLoaded() {
    root.configLoads++
    if (root.configLoads >= 2 && !root.configsLoaded) { root.configsLoaded = true; hotkeyStartTimer.start() }
  }

  Timer {
    id: hotkeyStartTimer
    interval: 600
    onTriggered: root.ensureHotkey()
  }

  // ---------------------------------------------------------------- config

  FileView {
    path: root.pluginDir + "/config.default.json"
    watchChanges: true
    printErrors: false
    onLoaded: {
      try { root.defaultConfig = Engine.parseJsonc(text()) }
      catch (e) { console.warn("commandbar: bad config.default.json: " + e) }
      root.configLoaded()
    }
    onFileChanged: reload()
  }

  FileView {
    path: root.userConfigPath
    watchChanges: true
    printErrors: false
    onLoaded: {
      try { root.userConfig = Engine.parseJsonc(text()) }
      catch (e) { console.warn("commandbar: bad " + root.userConfigPath + ": " + e); root.userConfig = ({}) }
      root.configLoaded()
    }
    onLoadFailed: { root.userConfig = ({}); root.configLoaded() }
    onFileChanged: reload()
  }

  // ---------------------------------------------------------------- rates

  // Called by the currency provider (ctx.requestRates) only while a currency
  // query is on screen, so someone who never converts money never contacts
  // the API. open.er-api.com says when its next daily update is, and the
  // cache is refetched only after that. Failed attempts back off for ten
  // minutes; the last good file keeps working offline.
  function refreshRates() {
    if (ratesProc.running) return
    var now = Date.now()
    if (root.rates && root.rates.next && now < root.rates.next * 1000) return
    if (now - root.ratesAttemptAt < 10 * 60 * 1000) return
    root.ratesAttemptAt = now
    if (!root.rates) root.ratesStatus = "Fetching exchange rates…"
    ratesProc.running = true
  }

  function loadRates(raw) {
    try {
      var data = JSON.parse(raw)
      if (data.result !== "success" || !data.rates) throw "unexpected response"
      root.rates = {
        rates: data.rates,
        updated: data.time_last_update_unix,
        next: data.time_next_update_unix,
        stale: Date.now() > (data.time_next_update_unix + 86400) * 1000
      }
      root.ratesStatus = ""
    } catch (e) {
      if (raw) console.warn("commandbar: bad rates cache: " + e)
    }
    if (root.opened) root.recompute()
  }

  // ---------------------------------------------------------------- last query

  // Kept in memory between opens (the plugin stays loaded) and written to the
  // cache on close so it also survives a shell restart. Long queries are cut
  // so they stay under the helper's 4 KiB cap.
  property bool lastQueryLoaded: false
  property string savedQuery: ""

  function saveLastQuery() {
    var text = input.text.slice(0, 1000)
    if (!root.lastQueryLoaded || root.savedQuery === text) return
    root.savedQuery = text
    root.cacheWrite("last-query", text)
  }

  function loadLastQuery(text) {
    root.savedQuery = text
    if (!root.lastQueryLoaded && !input.text) input.text = text.replace(/\n+$/, "")
    root.lastQueryLoaded = true
  }

  Process {
    id: ratesProc
    // Size-capped download: curl aborts past the limit and head cuts the stream
    // even without a Content-Length. Only a complete download reaches the
    // helper, which refuses anything over the cap or that isn't JSON, so the
    // last good rates.json stays in place.
    command: ["bash", "-c",
      "set -o pipefail; d=$(curl -fsS --max-time 8 --max-filesize \"$3\" \"$2\" | head -c \"$(($3 + 1))\") " +
      "&& printf '%s' \"$d\" | python3 \"$1\" write rates.json",
      "_", root.cacheHelper, root.ratesUrl, String(root.ratesMaxBytes)]
    onExited: function(exitCode) {
      if (exitCode !== 0) {
        root.ratesStatus = root.rates ? "" : "Couldn't reach open.er-api.com"
        if (root.opened) root.recompute()
      } else {
        root.cacheRead("rates.json", root.loadRates)
      }
    }
  }

  // ---------------------------------------------------------------- cache files

  // The shell never opens the cache files itself: bin/commandbar-cache does
  // every read and write, refusing symlinks, foreign or oversized files, and
  // replacing a file atomically through a private temporary file. Requests run
  // one at a time, in order.
  readonly property string cacheHelper: root.pluginDir + "/bin/commandbar-cache"
  property var cacheQueue: []
  property var cacheDone: null

  property var cacheInput: null

  function cacheRead(name, done) {
    root.cacheQueue.push({ command: ["python3", root.cacheHelper, "read", name], input: null, done: done })
    if (!cacheProc.running) root.cacheNext()
  }

  // The content is piped straight to the helper's stdin, never put in its
  // arguments, so it can't be read from /proc/<pid>/cmdline.
  function cacheWrite(name, text) {
    root.cacheQueue.push({ command: ["python3", root.cacheHelper, "write", name], input: text, done: null })
    if (!cacheProc.running) root.cacheNext()
  }

  function cacheNext() {
    if (root.cacheQueue.length === 0) return
    var next = root.cacheQueue.shift()
    root.cacheDone = next.done
    root.cacheInput = next.input
    cacheProc.command = next.command
    cacheProc.stdinEnabled = next.input !== null
    cacheProc.running = true
  }

  Process {
    id: cacheProc
    onStarted: {
      var input = root.cacheInput
      root.cacheInput = null
      if (input === null) return
      cacheProc.write(input)
      // Closing stdin is what lets the helper see the end of the content.
      cacheProc.stdinEnabled = false
    }
    stdout: StdioCollector { id: cacheOut; waitForEnd: true }
    stderr: StdioCollector {
      onStreamFinished: if (text.trim() !== "") console.warn("commandbar: " + text.trim())
    }
    onExited: function(exitCode) {
      var done = root.cacheDone
      root.cacheDone = null
      // A refused or failed read counts as an empty file.
      if (done) done(exitCode === 0 ? String(cacheOut.text || "") : "")
      root.cacheNext()
    }
  }

  // ---------------------------------------------------------------- zones

  function refreshZones() {
    if (zonesProc.running) return
    if (Date.now() - root.zonesFetchedAt < 60 * 60 * 1000) return
    var t = root.config.time || {}
    var extra = (t.zones || []).concat(t.home ? [t.home] : [])
    // First line reports the system zone ("@local Europe/Berlin"), then one
    // "zone +hhmm ABBR" line per zone, the system zone included.
    zonesProc.command = ["bash", "-c",
      "lz=$(timedatectl show -p Timezone --value 2>/dev/null); "
      + "[ -n \"$lz\" ] || lz=$(readlink /etc/localtime 2>/dev/null | sed 's|.*/zoneinfo/||'); "
      + "echo \"@local $lz\"; "
      + "for z in \"$@\" $lz; do printf '%s ' \"$z\"; TZ=\"$z\" date +'%z %Z'; done", "_"]
      .concat(Tz.allZones(extra))
    zonesProc.running = true
  }

  Process {
    id: zonesProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var next = {}
        var lines = String(text || "").split("\n")
        for (var i = 0; i < lines.length; i++) {
          var local = lines[i].match(/^@local (\S+)$/)
          if (local) { root.localZone = local[1]; continue }
          var m = lines[i].match(/^(\S+) ([+-])(\d\d)(\d\d) (\S+)$/)
          if (!m) continue
          var minutes = parseInt(m[3], 10) * 60 + parseInt(m[4], 10)
          next[m[1]] = { offset: m[2] === "-" ? -minutes : minutes, abbr: m[5] }
        }
        root.zones = next
        root.zonesFetchedAt = Date.now()
        if (root.opened) root.recompute()
      }
    }
  }

  // ---------------------------------------------------------------- agent

  // Asked of `omarchy-default-agent`, the same answer Omarchy's launcher uses,
  // on every open. The shell never opens the file itself: at most 64 bytes of
  // the answer come back, and providers/ai.js accepts only an agent-like name.
  function refreshAgent() {
    if (!agentProc.running) agentProc.running = true
  }

  Process {
    id: agentProc
    command: ["bash", "-c", "timeout 2 omarchy-default-agent 2>/dev/null | head -c 64"]
    stdout: StdioCollector { id: agentOut; waitForEnd: true }
    onExited: {
      var next = (String(agentOut.text || "").split("\n")[0] || "").trim()
      if (next === root.agent) return
      root.agent = next
      if (root.opened) root.recompute()
    }
  }

  // ---------------------------------------------------------------- emoji

  FileView {
    path: Quickshell.env("OMARCHY_PATH") + "/shell/plugins/emojis/emojis.json"
    printErrors: false
    onLoaded: {
      try {
        var data = JSON.parse(text())
        root.emojis = Array.isArray(data) ? data : []
      } catch (e) {
        console.warn("commandbar: bad emojis.json: " + e)
      }
    }
  }

  // ---------------------------------------------------------------- processes

  // Snapshot of the user's own processes, taken only while a "kill" query is
  // on screen and at most every 1.5 s. comm is padded to a fixed width so
  // names with spaces ("Web Content") parse cleanly.
  function requestProcesses() {
    if (processProc.running) return
    if (Date.now() - root.processesFetchedAt < 1500) return
    processProc.running = true
  }

  Process {
    id: processProc
    command: ["ps", "-u", Quickshell.env("USER"), "--no-headers", "-o", "pid=,rss=,pcpu=,comm:40=,args="]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var out = []
        var lines = String(text || "").split("\n")
        for (var i = 0; i < lines.length; i++) {
          var m = lines[i].match(/^\s*(\d+)\s+(\d+)\s+([\d.]+) (.{40}) (.*)$/)
          if (!m) continue
          var name = m[4].trim()
          if (name === "ps") continue
          out.push({ pid: parseInt(m[1], 10), rss: parseInt(m[2], 10), cpu: parseFloat(m[3]), name: name, args: m[5] })
        }
        root.processes = out
        root.processesFetchedAt = Date.now()
        if (root.opened) root.recompute()
      }
    }
  }

  // ---------------------------------------------------------------- apps

  // Desktop entries, filtered like Omarchy's own launcher: NoDisplay entries
  // and the ids in its launcher.hides are left out. Rebuilt whenever apps are
  // installed or removed.
  function rebuildApps() {
    var list = []
    var byId = {}
    var values = DesktopEntries.applications.values || []
    for (var i = 0; i < values.length; i++) {
      var e = values[i]
      var id = String(e.id || "")
      if (!id || e.noDisplay || root.hiddenApps[id]) continue
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
    root.appEntries = byId
    root.apps = list
    if (root.opened) root.recompute()
  }

  // Started the way Omarchy's launcher starts apps: under uwsm, in their own
  // scope, with gtk-launch resolving the entry. Actions ("New Window") have no
  // gtk-launch form, so their parsed command runs under uwsm directly.
  function launchApp(id, actionIndex) {
    var entry = root.appEntries[id]
    if (actionIndex !== undefined && actionIndex !== null) {
      var action = entry && entry.actions ? entry.actions[actionIndex] : null
      var cmd = action ? Array.prototype.slice.call(action.command || []) : []
      if (cmd.length === 0) return
      Quickshell.execDetached(["uwsm-app", "--"].concat(cmd))
    } else {
      Quickshell.execDetached(["uwsm-app", "--", "gtk-launch", id + ".desktop"])
    }
    var next = Object.assign({}, root.launches)
    next[id] = (next[id] || 0) + 1
    root.launches = next
    root.cacheWrite("launches.json", JSON.stringify(next))
  }

  function appIconSource(icon) {
    var value = String(icon || "")
    if (value.charAt(0) === "/") return "file://" + value
    var themed = value ? Quickshell.iconPath(value, true) : ""
    return themed || Quickshell.iconPath("application-x-executable", true)
  }

  Timer {
    id: appsDebounce
    interval: 300
    onTriggered: root.rebuildApps()
  }

  Connections {
    target: DesktopEntries.applications
    function onValuesChanged() { appsDebounce.restart() }
  }

  Component.onCompleted: {
    appsDebounce.restart()
    root.cacheRead("last-query", root.loadLastQuery)
    root.cacheRead("launches.json", root.loadLaunches)
    root.cacheRead("rates.json", root.loadRates)
    root.refreshAgent()
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
      root.hiddenApps = next
      appsDebounce.restart()
    }
    onFileChanged: reload()
  }

  // Only whole-number counts are kept, whatever the file holds.
  function loadLaunches(text) {
    var data = {}
    try { data = JSON.parse(text) || {} } catch (e) {}
    var next = {}
    if (data && typeof data === "object" && !Array.isArray(data))
      for (var id in data) if (Number.isInteger(data[id]) && data[id] > 0) next[id] = data[id]
    root.launches = next
  }

  // ---------------------------------------------------------------- windows

  // Hyprland's windows, taken each time the bar opens. focusHistoryID orders
  // them by recency (0 is the window you were just in).
  function refreshWindows() {
    if (!windowsProc.running) windowsProc.running = true
  }

  // The same dispatch Omarchy's launch-or-focus uses: the Lua form first,
  // then the classic one. The address is checked to be Hyprland's hex form.
  function focusWindow(address) {
    if (!/^0x[0-9a-fA-F]+$/.test(String(address))) return
    Quickshell.execDetached(["bash", "-c",
      "hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$1\\\" })\" >/dev/null 2>&1 || hyprctl dispatch focuswindow \"address:$1\"",
      "_", address])
  }

  Process {
    id: windowsProc
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
        root.windows = out
        if (root.opened) root.recompute()
      }
    }
  }

  // ---------------------------------------------------------------- UI

  // A key drawn as a small keycap, for the footer hints.
  component Keycap: Rectangle {
    id: cap
    property string label: ""
    property color foreground: Color.foreground
    property string fontFamily: Style.font.family
    property bool rounded: true
    implicitWidth: Math.max(implicitHeight, capText.implicitWidth + Style.space(10))
    implicitHeight: capText.implicitHeight + Style.space(4)
    radius: rounded ? Style.space(4) : 0
    color: Util.alpha(cap.foreground, 0.08)
    border.width: 1
    border.color: Util.alpha(cap.foreground, 0.18)

    Text {
      id: capText
      anchors.centerIn: parent
      text: cap.label
      color: cap.foreground
      opacity: 0.8
      font.family: cap.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  // A row's icon: the app's own image, or a font glyph on a soft tile.
  component IconTile: Rectangle {
    id: tileRoot
    property string glyph: ""
    property url imageSource: ""
    property bool selected: false
    property real size: Style.space(30)
    property color foreground: Color.foreground
    property color selectedText: Color.foreground
    property string fontFamily: Style.font.family
    readonly property bool hasImage: String(imageSource) !== ""
    width: size
    height: size
    color: hasImage ? "transparent" : Util.alpha(selected ? selectedText : foreground, selected ? 0.16 : 0.07)

    Image {
      visible: tileRoot.hasImage
      anchors.fill: parent
      sourceSize.width: width * 2
      sourceSize.height: height * 2
      fillMode: Image.PreserveAspectFit
      asynchronous: true
      smooth: true
      source: tileRoot.imageSource
    }

    Text {
      visible: !tileRoot.hasImage
      anchors.centerIn: parent
      text: tileRoot.glyph
      color: tileRoot.selected ? tileRoot.selectedText : tileRoot.foreground
      opacity: tileRoot.selected ? 1 : 0.8
      font.family: tileRoot.fontFamily
      font.pixelSize: Math.round(tileRoot.size * 0.56)
    }
  }

  PanelWindow {
    id: panel
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "omarchy-commandbar"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
    exclusionMode: ExclusionMode.Ignore

    Rectangle {
      anchors.fill: parent
      color: root.scrim
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.dismiss()
    }

    BorderSurface {
      id: card
      width: root.cardWidth
      height: contentTopInset + contentBottomInset + layout.implicitHeight
      radius: root.cornerRadius
      anchors.horizontalCenter: parent.horizontalCenter
      y: Math.round(panel.height * 0.22)
      color: root.background
      borderSpec: root.borderSpec
      padding: root.contentMargin
      Behavior on height { NumberAnimation { duration: 90; easing.type: Easing.OutCubic } }

      MouseArea { anchors.fill: parent; onClicked: {} }

      Column {
        id: layout
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.leftMargin: card.contentLeftInset
        spacing: Style.spacing.md

        // ---------- search field ----------
        Item {
          width: parent.width
          height: root.inputHeight

          Text {
            id: promptGlyph
            anchors.left: parent.left
            anchors.leftMargin: Style.space(4)
            anchors.verticalCenter: parent.verticalCenter
            text: "󰍉"
            color: root.foreground
            opacity: 0.55
            font.family: root.fontFamily
            font.pixelSize: Math.round(root.inputFont * 1.05)
          }

          TextInput {
            id: input
            anchors.left: promptGlyph.right
            anchors.leftMargin: Style.spacing.md
            anchors.right: modeChip.visible ? modeChip.left : (helpHint.visible ? helpHint.left : parent.right)
            anchors.rightMargin: Style.spacing.md
            anchors.verticalCenter: parent.verticalCenter
            color: root.foreground
            selectionColor: root.selectedBackground
            selectedTextColor: root.selectedText
            font.family: root.fontFamily
            font.pixelSize: root.inputFont
            clip: true
            focus: true
            onTextChanged: {
              root.selectedIndex = 0
              root.recompute()
            }

            Text {
              anchors.fill: parent
              verticalAlignment: Text.AlignVCenter
              visible: !input.text
              text: "Search apps and windows, or type a sum"
              color: root.foreground
              opacity: 0.4
              font: input.font
              elide: Text.ElideRight
            }

            Keys.priority: Keys.BeforeItem
            Keys.onPressed: function(event) {
              if (event.key === Qt.Key_Escape) {
                if (root.inHelpTopic) root.helpBack()
                else if (input.text) input.text = ""
                else root.dismiss()
                event.accepted = true
              } else if (event.key === Qt.Key_Down || (event.key === Qt.Key_N && event.modifiers & Qt.ControlModifier)) {
                root.move(1); event.accepted = true
              } else if (event.key === Qt.Key_Up || (event.key === Qt.Key_P && event.modifiers & Qt.ControlModifier)) {
                root.move(-1); event.accepted = true
              } else if (event.key === Qt.Key_Backspace && root.inHelpTopic && !input.selectedText
                         && /^\s*\?[a-z]+$/.test(input.text) && root.showingHelp && !!root.rows[0].helpTopic
                         && input.cursorPosition === input.text.length) {
                root.helpBack(); event.accepted = true
              } else if (event.key === Qt.Key_Tab) {
                var row = root.rows[root.selectedIndex]
                if (row) root.complete(row)
                event.accepted = true
              } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                root.activate(root.selectedIndex); event.accepted = true
              } else if ((event.modifiers & Qt.AltModifier) && event.key >= Qt.Key_1 && event.key <= Qt.Key_9) {
                var quick = event.key - Qt.Key_1
                if (quick < Math.min(root.quickKeys, root.rows.length)) { root.selectedIndex = quick; root.activate(quick) }
                event.accepted = true
              }
            }
          }

          // The mode a prefix puts the bar in: Emoji, Windows, Search Google…
          Rectangle {
            id: modeChip
            visible: !!root.mode
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            implicitWidth: chipRow.implicitWidth + Style.space(16)
            implicitHeight: chipRow.implicitHeight + Style.space(8)
            width: implicitWidth
            height: implicitHeight
            radius: root.cornerRadius > 0 ? height / 2 : 0
            color: root.selectedBackground

            Row {
              id: chipRow
              anchors.centerIn: parent
              spacing: Style.space(6)

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: root.mode ? (root.mode.icon || "") : ""
                visible: text !== ""
                color: root.selectedText
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
              }

              Text {
                anchors.verticalCenter: parent.verticalCenter
                text: root.mode ? root.mode.label : ""
                color: root.selectedText
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: true
              }
            }
          }

          Row {
            id: helpHint
            visible: !root.mode && !input.text
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(6)

            Keycap { label: "?"; anchors.verticalCenter: parent.verticalCenter; foreground: root.foreground; fontFamily: root.fontFamily; rounded: root.cornerRadius > 0 }
            Text {
              anchors.verticalCenter: parent.verticalCenter
              text: "for help"
              color: root.foreground
              opacity: 0.45
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }
        }

        Rectangle {
          width: parent.width
          height: 1
          color: root.foreground
          opacity: 0.1
          visible: root.rows.length > 0 || root.noResults
        }

        // ---------- nothing matched ----------
        Column {
          width: parent.width
          visible: root.noResults
          spacing: Style.space(4)
          topPadding: Style.spacing.md
          bottomPadding: Style.spacing.md

          Text {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            textFormat: Text.PlainText
            text: "Nothing matches \"" + input.text.trim() + "\""
            color: root.foreground
            opacity: 0.8
            font.family: root.fontFamily
            font.pixelSize: Style.font.subtitle
            elide: Text.ElideMiddle
          }

          Text {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            text: "Type ? to see what the bar understands"
            color: root.foreground
            opacity: 0.45
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
          }
        }

        // ---------- results ----------
        ListView {
          id: list
          width: parent.width
          height: root.listHeight
          visible: root.rows.length > 0
          model: root.rows
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          currentIndex: root.selectedIndex

          delegate: Item {
            id: rowItem
            required property int index
            required property var modelData
            readonly property bool selected: index === root.selectedIndex
            readonly property bool hero: !!modelData.hero
            // The first row of each group carries its label (Windows, Apps…),
            // drawn above the row, outside the selectable area.
            readonly property string section: modelData.section || ""

            width: list.width
            height: root.rowSize(modelData)

            Text {
              visible: rowItem.section !== ""
              anchors.left: parent.left
              anchors.leftMargin: Style.spacing.md
              anchors.top: parent.top
              height: root.sectionHeight
              verticalAlignment: Text.AlignVCenter
              text: rowItem.section
              color: root.foreground
              opacity: 0.5
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 0.4
            }

            Rectangle {
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.bottom: parent.bottom
              height: rowItem.hero ? root.heroHeight : root.rowHeight
              radius: root.cornerRadius > 0 ? Style.space(8) : 0
              color: rowItem.selected ? root.selectedBackground : "transparent"
              Behavior on color { ColorAnimation { duration: 80 } }

              IconTile {
                id: tile
                anchors.left: parent.left
                anchors.leftMargin: Style.spacing.md
                anchors.verticalCenter: parent.verticalCenter
                glyph: rowItem.modelData.icon || ""
                imageSource: rowItem.modelData.image ? root.appIconSource(rowItem.modelData.image) : ""
                selected: rowItem.selected
                size: rowItem.hero ? Math.round(root.tileSize * 1.4) : root.tileSize
                radius: root.tileRadius
                foreground: root.foreground
                selectedText: root.selectedText
                fontFamily: root.fontFamily
              }

              Column {
                anchors.left: tile.right
                anchors.leftMargin: Style.spacing.md
                anchors.right: quickKey.visible ? quickKey.left : parent.right
                anchors.rightMargin: Style.spacing.md
                anchors.verticalCenter: parent.verticalCenter
                spacing: rowItem.hero ? Style.space(4) : Style.space(2)

                Text {
                  width: parent.width
                  textFormat: Text.PlainText
                  text: rowItem.modelData.title
                  color: rowItem.selected ? root.selectedText : root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: rowItem.hero ? Style.font.displayLarge : Style.font.subtitle
                  font.bold: rowItem.hero
                  elide: Text.ElideRight
                }

                Text {
                  width: parent.width
                  visible: text !== ""
                  textFormat: Text.PlainText
                  text: rowItem.modelData.subtitle || ""
                  color: rowItem.selected ? root.selectedText : root.foreground
                  opacity: rowItem.selected ? 0.7 : 0.5
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  elide: Text.ElideRight
                }
              }

              Keycap {
                id: quickKey
                visible: rowItem.index < root.quickKeys
                anchors.right: parent.right
                anchors.rightMargin: Style.spacing.md
                anchors.verticalCenter: parent.verticalCenter
                label: "Alt+" + (rowItem.index + 1)
                foreground: rowItem.selected ? root.selectedText : root.foreground
                fontFamily: root.fontFamily
                rounded: root.cornerRadius > 0
                opacity: rowItem.selected ? 0.9 : 0.6
              }

              MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                // Only real pointer movement selects: rows that slide under a
                // resting cursor (the card growing, the list re-rendering)
                // report positions too, but the window position stays put.
                onPositionChanged: function(mouse) {
                  var p = mapToItem(null, mouse.x, mouse.y)
                  if (p.x === root.lastPointer.x && p.y === root.lastPointer.y) return
                  var first = root.lastPointer.x < 0
                  root.lastPointer = Qt.point(p.x, p.y)
                  if (!first) root.selectedIndex = rowItem.index
                }
                onClicked: {
                  root.selectedIndex = rowItem.index
                  root.activate(rowItem.index)
                  input.forceActiveFocus()
                }
              }
            }
          }
        }

        // ---------- footer: what the selected row is, and what the keys do ----------
        Item {
          width: parent.width
          height: root.footerHeight
          visible: root.rows.length > 0

          Rectangle {
            anchors.top: parent.top
            width: parent.width
            height: 1
            color: root.foreground
            opacity: 0.1
          }

          Row {
            anchors.left: parent.left
            anchors.leftMargin: Style.space(4)
            anchors.verticalCenter: parent.verticalCenter
            anchors.verticalCenterOffset: 1
            spacing: Style.space(6)

            Text {
              anchors.verticalCenter: parent.verticalCenter
              text: root.selectedRow ? (root.selectedRow.help ? "Help" : (root.selectedRow.group || root.selectedRow.providerName || "")) : ""
              color: root.foreground
              opacity: 0.5
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }

          Row {
            anchors.right: parent.right
            anchors.rightMargin: Style.space(4)
            anchors.verticalCenter: parent.verticalCenter
            anchors.verticalCenterOffset: 1
            spacing: Style.space(6)

            Text {
              visible: root.inHelpTopic
              anchors.verticalCenter: parent.verticalCenter
              text: "Back"
              color: root.foreground
              opacity: 0.55
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
            Keycap { visible: root.inHelpTopic; label: "Esc"; anchors.verticalCenter: parent.verticalCenter; foreground: root.foreground; fontFamily: root.fontFamily; rounded: root.cornerRadius > 0 }
            Item { visible: root.inHelpTopic; width: Style.space(8); height: 1 }

            Text {
              visible: root.canComplete(root.selectedRow)
              anchors.verticalCenter: parent.verticalCenter
              text: "Fill in"
              color: root.foreground
              opacity: 0.55
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
            Keycap { visible: root.canComplete(root.selectedRow); label: "Tab"; anchors.verticalCenter: parent.verticalCenter; foreground: root.foreground; fontFamily: root.fontFamily; rounded: root.cornerRadius > 0 }

            Item { visible: root.canComplete(root.selectedRow); width: Style.space(8); height: 1 }

            Text {
              id: primary
              visible: text !== ""
              anchors.verticalCenter: parent.verticalCenter
              text: root.actionLabel(root.selectedRow)
              color: root.foreground
              opacity: 0.85
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
            }
            Keycap { visible: primary.text !== ""; label: "↵"; anchors.verticalCenter: parent.verticalCenter; foreground: root.foreground; fontFamily: root.fontFamily; rounded: root.cornerRadius > 0 }
          }
        }
      }
    }
  }
}
