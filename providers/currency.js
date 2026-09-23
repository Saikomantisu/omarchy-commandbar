.pragma library
.import "math.js" as Calc

// Currency converter. Rates (USD-based) are fetched and cached by
// CommandBar.qml and arrive here as ctx.rates = { rates, updated, stale }.
//
//   100 usd to lkr · 100usd in eur · $50 · €20 to inr · 50 eur · usd lkr · 12*50 usd

var SYMBOLS = { "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", "රු": "LKR", "₩": "KRW", "₽": "RUB", "₺": "TRY", "฿": "THB", "₱": "PHP", "₫": "VND", "₪": "ILS" }

var NAMES = {
  dollar: "USD", dollars: "USD", bucks: "USD", euro: "EUR", euros: "EUR",
  pound: "GBP", pounds: "GBP", quid: "GBP", yen: "JPY", yuan: "CNY", rmb: "CNY",
  rs: "RUPEE", rupee: "RUPEE", rupees: "RUPEE", dirham: "AED", dirhams: "AED",
  ringgit: "MYR", baht: "THB", won: "KRW", franc: "CHF", francs: "CHF"
}

// Used before the first rates download so the parser still recognises codes.
var COMMON = ["USD", "EUR", "GBP", "JPY", "CNY", "INR", "LKR", "AUD", "CAD", "CHF", "SGD", "AED", "SAR", "MYR", "THB", "KRW", "NZD", "HKD", "SEK", "NOK", "DKK", "PKR", "BDT", "NPR", "MVR", "QAR", "KWD", "OMR", "BHD"]

// "rupee"/"rs" mean your home currency when it's a rupee, else INR.
var RUPEES = ["INR", "LKR", "PKR", "NPR", "MUR", "SCR"]
var homeCurrency = "USD"

var TARGET_SEP = /\s+(?:to|in|into|as|->|=>|=)\s*$/

function knownCode(word, rates) {
  if (!word) return null
  var w = word.toLowerCase()
  if (SYMBOLS[word]) return SYMBOLS[word]
  if (NAMES[w] === "RUPEE") return RUPEES.indexOf(homeCurrency) !== -1 ? homeCurrency : "INR"
  if (NAMES[w]) return NAMES[w]
  var up = word.toUpperCase()
  if (!/^[A-Z]{3}$/.test(up)) return null
  if (rates && rates[up] !== undefined) return up
  if (!rates && COMMON.indexOf(up) !== -1) return up
  return null
}

// Pull a currency token off the start or end of `text`.
// Returns { code, rest } or null.
function takeCurrency(text, fromEnd, rates) {
  var m
  if (fromEnd) m = text.match(/^(.*?)\s*([A-Za-z]{2,8}|[$€£¥₹₩₽₺฿₱₫₪]|රු)$/)
  else m = text.match(/^([A-Za-z]{2,8}(?![A-Za-z])|[$€£¥₹₩₽₺฿₱₫₪]|රු)\s*(.*)$/)
  if (!m) return null
  var word = fromEnd ? m[2] : m[1]
  var rest = fromEnd ? m[1] : m[2]
  var code = knownCode(word, rates)
  if (!code) return null
  return { code: code, rest: rest.trim() }
}

function parse(query, rates) {
  var text = query.trim()
  var target = null

  // Explicit target: "... to lkr"
  var t = takeCurrency(text, true, rates)
  if (t && TARGET_SEP.test(" " + t.rest)) {
    target = t.code
    text = (" " + t.rest).replace(TARGET_SEP, "").trim()
  }

  // Source currency: "$50", "usd 50", "50 usd", "50usd".
  var source = null
  var amountText = text
  var s = takeCurrency(text, false, rates)
  if (s) { source = s.code; amountText = s.rest }
  else {
    s = takeCurrency(text, true, rates)
    if (s) { source = s.code; amountText = s.rest }
  }
  if (!source) return null

  // "usd lkr" — two bare codes, implied amount of 1.
  if (!target && amountText) {
    var bare = takeCurrency(amountText, true, rates)
    if (bare && !bare.rest) { target = bare.code; amountText = "" }
  }

  var amount = 1
  if (amountText) {
    var r = Calc.evaluate(amountText)
    if (!r || !isFinite(r.value)) return null
    amount = r.value
  } else if (!target) {
    return null   // a lone "usd" is too ambiguous to answer
  }
  return { amount: amount, from: source, to: target }
}

function convert(amount, from, to, rates) {
  if (!rates || rates[from] === undefined || rates[to] === undefined) return null
  return amount / rates[from] * rates[to]
}

var provider = {
  id: "currency",
  name: "Currency",
  icon: "󰁰",
  commands: function(ctx) {
    var home = String((ctx.settings && ctx.settings.home) || "USD").toLowerCase()
    var example = home === "usd" ? "100 eur to usd" : "100 usd to " + home
    return [{ title: "Convert Currency", keywords: "currency exchange rate rates money forex fx", text: "Live exchange rates, cached offline", complete: example, select: true }]
  },
  help: [
    { example: "100 usd to eur", text: "Convert between currencies (also “in”, $50, €20)" },
    { example: "50 eur", text: "Amount in your home and favorite currencies" }
  ],
  match: function(query, ctx) {
    var settings = ctx.settings || {}
    homeCurrency = String(settings.home || "USD").toUpperCase()
    var data = ctx.rates
    var rates = data && data.rates
    var q = parse(query, rates)
    if (!q) return []

    if (!rates) {
      return [{ title: "Fetching exchange rates…", subtitle: ctx.ratesStatus || "No cached rates yet", score: 40, copy: "" }]
    }

    var targets = []
    if (q.to) targets.push(q.to)
    else {
      if (q.from !== homeCurrency) targets.push(homeCurrency)
      var favs = settings.favorites || []
      for (var i = 0; i < favs.length; i++) {
        var f = String(favs[i]).toUpperCase()
        if (f !== q.from && targets.indexOf(f) === -1) targets.push(f)
      }
    }

    var asOf = data.updated ? "rates as of " + ctx.formatDate(data.updated) : ""
    if (data.stale) asOf += " (stale)"

    var out = []
    for (var j = 0; j < targets.length; j++) {
      var value = convert(q.amount, q.from, targets[j], rates)
      if (value === null) continue
      var rounded = Math.round(value * 100) / 100
      if (Math.abs(value) < 1 && value !== 0) rounded = Number(value.toPrecision(4))
      out.push({
        title: ctx.format(rounded) + " " + targets[j],
        subtitle: ctx.format(q.amount) + " " + q.from + " → " + targets[j] + (asOf ? " · " + asOf : ""),
        score: 90 - j,
        copy: ctx.plain(rounded)
      })
    }
    return out
  }
}
