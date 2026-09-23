.pragma library
.import "../lib/tzcities.js" as Tz

// Time zones and date maths.
//
// Zone offsets come from ctx.zones = { "Asia/Tokyo": { offset: 540, abbr: "JST" } },
// probed with `date` by CommandBar.qml — V4's Intl/timeZone support is too thin
// to trust for DST. Offsets are "right now", which is what these queries mean.
//
//   time · time in tokyo · tokyo time · 3pm lkt to pst · 15:30 in london
//   days until dec 25 · today + 45 days · 2026-01-01 to 2026-09-23 · next friday

var DAY_MS = 86400000
var WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
var WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
var MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function pad(n) { return (n < 10 ? "0" : "") + n }

// ---------------------------------------------------------------- zones

function resolveZone(name, ctx) {
  var key = String(name || "").trim().toLowerCase()
  if (!key) return null
  if (key === "here" || key === "local" || key === "home") return homeZone(ctx)
  if (Tz.CITIES[key]) return Tz.CITIES[key]
  for (var z in ctx.zones) {
    if (z.toLowerCase() === key) return z
    var city = z.split("/").pop().replace(/_/g, " ").toLowerCase()
    if (city === key) return z
  }
  return null
}

function homeZone(ctx) {
  return (ctx.settings && ctx.settings.home) || "UTC"
}

function zoneLabel(zone) {
  if (zone === "UTC") return "UTC"
  return zone.split("/").pop().replace(/_/g, " ")
}

// A Date whose UTC fields read as wall-clock time in `zone`.
function wall(utcMs, zone, ctx) {
  return new Date(utcMs + ctx.zones[zone].offset * 60000)
}

function clock(d, ctx) {
  var h = d.getUTCHours(), m = d.getUTCMinutes()
  if (ctx.settings && ctx.settings.clock24 === false) {
    var suffix = h < 12 ? "am" : "pm"
    h = h % 12 || 12
    return h + ":" + pad(m) + " " + suffix
  }
  return pad(h) + ":" + pad(m)
}

function wallDay(d) { return Math.floor(d.getTime() / DAY_MS) }

function dayShift(targetWall, refWall) {
  var diff = wallDay(targetWall) - wallDay(refWall)
  if (diff === 0) return ""
  if (diff === 1) return " (+1 day)"
  if (diff === -1) return " (−1 day)"
  return " (" + (diff > 0 ? "+" : "−") + Math.abs(diff) + " days)"
}

function offsetText(minutes) {
  var sign = minutes < 0 ? "−" : "+"
  var abs = Math.abs(minutes)
  return "UTC" + sign + Math.floor(abs / 60) + (abs % 60 ? ":" + pad(abs % 60) : "")
}

function zoneRow(zone, utcMs, ctx, score) {
  var w = wall(utcMs, zone, ctx)
  var home = homeZone(ctx)
  var shift = ctx.zones[home] ? dayShift(w, wall(utcMs, home, ctx)) : ""
  var info = ctx.zones[zone]
  return {
    title: clock(w, ctx) + " " + zoneLabel(zone) + shift,
    subtitle: WD_SHORT[w.getUTCDay()] + ", " + w.getUTCDate() + " " + MON_SHORT[w.getUTCMonth()]
      + " · " + (info.abbr && !/^[+-]/.test(info.abbr) ? info.abbr + " · " : "") + offsetText(info.offset),
    score: score,
    copy: clock(w, ctx)
  }
}

function pending() {
  return [{ title: "Looking up time zones…", subtitle: "Time", score: 30, copy: "" }]
}

function matchZones(q, ctx) {
  var nowMs = ctx.now().getTime()
  var ready = ctx.zones && Object.keys(ctx.zones).length > 0

  if (/^(time|now|clock|times)$/.test(q)) {
    if (!ready) return pending()
    var zones = [homeZone(ctx)].concat((ctx.settings && ctx.settings.zones) || [])
    var rows = []
    for (var i = 0; i < zones.length; i++) {
      if (ctx.zones[zones[i]] && (i === 0 || zones[i] !== zones[0])) rows.push(zoneRow(zones[i], nowMs, ctx, 85 - i))
    }
    return rows
  }

  var m = q.match(/^(?:time|clock|now)\s+(?:in|at)\s+(.+)$/) || q.match(/^what(?:'s| is)? (?:the )?time(?: is it)? in\s+(.+?)\??$/) || q.match(/^(.+?)\s+time$/)
  if (m) {
    var zone = resolveZone(m[1], ctx)
    if (!zone) return []
    if (!ready || !ctx.zones[zone]) return pending()
    return [zoneRow(zone, nowMs, ctx, 88)]
  }

  // "3pm lkt to pst", "15:30 in london", "9am to tokyo"
  m = q.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?:\s+(.+?))?\s+(?:to|in|->|=>)\s+(.+)$/)
  if (m && (m[2] || m[3] || m[4])) {
    var h = parseInt(m[1], 10), min = m[2] ? parseInt(m[2], 10) : 0
    if (m[3]) {
      if (h < 1 || h > 12) return []
      h = (h % 12) + (m[3] === "pm" ? 12 : 0)
    }
    if (h > 23 || min > 59) return []
    var from = m[4] ? resolveZone(m[4], ctx) : homeZone(ctx)
    var to = resolveZone(m[5], ctx)
    if (!from || !to) return []
    if (!ready || !ctx.zones[from] || !ctx.zones[to]) return pending()

    // Today's date as seen in the source zone, at the requested wall time.
    var srcToday = wall(nowMs, from, ctx)
    var srcWallMs = Date.UTC(srcToday.getUTCFullYear(), srcToday.getUTCMonth(), srcToday.getUTCDate(), h, min)
    var utcMs = srcWallMs - ctx.zones[from].offset * 60000
    var srcWall = new Date(srcWallMs)
    var dst = wall(utcMs, to, ctx)
    return [{
      title: clock(dst, ctx) + " " + zoneLabel(to) + dayShift(dst, srcWall),
      subtitle: clock(srcWall, ctx) + " " + zoneLabel(from) + " (" + offsetText(ctx.zones[from].offset) + ") → "
        + zoneLabel(to) + " (" + offsetText(ctx.zones[to].offset) + ")",
      score: 92,
      copy: clock(dst, ctx)
    }]
  }
  return null
}

// ---------------------------------------------------------------- dates

function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }

function monthIndex(word) {
  var w = String(word || "").toLowerCase()
  if (w.length < 3) return -1
  var i = MONTHS.indexOf(w.slice(0, 3))
  if (i === -1) return -1
  // "march" and "mar" are fine, "marble" is not.
  var full = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"][i]
  return (full.indexOf(w) === 0 || (i === 8 && w === "sept")) ? i : -1
}

// Returns { date, hadYear } or null.
function parseDate(s, today) {
  var t = String(s || "").trim().toLowerCase().replace(/\s+/g, " ")
  if (t === "today" || t === "now") return { date: today, hadYear: true }
  if (t === "tomorrow") return { date: addDays(today, 1), hadYear: true }
  if (t === "yesterday") return { date: addDays(today, -1), hadYear: true }
  if (t === "christmas" || t === "xmas") return { date: new Date(today.getFullYear(), 11, 25), hadYear: false }
  if (t === "new year" || t === "new years" || t === "new year's") return { date: new Date(today.getFullYear(), 0, 1), hadYear: false }

  var m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return validDate(+m[1], +m[2] - 1, +m[3], true)

  m = t.match(/^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/)
  if (m && monthIndex(m[1]) !== -1) return validDate(m[3] ? +m[3] : today.getFullYear(), monthIndex(m[1]), +m[2], !!m[3])

  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?(?:,? (\d{4}))?$/)
  if (m && monthIndex(m[2]) !== -1) return validDate(m[3] ? +m[3] : today.getFullYear(), monthIndex(m[2]), +m[1], !!m[3])

  m = t.match(/^(next|this|last|coming)? ?([a-z]+)$/)
  if (m) {
    var wd = WEEKDAYS.indexOf(m[2])
    if (wd === -1) wd = WEEKDAYS.map(function(d) { return d.slice(0, 3) }).indexOf(m[2])
    if (wd !== -1) {
      var diff = (wd - today.getDay() + 7) % 7
      if (m[1] === "last") diff = diff === 0 ? -7 : diff - 7
      else if (m[1] === "next" && diff === 0) diff = 7
      return { date: addDays(today, diff), hadYear: true }
    }
  }
  return null
}

function validDate(y, mo, d, hadYear) {
  var date = new Date(y, mo, d)
  if (date.getMonth() !== mo || date.getDate() !== d) return null
  return { date: date, hadYear: hadYear }
}

function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n) }

function addUnits(d, n, unit) {
  var u = unit.toLowerCase()
  if (/^(d|days?)$/.test(u)) return addDays(d, n)
  if (/^(w|wks?|weeks?)$/.test(u)) return addDays(d, n * 7)
  if (/^(m|mos?|months?)$/.test(u)) return new Date(d.getFullYear(), d.getMonth() + n, d.getDate())
  if (/^(y|yrs?|years?)$/.test(u)) return new Date(d.getFullYear() + n, d.getMonth(), d.getDate())
  return null
}

function daysBetween(a, b) { return Math.round((midnight(b) - midnight(a)) / DAY_MS) }

function formatDate(d) {
  return WD_SHORT[d.getDay()] + ", " + d.getDate() + " " + MON_SHORT[d.getMonth()] + " " + d.getFullYear()
}

function isoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) }

function relative(days) {
  if (days === 0) return "today"
  if (days === 1) return "tomorrow"
  if (days === -1) return "yesterday"
  var n = Math.abs(days)
  var text = n + " days"
  if (n >= 14) text += " (" + Math.floor(n / 7) + "w" + (n % 7 ? " " + (n % 7) + "d" : "") + ")"
  return days > 0 ? "in " + text : text + " ago"
}

function dateRow(date, today, score, note) {
  return {
    title: formatDate(date),
    subtitle: relative(daysBetween(today, date)) + (note ? " · " + note : ""),
    score: score,
    copy: isoDate(date)
  }
}

function countRow(days, a, b, score) {
  var n = Math.abs(days)
  return {
    title: n + (n === 1 ? " day" : " days") + (n >= 14 ? " (" + Math.floor(n / 7) + "w" + (n % 7 ? " " + (n % 7) + "d" : "") + ")" : ""),
    subtitle: formatDate(a) + " → " + formatDate(b),
    score: score,
    copy: String(n)
  }
}

function matchDates(q, ctx) {
  var today = midnight(ctx.now())
  var m

  // "days until dec 25", "until christmas"
  m = q.match(/^(?:how many )?(?:days? )?(?:until|till|til|to|before) (.+?)\??$/)
  if (m) {
    var target = parseDate(m[1], today)
    if (target) {
      var d = target.date
      if (!target.hadYear && d < today) d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate())
      return [countRow(daysBetween(today, d), today, d, 90)]
    }
  }

  // "days since jan 1"
  m = q.match(/^(?:how many )?(?:days? )?since (.+?)\??$/)
  if (m) {
    var since = parseDate(m[1], today)
    if (since) return [countRow(daysBetween(since.date, today), since.date, today, 90)]
  }

  // "today + 45 days", "dec 25 - 2 weeks"
  m = q.match(/^(.+?) ?([+-]) ?(\d+) ?([a-z]+)$/)
  if (m) {
    var base = parseDate(m[1], today)
    var shifted = base && addUnits(base.date, (m[2] === "-" ? -1 : 1) * parseInt(m[3], 10), m[4])
    if (shifted) return [dateRow(shifted, today, 90)]
  }

  // "in 3 weeks", "3 weeks from now", "10 days ago"
  m = q.match(/^in (\d+) ?([a-z]+)$/) || q.match(/^(\d+) ?([a-z]+) (?:from now|from today|later)$/)
  if (m) {
    var ahead = addUnits(today, parseInt(m[1], 10), m[2])
    if (ahead) return [dateRow(ahead, today, 88)]
  }
  m = q.match(/^(\d+) ?([a-z]+) ago$/)
  if (m) {
    var back = addUnits(today, -parseInt(m[1], 10), m[2])
    if (back) return [dateRow(back, today, 88)]
  }

  // "2026-01-01 to 2026-09-23"
  m = q.match(/^(?:days? )?(?:between |from )?(.+?) (?:to|and|until|-|–) (.+)$/)
  if (m) {
    var a = parseDate(m[1], today), b = parseDate(m[2], today)
    if (a && b) return [countRow(daysBetween(a.date, b.date), a.date, b.date, 88)]
  }

  // A bare date: "dec 25", "next friday"
  var bare = parseDate(q, today)
  if (bare && q !== "now") return [dateRow(bare.date, today, 70)]
  return []
}

var provider = {
  id: "time",
  name: "Time",
  icon: "󰥔",
  match: function(query, ctx) {
    var q = query.trim().toLowerCase().replace(/\s+/g, " ")
    var zoneRows = matchZones(q, ctx)
    if (zoneRows !== null) return zoneRows
    return matchDates(q, ctx)
  }
}
