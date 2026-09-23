import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "lib/Engine.js" as Engine
import "lib/tzcities.js" as Tz

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
  readonly property string cacheDir: home + "/.cache/omarchy-commandbar"
  readonly property string ratesUrl: "https://open.er-api.com/v6/latest/USD"

  property var defaultConfig: ({})
  property var userConfig: ({})
  readonly property var config: Engine.deepMerge(defaultConfig, userConfig)

  property var rates: null          // { rates, updated, next, stale }
  property string ratesStatus: ""
  property real ratesAttemptAt: 0

  property var zones: ({})          // { "Asia/Tokyo": { offset: 540, abbr: "JST" } }
  property real zonesFetchedAt: 0

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
  property int inputHeight: Math.max(Style.space(34), Style.font.heading + Style.spacing.controlPaddingY * 2)
  property int rowHeight: Math.max(Style.space(46), Style.font.heading + Style.font.bodySmall + Style.spacing.md * 2)
  readonly property int maxRows: 7
  property int cardWidth: Math.min(Style.space(640), panel.width - Style.gapsOut * 2)

  // Nothing is listed until there's a query, so an empty bar is just the input.
  readonly property var rows: results

  // ---------------------------------------------------------------- lifecycle

  function open(payloadJson) {
    root.opened = true
    root.selectedIndex = 0
    root.refreshRates()
    root.refreshZones()
    root.recompute()   // the kept query may be time-sensitive ("time", "3pm to tokyo")
    // Like Spotlight: the last query comes back selected, so typing replaces it
    // and an arrow key keeps it.
    Qt.callLater(function() { input.forceActiveFocus(); input.selectAll() })
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

  function toggle() {
    if (root.opened) root.dismiss()
    else root.open("{}")
  }

  // ---------------------------------------------------------------- queries

  function recompute() {
    root.results = Engine.run(input.text, root.config, {
      rates: root.rates,
      ratesStatus: root.ratesStatus,
      zones: root.zones
    })
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
    input.cursorPosition = text.length
    root.selectedIndex = 0
    return true
  }

  function activate(index) {
    var row = root.rows[index]
    if (!row) return
    if (row.run) {
      root.dismiss()
      if (row.run.kind === "open") Quickshell.execDetached(["xdg-open", row.run.target])
      else Quickshell.execDetached(["bash", "-c", row.run.target])
      return
    }
    if (row.complete && !row.copy) { root.complete(row); return }
    if (!row.copy) return
    root.dismiss()
    Quickshell.execDetached(["bash", "-c", "printf %s " + Util.shellQuote(row.copy) + " | wl-copy"])
  }

  function actionLabel(row) {
    if (row.run) return row.run.kind === "open" ? "↵ open" : "↵ run"
    if (row.complete && !row.copy) return "⇥ complete"
    return row.copy ? "↵ copy" : ""
  }

  onConfigChanged: {
    if (root.opened) root.recompute()
    root.zonesFetchedAt = 0   // the zone list may have changed
  }

  // ---------------------------------------------------------------- config

  FileView {
    path: root.pluginDir + "/config.default.json"
    watchChanges: true
    printErrors: false
    onLoaded: {
      try { root.defaultConfig = Engine.parseJsonc(text()) }
      catch (e) { console.warn("commandbar: bad config.default.json: " + e) }
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
    }
    onLoadFailed: root.userConfig = ({})
    onFileChanged: reload()
  }

  // ---------------------------------------------------------------- rates

  // open.er-api.com publishes daily and says when the next update is, so the
  // cache is refetched only once that time has passed. Failed attempts back
  // off for ten minutes; the last good file keeps working offline.
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
      console.warn("commandbar: bad rates cache: " + e)
    }
    if (root.opened) root.recompute()
  }

  // ---------------------------------------------------------------- last query

  // Kept in memory between opens (the plugin stays loaded) and written to the
  // cache on close so it also survives a shell restart.
  property bool lastQueryLoaded: false

  function saveLastQuery() {
    if (!root.lastQueryLoaded || lastQueryFile.text() === input.text) return
    Quickshell.execDetached(["mkdir", "-p", root.cacheDir])
    lastQueryFile.setText(input.text)
  }

  FileView {
    id: lastQueryFile
    path: root.cacheDir + "/last-query"
    printErrors: false
    atomicWrites: true
    onLoaded: {
      if (!root.lastQueryLoaded && !input.text) input.text = text().replace(/\n+$/, "")
      root.lastQueryLoaded = true
    }
    onLoadFailed: root.lastQueryLoaded = true
  }

  FileView {
    id: ratesFile
    path: root.cacheDir + "/rates.json"
    watchChanges: true
    printErrors: false
    onLoaded: root.loadRates(text())
    onLoadFailed: root.refreshRates()
    onFileChanged: reload()
  }

  Process {
    id: ratesProc
    command: ["bash", "-c",
      "mkdir -p \"$1\" && curl -fsS --max-time 8 \"$2\" -o \"$1/rates.json.tmp\" && mv \"$1/rates.json.tmp\" \"$1/rates.json\"",
      "_", root.cacheDir, root.ratesUrl]
    onExited: function(exitCode) {
      if (exitCode !== 0) {
        root.ratesStatus = root.rates ? "" : "Couldn't reach open.er-api.com"
        if (root.opened) root.recompute()
      } else {
        ratesFile.reload()
      }
    }
  }

  Timer {
    interval: 60 * 60 * 1000
    running: true
    repeat: true
    onTriggered: root.refreshRates()
  }

  // ---------------------------------------------------------------- zones

  function refreshZones() {
    if (zonesProc.running) return
    if (Date.now() - root.zonesFetchedAt < 60 * 60 * 1000) return
    var t = root.config.time || {}
    var extra = (t.zones || []).concat(t.home ? [t.home] : [])
    zonesProc.command = ["bash", "-c", "for z in \"$@\"; do printf '%s ' \"$z\"; TZ=\"$z\" date +'%z %Z'; done", "_"]
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
      height: contentTopInset + contentBottomInset + root.inputHeight
        + (root.rows.length > 0 ? Style.spacing.md + 1 + Style.spacing.md + Math.min(root.rows.length, root.maxRows) * root.rowHeight : 0)
      radius: root.cornerRadius
      anchors.horizontalCenter: parent.horizontalCenter
      y: Math.round(panel.height * 0.24)
      color: root.background
      borderSpec: root.borderSpec
      padding: root.contentMargin

      MouseArea { anchors.fill: parent; onClicked: {} }

      Column {
        anchors.fill: parent
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        anchors.leftMargin: card.contentLeftInset
        spacing: Style.spacing.md

        Item {
          width: parent.width
          height: root.inputHeight

          Text {
            id: promptGlyph
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: "󰍉"
            color: root.selectedText
            font.family: root.fontFamily
            font.pixelSize: Style.font.iconLarge
          }

          TextInput {
            id: input
            anchors.left: promptGlyph.right
            anchors.leftMargin: Style.spacing.md
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            color: root.foreground
            selectionColor: root.selectedBackground
            selectedTextColor: root.selectedText
            font.family: root.fontFamily
            font.pixelSize: Style.font.heading
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
              text: "Calculate, convert, or type a keyword…"
              color: root.foreground
              opacity: 0.45
              font: input.font
            }

            Keys.priority: Keys.BeforeItem
            Keys.onPressed: function(event) {
              if (event.key === Qt.Key_Escape) {
                if (input.text) input.text = ""
                else root.dismiss()
                event.accepted = true
              } else if (event.key === Qt.Key_Down || (event.key === Qt.Key_N && event.modifiers & Qt.ControlModifier)) {
                root.move(1); event.accepted = true
              } else if (event.key === Qt.Key_Up || (event.key === Qt.Key_P && event.modifiers & Qt.ControlModifier)) {
                root.move(-1); event.accepted = true
              } else if (event.key === Qt.Key_Tab) {
                var row = root.rows[root.selectedIndex]
                if (row) root.complete(row)
                event.accepted = true
              } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                root.activate(root.selectedIndex); event.accepted = true
              }
            }
          }
        }

        Rectangle {
          width: parent.width
          height: 1
          color: root.foreground
          opacity: 0.12
          visible: root.rows.length > 0
        }

        ListView {
          id: list
          width: parent.width
          height: Math.min(root.rows.length, root.maxRows) * root.rowHeight
          visible: root.rows.length > 0
          model: root.rows
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          currentIndex: root.selectedIndex

          delegate: Rectangle {
            id: rowItem
            required property int index
            required property var modelData
            readonly property bool selected: index === root.selectedIndex

            width: list.width
            height: root.rowHeight
            radius: root.cornerRadius
            color: selected ? root.selectedBackground : "transparent"

            Text {
              id: rowIcon
              anchors.left: parent.left
              anchors.leftMargin: Style.spacing.md
              anchors.verticalCenter: parent.verticalCenter
              width: Style.font.display
              horizontalAlignment: Text.AlignHCenter
              text: rowItem.modelData.icon || ""
              color: rowItem.selected ? root.selectedText : root.foreground
              opacity: rowItem.selected ? 1 : 0.7
              font.family: root.fontFamily
              font.pixelSize: Style.font.iconLarge
            }

            Column {
              anchors.left: rowIcon.right
              anchors.leftMargin: Style.spacing.md
              anchors.right: actionText.left
              anchors.rightMargin: Style.spacing.md
              anchors.verticalCenter: parent.verticalCenter
              spacing: Style.space(2)

              Text {
                width: parent.width
                textFormat: Text.PlainText
                text: rowItem.modelData.title
                color: rowItem.selected ? root.selectedText : root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.heading
                font.bold: rowItem.index === 0
                elide: Text.ElideRight
              }

              Text {
                width: parent.width
                visible: text !== ""
                textFormat: Text.PlainText
                text: rowItem.modelData.subtitle || ""
                color: root.foreground
                opacity: 0.55
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                elide: Text.ElideRight
              }
            }

            Text {
              id: actionText
              anchors.right: parent.right
              anchors.rightMargin: Style.spacing.md
              anchors.verticalCenter: parent.verticalCenter
              text: rowItem.selected ? root.actionLabel(rowItem.modelData) : ""
              color: root.foreground
              opacity: 0.5
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }

            MouseArea {
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              // Only real pointer movement selects, so a result list that
              // re-renders under a resting cursor doesn't steal the selection.
              onPositionChanged: root.selectedIndex = rowItem.index
              onClicked: {
                root.selectedIndex = rowItem.index
                root.activate(rowItem.index)
                input.forceActiveFocus()
              }
            }
          }
        }
      }
    }
  }
}
