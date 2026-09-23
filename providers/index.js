.pragma library
.import "commands.js" as Commands
.import "math.js" as Calculator
.import "currency.js" as Currency
.import "time.js" as Time
.import "emoji.js" as Emoji
.import "processes.js" as Processes

// Every provider the bar knows about. To add a feature: write providers/<name>.js
// exporting `var provider = { id, name, icon, match(query, ctx) }`, import it
// above and list it here, then add its id to "providers" in the config.
var all = [
  Commands.provider,
  Calculator.provider,
  Currency.provider,
  Time.provider,
  Emoji.provider,
  Processes.provider
]
