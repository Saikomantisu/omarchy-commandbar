.pragma library
.import "../providers/index.js" as Registry

// Runs every enabled provider over a query and returns ranked rows:
//   { provider, icon, title, subtitle, copy, run, complete, score }

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
    requestProcesses: services.requestProcesses || null,
    now: services.now || function() { return new Date() },
    format: format,
    plain: plain,
    formatDate: formatDate
  }
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

// "?" — what the bar can do, in sections. Each provider describes itself with
// `help`: [{ title, examples: [...], text?, icon?, exact? }] (or a function of
// ctx returning that, for config-driven lists), and optionally `helpSection`
// (default "Features"). One row per entry: the title, then its examples.
// Enter puts the first example in the bar, selected unless `exact` (a mode
// prefix like ":" or "kill " you keep typing after).
function help(config, services) {
  var sections = []   // [{ name, rows }] in first-seen order
  var byName = {}
  var providers = enabledProviders(config)
  for (var i = 0; i < providers.length; i++) {
    var p = providers[i]
    var entries = p.help
    if (typeof entries === "function") {
      try { entries = entries(contextFor(p, config, services)) }
      catch (e) { console.warn("commandbar: help for " + p.id + " failed: " + e); entries = [] }
    }
    if (!entries || entries.length === 0) continue
    var name = p.helpSection || "Features"
    if (!byName[name]) { byName[name] = { name: name, rows: [] }; sections.push(byName[name]) }
    for (var j = 0; j < entries.length; j++) {
      var h = entries[j]
      var examples = h.examples || []
      byName[name].rows.push({
        provider: p.id,
        providerName: p.name,
        icon: h.icon || p.icon || "",
        title: h.title || examples[0] || p.name,
        subtitle: h.text || examples.map(function(x) { return x.trim() }).join("  ·  "),
        copy: "",
        run: null,
        complete: examples[0] || "",
        select: !h.exact,
        score: 0
      })
    }
  }
  // Built-in features first, then config-driven sections like Keywords.
  sections = sections.filter(function(x) { return x.name === "Features" })
    .concat(sections.filter(function(x) { return x.name !== "Features" }))
  var rows = []
  for (var s = 0; s < sections.length; s++) {
    for (var r = 0; r < sections[s].rows.length; r++) {
      var row = sections[s].rows[r]
      row.section = r === 0 ? sections[s].name : ""
      row.order = s
      row.seq = rows.length
      rows.push(row)
    }
  }
  return rows
}

// ---------------------------------------------------------------- commands
//
// Every feature is findable from the search box, Raycast-style: providers list
// `commands` (array, or function of ctx), and any query whose words prefix the
// command's title or keywords shows it — "emo" → Search Emoji, "clock" →
// World Clock. They rank below real answers, so "2+2" still leads with 4.

var BUILTIN_COMMANDS = [
  { title: "Show All Commands", keywords: "help commands list all features", text: "Everything the bar can do", complete: "?", icon: "󰋖" }
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
        subtitle: "Command · " + (c.text || p.name),
        copy: "",
        run: c.run || null,
        complete: c.complete || "",
        select: !!c.select,
        // Title hits above keyword hits; all below real answers (70+).
        score: (inTitle ? 62 : 56) + (c.title.toLowerCase().indexOf(q) === 0 ? 2 : 0),
        order: i,
        seq: j
      })
    }
  }
  return rows
}

// services: { rates, ratesStatus, zones, emojis, processes, requestProcesses(), now() }
function run(query, config, services) {
  var q = String(query || "")
  if (!q.trim()) return []
  if (q.trim() === "?") return help(config, services)
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
        title: String(row.title || ""),
        subtitle: String(row.subtitle || ""),
        copy: row.copy === undefined ? String(row.title || "") : String(row.copy),
        run: row.run || null,
        complete: row.complete || "",
        select: !!row.select,
        score: typeof row.score === "number" ? row.score : 50,
        order: order,
        seq: rows.length
      })
    }
  }

  rows = rows.concat(commandRows(q, config, services, rows))

  rows.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score
    if (a.order !== b.order) return a.order - b.order
    return a.seq - b.seq
  })
  return rows
}
