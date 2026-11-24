import Quickshell
import Quickshell.Io
import QtQuick

// The default browser's bookmarks, asked of bin/commandbar-bookmarks each time
// the bar opens, so new bookmarks and a changed default browser show up
// without restarting the shell. The helper caches its result and rereads the
// browser's files only when they change. bookmarks.browser in the config picks
// a browser by desktop id instead ("firefox.desktop"). If the helper fails or
// prints something unexpected the list is empty and the bar carries on.
Item {
  id: bookmarks
  required property string helper
  property var config: ({})
  property var list: []             // [{ title, url, folder, profile }]
  property string browserName: ""   // "Brave"
  property string lastText: ""      // the helper's last output, to skip unchanged ones

  signal updated()

  function refresh() {
    if (proc.running) return
    var settings = (bookmarks.config && bookmarks.config.bookmarks) || {}
    var browser = typeof settings.browser === "string" ? settings.browser : ""
    proc.command = [bookmarks.helper, browser]
    proc.running = true
  }

  Process {
    id: proc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        if (text === bookmarks.lastText && text !== "") return
        bookmarks.lastText = text
        var list = [], name = ""
        try {
          var data = JSON.parse(text)
          if (data && Array.isArray(data.bookmarks)) list = data.bookmarks
          name = String((data && data.name) || "")
        } catch (e) {
          console.warn("commandbar: bad bookmarks output: " + e)
        }
        bookmarks.list = list
        bookmarks.browserName = name
        bookmarks.updated()
      }
    }
  }

  Component.onCompleted: refresh()
}
