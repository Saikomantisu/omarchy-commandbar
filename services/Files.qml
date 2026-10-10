import Quickshell
import Quickshell.Io
import QtQuick

// File names, read by fd only while files are on screen, for two things:
//   search  file names anywhere in the home folder (".pdf"). The words go
//           to fd one per --and, so every word has to be in the name.
//   browse  everything in one folder ("~/Downloads/"), hidden files included;
//           providers/files.js filters and sorts it as you type.
// Words and folders go to fd as arguments, never through a shell. A run
// that's still going when the query changes finishes first; then the latest
// one runs. Paths of folders end in "/".
Item {
  id: files
  readonly property string home: Quickshell.env("HOME")
  property var result: null         // { query, list: [paths] }
  property string running: ""
  property string pending: ""
  property var folder: null         // { dir, list: [paths], missing, failed }
  property string browsing: ""
  property string pendingDir: ""

  signal updated()

  // What was read before is out of date once the bar is opened again.
  function forget() {
    files.result = null
    files.folder = null
  }

  // Each search walks the whole home folder, so it waits for a pause in
  // typing instead of running for every key.
  function request(query) {
    if (files.result && files.result.query === query) return
    if (proc.running && files.running === query) { files.pending = ""; return }
    if (files.pending === query) return
    files.pending = query
    debounce.restart()
  }

  Timer {
    id: debounce
    interval: 150
    onTriggered: if (!proc.running && files.pending) files.start(files.pending)
  }

  function start(query) {
    var words = query.split(/\s+/).filter(function(w) { return w.length > 0 })
    if (words.length === 0) return
    files.running = query
    files.pending = ""
    proc.command = ["timeout", "2", "fd", "--ignore-case", "--fixed-strings", "--color", "never",
                    "--max-results", "300", "--exclude", "node_modules"]
      .concat(words.slice(1).map(function(w) { return "--and=" + w }))
      .concat(["--", words[0], files.home])
    proc.running = true
  }

  function browse(dir) {
    if (files.folder && files.folder.dir === dir) return
    if (dirProc.running) { files.pendingDir = dir; return }
    files.startBrowse(dir)
  }

  function startBrowse(dir) {
    files.browsing = dir
    files.pendingDir = ""
    dirProc.command = ["timeout", "2", "fd", "--max-depth", "1", "--hidden", "--no-ignore", "--follow",
                       "--color", "never", "--max-results", "5000", "--", ".", dir]
    dirProc.running = true
  }

  Process {
    id: dirProc
    stdout: StdioCollector { id: dirOut; waitForEnd: true }
    onExited: function(exitCode) {
      var list = String(dirOut.text || "").split("\n").filter(function(l) { return l.charAt(0) === "/" })
      // fd exits 1 for a folder that isn't there; anything else (124 from
      // timeout) means it couldn't be read in time.
      var empty = exitCode !== 0 && list.length === 0
      files.folder = { dir: files.browsing, list: list, missing: empty && exitCode === 1, failed: empty && exitCode !== 1 }
      files.updated()
      if (files.pendingDir && files.pendingDir !== files.browsing) files.startBrowse(files.pendingDir)
    }
  }

  Process {
    id: proc
    stdout: StdioCollector { id: out; waitForEnd: true }
    // A search cut short by the timeout still shows what it found.
    onExited: {
      var list = String(out.text || "").split("\n").filter(function(l) { return l.charAt(0) === "/" })
      files.result = { query: files.running, list: list }
      files.updated()
      if (files.pending && files.pending !== files.running && !debounce.running) files.start(files.pending)
    }
  }
}
