.pragma library
.import "../lib/symbols.js" as Symbols

// Emoji search over Omarchy's own emojis.json ({ e, k } entries), loaded by
// CommandBar.qml and passed in as ctx.emojis, and over the symbols in
// lib/symbols.js (arrows, maths, currency, typography…), listed in a group
// of their own.
//
//   :fire · :heart eyes · emoji thumbs up · :arrow · :degree · :em dash

var LIMIT = 40
var SHARED = 10

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
    { title: "Search emoji", keywords: "emoji emojis emoticon smiley", text: "Type : then a word", complete: ":" },
    { title: "Search symbols", keywords: "symbol symbols unicode character arrow degree dash copyright", text: "Arrows, maths, currency signs, keyboard keys", complete: ":" }
  ],
  help: [
    { id: "emoji", title: "Emoji and symbols", about: "A colon and a word. Enter types it into your app and copies it",
      examples: [{ q: ":", note: "Start an emoji or symbol search" }, ":fire", "emoji party", ":arrow", ":degree", ":em dash"] }
  ],
  match: function(query, ctx) {
    var m = query.match(/^\s*(?::|emoji\s+|emoji$)\s*(.*)$/i)
    if (!m) return []
    var needle = m[1].trim().toLowerCase()
    var list = ctx.emojis || []
    // The symbols are built in, so they're searched while emoji still load.
    var loading = list.length === 0 ? [{ title: "Loading emoji…", subtitle: "Emoji", score: 40, copy: "" }] : []
    if (!needle) return loading.length ? loading : [{ title: "Type a word after the colon", subtitle: ":fire, :thumbs up, :party", score: 40, copy: "" }]

    var paste = !(ctx.settings && ctx.settings.onEnter === "copy")
    var emoji = search(list, "e", needle), symbols = search(Symbols.all, "s", needle)
    // When both match, the better group comes first and is cut to SHARED
    // rows, so the other is a few arrow keys away instead of forty.
    if (emoji.length > 0 && symbols.length > 0) {
      if (symbols[0].r > emoji[0].r) symbols = symbols.slice(0, SHARED)
      else emoji = emoji.slice(0, SHARED)
    }
    return rows(emoji, "Emoji", paste).concat(rows(symbols, "Symbols", paste), loading)
  }
}

// Matches best first, then in the list's own order (Omarchy's is by
// popularity, the symbols' by group).
function search(list, field, needle) {
  var hits = []
  for (var i = 0; i < list.length; i++) {
    var item = list[i]
    if (!item || !item[field]) continue
    var r = rank(String(item.k || "").toLowerCase(), needle)
    if (r > 0) hits.push({ text: item[field], k: String(item.k), r: r, i: i })
  }
  hits.sort(function(a, b) { return b.r - a.r || a.i - b.i })
  return hits.slice(0, LIMIT)
}

// The group whose best match is better comes first: ":degree" leads with
// symbols, ":fire" with emoji; on a tie, emoji.
function rows(hits, group, paste) {
  return hits.map(function(h, j) {
    return {
      icon: h.text,
      title: h.k.split(" ").slice(0, 5).join(" "),
      subtitle: h.k.split(" ").slice(5).join(" "),
      group: group,
      score: 90 + Math.min(h.r, 20) * 0.3 - j * 0.01,
      copy: h.text,
      // omarchy-menu-emoji-insert pastes through a temporary clipboard and
      // takes it back afterwards, so the text is copied again once it's typed.
      run: paste ? { kind: "run", target: "omarchy-menu-emoji-insert " + shellQuote(h.text) + "; printf %s " + shellQuote(h.text) + " | wl-copy", label: "type" } : null
    }
  })
}

function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'" }
