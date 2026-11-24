.pragma library
.import "commands.js" as Commands
.import "math.js" as Calculator
.import "currency.js" as Currency
.import "time.js" as Time
.import "emoji.js" as Emoji
.import "processes.js" as Processes
.import "apps.js" as Apps
.import "units.js" as Units
.import "windows.js" as Windows
.import "ai.js" as Ai
.import "files.js" as Files
.import "url.js" as Url
.import "generate.js" as Generate
.import "bookmarks.js" as Bookmarks

// Every provider the bar knows about. To add a feature: write providers/<name>.js
// exporting `var provider = { id, name, icon, match(query, ctx) }`, import it
// above and list it here, then add its id to "providers" in the config.
var all = [
  Commands.provider,
  Calculator.provider,
  Currency.provider,
  Time.provider,
  Emoji.provider,
  Processes.provider,
  Units.provider,
  Windows.provider,
  Apps.provider,
  Ai.provider,
  Files.provider,
  Url.provider,
  Generate.provider,
  Bookmarks.provider
]
