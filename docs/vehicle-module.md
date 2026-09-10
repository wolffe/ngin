# Vehicle module

Reusable Jolt wheeled vehicles for static HTML + ES module games. No build step.

Requires [jolt-physics 1.1.0](https://github.com/jrouwe/JoltPhysics.js/releases), included in the [starter page's import map](../games/template/index.html).

## Architecture

```
createVehicle(engine, physics, materials, player, input, spawn)
        │
        ├── BoxShape + OffsetCenterOfMass  →  dynamic body (LAYER_MOVING)
        ├── WheeledVehicleController       →  4WD, Jolt automatic gearbox
        ├── chassis Group + part meshes    →  synced by physics.syncDynamicMeshes
        └── bindSeat (Occupancy)            →  E enter/exit
        └── onPreStep / onUpdate           →  driver input, wheels, cosmetic lean
```

| Piece     | Path                              | Role                                                          |
| --------- | --------------------------------- | ------------------------------------------------------------- |
| Vehicle   | `src/vehicle/Vehicle.js`          | Profiles, physics, meshes, towing                             |
| Physics   | `src/physics/PhysicsWorld.js`     | Jolt world, `dynamicBodies`, `onPreStep`                      |
| Materials | `src/graphics/MaterialLibrary.js` | Paint, chrome, glass, rubber, lights                          |
| Occupancy | `src/player/Occupancy.js`         | `bindSeat` — look-at E for cars and boats                     |
| Player    | `src/player/Player.js`            | `disable` / `setFollowTarget` / `aimOrbitBehind` while seated |

Pass `interaction: use.interaction` in spawn so enter is look-at (E). There is no radius poll. Exit is E while seated.

Cars and boats share `bindSeat` in `src/player/Occupancy.js` (enter volume, look-at E, leftover W/S ignore). Driving stays in this file.

## Boot

After `createPlayer(...)`:

```js
import { createVehicle } from "./vehicle/Vehicle.js";

createVehicle(engine, physics, materials, player, input, {
    kind: "car",
    x: 0,
    y: 1.15,
    z: -12,
    interaction,
});
```

`kind`: `'car'` | `'truck'` | `'bus'` | `'kenworth'`. Defaults: `kind: 'car'`, `id: vehicle_${kind}`, `y: spec.spawnY`, `z: -12`.

Sandbox spawns all four in a line at `z = -12`.

## Controls (while seated)

| Key   | Action                                 |
| ----- | -------------------------------------- |
| W / ↑ | Accelerate                             |
| S / ↓ | Reverse                                |
| A / D | Steer                                  |
| Space | Handbrake (brightens red brake lights) |
| L     | Headlights on / off                    |
| E     | Enter / exit                           |

Opposite of travel **only brakes**. After a stop, that key hold does not change direction — release and press again. Entering ignores leftover W/S from walking until those keys are released.

## Profiles

Dynamics that feel the same on every vehicle live in `SHARED` (COM, anti-roll, suspension frequency/damping, cosmetic lean gains). Per-kind differences are size, mass, torque, brakes, steer angle.

|                   | Car          | Truck        | Bus          | Kenworth (cab) |
| ----------------- | ------------ | ------------ | ------------ | -------------- |
| Mass              | 1500 kg      | 5200 kg      | 9000 kg      | 7500 kg        |
| Torque            | 500 Nm       | 3800 Nm      | 4200 Nm      | 5500 Nm        |
| Brake / handbrake | 3200 / 14000 | 7200 / 32000 | 9500 / 38000 | 10000 / 42000  |
| Max steer         | 32°          | 28°          | 24°          | 34°            |
| Enter radius      | 3.2 m        | 4.2 m        | 4.8 m        | 5.0 m          |

## Physics

- Compound hull (`StaticCompoundShape`): floor pan plus cabin / body boxes so the player cannot walk through the cab.
- `EOverrideMassProperties_CalculateInertia` — mass from the profile, inertia from the box.
- `WheeledVehicleController`, 4WD (front + rear diffs, `mEngineTorqueRatio 0.5` each).
- Anti-roll 600 N/m front and rear; `mMaxPitchRollAngle` 60°.
- Wheel collision: `VehicleCollisionTesterCastCylinder` on `LAYER_MOVING`.

## Visuals

Primitive meshes (body, cabin, glass, bumpers, lights). Wheels: rubber tyre + chrome rim, posed with `constraint.GetWheelLocalTransform`.

Tire dust (`type: 'dust'`) emits from the contact patches. Rate follows chassis speed (none below ~3 m/s, full by ~17 m/s). The Kenworth trailer has its own emitter.

`physics.step` copies body position and rotation onto `chassis` (via `syncDynamicMeshes`). Cosmetic roll/pitch is then applied with `chassis.rotateZ` / `rotateX`:

- Roll = `rollGain × (fwdSpeed × yawRate)`
- Pitch = `pitchGain × longitudinalAccel`
- Limits ±4.2° roll, ±2.5° pitch; `dynSmooth` 0.12 per physics step

## Towing (Kenworth)

Cab + box trailer. Trailer is a second wheeled body (no engine, no steer) linked with a **world-space `PointConstraint`** (kingpin). Hitch `RVec3` is the cab rear.

Cab–trailer collision is disabled with `GroupFilterTable` so contact does not weld the pair.

Trailer: 4000 kg, 5.5 m half-length, brakes only.

## Enter / exit

- **E** while looking at the enter volume (`maxDistance` = `enterRadius`). Shared with boats.
- Player moved to `(0, -20, 0)` and `player.disable()`; camera follows the chassis.
- Exit places the player `exitSide` metres to the right of the cab; `SetDriverInput(0,0,0,0)`.

## API

```js
const v = createVehicle(engine, physics, materials, player, input, spawn);

v.kind; // profile name
v.chassis; // THREE.Group
v.body; // Jolt body
v.occupied; // getter
v.enter();
v.exit();
```
