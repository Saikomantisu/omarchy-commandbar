.pragma library

// Files and folders, two ways. services/Files.qml runs fd and passes what it
// found in (folders end in "/"):
//   search  ctx.files  = { query, list }  names anywhere in the home folder,
//           hidden files and what .gitignore lists left out
//   browse  ctx.folder = { dir, list, missing }  everything in one folder
//
//   .pdf · . screenshot png · f notes     search by name
//   ~/ · ~/Down · ~/Downloads/inv · /etc/  browse by path; Tab goes into a folder

var LIMIT = 30
var BROWSE_LIMIT = 60

// Which queries are files', for Engine.mode and the providers that stand
// aside: a dot followed by a letter, a space or nothing (".pdf", ". 2024 tax",
// while ".5*2" and ".5 km to m" stay maths), and a path ("~", "~/…", "/…").
function isSearch(query) { return /^\s*\.(?:[a-z]|\s|$)/i.test(query) }
function isPath(query) { return /^\s*(~(\/|$)|\/)/.test(query) }

function needleOf(query, ctx) {
  var dot = query.match(/^\s*\.\s*(.*)$/)
  if (dot) return isSearch(query) ? dot[1].trim() : null
  var f = query.match(/^\s*f(?:\s+(.*)|\s*)$/i)
  // Bare "f" is an ordinary search ("f" → Firefox); "f " starts a file search,
  // unless you have a keyword command called f.
  if (!f || !/^\s*f\s/i.test(query)) return null
  if ((ctx.keywords || []).indexOf("f") !== -1) return null
  return (f[1] || "").trim()
}

// A path being typed: the folder so far and the start of a name in it.
// "~/Downloads/inv" → { dir: "/home/you/Downloads/", shown: "~/Downloads/", name: "inv" }
function pathOf(query, home) {
  var m = String(query).match(/^\s*(~(?=\/|$)|\/)(.*)$/)
  if (!m) return null
  var typed = m[1] === "~" ? "~" + (m[2] || "/") : "/" + m[2]
  var cut = typed.lastIndexOf("/") + 1
  var shown = typed.slice(0, cut)
  var dir = shown.charAt(0) === "~" ? home + shown.slice(1) : shown
  return { dir: dir, shown: shown, name: typed.slice(cut) }
}

// The folder's entries that start with the name typed, then those that have
// it anywhere; folders first, then A to Z. Hidden ones only once a dot is
// typed, and then only names that start with it.
function browse(path, folder, ctx) {
  var name = path.name.toLowerCase()
  var hits = []
  for (var i = 0; i < folder.list.length; i++) {
    var p = folder.list[i]
    var base = baseName(p)
    var b = base.toLowerCase()
    if (b.charAt(0) === "." && name.charAt(0) !== ".") continue
    var at = name ? b.indexOf(name) : 0
    // ".c" means hidden names that start with it, not "docs.csv".
    if (at === -1 || (at > 0 && name.charAt(0) === ".")) continue
    hits.push({ p: p, base: base, start: at === 0, folder: /\/$/.test(p) })
  }
  hits.sort(function(a, b) {
    return (b.start - a.start) || (b.folder - a.folder) || (a.base.toLowerCase() < b.base.toLowerCase() ? -1 : 1)
  })

  var out = []
  // The folder you're in is an action under its own heading ("This folder"),
  // above its contents ("In ~/Code"), so it isn't taken for one of them.
  // Shown while no name is typed, so Enter on "~/Downloads/" opens Downloads.
  var where = path.shown === "/" ? "/" : path.shown.replace(/\/$/, "")
  if (!name && path.dir !== "/") {
    var self = path.dir.replace(/\/$/, "")
    out.push({ icon: "󰝰", title: "Open " + where, subtitle: "In your file manager", group: "This folder",
               score: 96, copy: self, run: { kind: "open", target: self, label: "open" } })
  }
  for (var j = 0; j < hits.length && out.length < BROWSE_LIMIT; j++) {
    var r = row(hits[j].p, ctx.home, 95.9 - j * 0.01)
    r.group = "In " + where
    r.subtitle = hits[j].folder ? "Folder · Tab to go in" : ""
    // Tab fills in the folder's path, so you keep typing inside it.
    if (hits[j].folder) r.complete = path.shown + hits[j].base + "/"
    out.push(r)
  }
  if (out.length === 0)
    return [{ title: "Nothing in " + path.shown + " starts with \"" + path.name + "\"", subtitle: "Files", score: 40, copy: "" }]
  return out
}

function words(text) { return String(text || "").toLowerCase().split(/\s+/).filter(function(w) { return w.length > 0 }) }

function baseName(path) { return path.replace(/\/$/, "").replace(/^.*\//, "") }

// How well a name matches the first word: the whole name, the name without
// its extension, its extension (only when the dot was typed with the word,
// ".jpeg"), the start of the name, the start of a word in it, anywhere.
// A hidden file's dot doesn't count, so ".bashrc" is a whole-name match.
function rank(name, first, ext) {
  var n = name.toLowerCase().replace(/^\./, "")
  if (n === first || n.replace(/\.[^.]*$/, "") === first) return 5
  if (ext && n.slice(-first.length - 1) === "." + first) return 4
  if (n.indexOf(first) === 0) return 3
  if (new RegExp("[^a-z0-9]" + first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(n)) return 2
  return 1
}

var ICONS = [
  [/\.pdf$/i, "󰈦"],
  [/\.(png|jpe?g|gif|webp|svg|avif|heic|bmp|tiff?)$/i, "󰋩"],
  [/\.(mp4|mkv|mov|webm|avi)$/i, "󰕧"],
  [/\.(mp3|flac|wav|ogg|m4a|opus)$/i, "󰎆"],
  [/\.(zip|tar|gz|xz|zst|7z|rar|bz2)$/i, "󰗄"],
  [/\.(docx?|odt|rtf)$/i, "󰈬"],
  [/\.(xlsx?|ods|csv)$/i, "󰈛"],
  [/\.(pptx?|odp)$/i, "󰈧"],
  [/\.(md|txt|log)$/i, "󰈙"],
  [/\.(js|ts|py|rb|go|rs|c|h|cpp|java|lua|sh|qml|json|toml|ya?ml|html|css)$/i, "󰈮"]
]

function iconFor(path) {
  if (/\/$/.test(path)) return "󰉋"
  for (var i = 0; i < ICONS.length; i++) if (ICONS[i][0].test(path)) return ICONS[i][1]
  return "󰈔"
}

function row(path, home, score) {
  var dir = path.replace(/\/$/, "").replace(/\/[^\/]*$/, "")
  if (home && (dir === home || dir.indexOf(home + "/") === 0)) dir = "~" + dir.slice(home.length)
  var folder = /\/$/.test(path)
  return {
    icon: iconFor(path),
    title: baseName(path),
    subtitle: dir + (folder ? " · folder" : ""),
    score: score,
    copy: path.replace(/(.)\/$/, "$1"),
    run: { kind: "open", target: path.replace(/(.)\/$/, "$1"), label: "open" }
  }
}

var provider = {
  id: "files",
  name: "Files",
  icon: "󰈞",
  commands: [
    { title: "Search files", keywords: "file files find document folder search open", text: "Type . then part of a file name", complete: "." },
    { title: "Browse files", keywords: "file files folder browse path home directory", text: "Type ~/ and go folder by folder with Tab", complete: "~/" }
  ],
  help: [
    { id: "files", title: "Files", about: "A dot and a name searches your home folder; ~/ browses it folder by folder",
      examples: [{ q: ".", note: "Search by name" },
                 { q: ".pdf", hint: "Files and folders with pdf in the name" },
                 { q: ". screenshot png", hint: "Every word has to be in the name" },
                 { q: "f notes", hint: "f and a space works too" },
                 { q: "~/", note: "Browse your home folder. Tab goes into a folder" },
                 { q: "~/Downloads/", note: "What's in Downloads, folders first" },
                 { q: "/etc/", note: "Any folder, from the top" }] }
  ],
  match: function(query, ctx) {
    var path = ctx.home ? pathOf(query, ctx.home) : null
    if (path) {
      if (ctx.requestFolder) ctx.requestFolder(path.dir)
      var folder = ctx.folder
      if (!folder || folder.dir !== path.dir) return [{ title: "Reading " + path.shown + "…", subtitle: "Files", score: 40, copy: "" }]
      if (folder.missing) return [{ title: "No folder " + path.shown, subtitle: "Files", score: 40, copy: "" }]
      if (folder.failed) return [{ title: "Couldn't read " + path.shown, subtitle: "Files", score: 40, copy: "" }]
      return browse(path, folder, ctx)
    }

    var needle = needleOf(query, ctx)
    if (needle === null) return []
    if (needle.length < 2) return [{ title: "Type part of a file name", subtitle: ".pdf, .notes, .screenshot png", score: 40, copy: "" }]
    if (ctx.requestFiles) ctx.requestFiles(needle)

    var found = ctx.files
    var qw = words(needle)
    var has = function(p) {
      var name = baseName(p).toLowerCase()
      return qw.every(function(w) { return name.indexOf(w) !== -1 })
    }
    // fd's search leaves hidden files out, so ".bashrc" also looks at the
    // dotfiles in the home folder itself, read the way ~/ is browsed.
    var hidden = []
    if (/^\s*\.[a-z]/i.test(query) && ctx.home) {
      var top = ctx.home + "/"
      if (ctx.requestFolder) ctx.requestFolder(top)
      if (ctx.folder && ctx.folder.dir === top) hidden = ctx.folder.list.filter(function(p) {
        return baseName(p).toLowerCase().indexOf("." + qw[0]) === 0 && has(p)
      })
    }
    // While fd works on the latest words, the last answer narrowed down to
    // them stands in, so the list doesn't blink on every key.
    var list = hidden.concat(found ? found.list.filter(has) : [])
    var done = !!found && found.query === needle
    if (list.length === 0)
      return [{ title: done ? "No file matches \"" + needle + "\"" : "Searching…", subtitle: "Files in your home folder", score: 40, copy: "" }]

    var ext = /^\s*\.\S/.test(query)
    var ranked = list.map(function(p) {
      return { p: p, r: rank(baseName(p), qw[0], ext), depth: p.split("/").length }
    })
    ranked.sort(function(a, b) { return b.r - a.r || a.depth - b.depth || a.p.length - b.p.length || (a.p < b.p ? -1 : 1) })
    return ranked.slice(0, LIMIT).map(function(x, n) { return row(x.p, ctx.home, 96 - n * 0.01) })
  }
}
