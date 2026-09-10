# Walking module

Reusable first/third-person locomotion for static HTML + ES module games. No build step.

Creator handbook (prompts, not APIs): [index.html](./index.html)

## Architecture

```
games/<slug>/index.html → scripts/main.js → scripts/game.js
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   createEngine         createInputManager    createPhysicsWorld
         │                    │                    │
         └──────── createPlayer ◄─────────────────┘
                              │
                    createCharacterModel
```

| Module    | Path                           | Role                                                 |
| --------- | ------------------------------ | ---------------------------------------------------- |
| Engine    | `src/engine/`                  | WebGPU renderer, scene graph, update loop            |
| Input     | `src/input/`                   | WASD, jump, crouch, sprint, mouse look               |
| Physics   | `src/physics/PhysicsWorld.js`  | Jolt 1.1.0 CharacterVirtual + static/dynamic bodies  |
| Camera    | `src/camera/CameraManager.js`  | First-person and third-person orbit                  |
| Player    | `src/player/Player.js`         | Wires input, physics, camera, character              |
| Character | `src/player/CharacterModel.js` | R6 block model + limb swing                          |
| Vehicle   | `src/vehicle/Vehicle.js`       | See [vehicle-module.md](./vehicle-module.md)         |
| Water     | `src/physics/Water.js`         | See [water-module.md](./water-module.md)             |
| Use       | `src/player/Use.js`            | See [interaction-module.md](./interaction-module.md) |
| Graphics  | `src/graphics/`                | Environment, TSL materials, particles, weather       |
| Assets    | `src/assets/AssetManager.js`   | GLTF/texture cache; place with `placeGltf`           |

## Boot pattern

Every game follows the same sequence (see [games/template/scripts/game.js](../games/template/scripts/game.js)).
The [reference sandbox](../games/sandbox/scripts/sandbox.js) is a separate protected game.
Copy the starter folder; never replace the demo startup. See [new-game.md](./new-game.md).

1. `createEngine(canvas)` — async WebGPU init
2. `createInputManager(canvas, engine)` — keyboard + pointer; call `setLookMode('drag' | 'capture')`
3. `createPhysicsWorld(engine)` — registers `physics` on the engine
4. `createEnvironment(engine)` + `environment.load(preset)`
5. Build level meshes with `engine.add(mesh)` and matching `physics.addStaticBox(...)`
6. `createCharacterModel()` — sync; returns `{ root, modelHeight, anchorHeight, setVisible, setTransform, update }`
7. `createPlayer(engine, physics, input, settings, character)` — hooks `engine.onUpdate`
8. `engine.start()`

## Settings object

Locomotion (walk/run/crouch speeds, jump, capsule & eye heights) is fixed inside `Player.js`. Games only pass camera/view options:

| Key                   | Default         | Notes                                              |
| --------------------- | --------------- | -------------------------------------------------- |
| `alwaysRun`           | `false`         | When true, move at run speed without holding Shift |
| `invertMouse`         | `false`         | Invert vertical look                               |
| `viewMode`            | `'firstPerson'` | `'thirdPerson'` shows character                    |
| `lookMode`            | `'drag'`        | `'capture'` = pointer lock                         |
| `fov`                 | 75              |                                                    |
| `mouseSensitivity`    | 0.003           |                                                    |
| `thirdPersonDistance` | 3               | Orbit distance; scroll zooms (about 1.2–14 m)      |
| `thirdPersonHeight`   | 0.5             | Camera height above the follow point               |

Built-in locomotion: walk 4 · run 7 · crouch 2 · jump 8 · standing height 1.8 · crouch height 1.0 · eyes 1.6 / 0.9.

## Player API

```js
const player = createPlayer(engine, physics, input, settings, character);

player.setViewMode("firstPerson" | "thirdPerson");
player.toggleViewMode();
player.enable();
player.disable(); // seated in a vehicle
player.setFollowTarget(() => pos); // camera follow override; hides character
player.clearFollowTarget();
player.aimOrbitBehind(subjectYaw); // third-person orbit behind a vehicle
player.refreshCameraBindings(); // after sensitivity/distance changes
```

Third-person body rotation only updates while moving; idle keeps last facing. First-person uses camera yaw for movement direction. Crouch in third person bends the knees (squat). The third-person camera stays at standing height and does not dip. Scroll zooms the orbit.

## Character model API

```js
const character = createCharacterModel();

engine.add(character.root);
character.setVisible(settings.viewMode === "thirdPerson");

// Each frame (third person only — Player handles this):
character.setTransform(feetY, x, z, facingY, crouchT);
character.update(dt, { speed, grounded, runSpeed });
```

## Physics API

```js
physics.createCharacter({ height, radius, position });
physics.addStaticBox(id, { x, y, z }, halfExtents, meshOptional, rotationEuler, extras?);
physics.addStaticConvexHull(id, position, localPoints, meshOptional);
physics.addStaticMesh(id, position, localTris, meshOptional);
physics.addForceField({ origin, direction, reach, radius, acceleration });
physics.addDynamicBox(id, position, halfExtents, mesh, mass, extras?);
physics.addDynamicSphere(id, position, radius, mesh, mass, extras?);
physics.removeDynamic(id);
physics.setCarriedBody(body | null);
physics.onPreStep(fn);
physics.syncDynamicMeshes();
physics.moveCharacter(wishDir, speed, jump, dt, jumpForce);
physics.getCharacterPosition();
physics.setCharacterPosition(x, y, z);
physics.halfHeight(height, radius);
physics.character // { position, velocity, grounded, height, radius }
```

No implicit ground — add a static floor box. Static boxes may include Euler rotation. `addStaticMesh` takes a flat xyz triangle list in body-local space (used by GLB scenery). `extras.bounce` on a static box is a trampoline (launch speed along the ground normal). `addForceField` is a cylinder volume that accelerates the character and dynamic bodies (fans). `physics.step` copies dynamic body pose onto each entry’s `mesh`.

## Input API

```js
input.isAction("jump" | "crouch" | "sprint" | "interact" | "carry" | "stow");
input.wasPressed("interact"); // one frame
input.getMove(); // { x, z } from WASD, normalized intent
input.consumeMouseDelta(); // look { dx, dy } — camera bindings
input.consumeTurnDelta(); // RMB { dx, dy } — carry tumble
input.consumeWheel(); // signed step
input.setLookMode("drag" | "capture");
```

## Environment presets

`environment.load('default-overcast')` — also: `sunny`, `dusk`, `night`, `industrial`. Optional day/night: `environment.setCycle(true)` — see [effects-module.md](./effects-module.md).

Pixelated maps: `grassTexture()` / `dirtTexture()` / `stoneTexture()` / `grassBlockAtlas()` / `grassTuftTexture()` / `tennisTexture()` / `skyboxTexture()` from `src/graphics/ProceduralTextures.js` (16 px tiles, muted palettes). Grass blocks use a top/side/bottom atlas.

The sandbox map is 128 m. Northwest corner: `createVoxelHill` (instanced grass/dirt/stone cubes + grass tufts).

Box meshes with a `map` should call `applyWorldUVs(geometry, tileMetres, meshPosition)` from `src/graphics/WorldUVs.js` so tiles stay square on every face (default BoxGeometry UVs stretch).

## Optional assets

See [glb-module.md](./glb-module.md). Load with `createAssetManager`, place with `placeGltf` (clone + collider). Do not add `gltf.scene` raw.

Keep GLB props separate from the R6 player — skinned GLB on WebGPU needs careful scaling and bind-mode handling.

## Controls

WASD · Shift run · C crouch · Space jump · E enter/exit (look at vehicle/boat) · F carry · G stow · scroll zoom (third person) or hold distance · RMB rotate held item · V toggle view · drag or pointer-lock look (GUI setting).
