import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "lib/Engine.js" as Engine
import "services"
import "ui"

// Spotlight-style command bar. This file holds the bar's state and the card
// it draws; the data it needs (exchange rates, zone offsets, apps…) comes
// from services/, the pieces of the card are in ui/, and what a query
// *means* is decided by the providers in providers/, run through
// lib/Engine.js.
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

  property var defaultConfig: ({})
  property var userConfig: ({})
  readonly property var config: Engine.deepMerge(defaultConfig, userConfig)

  property var emojis: []           // Omarchy's emojis.json: [{ e, k }]

  // The search field's TextInput, for the code below that reads and sets it.
  property alias input: search.input

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
    zones.refresh()
    windows.refresh()
    agent.refresh()   // picked up when it changes, even after the shell started
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
      rates: rates.latest,
      ratesStatus: rates.status,
      zones: zones.offsets,
      localZone: zones.local,
      emojis: root.emojis,
      processes: processes.list,
      apps: apps.list,
      windows: windows.list,
      launches: apps.launches,
      agent: agent.name,
      requestProcesses: processes.request,
      requestRates: rates.refresh
    })
    root.mode = Engine.mode(input.text, root.config)
    if (root.selectedIndex >= root.rows.length) root.selectedIndex = Math.max(0, root.rows.length - 1)
    if (root.rows.length > 0) list.positionViewAtIndex(root.selectedIndex, ListView.Contain)
  }

  // A service's data changed: show it if the bar is open.
  function refresh() {
    if (root.opened) root.recompute()
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
      if (row.run.kind === "app") apps.launch(row.run.target, row.run.action)
      else if (row.run.kind === "window") windows.focus(row.run.target)
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
    zones.invalidate()   // the zone list may have changed
    hotkey.ensure()
  }

  // ---------------------------------------------------------------- services

  CacheFiles { id: cacheFiles; helper: root.pluginDir + "/bin/commandbar-cache" }
  HotkeyBinding { id: hotkey; config: root.config; ready: root.configsLoaded }
  Rates { id: rates; cache: cacheFiles; onUpdated: root.refresh() }
  Zones { id: zones; config: root.config; onUpdated: root.refresh() }
  Agent { id: agent; onUpdated: root.refresh() }
  Processes { id: processes; onUpdated: root.refresh() }
  Apps { id: apps; cache: cacheFiles; onUpdated: root.refresh() }
  Windows { id: windows; onUpdated: root.refresh() }

  // ---------------------------------------------------------------- config

  // Both config files report in before the hotkey is first bound, so a user's
  // own "hotkey" is used from the start.
  property int configLoads: 0
  property bool configsLoaded: false
  function configLoaded() {
    root.configLoads++
    if (root.configLoads >= 2) root.configsLoaded = true
  }

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
    cacheFiles.write("last-query", text)
  }

  function loadLastQuery(text) {
    root.savedQuery = text
    if (!root.lastQueryLoaded && !input.text) input.text = text.replace(/\n+$/, "")
    root.lastQueryLoaded = true
  }

  Component.onCompleted: cacheFiles.read("last-query", root.loadLastQuery)

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

  // ---------------------------------------------------------------- UI

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

        SearchField {
          id: search
          bar: root
          width: parent.width
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

        ListView {
          id: list
          width: parent.width
          height: root.listHeight
          visible: root.rows.length > 0
          model: root.rows
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          currentIndex: root.selectedIndex

          delegate: ResultRow {
            bar: root
            width: list.width
          }
        }

        Footer {
          bar: root
          width: parent.width
          visible: root.rows.length > 0
        }
      }
    }
  }
}
