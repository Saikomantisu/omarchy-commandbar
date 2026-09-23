# Command Bar

A Spotlight/Raycast-style command bar for the Omarchy shell. Press a hotkey, type, and the answer shows up as you type. **Enter** copies it or runs it.

It focuses on quick answers (maths, money, time) and on being easy to extend: new keyword commands need only a line of JSON, and new features are a single JavaScript file.

![Command Bar listing its features after typing ?](preview.png)

| Type | You get |
|------|---------|
| `12*8 + 15%`, `sqrt(2)`, `15% of 200`, `2pi`, `5!` | Calculator (a real parser, never `eval`) |
| `100 usd to eur`, `$50`, `€20 in inr`, `50 gbp`, `usd jpy` | Currency conversion ([open.er-api.com](https://open.er-api.com), cached, works offline) |
| `time`, `time in tokyo`, `3pm cet to pst`, `15:30 in london` | Time zones (DST-correct offsets from the system tz database) |
| `days until dec 25`, `today + 45 days`, `next friday`, `2026-01-01 to 2026-09-23` | Date maths |
| `g …`, `yt …`, `gh …`, `wiki …`, `lock` | Keyword commands you define in config |
| `:fire`, `emoji thumbs up` | Emoji search. Enter types it into the app you were in (`"emoji": { "onEnter": "copy" }` to copy instead) |
| `kill`, `kill chrome`, `kill -9 node` | Quit your own processes. Several processes with one name can be quit together |

Every feature is also a command you can find by typing its name, like Raycast: `emo` → *Search Emoji*, `curr` → *Convert Currency*, `kil` → *Kill Process*, `clock` → *World Clock*, `goo` → *Search Google*. Commands rank below real answers, so `2+2` still shows 4 first.

Type **`?`** to list everything the bar can do, including your own keyword commands. Enter on a row puts its example into the bar.

Keys: **↑/↓** (or Ctrl+N/P) move the selection, **Enter** copies/opens/runs the selected row, **Tab** completes a keyword, **Esc** clears the text and a second **Esc** closes the bar.

The bar remembers your last query, even across shell restarts. It comes back selected when you reopen, so typing replaces it and an arrow key keeps it. Close with Esc Esc to start fresh next time.

## Install

```sh
omarchy plugin add https://github.com/Saikomantisu/omarchy-commandbar --enable
```

Then load its hotkey in `~/.config/hypr/bindings.lua`:

```lua
local commandbar = os.getenv("HOME") .. "/.config/omarchy/plugins/io.github.saikomantisu.commandbar/hypr/commandbar.lua"
local commandbar_file = io.open(commandbar)
if commandbar_file then commandbar_file:close(); dofile(commandbar) end
```

The default hotkey is **Super + Period**. To change it, set `"hotkey"` in your config (below). It takes effect as soon as you save. `"hotkey": ""` leaves the bar unbound.

To open the bar with a starting query, for example a separate key straight into emoji search, pass it in the payload:

```sh
omarchy-shell shell toggle io.github.saikomantisu.commandbar '{"query": ":"}'
```

### Dependencies

Everything it uses ships with Omarchy:

- `curl` for exchange rates
- `wl-copy` (`wl-clipboard`) to copy results
- `xdg-open` for web keyword commands
- `ps` and `kill` (`procps-ng`) for the process list
- `date` and `timedatectl` for time zone offsets
- `hyprctl` to reload Hyprland when the hotkey changes
- Omarchy's `omarchy-menu-emoji-insert` (uses `wtype`) and its `emojis.json` for emoji

### What it touches

- **Network:** only `https://open.er-api.com/v6/latest/USD`, at most once per rate update (daily) and only when a currency query needs it. Nothing you type is sent anywhere, except web keyword commands like `g …`, which you trigger with Enter.
- **Files it writes:** `~/.cache/omarchy-commandbar/` (the rates cache and your last query). It never writes your Hyprland or Omarchy config. The only change there is the hotkey snippet you add yourself.
- **Hyprland:** when you change `"hotkey"`, the bar runs `hyprctl reload config-only` so the new key works straight away.
- **Processes:** it lists only your own processes, and only quits one when you press Enter on it.

## Remove

```sh
omarchy plugin remove io.github.saikomantisu.commandbar
rm -rf ~/.cache/omarchy-commandbar ~/.config/omarchy/extensions/commandbar.json
```

Then delete the three hotkey lines from `~/.config/hypr/bindings.lua`. Until you do, they are harmless: they do nothing if the plugin isn't installed.

## Configure

Defaults live in [`config.default.json`](config.default.json). Put overrides in `~/.config/omarchy/extensions/commandbar.json` (JSONC: comments and trailing commas are fine). Changes apply live.

```jsonc
{
  // Any Hyprland key combo, e.g. "SUPER + ALT + C".
  "hotkey": "SUPER + PERIOD",
  // Which providers run, in tie-break order.
  "providers": ["commands", "math", "currency", "time", "emoji", "processes"],
  // Default home is USD; "rupee"/"rs" mean your home currency if it's a rupee.
  "currency": { "home": "EUR", "favorites": ["USD", "GBP"] },
  // "home" defaults to your system time zone.
  "time": { "home": "Europe/Berlin", "zones": ["UTC", "America/New_York"], "clock24": true },
  // "paste" types the emoji into the focused app; "copy" copies it.
  "emoji": { "onEnter": "paste" },
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

Give it a `commands` list (`[{ title, keywords, text, complete, select?, run? }]`) so it can be found by name, and a `help` list (`[{ example, text }]`, or a function of `ctx` returning one) so it shows up under `?`. Import it and add it to the list in [`providers/index.js`](providers/index.js), then add its id to `"providers"` in the config. Rows from all providers are merged and sorted by `score`. Run `node tests/run.js` to check providers without the shell.

## License

MIT
