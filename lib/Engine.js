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

// "?" — what the bar can do. Each provider describes itself with `help`
// (an array, or a function of ctx for config-driven lists like commands),
// so new providers show up here without touching this code.
function help(config, services) {
  var rows = []
  // Built-in features first, config-driven lists (keyword commands) last.
  var all = enabledProviders(config)
  var providers = all.filter(function(p) { return typeof p.help !== "function" })
    .concat(all.filter(function(p) { return typeof p.help === "function" }))
  for (var i = 0; i < providers.length; i++) {
    var p = providers[i]
    var entries = p.help
    if (typeof entries === "function") {
      try { entries = entries(contextFor(p, config, services)) }
      catch (e) { console.warn("commandbar: help for " + p.id + " failed: " + e); entries = [] }
    }
    for (var j = 0; entries && j < entries.length; j++) {
      var h = entries[j]
      rows.push({
        provider: p.id,
        providerName: p.name,
        icon: h.icon || p.icon || "",
        title: h.label || h.example,
        subtitle: p.name + " · " + h.text,
        copy: "",
        run: null,
        complete: h.example,
        score: 0,
        order: i,
        seq: rows.length
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
        score: typeof row.score === "number" ? row.score : 50,
        order: order,
        seq: rows.length
      })
    }
  }

  rows.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score
    if (a.order !== b.order) return a.order - b.order
    return a.seq - b.seq
  })
  return rows
}
