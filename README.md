# Command Bar

A Spotlight/Raycast-style command bar for the Omarchy shell. Press a hotkey, type, and the answer shows up as you type. **Enter** copies it or runs it.

| Type | You get |
|------|---------|
| `12*8 + 15%`, `sqrt(2)`, `15% of 200`, `2pi`, `5!` | Calculator (a real parser, never `eval`) |
| `100 usd to lkr`, `$50`, `€20 in inr`, `50 eur`, `usd lkr` | Currency conversion ([open.er-api.com](https://open.er-api.com), cached, works offline) |
| `time`, `time in tokyo`, `3pm lkt to pst`, `15:30 in london` | Time zones (DST-correct offsets from the system tz database) |
| `days until dec 25`, `today + 45 days`, `next friday`, `2026-01-01 to 2026-09-23` | Date maths |
| `g …`, `yt …`, `gh …`, `wiki …`, `lock` | Keyword commands you define in config |
| `:fire`, `emoji thumbs up` | Emoji search. Enter types it into the app you were in (`"emoji": { "onEnter": "copy" }` to copy instead) |
| `kill`, `kill chrome`, `kill -9 node` | Quit your own processes. Several processes with one name can be quit together |

Type **`?`** to list everything the bar can do, including your own keyword commands. Enter on a row puts its example into the bar.

Keys: **↑/↓** (or Ctrl+N/P) move the selection, **Enter** copies/opens/runs the selected row, **Tab** completes a keyword, **Esc** clears the text and a second **Esc** closes the bar.

The bar remembers your last query, even across shell restarts. It comes back selected when you reopen, so typing replaces it and an arrow key keeps it. Close with Esc Esc to start fresh next time.

## Install

```sh
omarchy plugin add https://github.com/Saikomantisu/omarchy-commandbar --enable
```

Then bind a key in `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + PERIOD", "Command bar", "omarchy-shell shell toggle io.github.saikomantisu.commandbar")
hl.layer_rule({ match = { namespace = "^omarchy-commandbar$" }, no_anim = true, animation = "none" })
```

Requires `curl` and `wl-copy` (`wl-clipboard`). Both ship with Omarchy.

## Remove

```sh
omarchy plugin remove io.github.saikomantisu.commandbar
rm -rf ~/.cache/omarchy-commandbar ~/.config/omarchy/extensions/commandbar.json
```

Then delete the two keybinding lines.

## Configure

Defaults live in [`config.default.json`](config.default.json). Put overrides in `~/.config/omarchy/extensions/commandbar.json` (JSONC: comments and trailing commas are fine). Changes apply live.

```jsonc
{
  // Which providers run, in tie-break order.
  "providers": ["commands", "math", "currency", "time"],
  "currency": { "home": "LKR", "favorites": ["USD", "EUR", "INR"] },
  "time": { "home": "Asia/Colombo", "zones": ["UTC", "America/New_York"], "clock24": true },
  // Replaces the default list entirely.
  "commands": [
    { "keyword": "g", "title": "Search Google", "open": "https://www.google.com/search?q={q}" },
    { "keyword": "ddg", "title": "DuckDuckGo", "open": "https://duckduckgo.com/?q={q}" },
    { "keyword": "term", "title": "Terminal here", "run": "xdg-terminal-exec" },
    { "keyword": "say", "title": "Notify", "run": "notify-send {q}" }
  ]
}
```

In `open` commands, `{q}` is URL-encoded. In `run` commands, it is shell-quoted, so typed text can never break out of the command.

## Adding a feature

Each feature is a provider in `providers/`:

```js
.pragma library

var provider = {
  id: "units",
  name: "Units",
  icon: "󰕒",
  // Return [] when the query isn't yours.
  match: function(query, ctx) {
    // ctx.settings = config["units"]; also ctx.rates, ctx.zones, ctx.now(), ctx.format(n), ctx.plain(n)
    return [{ title: "…", subtitle: "…", score: 80, copy: "…" /*, run: { kind: "open" | "run", target } */ }]
  }
}
```

Give it a `help` list (`[{ example, text }]`, or a function of `ctx` returning one) so it shows up under `?`. Import it and add it to the list in [`providers/index.js`](providers/index.js), then add its id to `"providers"` in the config. Rows from all providers are merged and sorted by `score`. Run `node tests/run.js` to check providers without the shell.

## License

MIT
