.pragma library
.import "files.js" as Files

// Fuzzy-search the default browser's bookmarks and open one. CommandBar.qml
// keeps them in ctx.bookmarks: [{ title, url, folder, profile }] and the
// browser's name in ctx.browserName.
//
//   b gh issues → bookmarks only, fuzzy, up to 20
//   notion wiki → good matches also show among the other results, unless
//                 "bookmarks": { "inGlobalSearch": false } in the config
//
// Matching is fzf-like: the query's characters appear in order in the title
// (or the address), with bonuses for runs and word starts. Each space-separated
// word must match on its own, in any order.

var LIMIT = 20          // in "b " mode
var MIXED_LIMIT = 4     // among everything else
var MODE = /^\s*b\s(.*)$/i

// Score `needle` as an in-order subsequence of `hay` (both lower case);
// 0 when it isn't one.
function fuzzy(needle, hay) {
  if (!needle) return 1
  var n = needle.length, h = hay.length
  if (n > h) return 0
  var direct = hay.indexOf(needle)
  if (direct !== -1) {
    var start = direct === 0 || /[^a-z0-9]/.test(hay[direct - 1])
    return 100 + (start ? 40 : 0) + (direct === 0 ? 20 : 0) - Math.min(direct, 30) * 0.3 + n * 2
  }
  var score = 0, run = 0, j = 0, first = -1, prev = -2
  for (var i = 0; i < n; i++) {
    var c = needle[i]
    while (j < h && hay[j] !== c) j++
    if (j >= h) return 0
    if (first < 0) first = j
    var boundary = j === 0 || /[^a-z0-9]/.test(hay[j - 1])
    run = j === prev + 1 ? run + 1 : 0
    score += 1 + (boundary ? 6 : 0) + run * 3
    prev = j
    j++
  }
  return score - Math.min(first, 20) * 0.2 - (prev - first + 1 - n) * 0.15
}

// "https://www.github.com/foo" → "github.com/foo"
function shortUrl(url) {
  return String(url).replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "")
}

// Best score for one bookmark, 0 when a query word matches nowhere.
function rank(b, words) {
  var title = String(b.title || "").toLowerCase()
  var url = shortUrl(b.url).toLowerCase()
  var folder = String(b.folder || "").toLowerCase()
  var total = 0
  for (var i = 0; i < words.length; i++) {
    var w = words[i]
    var best = Math.max(fuzzy(w, title), fuzzy(w, url) * 0.8, fuzzy(w, folder) * 0.5)
    if (best <= 0) return 0
    total += best
  }
  return total / words.length
}

function search(q, list, limit) {
  var words = q.toLowerCase().split(/\s+/).filter(function(w) { return w })
  var hits = []
  for (var i = 0; i < list.length; i++) {
    var r = words.length ? rank(list[i], words) : 1
    if (r > 0) hits.push({ b: list[i], r: r, i: i })
  }
  hits.sort(function(x, y) { return y.r - x.r || x.i - y.i })
  return hits.slice(0, limit)
}

function row(hit, score, browser) {
  var b = hit.b
  var where = [shortUrl(b.url)]
  if (b.folder) where.push(b.folder)
  return {
    title: b.title || shortUrl(b.url),
    subtitle: where.join(" · "),
    icon: "󰃀",
    score: score,
    copy: b.url,
    group: browser ? browser + " bookmarks" : "Bookmarks",
    run: { kind: "open", target: b.url, label: "open" }
  }
}

var provider = {
  id: "bookmarks",
  name: "Bookmarks",
  icon: "󰃀",
  help: [
    { id: "bookmarks", title: "Open a bookmark", about: "Type b and part of a bookmark's name or address. Letters can be spread out: gh iss finds GitHub Issues",
      examples: [{ q: "b ", note: "All your browser's bookmarks" }] }
  ],
  match: function(query, ctx) {
    if (ctx.filesOn && Files.isPath(query)) return []
    var list = ctx.bookmarks || []
    var browser = ctx.browserName || ""
    var mode = query.match(MODE)
    if (mode) {
      var q = mode[1].trim()
      var hits = search(q, list, LIMIT)
      return hits.map(function(h, n) { return row(h, 97 - n * 0.01, browser) })
    }
    // Mixed in with apps and the rest: only clear matches, under apps (70+).
    if (ctx.settings && ctx.settings.inGlobalSearch === false) return []
    var text = query.trim()
    if (text.length < 3 || list.length === 0) return []
    var mixed = search(text, list, MIXED_LIMIT).filter(function(h) { return h.r >= 100 })
    return mixed.map(function(h, n) { return row(h, 60 + Math.min(h.r, 200) * 0.03 - n * 0.01, browser) })
  }
}
