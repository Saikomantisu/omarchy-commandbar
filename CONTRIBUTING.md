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

New features go in `providers/`. The README's "Adding a feature" section shows the format.

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
- List any new command-line tool in the README's Dependencies section.

## License

By contributing, you agree that your changes are released under the project's [MIT license](LICENSE).
