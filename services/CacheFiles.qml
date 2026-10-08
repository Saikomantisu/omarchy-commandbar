import Quickshell.Io
import QtQuick

// The shell never opens the cache files itself: bin/commandbar-cache does
// every read and write, refusing symlinks, foreign or oversized files, and
// replacing a file atomically through a private temporary file. Requests run
// one at a time, in order.
Item {
  id: cache
  required property string helper
  property var queue: []
  property var done: null
  property var input: null

  function read(name, done) {
    cache.queue.push({ command: ["python3", cache.helper, "read", name], input: null, done: done })
    if (!proc.running) cache.next()
  }

  // The content is piped straight to the helper's stdin, never put in its
  // arguments, so it can't be read from /proc/<pid>/cmdline.
  function write(name, text) {
    cache.queue.push({ command: ["python3", cache.helper, "write", name], input: text, done: null })
    if (!proc.running) cache.next()
  }

  function next() {
    if (cache.queue.length === 0) return
    var next = cache.queue.shift()
    cache.done = next.done
    cache.input = next.input
    proc.command = next.command
    proc.stdinEnabled = next.input !== null
    proc.running = true
  }

  Process {
    id: proc
    onStarted: {
      var input = cache.input
      cache.input = null
      if (input === null) return
      proc.write(input)
      // Closing stdin is what lets the helper see the end of the content.
      proc.stdinEnabled = false
    }
    stdout: StdioCollector { id: out; waitForEnd: true }
    stderr: StdioCollector {
      onStreamFinished: if (text.trim() !== "") console.warn("commandbar: " + text.trim())
    }
    onExited: function(exitCode) {
      var done = cache.done
      cache.done = null
      // A refused or failed read counts as an empty file.
      if (done) done(exitCode === 0 ? String(out.text || "") : "")
      cache.next()
    }
  }
}
