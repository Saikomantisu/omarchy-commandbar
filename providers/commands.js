.pragma library

// Keyword commands defined entirely in config — the no-code extension point.
//
//   { "keyword": "g",    "title": "Search Google", "open": "https://www.google.com/search?q={q}" }
//   { "keyword": "lock", "title": "Lock screen",   "run":  "omarchy-system-lock" }
//
// `open` gets {q} URL-encoded and is handed to xdg-open; `run` gets {q}
// shell-quoted and runs under bash. Nothing runs until Enter.

function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'" }

function takesQuery(cmd) { return /\{q\}/.test(cmd.open || cmd.run || "") }

function build(cmd, q) {
  if (cmd.open) return { kind: "open", target: cmd.open.replace(/\{q\}/g, encodeURIComponent(q)) }
  if (cmd.run) return { kind: "run", target: cmd.run.replace(/\{q\}/g, shellQuote(q)) }
  return null
}

var provider = {
  id: "commands",
  name: "Commands",
  icon: "󰘳",
  match: function(query, ctx) {
    var list = ctx.settings
    if (!Array.isArray(list)) return []
    var text = query.replace(/^\s+/, "")
    var space = text.search(/\s/)
    var word = (space === -1 ? text : text.slice(0, space)).toLowerCase()
    var rest = space === -1 ? "" : text.slice(space).trim()
    var out = []

    for (var i = 0; i < list.length; i++) {
      var cmd = list[i]
      if (!cmd || !cmd.keyword || !(cmd.open || cmd.run)) continue
      var kw = String(cmd.keyword).toLowerCase()
      var title = cmd.title || kw
      var icon = cmd.icon || (cmd.open ? "󰖟" : "󰘳")

      if (word === kw) {
        if (takesQuery(cmd)) {
          if (!rest) {
            out.push({ title: title + "…", subtitle: "Type what to search for after “" + kw + " ”", score: 95, icon: icon, copy: "" })
          } else {
            out.push({ title: title + ": " + rest, subtitle: cmd.open ? "Enter to open" : "Enter to run", score: 98, icon: icon, copy: rest, run: build(cmd, rest) })
          }
        } else if (!rest) {
          out.push({ title: title, subtitle: "Enter to " + (cmd.open ? "open" : "run") + " · " + kw, score: 98, icon: icon, copy: "", run: build(cmd, "") })
        }
      } else if (space === -1 && word.length >= 2 && kw.indexOf(word) === 0) {
        // Keyword completion while typing: "lo" → "lock".
        out.push({
          title: title,
          subtitle: "Keyword “" + kw + "”",
          score: 50,
          icon: icon,
          copy: "",
          run: takesQuery(cmd) ? null : build(cmd, ""),
          complete: kw + " "
        })
      }
    }
    return out
  }
}
