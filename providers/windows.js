.pragma library
.import "files.js" as Files
.import "apps.js" as Apps

// Switch to an open window. CommandBar.qml takes a snapshot of Hyprland's
// windows (hyprctl clients) each time the bar opens, in ctx.windows:
//   [{ address, cls, title, workspace, focus }]   focus 0 = most recent
//
//   brave → its open windows, most recently used first, above "open new"
//   netflix → the window whose title says so
//   w · w github → every window, or windows matching a filter

var LIMIT = 8

// The desktop entry a window belongs to, for its name and icon.
function appFor(win, apps) {
  var cls = win.cls.toLowerCase()
  for (var i = 0; i < apps.length; i++) {
    var a = apps[i]
    if (a.id.toLowerCase() === cls || (a.wmclass && a.wmclass.toLowerCase() === cls)) return a
  }
  // "org.gnome.Nautilus" ↔ class "org.gnome.Nautilus"; "brave-browser" ↔ "brave-browser";
  // otherwise the last dotted part: "com.mitchellh.ghostty" ↔ "ghostty".
  var tail = cls.split(".").pop()
  for (var j = 0; j < apps.length; j++) {
    if (apps[j].id.toLowerCase().split(".").pop() === tail) return apps[j]
  }
  return null
}

function describe(win, apps) {
  var app = appFor(win, apps)
  // No desktop entry: "com.mitchellh.ghostty" → "Ghostty".
  var tail = win.cls.split(".").pop()
  var name = app ? app.name : tail.charAt(0).toUpperCase() + tail.slice(1)
  return {
    app: app,
    name: name,
    matchable: { id: win.cls, name: name, generic: app ? app.generic : "", keywords: app ? app.keywords : [] }
  }
}

function where(win) {
  var ws = String(win.workspace || "")
  return ws.indexOf("special") === 0 ? "scratchpad" : "workspace " + ws
}

function row(win, d, score) {
  return {
    title: win.title || d.name,
    subtitle: d.name + " · " + where(win),
    image: d.app ? d.app.icon : "",
    icon: "󰖯",
    score: score,
    copy: "",
    run: { kind: "window", target: win.address, label: "switch" }
  }
}

var provider = {
  id: "windows",
  name: "Windows",
  icon: "󰖯",
  commands: [
    { title: "Switch window", keywords: "window windows switch focus open alt tab", text: "Go to an open window", complete: "w " }
  ],
  help: [
    { id: "windows", title: "Switch window", about: "Type an app or a window title. w and a space lists them all",
      examples: [{ q: "w ", note: "Every other open window, most recent first" },
                 { q: "w term", hint: "Only your terminal windows" }] }
  ],
  match: function(query, ctx) {
    if (Files.isPath(query)) return []   // a path being browsed
    var list = (ctx.windows || []).filter(function(w) {
      // Only addresses Hyprland gave us ever reach the dispatcher.
      return /^0x[0-9a-f]+$/i.test(w.address) && w.focus !== 0
    })
    var apps = ctx.apps || []
    var mode = query.match(/^\s*w\s(.*)$/i)
    var q = (mode ? mode[1] : query).trim().toLowerCase().replace(/\s+/g, " ")
    var qw = Apps.words(q)

    // "w" / "w filter": windows only, most recently used first.
    if (mode) {
      var picked = []
      for (var i = 0; i < list.length; i++) {
        var d = describe(list[i], apps)
        if (!q || Apps.rank(d.matchable, q, qw) > 0 || Apps.prefixesAll(qw, Apps.words(list[i].title))) picked.push({ w: list[i], d: d })
      }
      picked.sort(function(a, b) { return a.w.focus - b.w.focus })
      if (picked.length === 0) return [{ title: q ? "No window matches \"" + q + "\"" : "No other windows open", subtitle: "Windows", score: 40, copy: "" }]
      return picked.slice(0, LIMIT).map(function(p, n) { return row(p.w, p.d, 97 - n * 0.01) })
    }

    if (!q || qw.length === 0) return []
    var out = []
    for (var j = 0; j < list.length; j++) {
      var win = list[j]
      var info = describe(win, apps)
      var r = Apps.rank(info.matchable, q, qw)
      var score = 0
      // Named by its app: just above that app's own row (70 + r·0.2 + habit ≤ 0.6),
      // so Enter switches and "open new" is one arrow key down.
      if (r >= 72) score = 70 + r * 0.2 + 0.7
      // Named by its title ("netflix", "inventory"): below app-name prefixes.
      else if (q.length >= 3 && Apps.prefixesAll(qw, Apps.words(win.title))) score = 84
      if (score > 0) out.push(row(win, info, score - win.focus * 0.001))
    }
    out.sort(function(a, b) { return b.score - a.score })
    return out.slice(0, LIMIT)
  }
}
