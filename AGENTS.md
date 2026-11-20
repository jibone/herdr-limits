# herdr-limits

A **herdr-app mod** (plugin): a small JavaScript panel that runs inside the
Herdr desktop app. This repo is the mod's source; the running app only reads
mods from its own home folder.

It started as a fork of
[nozikov/herdr-usage-limits](https://github.com/nozikov/herdr-usage-limits)
(MIT, see `LICENSE`) and now goes its own way. Nothing is pulled from or
sent upstream.

## First, always

**Before any task in this repo, read `~/.config/herdr-app/AGENTS.md`.**

The Herdr app writes that guide itself and rewrites it on every start, so it
always matches the installed version. It is the source of truth for mods:
the gpui-kit way of drawing UI, the `herdr` module (`props`, `run`,
`openOverlay`, `shared`, `exec`, …), the mod folder format (`main.js`,
`mod.json`), layouts, keys, commands, and the `herdr-app` CLI. If that guide
and this file disagree, that guide wins. Re-read it every session — never
work from memory of it — and never edit it or the `.d.ts` files beside it;
the app rewrites those.

## The mod

- Written in **gpui-kit**: JavaScript that describes native GPUI elements
  (`div()`, flex, `.on_click`). No HTML, CSS, DOM, web view, Node APIs or
  `setTimeout` (use `cx.timer` / `cx.spawn`).
- The types are the truth: `gpui-kit.d.ts` (elements) and `herdr.d.ts`
  (app data and commands), both in `~/.config/herdr-app/`.
- One mod per idea. Don't edit Herdr's own shipped mods or layouts —
  clone them (`herdr-app do mod.clone '{"name":"...","as":"..."}'`)
  if you need a starting point.
- Installed name: `usage-limits` (folder `mods/usage-limits/`, shared-state
  keys `usage-limits.*`, helper paths `mods/usage-limits/helpers/…`). Keep
  that name unless renaming everywhere at once, including the person's layout.
- `herdr-app check` runs `init()` for real: the View guards every timer,
  helper and `hc` call with `checking()`, so a check starts no CLI. Keep it
  that way for anything new that runs a program.
- Providers live in `providers/*.js` (`{ id, name, icon, helper, parse }`),
  listed in order in `providers/index.js`; each has a shell helper in
  `helpers/` that exits 0 with JSON, 127 when its CLI isn't installed, and 1
  otherwise. Helpers clean up their temp folder and child process on exit
  (`trap`). `RECIPE.md` describes the whole build.
- Changes since the fork:
  - **Codex enterprise plans**: no primary/secondary windows, only an
    `individualLimit`; shown as a monthly window `mo`.
  - **GitHub Copilot** (`providers/copilot.js`, `helpers/copilot-usage.sh`):
    premium requests from `gh api /copilot_internal/user`. When `gh` isn't
    signed in inside Herdr (its auth is a `GITHUB_TOKEN` set by the person's
    shell), the helper asks `$SHELL -ilc` only to print that token (10 s
    cap), then runs `gh` itself with `GH_TOKEN` set. Never run `gh` inside
    the login shell, and never write the token to disk.
  - **OpenCode Go** (`providers/opencode-go.js`,
    `helpers/opencode-go-limits.sh`): the 5-hour, weekly and monthly Go
    meters from `opencode api GET /api/experimental/usage/limits`. It needs
    OpenCode signed in to OpenCode Console (`data` is null with only a Go
    API key); null or no `go` exits 127 so non-Go users never see it.

## Layout

A mod-only package: no layout file and no `keys.json`; the person grafts
one block into their own layout (README "Install", RECIPE "Built from").

```
mods/usage-limits/       the mod: main.js, mod.json, actions.js, and
  providers/             one parser per CLI, in bar order (index.js)
  helpers/               one shell helper per provider, plus session.sh,
                         codex-session.py, awk/ and opencode/ SQL
  io/ lib/ ui/           host calls, pure logic, drawing
  icons/                 one-color SVGs (tinted with svg())
  test/                  unit tests, fake CLIs, fixtures (not installed)
test/quality/, tools/    the quality gate npm test runs after the mod's tests
assets/                  the README hero image and its source
RECIPE.md                the brief to rebuild all of this from scratch
preview.png              a mockup of it with sample numbers (from assets/src/hero.html)
```

`mod.json` is `{ "place": "none" }` — a layout's block puts it on screen;
Herdr docks nothing on its own.

## Developing

1. The app only reads its own home, and doesn't hot-reload a symlinked mod.
   To test, copy the mod there:
   `rsync -a --delete --exclude test --exclude gpui-kit.d.ts --exclude herdr.d.ts --exclude jsconfig.json mods/usage-limits/ ~/.config/herdr-app/mods/usage-limits/`
2. Saving a file under `~/.config/herdr-app/mods/` hot-reloads every copy in
   the window; a broken save keeps the old version running and shows in
   `herdr-app status`. Edit here, then copy; never edit the installed copy.
3. After every change: `herdr-app check ~/.config/herdr-app/mods/usage-limits`.
   It exits nonzero with the exact error. Never call it done without a
   passing check — and trying it in the app.
4. `npm ci && npm test` runs the unit tests and the quality gate. Node 24 or
   newer (`.nvmrc`, `engines`): `main.test.js` and `sh.test.js` need
   `module.registerHooks`.
5. `herdr-app shot [file.png]` saves the current window frame when debugging
   the drawn UI.

### Code

- No comments in code: a name, a constant, a small function, an assert
  message or a test says it; reasons that are about the platform live in
  `RECIPE.md`'s Watch out.
- JavaScript is functions; the one class is the View Herdr requires.
- `npm test` runs the mod's tests, then the quality gate in `test/quality/`:
  eslint (size and complexity limits, no classes or `this` outside the View,
  the layers), jscpd (no copied code), shellcheck (POSIX `sh`), no comments
  in JS, shell, Python, SQL or awk, file sizes.
- CI runs the same `npm test` (`.github/workflows/tests.yml`) on Linux and
  macOS, one workflow each (`linux.yml`, `macos.yml`, so each has its README
  badge), for every pull request and every push to the default branch; a
  pull request merges only when both pass.
- `mods/usage-limits/test/main.test.js` runs the real `main.js` over host
  stand-ins and compares what it draws and does, click by click, with
  `test/fixtures/main-snapshot.json`; `UPDATE_SNAPSHOT=1` rewrites it after a
  change meant to show. `view-before.json` is `cardModel`/`barModel` of the
  scenarios in `_view-scenarios.js` from the code before spend providers, and
  `view-before-extra.json` from the code at `19fda91`: the guard that a Claude
  + Codex user sees no change.

## Sharing (herdr.dev/mods)

- Write the `RECIPE.md` from the real files, keep `preview.png` current, put
  this folder in a public GitHub repo and add the topic `herdr-mod`; it shows
  up at herdr.dev/mods within the hour.
- The mod runs programs (`claude`, `codex`, `gh`, `opencode` incl. `opencode
  api`, `sqlite3`,
  `hc`, `ps`, `lsof`, the person's login shell for the Copilot fallback) and
  reads agent logs outside its folder: RECIPE "What it runs and reads" and
  README "What it runs" must stay accurate, since the Herdr guide tells
  installing agents to warn about exactly that.
