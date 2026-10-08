import Quickshell.Io
import QtQuick
import "../lib/tzcities.js" as Tz

// UTC offsets and abbreviations for every zone the time provider knows, read
// from `date` at most once an hour, plus the system's own zone.
Item {
  id: zones
  property var config: ({})
  property var offsets: ({})        // { "Asia/Tokyo": { offset: 540, abbr: "JST" } }
  property string local: ""         // the system's IANA zone, e.g. "Europe/Berlin"
  property real fetchedAt: 0

  signal updated()

  // The zone list may have changed: fetch again on the next refresh().
  function invalidate() {
    zones.fetchedAt = 0
  }

  function refresh() {
    if (proc.running) return
    if (Date.now() - zones.fetchedAt < 60 * 60 * 1000) return
    var t = zones.config.time || {}
    var extra = (t.zones || []).concat(t.home ? [t.home] : [])
    // First line reports the system zone ("@local Europe/Berlin"), then one
    // "zone +hhmm ABBR" line per zone, the system zone included.
    proc.command = ["bash", "-c",
      "lz=$(timedatectl show -p Timezone --value 2>/dev/null); "
      + "[ -n \"$lz\" ] || lz=$(readlink /etc/localtime 2>/dev/null | sed 's|.*/zoneinfo/||'); "
      + "echo \"@local $lz\"; "
      + "for z in \"$@\" $lz; do printf '%s ' \"$z\"; TZ=\"$z\" date +'%z %Z'; done", "_"]
      .concat(Tz.allZones(extra))
    proc.running = true
  }

  Process {
    id: proc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var next = {}
        var lines = String(text || "").split("\n")
        for (var i = 0; i < lines.length; i++) {
          var local = lines[i].match(/^@local (\S+)$/)
          if (local) { zones.local = local[1]; continue }
          var m = lines[i].match(/^(\S+) ([+-])(\d\d)(\d\d) (\S+)$/)
          if (!m) continue
          var minutes = parseInt(m[3], 10) * 60 + parseInt(m[4], 10)
          next[m[1]] = { offset: m[2] === "-" ? -minutes : minutes, abbr: m[5] }
        }
        zones.offsets = next
        zones.fetchedAt = Date.now()
        zones.updated()
      }
    }
  }
}
