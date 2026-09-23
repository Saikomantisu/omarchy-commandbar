// Loads QML ".pragma library" JS files in node, resolving ".import x.js as Name".
const fs = require("fs"), path = require("path"), vm = require("vm")
const cache = {}
function load(file) {
  file = path.resolve(file)
  if (cache[file]) return cache[file]
  const src = fs.readFileSync(file, "utf8")
  const sandbox = { console, Math, Date, JSON, String, Number, Object, Array, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent }
  const body = src.split("\n").map(line => {
    const m = line.match(/^\.import\s+"([^"]+)"\s+as\s+(\w+)/)
    if (m) { sandbox[m[2]] = load(path.join(path.dirname(file), m[1])); return "" }
    return line.startsWith(".pragma") ? "" : line
  }).join("\n")
  vm.createContext(sandbox)
  vm.runInContext(body, sandbox, { filename: file })
  cache[file] = sandbox
  return sandbox
}
module.exports = load
