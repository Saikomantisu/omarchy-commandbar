// node tests/run.js — exercises every provider against mocked rates, zones and clock.
const load = require("./loader")
const P = require("path").join(__dirname, "..") + "/"
const Engine = load(P + "lib/Engine.js")
const config = Engine.parseJsonc(require("fs").readFileSync(P + "config.default.json", "utf8"))
const rates = { rates: { USD: 1, LKR: 300.5, EUR: 0.9, INR: 83.2, GBP: 0.78, JPY: 150 }, updated: 1790000000, stale: false }
const zones = { "Asia/Colombo": { offset: 330, abbr: "+0530" }, "UTC": { offset: 0, abbr: "UTC" }, "America/New_York": { offset: -240, abbr: "EDT" }, "Europe/London": { offset: 60, abbr: "BST" }, "America/Los_Angeles": { offset: -420, abbr: "PDT" }, "Asia/Tokyo": { offset: 540, abbr: "JST" } }
const now = () => new Date(2026, 8, 23, 14, 0)   // 23 Sep 2026 14:00 local
let fails = 0
function q(query) { return Engine.run(query, config, { rates, zones, now, ratesStatus: "" }) }
function expect(query, want) {
  const rows = q(query)
  const top = rows[0] ? rows[0].title : "(none)"
  const ok = want === null ? rows.length === 0 : (want instanceof RegExp ? want.test(top) : top === want)
  if (!ok) fails++
  console.log((ok ? "ok  " : "FAIL") + "  " + JSON.stringify(query).padEnd(30) + " → " + top + (rows[0] ? "  | " + rows[0].subtitle : "") + (ok ? "" : "   (want " + want + ")"))
}
expect("2+3*4", "14"); expect("2^10", "1,024"); expect("15% of 200", "30"); expect("200+10%", "220"); expect("200 - 15%", "170")
expect("sqrt(16)", "4"); expect("2pi", "6.283185307"); expect("3(4+1)", "15"); expect("3x4", "12"); expect("10 % 3", "1"); expect("10 mod 4", "2")
expect("0.1+0.2", "0.3"); expect("1,000 * 3", "3,000"); expect("max(1,5,3)", "5"); expect("-2^2", "-4"); expect("5!", "120"); expect("1/0", "∞"); expect("2e3+1", "2,001")
expect("hello", null); expect("42", null); expect("(1+2", null); expect("", null)
expect("100 usd to lkr", "30,050 LKR"); expect("100usd in eur", "90 EUR"); expect("$50", "15,025 LKR"); expect("€20 to inr", /^1,848\.89 INR$/)
expect("50 eur", /LKR$/); expect("usd lkr", "300.5 LKR"); expect("usd to lkr", "300.5 LKR"); expect("12*50 usd", "180,300 LKR"); expect("1 lkr", /USD$/); expect("usd", null)
expect("time", /Colombo/); expect("time in tokyo", /Tokyo/); expect("tokyo time", /Tokyo/); expect("3pm lkt to pst", "02:30 Los Angeles"); expect("15:30 in london", "11:00 London")
expect("9am to tokyo", "12:30 Tokyo"); expect("11pm to tokyo", "02:30 Tokyo (+1 day)")
expect("days until dec 25", /^93 days/); expect("today + 45 days", "Sat, 7 Nov 2026"); expect("2026-01-01 to 2026-09-23", /^265 days/); expect("next friday", "Fri, 25 Sep 2026")
expect("days since jan 1", /^265 days/); expect("in 2 weeks", "Wed, 7 Oct 2026"); expect("until christmas", /^93 days/); expect("dec 25", "Fri, 25 Dec 2026")
expect("g foo bar", "Search Google: foo bar"); expect("g", "Search Google…"); expect("lock", "Lock screen"); expect("lo", "Lock screen")
const helpRows = q("?")
const helpOk = helpRows.length === 12 && helpRows[0].title === "12*8 + 15%" && helpRows[7].title === "g …" && helpRows[7].complete === "g " && helpRows.some(r => r.complete === "100 usd to lkr") && helpRows.every(r => !r.copy && !r.run)
console.log((helpOk ? "ok  " : "FAIL") + "  \"?\" help → " + helpRows.length + " rows: " + helpRows.map(r => r.title).join(" | ")); if (!helpOk) fails++
expect(" ? ", "12*8 + 15%"); expect("?x", null)
const r = q("g foo & bar")[0].run; console.log("      url:", r.target)
const cmds = Engine.run("x it's; rm -rf ~", { providers: ["commands"], commands: [{ keyword: "x", run: "echo {q}" }] }, {})[0].run
console.log("      cmd:", cmds.target)
const out = require("child_process").execFileSync("bash", ["-c", cmds.target]).toString().trim()
console.log((out === "it's; rm -rf ~" ? "ok  " : "FAIL") + "  shell quoting → " + out); if (out !== "it's; rm -rf ~") fails++
console.log(fails ? fails + " FAILED" : "all passed"); process.exit(fails ? 1 : 0)
