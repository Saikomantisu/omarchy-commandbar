import Quickshell
import Quickshell.Io
import QtQuick

// File names, read by fd only while files are on screen, for two things:
//   search  file names anywhere in the home folder (".pdf"). fd lists them
//           and awk keeps the names that have every word in them.
//   browse  everything in one folder ("~/Downloads/"), hidden files included;
//           providers/files.js filters and sorts it as you type.
// The words and the folder reach the scripts below through the environment,
// which only you can read, never through arguments, which anyone on the
// machine can read in /proc/<pid>/cmdline. A run that's still going when the
// query changes finishes first; then the latest one runs. Paths of folders
// end in "/".
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

  // fd separates names with NUL, and awk drops any name with a newline in it,
  // so a folder called "a<newline>" can't pass a path inside it off as
  // another file. Every path is at most PATH_MAX, so 300 of them is bounded.
  readonly property string searchScript:
    "timeout 2 fd --print0 --color never --exclude node_modules . \"$HOME\" | awk '" +
    "BEGIN { RS = \"\\0\"; n = split(tolower(ENVIRON[\"COMMANDBAR_WORDS\"]), w, \"\\n\") } /\\n/ { next } " +
    "{ name = tolower($0); sub(/\\/$/, \"\", name); sub(/.*\\//, \"\", name); " +
    "for (i = 1; i <= n; i++) if (!index(name, w[i])) next; print; if (++c == 300) exit }'"
  // Run inside the folder, so fd's arguments don't name it. Exits 1 when the
  // folder isn't there and 124 when fd times out.
  readonly property string browseScript:
    "set -o pipefail; cd -- \"$COMMANDBAR_DIR\" 2>/dev/null || exit 1; " +
    "timeout 2 fd --max-depth 1 --hidden --no-ignore --follow --print0 --color never --max-results 5000 | " +
    "awk 'BEGIN { RS = \"\\0\" } /\\n/ { next } { sub(/^\\.\\//, \"\"); print ENVIRON[\"COMMANDBAR_DIR\"] $0 }'"

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
    proc.environment = { COMMANDBAR_WORDS: words.join("\n") }
    proc.command = ["bash", "-c", files.searchScript]
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
    dirProc.environment = { COMMANDBAR_DIR: dir }
    dirProc.command = ["bash", "-c", files.browseScript]
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
