.pragma library

// Kill a running process. CommandBar.qml keeps a snapshot of the user's own
// processes (ps, refreshed on demand) in ctx.processes:
//   [{ pid, rss (KiB), cpu (%), name, args }]
//
//   kill · kill chrome · kill -9 chrome

var LIMIT = 30

function megabytes(kib) {
  var mb = kib / 1024
  return mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : Math.round(mb) + " MB"
}

var provider = {
  id: "processes",
  name: "Processes",
  icon: "󰅙",
  commands: [
    { title: "Kill Process", keywords: "kill quit process processes force end task manager", text: "Quit a running app or process", complete: "kill " }
  ],
  help: [
    { example: "kill ", text: "Quit a running process (kill -9 … to force)" }
  ],
  match: function(query, ctx) {
    var m = query.match(/^\s*kill(?:\s+(-9|-KILL|--force))?(?:\s+(.*))?$/i)
    if (!m) return []
    var force = !!m[1]
    var needle = (m[2] || "").trim().toLowerCase()
    if (ctx.requestProcesses) ctx.requestProcesses()

    var list = ctx.processes
    if (!list) return [{ title: "Loading processes…", subtitle: "Processes", score: 40, copy: "" }]

    var signal = force ? "-KILL" : "-TERM"
    var verb = force ? "Force quit" : "Quit"
    var hits = []
    for (var i = 0; i < list.length; i++) {
      var p = list[i]
      var name = p.name.toLowerCase()
      var r = !needle ? 1 : name === needle ? 3 : name.indexOf(needle) === 0 ? 2 : (name + " " + p.args.toLowerCase()).indexOf(needle) !== -1 ? 1 : 0
      if (r > 0) hits.push({ p: p, r: r })
    }
    if (hits.length === 0) return [{ title: needle ? "No process matches “" + needle + "”" : "No processes found", subtitle: "Processes", score: 40, copy: "" }]
    hits.sort(function(a, b) { return b.r - a.r || b.p.cpu - a.p.cpu || b.p.rss - a.p.rss })

    var out = []

    // Several processes with the name you typed (browsers, electron apps):
    // offer to quit them all at once.
    if (needle) {
      var group = hits.filter(function(h) { return h.p.name.toLowerCase() === hits[0].p.name.toLowerCase() })
      if (group.length > 1) {
        var rss = 0, pids = []
        for (var g = 0; g < group.length; g++) { rss += group[g].p.rss; pids.push(group[g].p.pid) }
        out.push({
          title: verb + " all " + group.length + " “" + hits[0].p.name + "” processes",
          subtitle: megabytes(rss) + " total · pids " + pids.slice(0, 6).join(", ") + (pids.length > 6 ? "…" : ""),
          score: 97,
          copy: "",
          run: { kind: "run", target: "kill " + signal + " " + pids.join(" "), label: force ? "force quit" : "quit" }
        })
      }
    }

    for (var j = 0; j < hits.length && j < LIMIT; j++) {
      var proc = hits[j].p
      out.push({
        title: verb + " " + proc.name,
        subtitle: "pid " + proc.pid + " · " + megabytes(proc.rss) + " · " + proc.cpu.toFixed(1) + "% CPU · " + proc.args,
        score: 96 - j * 0.01,
        copy: String(proc.pid),
        run: { kind: "run", target: "kill " + signal + " " + proc.pid, label: force ? "force quit" : "quit" }
      })
    }
    return out
  }
}
