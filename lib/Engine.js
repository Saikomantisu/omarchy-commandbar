.pragma library
.import "../providers/index.js" as Registry
.import "../providers/files.js" as Files

// Runs every enabled provider over a query and returns ranked rows:
//   { provider, icon, image, title, subtitle, copy, run, complete, score,
//     group, section, hero }
// Rows come back grouped: `section` is set on the first row of each group,
// and `hero` on a top row that is a direct answer (a sum, a conversion).
// `image` is an icon theme name or path (app icons), drawn instead of `icon`.

function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v) }

// Objects merge key by key; arrays and scalars from `over` replace `base`.
function deepMerge(base, over) {
  if (!isObject(base) || !isObject(over)) return over === undefined ? base : over
  var out = {}
  var k
  for (k in base) out[k] = base[k]
  for (k in over) out[k] = deepMerge(base[k], over[k])
  return out
}

// Strips // and /* */ comments outside strings so the user file can be JSONC.
function parseJsonc(text) {
  var src = String(text || "")
  var out = ""
  var inString = false
  for (var i = 0; i < src.length; i++) {
    var c = src[i]
    if (inString) {
      out += c
      if (c === "\\") { out += src[++i] || "" }
      else if (c === "\"") inString = false
    } else if (c === "\"") { inString = true; out += c }
    else if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; out += "\n" }
    else if (c === "/" && src[i + 1] === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i++ }
    else out += c
  }
  out = out.replace(/,(\s*[}\]])/g, "$1")   // trailing commas
  if (!out.trim()) return {}
  return JSON.parse(out)
}

// ---------------------------------------------------------------- formatting

// Copy text: no grouping separators, so it pastes cleanly into anything.
function plain(n) { return String(n) }

function format(n) {
  if (typeof n !== "number" || !isFinite(n)) return String(n)
  var abs = Math.abs(n)
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return n.toPrecision(6).replace(/\.?0+e/, "e")
  var s = String(n)
  if (/e/.test(s)) s = n.toFixed(12).replace(/\.?0+$/, "")
  var neg = s[0] === "-"
  if (neg) s = s.slice(1)
  var parts = s.split(".")
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return (neg ? "-" : "") + parts.join(".")
}

var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function formatDate(unixSeconds) {
  var d = new Date(unixSeconds * 1000)
  return d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear()
}

// ---------------------------------------------------------------- run

function providers() { return Registry.all }

function contextFor(p, config, services) {
  return {
    settings: config[p.id],
    rates: services.rates,
    ratesStatus: services.ratesStatus,
    zones: services.zones || {},
    localZone: services.localZone || "",
    emojis: services.emojis || [],
    processes: services.processes || null,
    apps: services.apps || [],
    windows: services.windows || [],
    launches: services.launches || {},
    agent: services.agent || "",
    files: services.files || null,
    folder: services.folder || null,
    home: services.home || "",
    keywords: commandKeywords(config),
    requestProcesses: services.requestProcesses || null,
    requestRates: services.requestRates || null,
    requestFiles: services.requestFiles || null,
    requestFolder: services.requestFolder || null,
    now: services.now || function() { return new Date() },
    format: format,
    plain: plain,
    formatDate: formatDate
  }
}

// Keywords taken by your own keyword commands, so a feature's keyword can step
// aside for one ("ai" when you have an "ai" command).
function commandKeywords(config) {
  var cmds = config && Array.isArray(config.commands) && (config.providers || []).indexOf("commands") !== -1 ? config.commands : []
  var out = []
  for (var i = 0; i < cmds.length; i++) if (cmds[i] && cmds[i].keyword) out.push(String(cmds[i].keyword).toLowerCase())
  return out
}

function enabledProviders(config) {
  var enabled = (config && config.providers) || []
  var out = []
  for (var order = 0; order < enabled.length; order++) {
    for (var i = 0; i < Registry.all.length; i++) {
      if (Registry.all[i].id === enabled[order]) { out.push(Registry.all[i]); break }
    }
  }
  return out
}

// "?" is a small help browser, driven entirely by the query:
//   ?          one row per topic (Open an app, Calculator, Units, …)
//   ?units     that topic's examples, each with its live answer
//   ?money     examples from every topic that match the words
// Providers describe themselves with `help`: [{ id, title, about, icon?,
// examples: ["5 km to mi", { q: "kill ", note: "…" }, { q: "brave", hint: "…" }] }]
// (or a function of ctx returning that). Examples with a note show the note;
// the rest show what the bar would answer, so you see a result before trying
// it, or their hint when there's no answer right now (no matching window).

// Topics in the order people reach for them; anything else after, keywords last.
var HELP_ORDER = ["apps", "windows", "files", "calc", "units", "currency", "time", "dates", "emoji", "kill", "generate", "url", "ai"]

function helpTopics(config, services) {
  var topics = []
  var providers = enabledProviders(config)
  for (var i = 0; i < providers.length; i++) {
    var p = providers[i]
    var entries = p.help
    if (typeof entries === "function") {
      try { entries = entries(contextFor(p, config, services)) }
      catch (e) { console.warn("commandbar: help for " + p.id + " failed: " + e); entries = [] }
    }
    for (var j = 0; entries && j < entries.length; j++) {
      var h = entries[j]
      var examples = (h.examples || []).map(function(x) { return typeof x === "string" ? { q: x } : x })
      topics.push({ id: h.id || p.id, title: h.title || p.name, about: h.about || "", icon: h.icon || p.icon || "", examples: examples })
    }
  }
  function rank(t) {
    var n = HELP_ORDER.indexOf(t.id)
    return t.id === "keywords" ? 1000 : (n === -1 ? 500 : n)
  }
  return topics.sort(function(a, b) { return rank(a) - rank(b) })
}

// What an example answers right now: "3.1069 mi", "Firefox", "🔥 fire".
// Run without the request hooks, so browsing help never fetches rates or
// lists processes or searches files.
function preview(q, config, services) {
  var quiet = {}
  for (var k in services) quiet[k] = services[k]
  quiet.requestRates = null
  quiet.requestProcesses = null
  quiet.requestFiles = null
  quiet.requestFolder = null
  var rows = run(q, config, quiet)
  var top = rows[0]
  if (!top || top.help || !(top.copy || top.run)) return ""
  return (top.provider === "emoji" ? top.icon + " " : "") + top.title
}

function exampleRow(topic, ex, config, services) {
  var answer = ex.note ? "" : preview(ex.q, config, services)
  return {
    provider: "help",
    providerName: "Help",
    icon: topic.icon,
    title: ex.q.trim() || ex.q,
    subtitle: ex.note || (answer ? "→ " + answer : (ex.hint || "")),
    copy: "",
    run: null,
    complete: ex.q,
    // An example with a live answer comes in selected, so typing replaces
    // it; a mode prefix ("w ", ":") leaves the cursor at the end.
    select: !ex.note && /\S$/.test(ex.q),
    actionLabel: "Try it",
    group: topic.title,
    score: 0,
    help: true,
    helpTopic: topic.id
  }
}

function help(text, config, services) {
  var topics = helpTopics(config, services)
  var t = String(text || "").trim().toLowerCase()
  var rows = []
  var i, j

  if (!t) {
    for (i = 0; i < topics.length; i++) {
      rows.push({
        provider: "help", providerName: "Help", icon: topics[i].icon,
        title: topics[i].title, subtitle: topics[i].about,
        copy: "", run: null, complete: "?" + topics[i].id, select: false,
        actionLabel: "Open", group: "Help", score: 0, help: true
      })
    }
    rows = group(rows)
    rows[0].section = ""   // the search-field chip already says Help
    return rows
  }

  for (i = 0; i < topics.length; i++) {
    if (topics[i].id === t) {
      for (j = 0; j < topics[i].examples.length; j++) rows.push(exampleRow(topics[i], topics[i].examples[j], config, services))
      return group(rows)
    }
  }

  // Search: every word has to appear in the topic or the example.
  var qw = words(t)
  for (i = 0; i < topics.length; i++) {
    var topic = topics[i]
    var topicText = words(topic.id + " " + topic.title + " " + topic.about)
    for (j = 0; j < topic.examples.length; j++) {
      var ex = topic.examples[j]
      if (prefixesAll(qw, topicText.concat(words(ex.q + " " + (ex.note || "")))))
        rows.push(exampleRow(topic, ex, config, services))
    }
  }
  if (rows.length === 0)
    return [{ provider: "help", providerName: "Help", icon: "󰋖", title: "No help matches \"" + t + "\"", subtitle: "Esc goes back to all topics",
              copy: "", run: null, complete: "", select: false, group: "Help", section: "", score: 0, help: true }]
  return group(rows)
}

// The topic a "?id" query has open, for the search-field chip.
function helpTopicTitle(text, config, services) {
  var t = String(text || "").trim().toLowerCase()
  var topics = helpTopics(config, services)
  for (var i = 0; i < topics.length; i++) if (topics[i].id === t) return topics[i].title
  return ""
}

// ---------------------------------------------------------------- commands
//
// Every feature is findable from the search box, Raycast-style: providers list
// `commands` (array, or function of ctx), and any query whose words prefix the
// command's title or keywords shows it — "emo" → Search Emoji, "clock" →
// World Clock. They rank below real answers, so "2+2" still leads with 4.

var BUILTIN_COMMANDS = [
  { title: "Show everything", keywords: "help commands list all features show", text: "Every feature and keyword, with examples", complete: "?", icon: "󰋖" }
]

function words(text) {
  return String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(function(w) { return w.length > 0 })
}

// Every query word must start some word of the haystack.
function prefixesAll(queryWords, hay) {
  for (var i = 0; i < queryWords.length; i++) {
    var hit = false
    for (var j = 0; j < hay.length && !hit; j++) hit = hay[j].indexOf(queryWords[i]) === 0
    if (!hit) return false
  }
  return true
}

function commandRows(query, config, services, existing) {
  var q = query.trim().toLowerCase()
  var qw = words(q)
  if (q.length < 2 || qw.length === 0) return []
  // A path or a file name being typed ("~/.con", ".inv") isn't a command search.
  if (Files.isSearch(q) || Files.isPath(q)) return []

  var seen = {}
  for (var e = 0; e < existing.length; e++) seen[existing[e].provider + "|" + existing[e].title.replace(/…$/, "").toLowerCase()] = true

  var sources = enabledProviders(config).map(function(p) { return { p: p, list: p.commands } })
  sources.push({ p: { id: "bar", name: "Command Bar", icon: "󰋖" }, list: BUILTIN_COMMANDS })

  var rows = []
  for (var i = 0; i < sources.length; i++) {
    var p = sources[i].p
    var list = sources[i].list
    if (typeof list === "function") {
      try { list = list(contextFor(p, config, services)) }
      catch (err) { console.warn("commandbar: commands for " + p.id + " failed: " + err); list = [] }
    }
    for (var j = 0; list && j < list.length; j++) {
      var c = list[j]
      var titleWords = words(c.title)
      var inTitle = prefixesAll(qw, titleWords)
      if (!inTitle && !prefixesAll(qw, titleWords.concat(words(c.keywords)))) continue
      if (seen[p.id + "|" + c.title.toLowerCase()]) continue          // the provider already answered it
      if (c.complete && c.complete.trim() === q) continue            // already in that mode
      rows.push({
        provider: p.id,
        providerName: p.name,
        icon: c.icon || p.icon || "",
        title: c.title,
        subtitle: c.text || p.name,
        group: "Commands",
        copy: "",
        run: c.run || null,
        complete: c.complete || "",
        select: !!c.select,
        // A title that starts with the query ("lo" → Lock screen) ranks just
        // above an app whose name does (88); other title hits, then keyword
        // hits, sit below apps and real answers (70+).
        score: c.title.toLowerCase().indexOf(q) === 0 ? 88.5 : (inTitle ? 62 : 56),
        order: i,
        seq: j
      })
    }
  }
  return rows
}

// services: { rates, ratesStatus, zones, emojis, processes, apps, windows, launches, agent, files, folder, home,
//             requestProcesses(), requestRates(), requestFiles(words), requestFolder(dir), now() }
function run(query, config, services) {
  var q = String(query || "")
  if (!q.trim()) return []
  if (/^\s*\?/.test(q)) return help(q.replace(/^\s*\?/, ""), config, services)
  var providers = enabledProviders(config)
  var rows = []

  for (var order = 0; order < providers.length; order++) {
    var p = providers[order]
    var ctx = contextFor(p, config, services)

    var results
    try {
      results = p.match(q, ctx) || []
    } catch (e) {
      console.warn("commandbar: provider " + p.id + " failed: " + e)
      continue
    }

    for (var r = 0; r < results.length; r++) {
      var row = results[r]
      rows.push({
        provider: p.id,
        providerName: p.name,
        icon: row.icon || p.icon || "",
        image: row.image || "",
        title: String(row.title || ""),
        subtitle: String(row.subtitle || ""),
        copy: row.copy === undefined ? String(row.title || "") : String(row.copy),
        run: row.run || null,
        complete: row.complete || "",
        select: !!row.select,
        actionLabel: row.actionLabel || "",
        score: typeof row.score === "number" ? row.score : 50,
        group: row.group || p.name,
        fallback: !!row.fallback,
        order: order,
        seq: rows.length
      })
    }
  }

  rows = rows.concat(commandRows(q, config, services, rows))

  // Fallback rows ("Ask Claude Code: …") stand in only when nothing else
  // answered, the way Raycast's and Alfred's fallbacks do.
  var answered = rows.some(function(r) { return !r.fallback })
  if (answered) rows = rows.filter(function(r) { return !r.fallback })

  rows.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score
    if (a.order !== b.order) return a.order - b.order
    return a.seq - b.seq
  })
  return group(rows)
}

// Providers whose top row is the answer itself, shown large.
var ANSWERS = { math: true, currency: true, units: true, time: true }

// Keeps each group together, in the order of its best row, and labels the
// first row of each. A hero answer stands on its own, so the rest of its
// group gets its own label underneath.
function group(rows) {
  var order = []
  var byGroup = {}
  for (var i = 0; i < rows.length; i++) {
    var g = rows[i].group || rows[i].providerName
    if (!byGroup[g]) { byGroup[g] = []; order.push(g) }
    byGroup[g].push(rows[i])
  }
  var out = []
  for (var o = 0; o < order.length; o++) {
    for (var j = 0; j < byGroup[order[o]].length; j++) {
      var row = byGroup[order[o]][j]
      row.section = j === 0 ? order[o] : ""
      row.hero = false
      out.push(row)
    }
  }
  if (out.length > 0 && ANSWERS[out[0].provider] && out[0].copy) {
    out[0].hero = true
    out[0].section = ""
    if (out.length > 1 && !out[1].section) out[1].section = out[0].group
  }
  return out
}

// The mode a query puts the bar in, shown as a chip in the search field:
// ":" emoji, "kill " processes, "w " windows, a keyword and a space.
function mode(query, config) {
  var q = String(query || "")
  var on = {}
  var enabled = enabledProviders(config)
  for (var i = 0; i < enabled.length; i++) on[enabled[i].id] = enabled[i]
  if (/^\s*\?/.test(q)) {
    var topic = helpTopicTitle(q.replace(/^\s*\?/, ""), config, {})
    return { label: topic ? "Help · " + topic : "Help", icon: "󰋖" }
  }
  if (on.emoji && /^\s*:/.test(q)) return { label: "Emoji", icon: on.emoji.icon }
  if (on.processes && /^\s*kill(\s|$)/i.test(q)) return { label: "Processes", icon: on.processes.icon }
  if (on.windows && /^\s*w\s/i.test(q)) return { label: "Windows", icon: on.windows.icon }
  if (on.files && (Files.isSearch(q) || Files.isPath(q))) return { label: "Files", icon: on.files.icon }
  var m = q.match(/^\s*(\S+)\s/)
  var cmds = on.commands && config.commands
  if (m && Array.isArray(cmds)) {
    for (var c = 0; c < cmds.length; c++) {
      if (cmds[c] && String(cmds[c].keyword || "").toLowerCase() === m[1].toLowerCase())
        return { label: cmds[c].title || cmds[c].keyword, icon: cmds[c].icon || (cmds[c].open ? "󰖟" : "󰘳") }
    }
  }
  // After your own commands, which win when one has the same keyword.
  if (on.ai && m && m[1].toLowerCase() === String((config.ai && config.ai.keyword) || "ai").toLowerCase())
    return { label: "Agent", icon: on.ai.icon }
  if (on.files && m && m[1].toLowerCase() === "f") return { label: "Files", icon: on.files.icon }
  return null
}
