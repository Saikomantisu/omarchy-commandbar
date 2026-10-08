import Quickshell
import Quickshell.Io
import QtQuick

// Snapshot of the user's own processes, taken only while a "kill" query is
// on screen and at most every 1.5 s. comm is padded to a fixed width so
// names with spaces ("Web Content") parse cleanly.
Item {
  id: processes
  property var list: null           // [{ pid, rss, cpu, name, args }]
  property real fetchedAt: 0

  signal updated()

  function request() {
    if (proc.running) return
    if (Date.now() - processes.fetchedAt < 1500) return
    proc.running = true
  }

  Process {
    id: proc
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
        processes.list = out
        processes.fetchedAt = Date.now()
        processes.updated()
      }
    }
  }
}
