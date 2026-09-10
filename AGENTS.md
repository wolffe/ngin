# NGIN Agent Rules

## Game Development Boundary

For a game-creation or game-editing task, select exactly one `games/<slug>/`
folder. Ask if the target is ambiguous. Only that folder is writable, including
its HTML, scripts, assets, styles, documentation, and tests.

Everything else is protected during game development:

- All of `src/`, not just `src/engine/`.
- `games/sandbox/` (reference demo), `games/template/` (copyable starter), and all other games.
- Shared `assets/`, `library/`, `public/`, root pages, site/docs, tooling, tests, and these rules.

Read protected files to learn the APIs; do not edit, delete, move, format,
replace, or monkey-patch them. Copy the complete `games/template/` into the
selected folder, never develop in the template or sandbox. Do not change a
shared launcher or registry: launch the new game's own page.

Use existing factories and supported configuration overrides. A missing engine
capability is a request for a separately approved maintainer task, not permission
to modify the engine or duplicate its implementation inside a game.

## Required Change Check

Before game edits, run `node tools/game-boundary.mjs snapshot <slug>` from the
repository root. Retain the printed external baseline path. After work, run
`node tools/game-boundary.mjs check <baseline-path>` and the game's own tests.
Do not report completion with a failing or missing boundary check.

Never edit the guard, replace the baseline, or take a new snapshot to conceal a
violation. Report unexpected changes, including concurrent user changes, and ask
how to reconcile them. Never automatically revert the user's work. The checker
requires Node 24; if unavailable, report that verification is blocked rather than
claiming protection. It is change detection, not a filesystem lock.

## Maintainer Work

An explicit engine/demo/documentation maintenance request can authorize a
different, narrow scope. State that scope first, preserve unrelated changes,
and run relevant regressions. A game prompt alone does not authorize maintenance.
Do not stage, commit, push, or create branches unless explicitly requested.

## Development Conventions

- Static HTML and browser ES modules; no application build step or framework.
- Reuse `createPlayer`, cameras and Jolt physics; do not duplicate locomotion or physics stepping.
- Prefer factory functions, closures, simple geometry and shared materials.
- Target responsive Roblox/Minecraft-style worlds, not photorealistic effects by default.
- Serve the repository root with `php -S localhost:8080`; each game has its own URL.
- See [docs/new-game.md](docs/new-game.md) for setup, URL handling and validation.
- Maintainer regressions: `node --test tests/*.test.mjs`, then `node tests/browser-check.mjs` with the server running.
