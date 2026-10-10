.pragma library

// Launch installed applications. CommandBar.qml keeps a snapshot of the
// visible desktop entries in ctx.apps:
//   [{ id, name, generic, comment, keywords, icon, wmclass, actions: [{ index, name }] }]
// and how often each was launched from the bar in ctx.launches: { id: count }.
//
// Apps only: unlike the Omarchy menu, nothing here changes a setting, so
// typing "brave" can't land on "Default browser → Brave" by accident.
//
//   firefox · term · vsc (acronym) · brave new window

var LIMIT = 6
var ACTIONS = 3

// "VSCodium" → ["vs", "codium"], "org.gnome.Nautilus" → ["org", "gnome", "nautilus"]
function words(text) {
  return String(text || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(function(w) { return w.length > 0 })
}

// Every query word starts some word of the haystack.
function prefixesAll(queryWords, hay) {
  for (var i = 0; i < queryWords.length; i++) {
    var hit = false
    for (var j = 0; j < hay.length && !hit; j++) hit = hay[j].indexOf(queryWords[i]) === 0
    if (!hit) return false
  }
  return true
}

// How well the query names this app, best first; 0 means no match.
function rank(app, q, qw) {
  var name = app.name.toLowerCase()
  if (name === q) return 100
  if (name.indexOf(q) === 0) return 90
  var nameWords = words(app.name)
  if (app.id.toLowerCase() === q) return 88
  if (prefixesAll(qw, nameWords)) return 85
  if (q.length >= 2 && qw.length === 1 && nameWords.length > 1
      && nameWords.map(function(w) { return w[0] }).join("").indexOf(q) === 0) return 80
  if (q.length >= 3 && name.indexOf(q) !== -1) return 75
  if (prefixesAll(qw, words(app.id))) return 72
  if (prefixesAll(qw, words(app.generic + " " + app.keywords.join(" ")))) return 65
  return 0
}

// A launch history nudge: never enough to beat a better match, only to order
// equally good ones ("f" → the Firefox you use over Files).
function habit(count) {
  return count > 0 ? Math.min(3, Math.log(1 + count) / Math.LN2 * 0.75) : 0
}

var provider = {
  id: "apps",
  name: "Apps",
  icon: "󰀻",
  help: [
    { id: "apps", title: "Open an app", about: "Type part of an app's name, or what it does. Add an action after the name, like new window",
      examples: ["browser", "term", "files"] }
  ],
  match: function(query, ctx) {
    if (/^\s*w\s/i.test(query)) return []   // "w …" is the windows-only mode
    var q = query.trim().toLowerCase().replace(/\s+/g, " ")
    var apps = ctx.apps || []
    if (!q || apps.length === 0) return []
    var qw = words(q)
    if (qw.length === 0) return []
    var launches = ctx.launches || {}
    // Apps with a window open say "open new": Enter on their window row (from
    // the windows provider, ranked just above) switches instead.
    var running = {}
    var wins = ctx.windows || []
    for (var w = 0; w < wins.length; w++) running[String(wins[w].cls).toLowerCase()] = true
    function isRunning(app) {
      return running[app.id.toLowerCase()] || (app.wmclass && running[app.wmclass.toLowerCase()])
        || running[app.id.toLowerCase().split(".").pop()]
    }

    var hits = []
    for (var i = 0; i < apps.length; i++) {
      var r = rank(apps[i], q, qw)
      if (r > 0) hits.push({ app: apps[i], r: r, h: habit(launches[apps[i].id] || 0) })
    }

    // "brave new window": the app's name then one of its actions.
    var actionHits = []
    if (qw.length > 1) {
      for (var a = 0; a < apps.length; a++) {
        var app = apps[a]
        var nameWords = words(app.name)
        var lead = 0
        while (lead < qw.length && lead < nameWords.length && nameWords[lead].indexOf(qw[lead]) === 0) lead++
        if (lead === 0 || lead === qw.length) continue
        var rest = qw.slice(lead)
        for (var k = 0; k < app.actions.length; k++) {
          if (prefixesAll(rest, words(app.actions[k].name)))
            actionHits.push({ app: app, action: app.actions[k] })
        }
      }
    }

    hits.sort(function(x, y) {
      return (y.r + y.h) - (x.r + x.h) || x.app.name.localeCompare(y.app.name)
    })

    var out = []
    for (var j = 0; j < actionHits.length; j++) {
      var ah = actionHits[j]
      out.push({
        title: ah.action.name,
        subtitle: ah.app.name,
        image: ah.app.icon,
        score: 94 - j * 0.01,
        copy: "",
        run: { kind: "app", target: ah.app.id, action: ah.action.index, label: "open" }
      })
    }

    for (var n = 0; n < hits.length && n < LIMIT; n++) {
      var hit = hits[n]
      // Apps sit above keyword-found commands (≤64) and below exact answers
      // like keyword commands (98), kill rows (96) and time lookups (92).
      out.push({
        title: hit.app.name,
        subtitle: hit.app.generic || hit.app.comment || "Application",
        image: hit.app.icon,
        score: 70 + hit.r * 0.2 + hit.h * 0.2 - n * 0.01,
        copy: "",
        run: { kind: "app", target: hit.app.id, label: isRunning(hit.app) ? "open new" : "open" }
      })

      // A near-exact hit also offers its actions (New Window, New Private
      // Window, …), so a second browser window is one arrow key away.
      if (n === 0 && hit.r >= 90 && q.length >= 3 && actionHits.length === 0) {
        for (var m = 0; m < hit.app.actions.length && m < ACTIONS; m++) {
          out.push({
            title: hit.app.actions[m].name,
            subtitle: hit.app.name,
            image: hit.app.icon,
            score: 70 + hit.r * 0.2 + hit.h * 0.2 - 0.005 - m * 0.001,
            copy: "",
            run: { kind: "app", target: hit.app.id, action: hit.app.actions[m].index, label: "open" }
          })
        }
      }
    }
    return out
  }
}
