# AI prompt template

Use this in an AI coding tool with access to the NGIN repository. Replace the
game slug and task below. Explicitly attach [AGENTS.md](../AGENTS.md) if your tool
does not discover it automatically. This is a coding prompt, not runtime AI.

---

You are building a game using **NGIN**, a static HTML + ES module Three.js 0.186
WebGPU engine. No application build step, Vite, React, or custom locomotion.

**Writable scope:** `games/my-game/` only. If the slug is unspecified, ask before editing.

**Read first:** [AGENTS.md](../AGENTS.md), [new-game.md](./new-game.md), and the relevant
module guides. Reference demo: [games/sandbox/scripts/sandbox.js](../games/sandbox/scripts/sandbox.js).
Starter: [games/template/index.html](../games/template/index.html) and its complete folder.

**Before edits:** Run `node tools/game-boundary.mjs snapshot my-game` and retain
the printed baseline path. Copy the entire `games/template/` folder into the new
game folder, or continue the existing game without overwriting it.

**Protected:** All engine source, the sandbox demo, the template, shared assets,
other games, root pages, site/docs, shared tests/tooling, and agent rules. Read
them, but do not modify, delete, move, format, replace, or monkey-patch them.
Missing capabilities require a separately approved maintainer task.

**Stack to reuse (do not duplicate):**

- `src/engine/` — WebGPU loop
- `src/input/InputManager.js` — WASD, jump, crouch, sprint, mouse look, `wasPressed` (pass `engine`)
- `src/physics/PhysicsWorld.js` — Jolt 1.1.0 CharacterVirtual + static/dynamic bodies
- `src/physics/Water.js` — buoyancy volumes + water surface
- `src/camera/CameraManager.js` — first/third person
- `src/player/Player.js` + `src/player/CharacterModel.js` — R6 character + locomotion
- `src/player/Flashlight.js` — L toggles a camera spotlight
- `src/player/Use.js` — E/F/G look-at actions, carry, inventory
- `src/vehicle/Vehicle.js` — wheeled vehicles (`car`, `truck`, `bus`, `kenworth`)
- `src/vehicle/Boat.js` — buoyant boat
- `src/graphics/Environment.js`, `MaterialLibrary.js` (including `loadPainterlyMaterial`), `ProceduralTextures.js`, `Particles.js`, `Weather.js`

**Rules:**

- Vanilla JS, functional style (factory functions, closures). No classes.
- Every solid mesh needs a matching collider (`addStaticBox`, `addStaticConvexHull`, or `addStaticMesh` for GLB).
- Do not replace the R6 character with GLB for the player unless explicitly asked.
- Props: `src/assets/AssetManager.js` + `src/assets/placeGltf.js` (clone, do not add `gltf.scene` raw).
- Run from the repository root with `php -S localhost:8080`; launch `http://localhost:8080/games/my-game/`.
- Keep game-specific code, assets, styles, documentation and tests inside the selected folder.
- Preserve the copied page's import map/base and use module-relative URLs for game-local assets as described in the new-game guide.
- Reuse supported API/configuration options. Do not fork the engine or player controller into the game.
- Prioritize simple geometry, shared materials and responsive Roblox/Minecraft-style gameplay.
- Do not stage, commit, push or create branches.

**Task:** [describe your game — level layout, mechanics, UI]

**Deliver:** A playable, independently launched game in `games/my-game/`, with
game-specific tests and its URL. Do not change a shared launcher or replace the
demo. Run `node tools/game-boundary.mjs check <original-baseline-path>` before
reporting completion. Report violations or unavailable verification; never reset
the baseline or automatically revert someone else's changes. The checker detects
edits; it is not a filesystem lock.

---
