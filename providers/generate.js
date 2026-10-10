.pragma library

// Small things developers reach for: a UUID, a hash of some text, base64 and
// URL encoding. All worked out here, offline; Enter copies the answer.
//
//   uuid · sha256 hello · md5 hello · base64 hello · base64 aGVsbG8= · urlencode a b&c
//
// The text is hashed or encoded exactly as typed after the keyword and its
// space, as UTF-8.

// ---------------------------------------------------------------- UTF-8

function utf8Encode(str) {
  var out = []
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i)
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
      var lo = str.charCodeAt(i + 1)
      if (lo >= 0xdc00 && lo < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00); i++ }
    }
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return out
}

// The text the bytes spell, or null when they aren't valid UTF-8.
function utf8Decode(bytes) {
  var out = ""
  for (var i = 0; i < bytes.length;) {
    var b = bytes[i], n = 0, c = 0
    if (b < 0x80) { c = b; n = 0 }
    else if ((b & 0xe0) === 0xc0) { c = b & 31; n = 1 }
    else if ((b & 0xf0) === 0xe0) { c = b & 15; n = 2 }
    else if ((b & 0xf8) === 0xf0) { c = b & 7; n = 3 }
    else return null
    for (var k = 1; k <= n; k++) {
      var cont = bytes[i + k]
      if (cont === undefined || (cont & 0xc0) !== 0x80) return null
      c = (c << 6) | (cont & 63)
    }
    i += n + 1
    if (c >= 0x10000) { c -= 0x10000; out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 1023)) }
    else out += String.fromCharCode(c)
  }
  return out
}

// ---------------------------------------------------------------- base64

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function base64Encode(bytes) {
  var out = ""
  for (var i = 0; i < bytes.length; i += 3) {
    var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0)
    out += B64.charAt(n >> 18) + B64.charAt((n >> 12) & 63)
      + (i + 1 < bytes.length ? B64.charAt((n >> 6) & 63) : "=")
      + (i + 2 < bytes.length ? B64.charAt(n & 63) : "=")
  }
  return out
}

// The bytes, or null when the text isn't base64. URL-safe base64 (- and _)
// and missing padding are accepted.
function base64Decode(text) {
  var t = String(text).replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/")
  if (!/^[A-Za-z0-9+\/]*={0,2}$/.test(t)) return null
  t = t.replace(/=+$/, "")
  if (t.length % 4 === 1) return null
  var out = []
  for (var i = 0; i < t.length; i += 4) {
    var n = 0, got = 0
    for (var k = 0; k < 4; k++) {
      var ch = t.charAt(i + k)
      n = n << 6
      if (ch) { n |= B64.indexOf(ch); got++ }
    }
    out.push((n >> 16) & 255)
    if (got > 2) out.push((n >> 8) & 255)
    if (got > 3) out.push(n & 255)
  }
  return out
}

// ---------------------------------------------------------------- hashes

function hex(words, littleEndian) {
  var out = ""
  for (var i = 0; i < words.length; i++)
    for (var b = 0; b < 4; b++) {
      var byte = littleEndian ? (words[i] >>> (b * 8)) & 255 : (words[i] >>> (24 - b * 8)) & 255
      out += (byte < 16 ? "0" : "") + byte.toString(16)
    }
  return out
}

// Pads a message the way MD5 and SHA do: a 1 bit, zeros, then the length in
// bits as 64 bits (little-endian for MD5, big-endian for SHA).
function pad(bytes, littleEndian) {
  var msg = bytes.slice()
  var bits = bytes.length * 8
  msg.push(0x80)
  while (msg.length % 64 !== 56) msg.push(0)
  var hi = Math.floor(bits / 4294967296), lo = bits >>> 0
  var len = []
  for (var b = 0; b < 4; b++) len.push((lo >>> (b * 8)) & 255)
  for (b = 0; b < 4; b++) len.push((hi >>> (b * 8)) & 255)
  return msg.concat(littleEndian ? len : len.reverse())
}

function rotl(x, n) { return (x << n) | (x >>> (32 - n)) }
function rotr(x, n) { return (x >>> n) | (x << (32 - n)) }

var MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
var MD5_K = []
for (var mk = 0; mk < 64; mk++) MD5_K.push(Math.floor(Math.abs(Math.sin(mk + 1)) * 4294967296) >>> 0)

function md5(bytes) {
  var msg = pad(bytes, true)
  var h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]
  for (var o = 0; o < msg.length; o += 64) {
    var m = []
    for (var j = 0; j < 16; j++) m.push(msg[o + j * 4] | (msg[o + j * 4 + 1] << 8) | (msg[o + j * 4 + 2] << 16) | (msg[o + j * 4 + 3] << 24))
    var a = h[0], b = h[1], c = h[2], d = h[3]
    for (var i = 0; i < 64; i++) {
      var f, g
      if (i < 16) { f = (b & c) | (~b & d); g = i }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16 }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16 }
      else { f = c ^ (b | ~d); g = (7 * i) % 16 }
      f = (f + a + MD5_K[i] + m[g]) | 0
      a = d; d = c; c = b
      b = (b + rotl(f, MD5_S[(i >> 4) * 4 + (i % 4)])) | 0
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0
  }
  return hex(h, true)
}

function bigEndianWords(msg, o) {
  var w = []
  for (var j = 0; j < 16; j++) w.push((msg[o + j * 4] << 24) | (msg[o + j * 4 + 1] << 16) | (msg[o + j * 4 + 2] << 8) | msg[o + j * 4 + 3])
  return w
}

function sha1(bytes) {
  var msg = pad(bytes, false)
  var h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  for (var o = 0; o < msg.length; o += 64) {
    var w = bigEndianWords(msg, o)
    for (var t = 16; t < 80; t++) w.push(rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1))
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4]
    for (var i = 0; i < 80; i++) {
      var f, k
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999 }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1 }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc }
      else { f = b ^ c ^ d; k = 0xca62c1d6 }
      var temp = (rotl(a, 5) + f + e + k + w[i]) | 0
      e = d; d = c; c = rotl(b, 30); b = a; a = temp
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0
  }
  return hex(h, false)
}

var SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]

function sha256(bytes) {
  var msg = pad(bytes, false)
  var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  for (var o = 0; o < msg.length; o += 64) {
    var w = bigEndianWords(msg, o)
    for (var t = 16; t < 64; t++) {
      var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)
      var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)
      w.push((w[t - 16] + s0 + w[t - 7] + s1) | 0)
    }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7]
    for (var i = 0; i < 64; i++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      var ch = (e & f) ^ (~e & g)
      var t1 = (hh + S1 + ch + SHA256_K[i] + w[i]) | 0
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      var maj = (a & b) ^ (a & c) ^ (b & c)
      var t2 = (S0 + maj) | 0
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0
  }
  return hex(h, false)
}

// ---------------------------------------------------------------- uuid

// A version 4 UUID. Math.random is fine for an identifier, not for a secret.
function uuid(random) {
  var r = random || Math.random
  var s = ""
  for (var i = 0; i < 32; i++) {
    var n = Math.floor(r() * 16)
    if (i === 12) n = 4
    else if (i === 16) n = 8 + (n & 3)
    s += n.toString(16)
    if (i === 7 || i === 11 || i === 15 || i === 19) s += "-"
  }
  return s
}

// ---------------------------------------------------------------- provider

var HASHES = { md5: ["MD5", md5], sha1: ["SHA-1", sha1], sha256: ["SHA-256", sha256] }

// The UUID on screen, kept while the query stays the same, so a refresh from
// another feature (a window opening, files found) doesn't swap it under you.
var held = { query: "", id: "" }

// Decoded text worth showing: valid UTF-8 without control characters.
function printable(text) { return text !== null && text !== "" && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) }

function shown(text) { return "\"" + (text.length > 40 ? text.slice(0, 40) + "…" : text) + "\"" }

function answer(title, subtitle, score) { return { title: title, subtitle: subtitle, score: score, copy: title } }

var provider = {
  id: "generate",
  name: "Generate",
  icon: "󰙴",
  commands: [
    { title: "Generate a UUID", keywords: "uuid guid id random generate", text: "A random version 4 UUID", complete: "uuid", select: true },
    { title: "Hash text", keywords: "hash md5 sha1 sha256 checksum digest", text: "MD5, SHA-1 or SHA-256 of what you type", complete: "sha256 " },
    { title: "Base64 encode or decode", keywords: "base64 b64 encode decode", text: "Type base64 and the text", complete: "base64 " },
    { title: "URL encode or decode", keywords: "url encode decode percent escape", text: "Type urlencode or urldecode and the text", complete: "urlencode " }
  ],
  help: [
    { id: "generate", title: "Generate and encode", about: "UUIDs, hashes, base64 and URL encoding, worked out offline",
      examples: [{ q: "uuid", note: "A new random UUID every time" }, "sha256 hello", "md5 hello", "base64 hello", "base64 aGVsbG8=", "urlencode a b&c"] }
  ],
  match: function(query, ctx) {
    if (query !== held.query) held = { query: query, id: "" }
    var m = query.match(/^\s*([a-z0-9]+)(?:\s(.*))?$/i)
    if (!m) return []
    var word = m[1].toLowerCase()
    var text = m[2] === undefined ? "" : m[2].replace(/^\s+/, "")
    if ((ctx.keywords || []).indexOf(word) !== -1) return []

    if ((word === "uuid" || word === "guid") && !text.trim()) {
      if (!held.id) held.id = uuid()
      return [answer(held.id, "Random UUID (version 4)", 95)]
    }

    if (Object.prototype.hasOwnProperty.call(HASHES, word)) {
      if (!text) return [{ title: "Type the text to hash after \"" + word + " \"", subtitle: HASHES[word][0], score: 40, copy: "" }]
      return [answer(HASHES[word][1](utf8Encode(text)), HASHES[word][0] + " of " + shown(text), 95)]
    }

    if (word === "base64" || word === "b64") {
      if (!text) return [{ title: "Type the text after \"" + word + " \"", subtitle: "Base64 encodes it, or decodes base64", score: 40, copy: "" }]
      var out = [answer(base64Encode(utf8Encode(text)), "Base64 of " + shown(text), 95)]
      var bytes = /^[A-Za-z0-9+\/_=-]{4,}$/.test(text.trim()) ? base64Decode(text) : null
      var decoded = bytes ? utf8Decode(bytes) : null
      // Text that decodes cleanly was most likely base64 to begin with.
      if (printable(decoded)) out.unshift(answer(decoded, "Decoded from base64", 95.5))
      return out
    }

    if (word === "urlencode" || word === "urldecode") {
      if (!text) return [{ title: "Type the text after \"" + word + " \"", subtitle: "URL encoding", score: 40, copy: "" }]
      if (word === "urlencode") return [answer(encodeURIComponent(text), "URL-encoded " + shown(text), 95)]
      try { return [answer(decodeURIComponent(text.replace(/\+/g, " ")), "URL-decoded " + shown(text), 95)] }
      catch (e) { return [{ title: "Not valid URL encoding", subtitle: shown(text), score: 40, copy: "" }] }
    }
    return []
  }
}
