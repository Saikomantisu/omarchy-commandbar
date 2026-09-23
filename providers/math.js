.pragma library

// Calculator. A tokenizer + recursive-descent parser — never eval().
//
//   expr    := term (("+" | "-") term)*          a + b% means a * (1 + b/100)
//   term    := unary (("*" | "/" | "mod" | "of" | implicit) unary)*
//   unary   := ("-" | "+") unary | power
//   power   := postfix ("^" unary)?              right-associative; -2^2 = -4
//   postfix := primary ("%" | "!")*
//   primary := number | constant | func "(" args ")" | "(" expr ")"

var CONSTANTS = { pi: Math.PI, "π": Math.PI, e: Math.E, tau: Math.PI * 2 }

var FUNCTIONS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  round: Math.round, floor: Math.floor, ceil: Math.ceil,
  log: function(x) { return Math.log(x) / Math.LN10 },
  ln: Math.log, log2: function(x) { return Math.log(x) / Math.LN2 },
  exp: Math.exp,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  min: Math.min, max: Math.max
}

function tokenize(src) {
  var tokens = []
  var i = 0
  var parens = []   // true for a function-call paren, where "," separates args
  while (i < src.length) {
    var c = src[i]
    if (/\s/.test(c)) { i++; continue }

    if (/[0-9.]/.test(c)) {
      var num = ""
      while (i < src.length) {
        var ch = src[i]
        if (/[0-9.]/.test(ch)) { num += ch; i++; continue }
        if (ch === "_" && /[0-9]/.test(src[i + 1] || "")) { i++; continue }
        // "1,000" is a thousands separator unless we're inside min(…)/max(…).
        var inCall = parens.length > 0 && parens[parens.length - 1]
        if (ch === "," && !inCall && /^[0-9]{3}(?![0-9])/.test(src.slice(i + 1))) { i++; continue }
        if ((ch === "e" || ch === "E") && /^[+-]?[0-9]/.test(src.slice(i + 1))) {
          num += "e"; i++
          if (src[i] === "+" || src[i] === "-") { num += src[i]; i++ }
          continue
        }
        break
      }
      if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(num)) throw "bad number"
      tokens.push({ t: "num", v: parseFloat(num) })
      continue
    }

    // "3x4" / "3 x 4": a lone x after an operand is multiplication, not a word.
    var prev = tokens[tokens.length - 1]
    if ((c === "x" || c === "X") && prev && (prev.t === "num" || prev.t === "const" || prev.t === ")")
        && !/[a-z]/i.test(src[i + 1] || "")) {
      tokens.push({ t: "op", v: "*" }); i++; continue
    }

    if (/[a-zπ]/i.test(c)) {
      var word = ""
      while (i < src.length && /[a-z0-9π]/i.test(src[i])) word += src[i++]
      word = word.toLowerCase()
      if (word === "mod" || word === "of") tokens.push({ t: "op", v: word })
      else if (FUNCTIONS[word]) tokens.push({ t: "fn", v: word })
      else if (CONSTANTS[word] !== undefined) tokens.push({ t: "const", v: word })
      else throw "unknown word"
      continue
    }

    if (c === "(") {
      parens.push(tokens.length > 0 && tokens[tokens.length - 1].t === "fn")
      tokens.push({ t: "(" }); i++; continue
    }
    if (c === ")") { parens.pop(); tokens.push({ t: ")" }); i++; continue }
    if (c === ",") { tokens.push({ t: "," }); i++; continue }

    var ops = { "+": "+", "-": "-", "−": "-", "*": "*", "×": "*", "/": "/", "÷": "/", "^": "^", "%": "%", "!": "!" }
    if (ops[c]) { tokens.push({ t: "op", v: ops[c] }); i++; if (c === "*" && src[i] === "*") { tokens[tokens.length - 1].v = "^"; i++ } continue }

    throw "unexpected character"
  }
  return tokens
}

function Parser(tokens) {
  this.tokens = tokens
  this.pos = 0
  this.sawOperation = false
}

Parser.prototype.peek = function() { return this.tokens[this.pos] }
Parser.prototype.next = function() { return this.tokens[this.pos++] }
Parser.prototype.isOp = function(v) { var t = this.peek(); return !!t && t.t === "op" && t.v === v }

Parser.prototype.startsOperand = function(tok) {
  return !!tok && (tok.t === "num" || tok.t === "const" || tok.t === "fn" || tok.t === "(")
}

Parser.prototype.expr = function() {
  var left = this.term()
  while (this.isOp("+") || this.isOp("-")) {
    var op = this.next().v
    var right = this.term()
    this.sawOperation = true
    if (right.pct) {
      var factor = op === "+" ? 1 + right.v : 1 - right.v
      left = { v: left.v * factor }
    } else {
      left = { v: op === "+" ? left.v + right.v : left.v - right.v }
    }
  }
  return left
}

Parser.prototype.term = function() {
  var left = this.unary()
  while (true) {
    var tok = this.peek()
    var op = null
    if (tok && tok.t === "op" && (tok.v === "*" || tok.v === "/" || tok.v === "mod" || tok.v === "of")) op = this.next().v
    else if (this.startsOperand(tok)) op = "*"   // implicit: 2pi, 3(4+1)
    else break
    var right = this.unary()
    this.sawOperation = true
    if (op === "*" || op === "of") left = { v: left.v * right.v }
    else if (op === "/") left = { v: left.v / right.v }
    else left = { v: ((left.v % right.v) + right.v) % right.v }
  }
  return left
}

Parser.prototype.unary = function() {
  if (this.isOp("-")) { this.next(); var v = this.unary(); return { v: -v.v, pct: v.pct } }
  if (this.isOp("+")) { this.next(); return this.unary() }
  return this.power()
}

Parser.prototype.power = function() {
  var base = this.postfix()
  if (this.isOp("^")) {
    this.next()
    var exp = this.unary()
    this.sawOperation = true
    return { v: Math.pow(base.v, exp.v) }
  }
  return base
}

Parser.prototype.postfix = function() {
  var val = this.primary()
  while (true) {
    if (this.isOp("%")) {
      // "%" is a percentage unless an operand follows it, then it's modulo.
      var after = this.tokens[this.pos + 1]
      if (this.startsOperand(after)) {
        this.next()
        var rhs = this.power()
        this.sawOperation = true
        val = { v: ((val.v % rhs.v) + rhs.v) % rhs.v }
        continue
      }
      this.next()
      this.sawOperation = true
      val = { v: val.v / 100, pct: true }
    } else if (this.isOp("!")) {
      this.next()
      this.sawOperation = true
      val = { v: factorial(val.v) }
    } else {
      return val
    }
  }
}

Parser.prototype.primary = function() {
  var tok = this.next()
  if (!tok) throw "unexpected end"
  if (tok.t === "num") return { v: tok.v }
  if (tok.t === "const") { this.sawOperation = true; return { v: CONSTANTS[tok.v] } }
  if (tok.t === "(") {
    var inner = this.expr()
    if (!this.peek() || this.next().t !== ")") throw "missing )"
    return { v: inner.v }
  }
  if (tok.t === "fn") {
    this.sawOperation = true
    var open = this.next()
    if (!open || open.t !== "(") throw "expected ("
    var args = [this.expr().v]
    while (this.peek() && this.peek().t === ",") { this.next(); args.push(this.expr().v) }
    if (!this.peek() || this.next().t !== ")") throw "missing )"
    return { v: FUNCTIONS[tok.v].apply(null, args) }
  }
  throw "unexpected token"
}

function factorial(n) {
  if (n < 0 || n !== Math.floor(n) || n > 170) throw "bad factorial"
  var r = 1
  for (var i = 2; i <= n; i++) r *= i
  return r
}

// Returns { value, trivial } or null when the text isn't a complete expression.
// `trivial` is true for a bare number, which the calculator shouldn't echo back.
function evaluate(src) {
  var text = String(src || "").trim()
  if (!text) return null
  try {
    var tokens = tokenize(text)
    if (tokens.length === 0) return null
    var p = new Parser(tokens)
    var result = p.expr()
    if (p.pos !== tokens.length) return null
    if (typeof result.v !== "number" || isNaN(result.v)) return null
    return { value: result.v, trivial: !p.sawOperation }
  } catch (e) {
    return null
  }
}

var provider = {
  id: "math",
  name: "Calculator",
  icon: "󰃬",
  commands: [
    { title: "Calculator", keywords: "calculate calc math maths sum arithmetic", text: "Arithmetic, percentages, powers, functions", complete: "12*8 + 15%", select: true }
  ],
  help: [
    { example: "12*8 + 15%", text: "Arithmetic, percentages, powers (^), mod, n!" },
    { example: "sqrt(2) * pi", text: "Functions: sqrt log ln sin cos tan abs round min max…" }
  ],
  match: function(query, ctx) {
    var text = query.replace(/=\s*$/, "")
    var r = evaluate(text)
    if (!r || r.trivial) return []
    if (!isFinite(r.value)) {
      return [{ title: r.value > 0 ? "∞" : (r.value < 0 ? "-∞" : "undefined"), subtitle: "Calculator", score: 60, copy: String(r.value) }]
    }
    var precision = (ctx.settings && ctx.settings.precision) || 10
    var rounded = Number(r.value.toPrecision(precision))
    return [{
      title: ctx.format(rounded),
      subtitle: "= " + text.trim(),
      score: 80,
      copy: ctx.plain(rounded)
    }]
  }
}
