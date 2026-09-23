.pragma library

// Emoji search over Omarchy's own emojis.json ({ e, k } entries), loaded by
// CommandBar.qml and passed in as ctx.emojis.
//
//   :fire · :heart eyes · emoji thumbs up

var LIMIT = 40

// Omarchy's keywords mix names and phrases ("red heart heart love", "fire burn",
// "fire extinguisher fire_extinguisher"), so the best signal for a one-word
// search is how often it appears as a whole keyword, relative to how many
// keywords the emoji has. Then whole-word phrases, word prefixes, substrings.
function rank(keywords, needle) {
  if (needle.indexOf(" ") === -1) {
    var tokens = keywords.split(" ")
    var n = 0
    for (var i = 0; i < tokens.length; i++) if (tokens[i] === needle) n++
    if (n > 0) return 10 + n + n / tokens.length
  }
  var k = " " + keywords.replace(/_/g, " ") + " "
  var at = k.indexOf(" " + needle + " ")
  if (at !== -1) return at === 0 ? 9 : 8
  at = k.indexOf(" " + needle)
  if (at !== -1) return at === 0 ? 4 : 3
  return k.indexOf(needle) !== -1 ? 1 : 0
}

var provider = {
  id: "emoji",
  name: "Emoji",
  icon: "󰞅",
  commands: [
    { title: "Search Emoji", keywords: "emoji emojis emoticon smiley symbols", text: "Type : then a word", complete: ":" }
  ],
  help: [
    { example: ":fire", text: "Search emoji (or “emoji fire”); Enter types it into the app" }
  ],
  match: function(query, ctx) {
    var m = query.match(/^\s*(?::|emoji\s+|emoji$)\s*(.*)$/i)
    if (!m) return []
    var needle = m[1].trim().toLowerCase()
    var list = ctx.emojis || []
    if (list.length === 0) return [{ title: "Loading emoji…", subtitle: "Emoji", score: 40, copy: "" }]
    if (!needle) return [{ title: "Type to search emoji", subtitle: "e.g. :fire, :thumbs up, :party", score: 40, copy: "" }]

    var paste = !(ctx.settings && ctx.settings.onEnter === "copy")
    var hits = []
    for (var i = 0; i < list.length; i++) {
      var item = list[i]
      if (!item || !item.e) continue
      var r = rank(String(item.k || "").toLowerCase(), needle)
      if (r > 0) hits.push({ item: item, r: r, i: i })
    }
    // Best match kind first, then Omarchy's own (popularity) order.
    hits.sort(function(a, b) { return b.r - a.r || a.i - b.i })

    var out = []
    for (var j = 0; j < hits.length && j < LIMIT; j++) {
      var e = hits[j].item
      out.push({
        icon: e.e,
        title: String(e.k).split(" ").slice(0, 5).join(" "),
        subtitle: paste ? "Enter to type it · " + e.e : "Enter to copy · " + e.e,
        score: 96 - j * 0.01,
        copy: e.e,
        run: paste ? { kind: "run", target: "omarchy-menu-emoji-insert " + shellQuote(e.e), label: "type" } : null
      })
    }
    return out
  }
}

function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'" }
