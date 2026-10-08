import Quickshell.Io
import QtQuick

// Exchange rates. refresh() is called by the currency provider
// (ctx.requestRates) only while a currency query is on screen, so someone who
// never converts money never contacts the API. open.er-api.com says when its
// next daily update is, and the cache is refetched only after that. Failed
// attempts back off for ten minutes; the last good file keeps working offline.
Item {
  id: rates
  required property var cache
  readonly property string url: "https://open.er-api.com/v6/latest/USD"
  readonly property int maxBytes: 256 * 1024

  property var latest: null         // { rates, updated, next, stale }
  property string status: ""
  property real attemptAt: 0

  signal updated()

  function refresh() {
    if (proc.running) return
    var now = Date.now()
    if (rates.latest && rates.latest.next && now < rates.latest.next * 1000) return
    if (now - rates.attemptAt < 10 * 60 * 1000) return
    rates.attemptAt = now
    if (!rates.latest) rates.status = "Fetching exchange rates…"
    proc.running = true
  }

  function load(raw) {
    try {
      var data = JSON.parse(raw)
      if (data.result !== "success" || !data.rates) throw "unexpected response"
      rates.latest = {
        rates: data.rates,
        updated: data.time_last_update_unix,
        next: data.time_next_update_unix,
        stale: Date.now() > (data.time_next_update_unix + 86400) * 1000
      }
      rates.status = ""
    } catch (e) {
      if (raw) console.warn("commandbar: bad rates cache: " + e)
    }
    rates.updated()
  }

  Component.onCompleted: rates.cache.read("rates.json", rates.load)

  Process {
    id: proc
    // Size-capped download: curl aborts past the limit and head cuts the stream
    // even without a Content-Length. Only a complete download reaches the
    // helper, which refuses anything over the cap or that isn't JSON, so the
    // last good rates.json stays in place.
    command: ["bash", "-c",
      "set -o pipefail; d=$(curl -fsS --max-time 8 --max-filesize \"$3\" \"$2\" | head -c \"$(($3 + 1))\") " +
      "&& printf '%s' \"$d\" | python3 \"$1\" write rates.json",
      "_", rates.cache.helper, rates.url, String(rates.maxBytes)]
    onExited: function(exitCode) {
      if (exitCode !== 0) {
        rates.status = rates.latest ? "" : "Couldn't reach open.er-api.com"
        rates.updated()
      } else {
        rates.cache.read("rates.json", rates.load)
      }
    }
  }
}
