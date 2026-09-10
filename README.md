# NGIN

Code-first Three.js WebGPU engine with a protected reference sandbox and independent
games. No Node or build step is required to play; Node 24 runs authoring checks.

Visual target: Roblox/Minecraft-style worlds. Prioritize responsive gameplay, simple geometry and painterly color textures over photorealistic rendering. Optional effects must earn their frame-time cost.

## Run

```bash
php -S localhost:8080
```

Open http://localhost:8080 for the landing page. Sandbox: http://localhost:8080/games/sandbox/
The old http://localhost:8080/game.html URL still redirects to the demo.

Creator handbook: http://localhost:8080/docs/

## Build Your Game

Open this repository in your AI coding tool and read [AGENTS.md](./AGENTS.md).
Snapshot the boundary, copy the complete [games/template](./games/template/) folder
to `games/<your-game>/`, and prompt the AI to work only inside that copy. Each game
has its own page and URL; do not replace the demo or edit a shared launcher.

The engine, sandbox, starter, shared assets and other games are protected during
game development. Supported API/configuration options are yours to use; changes
to shared code require separately approved maintenance. The content-based checker
detects out-of-scope edits, including untracked files, but is not a filesystem lock.
See [docs/new-game.md](./docs/new-game.md) for exact commands and limits.

## Docs

See **[docs/index.html](./docs/index.html)** for what game creators can prompt. Technical notes live in **[docs/README.md](./docs/README.md)**.

- [Walking module](./docs/walking-module.md) — locomotion
- [Vehicle module](./docs/vehicle-module.md) — Jolt cars, bus, Kenworth + trailer
- [Water module](./docs/water-module.md) — buoyancy, pool, boat
- [Interaction](./docs/interaction-module.md) — E / F / G, carry, inventory
- [Effects](./docs/effects-module.md) — particles, weather, day/night
- [Textures](./docs/pbr-module.md) — color-only painterly materials
- [New game](./docs/new-game.md) - copy a complete starter and verify isolation
- [AI prompt](./docs/ai-prompt.md) — copy-paste for assisted development

## Sandbox Controls

| Key                              | Action                                     |
| -------------------------------- | ------------------------------------------ |
| WASD                             | Move / drive / boat thrust                 |
| Shift                            | Run                                        |
| C                                | Crouch                                     |
| Space                            | Jump (handbrake while seated)              |
| E                                | Enter / exit vehicle or boat (look at it)  |
| F                                | Carry / drop crate                         |
| G                                | Stow crate into inventory                  |
| Scroll (third person)            | Zoom camera closer / farther               |
| Scroll (while holding)           | Move held item closer / farther            |
| Right mouse drag (while holding) | Rotate held item                           |
| 1–9                              | Drop that inventory slot                   |
| V                                | Toggle first / third person                |
| L                                | Flashlight                                 |
| Drag (hold left mouse)           | Look around (drag mode)                    |
| Click canvas                     | Capture mouse for free look (capture mode) |
| Esc                              | Release captured mouse                     |

Settings are in the **lil-gui** panel (top-right): camera, optional day/night, rain, snow.

## Stack

Three.js 0.186 WebGPU + TSL, Jolt Physics 1.1.0, lil-gui — all from CDN via import map.

See the [r186 upgrade assessment](./docs/three-r186.md) for compatibility changes and visual/performance candidates.

## Layout

```
src/
  engine/       WebGPU loop, scene, clock
  input/        Keyboard + mouse (edge-press when passed engine)
  physics/      Jolt CharacterVirtual, bodies, water volumes
  camera/       First / third person
  player/       Player, R6 model, carry, inventory, interaction
  vehicle/      Wheeled vehicles + boat
  world/        Pool, fire pit, fountain, trampoline, fan
  graphics/     Lighting, materials, particles, weather
  assets/       Optional GLTF loader
games/
  sandbox/      Protected reference demo, own index.html and scripts/
  template/     Protected copyable starter, own index.html and scripts/
  <your-game>/  Your page, scripts, assets, styles, docs and tests
tools/          Maintainer tooling and game-boundary checker
AGENTS.md       Game ownership and maintenance rules
docs/           Architecture and guides
```

## Audit and checks

See the [three-pass audit](./docs/audit-2026-09-08.md) for tested fixes, measured asset costs, and remaining engine risks.

Optional regression checks (Node 24; not required to run the game):

```bash
node --test tests/*.test.mjs
```

With the PHP server running, `node tests/browser-check.mjs` checks the website, an
unmodified starter copied to a temporary game folder, and the sandbox using installed
Chrome. It covers real starter movement/jump/landing and desktop/mobile AO/weather.
Allow up to 90 seconds for cold game startup and use a WebGPU-capable Chrome/GPU.
Set `CHROME_PATH` or `NGIN_URL` to override its browser path or server address.
No npm dependencies are required. Set `NGIN_STARTER=1` for the starter-only check,
then clear the variable. The temporary copied game is removed after the run.

The suite includes a pixel-level AO regression: contact shadows must darken, not brighten, and unlit billboards must remain unchanged. Set `NGIN_AO=1` to run only that small fixture (clear the variable afterward).

For the camera-sweep stall regression in PowerShell:

```powershell
$env:NGIN_PERF='1'
node tests/browser-check.mjs
Remove-Item Env:NGIN_PERF
```

It checks AO toggles, weather and third-person views for new shader builds and frame gaps of 250 ms or more. It reports boot time, render submission time and draw counts; passing does not guarantee a smooth frame rate. Set `NGIN_CPU=1` as well to collect a CPU profile (adds measurement overhead).
