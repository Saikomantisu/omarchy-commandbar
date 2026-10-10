# Contributing

Thanks for helping. Bug reports, fixes and new features are all welcome.

## Before you start

- For a bug, open an issue with what you typed, what you expected and what happened.
- For a new feature, open an issue first so we can agree on it before you build it.
- Keep pull requests small and focused on one thing.

## Working on the plugin

Clone your fork into Omarchy's plugin folder so the shell loads it:

```sh
omarchy plugin remove io.github.saikomantisu.commandbar   # if the released version is installed
git clone https://github.com/<you>/omarchy-commandbar ~/.config/omarchy/plugins/io.github.saikomantisu.commandbar
omarchy plugin enable io.github.saikomantisu.commandbar
```

Keep only one copy in that folder. Two copies register the same plugin ID.

After changing the code, run `omarchy restart shell` to load it. The shell reloads plugins on its own when files change, but that isn't always reliable, so restart before you decide something works. `journalctl --user -f | grep -i commandbar` shows the bar's warnings and errors.

New features go in `providers/`. See [Adding a feature](#adding-a-feature) for the format.

## Adding a feature

Each feature is a JavaScript file in `providers/`:

```js
.pragma library

var provider = {
  id: "units",
  name: "Units",
  icon: "󰕒",
  // Found by name: typing "unit" shows this command.
  commands: [{ title: "Convert Units", keywords: "unit convert", text: "e.g. 5 km to mi", complete: "5 km to mi", select: true }],
  // Shown in the "?" list.
  help: [{ title: "Units", examples: ["5 km to mi", "30c to f"] }],
  // Return [] if the query isn't for this feature.
  match: function(query, ctx) {
    return [{ title: "3.11 mi", subtitle: "5 km → mi", score: 80, copy: "3.11" }]
  }
}
```

A result can include `run: { kind: "open" | "run", target }` to open or run something on Enter, `group` to list it under its own heading instead of the feature's name, and `fallback: true` to show it only when no other result does. `ctx.settings` is the provider's section of the config. `ctx` also has `rates`, `zones`, `localZone`, `emojis`, `processes`, `now()`, `format(n)` and `plain(n)`.

To enable it, import it in [`providers/index.js`](providers/index.js), add it to the list there, and add its `id` to `"providers"` in the config.

## Dependencies

All of these come with Omarchy:

- `curl`: exchange rates
- `wl-copy` (from `wl-clipboard`): copying results
- `xdg-open`: web keyword commands
- `ps` and `kill` (from `procps-ng`): the process list
- `date` and `timedatectl`: time zones
- `uwsm-app` and `gtk-launch`: opening apps, the same way Omarchy's own launcher does
- `hyprctl`: setting the hotkey, and listing and focusing windows
- `notify-send`: warning when the hotkey is already taken
- `python3`: reading and writing the cache files safely (`bin/commandbar-cache`)
- `omarchy-menu-emoji-insert` and Omarchy's `emojis.json`: emoji
- `omarchy-default-agent`, `omarchy-cmd-missing`, `omarchy-agent-prompt` and `omarchy-agent --pick`: asking your agent (`bin/commandbar-agent`)

## Tests

```sh
node tests/run.js
```

All tests must pass. Add tests for anything you add or fix. They run without the shell, using sample rates, time zones and processes.

## Rules

The plugin is published through the Omarchy plugin marketplace, and its automated security check and review require these:

- Don't ask for administrator rights, and don't start, stop or change system services. The marketplace's automated check flags these.
- Don't download something and then run it.
- Don't add network requests unless the feature needs one, and only make them when the user asks for that feature.
- Don't write to the user's config files. The bar writes only to `~/.cache/omarchy-commandbar/`.
- Keep the defaults neutral. Personal choices, such as a currency, time zone or hotkey, go in your own `~/.config/omarchy/extensions/commandbar.json`, not in `config.default.json`.
- Put what the user types into shell commands only through the existing quoting. See `{q}` handling in `providers/commands.js`.
- List any new command-line tool in [Dependencies](#dependencies) above.

## License

By contributing, you agree that your changes are released under the project's [MIT license](LICENSE).
