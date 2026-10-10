.pragma library

// Opens what you type when it's a web address: a full http(s) link, a domain
// like example.com, or a local server like localhost:3000. Only http and https
// are ever opened, and nothing is fetched until Enter.
//
//   example.com · localhost:3000 · https://omarchy.org/news

// Common domain endings. File extensions that are also country domains
// (.sh, .md, .py, .rs, .js, .pl, .cc, .ly) are left out so a file name isn't
// taken for a site.
var TLDS = ("com net org io dev app ai co me gg xyz info biz edu gov mil int eu asia " +
            "uk de fr nl es it se no fi dk ch at be cz ie pt gr ru ua jp cn kr in lk au nz ca us br mx ar za ng ke " +
            "tv fm to site online tech blog page link news store shop cloud wiki social").split(" ")

var LOCAL = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[a-z0-9-]+\.localhost|[a-z0-9-]+\.local)(:\d{1,5})?([\/?#]\S*)?$/i
var IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(:\d{1,5})?([\/?#]\S*)?$/

// An IP address: one on your own network ("192.168.1.1"), or any with a port
// or a path, so a version number like "1.2.3.4" isn't opened.
function isIp(t) {
  var m = t.match(IPV4)
  if (!m || m.slice(1, 5).some(function(n) { return Number(n) > 255 })) return false
  var a = Number(m[1]), b = Number(m[2])
  var own = a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
  return own || !!m[5] || !!m[6]
}
var DOMAIN = /^((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,24}))(:\d{1,5})?([\/?#]\S*)?$/i

// The address to open, or "" when the text isn't one.
function address(text) {
  var t = String(text || "").trim()
  if (!t || /\s/.test(t) || t.length > 2048) return ""
  if (/^https?:\/\/[^\/\s]+/i.test(t)) return t
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return ""   // other schemes stay closed
  if (LOCAL.test(t) || isIp(t)) return "http://" + t
  var m = t.match(DOMAIN)
  if (m && TLDS.indexOf(m[2].toLowerCase()) !== -1) return "https://" + t
  return ""
}

var provider = {
  id: "url",
  name: "Web address",
  icon: "󰖟",
  help: [
    { id: "url", title: "Web address", about: "Type an address and Enter opens it in your browser",
      examples: [{ q: "example.com", note: "Opens https://example.com" },
                 { q: "localhost:3000", note: "Opens http://localhost:3000" }] }
  ],
  match: function(query) {
    var url = address(query)
    if (!url) return []
    return [{
      title: "Open " + url.replace(/^https?:\/\//i, ""),
      subtitle: url,
      score: 92,
      copy: url,
      run: { kind: "open", target: url, label: "open" }
    }]
  }
}
