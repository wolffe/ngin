# New Game

Open NGIN in an AI coding tool with repository access, such as VS Code, Cursor,
Claude Code, or Codex. Read [AGENTS.md](../AGENTS.md) and give the assistant the
[AI prompt](./ai-prompt.md). Where automatic instruction discovery is unavailable,
explicitly attach those files. NGIN is a code-first framework, not a visual editor
or a runtime prompt interpreter.

## Ownership

**Your game is the only writable folder during game development.**

| Area                                                                     | Game-development policy                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `src/`                                                                   | Protected engine; import its APIs                                        |
| [games/sandbox/index.html](../games/sandbox/index.html) and its folder   | Protected reference demo; play and read it                               |
| [games/template/index.html](../games/template/index.html) and its folder | Protected starter; copy the whole folder                                 |
| `games/<your-game>/`                                                     | Your HTML, scripts, assets, styles, docs and tests                       |
| Everything else                                                          | Protected, including other games, shared assets, site, tests and tooling |

Never replace the demo startup or edit a shared launcher to start a new game.
The demo remains at [games/sandbox/](../games/sandbox/); [game.html](../game.html)
is its backward-compatible redirect. New games have independent URLs.

## Quick Start

Run these commands from the repository root. Node 24 is required for the change
checker, not to run the game. Choose a lowercase slug such as `my-game`;
`sandbox` and `template` are reserved.

1. Record the current state **before** asking the AI to edit or copying the starter:

    ```powershell
    node tools/game-boundary.mjs snapshot my-game
    ```

    Keep the printed baseline path. It is a JSON file in the OS temporary folder,
    outside the repository, and includes existing uncommitted/untracked content.

2. Copy the complete starter to a new folder:

    ```powershell
    Copy-Item games/template games/my-game -Recurse
    ```

    Do not overwrite an existing game. When continuing a game, snapshot first and
    edit its existing folder rather than copying over it.

3. Ask the AI to implement the game only inside that folder. The copy contains
   its own `index.html`, `scripts/main.js` bootstrap, and `scripts/game.js` factory.
   You may rename the factory and update its local import, change the page title,
   or add game-specific files without touching anything shared.

4. Serve the repository root, not the individual game folder:

    ```powershell
    php -S localhost:8080
    ```

    Open `http://localhost:8080/games/my-game/`. The unmodified starter already runs.

5. Test your game and verify the boundary with the original baseline path:

    ```powershell
    node tools/game-boundary.mjs check "C:\path\printed\by\snapshot\baseline.json"
    ```

    Exit 0 means protected content is unchanged; 1 reports violations; 2 means the
    check could not run (invalid baseline, unsupported link, or other error).

## Build On Existing Systems

Follow [games/template/scripts/game.js](../games/template/scripts/game.js):

- Reuse `createEngine`, `createInputManager(canvas, engine)`, and `createPhysicsWorld`.
- Reuse `createEnvironment`, `createMaterialLibrary`, `createCharacterModel`, and `createPlayer`.
- Add matching colliders to solid meshes using `addStaticBox`, `addStaticConvexHull`, or `addStaticMesh`.
- Put game rules in `engine.onUpdate` callbacks. The player already handles locomotion and physics stepping.
- Use supported settings for cameras, environment, materials and rendering. Do not edit core defaults or fork the player controller.

If an API cannot support the requested mechanic, explain the gap and request a
separately approved engine-maintenance task. Do not silently modify the engine,
demo, policy or checker to finish a game.

## Page And Asset URLs

The starter's pinned import map matches the engine (Three.js 0.186, Jolt 1.1.0).
Its `<base href="../../">` keeps existing shared asset loaders and styles relative
to the repository root, including when NGIN is hosted under a URL prefix.
Its entry script resolves against `location.href`, so copying the folder needs
no slug replacement. Keep this boot pattern in the copy.

ES module imports resolve relative to the importing module, unaffected by the
HTML base. From `scripts/game.js`, import engine modules via `../../../src/...`.
For your own files, prefer module-relative URLs:

```js
const modelUrl = new URL("../assets/model.glb", import.meta.url).href;
const model = await assets.loadGltf(modelUrl);
```

For game-local stylesheet links or other DOM URLs, use the actual page location:

```js
const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL("./styles/game.css", location.href).href;
document.head.append(stylesheet);
```

A plain `./assets/...` or `./styles/...` DOM/fetch URL follows the HTML base, not
the game folder. Shared assets are read-only; new assets belong in your game.

## What The Check Protects

The checker compares content hashes and paths outside your selected game, ignoring
only root Git metadata. It detects added, edited, deleted and moved files, including
untracked files, without requiring a commit or a clean worktree. Symlinks, junctions,
hard-linked files and special file types are rejected rather than treated as safe
game-local paths. Keep the baseline outside the repository and do not regenerate it
to hide violations. Missing or malformed baselines fail the check.

**This is strict policy plus post-edit detection, not a filesystem lock.** A tool
with write access can ignore rules or tamper with checks. Actual prevention requires
separate OS/container/tool permissions. If other user edits occur during a game
task, report them and agree how to reconcile the baseline; never revert them
automatically. Node availability and a retained baseline are required to verify.

## Validation

- Boundary check passes with the original pre-edit baseline.
- Game boots at its own URL, without importing the sandbox game.
- Player can move, jump, land and switch cameras; solid surfaces have matching collision.
- Resize calls `engine.resize`, and desktop/mobile rendering stays nonblank and correctly framed.
- Game-specific tests live in your game folder; do not edit shared tests to pass them.
- Check the reference demo still launches; report any engine issue as maintenance.

Maintainers can run `node --test tests/*.test.mjs` and `node tests/browser-check.mjs`.
The browser suite tests an unmodified starter copy at a temporary game URL. Set
`NGIN_STARTER=1` to run only that check, then clear the variable. This checks mobile
rendering, not a new touchscreen movement implementation.

See [walking-module.md](./walking-module.md), [vehicle-module.md](./vehicle-module.md),
[water-module.md](./water-module.md), and [interaction-module.md](./interaction-module.md)
for existing game-building APIs.
