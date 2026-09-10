# Water, pool, boat

Buoyancy volumes, an in-ground pool, and rideable boats. No fake Y-lock — Jolt floats the bodies.

## Water volume

`createWaterVolume(physics, bounds)` in `src/physics/Water.js`.

Each physics step, every **dynamic** body whose position is inside the AABB gets `BodyInterface.ApplyBuoyancyImpulse` against a horizontal surface at `surfaceY`. The AABB clamp is required: Jolt’s impulse is an **infinite plane**.

| Option | Role |
|--------|------|
| `minX maxX minZ maxZ minY` | Volume |
| `surfaceY` | Water plane |
| `maxY` | Stop applying impulse above this (default `surfaceY + 3`, so a hull whose COM sits above the plane still floats) |
| `buoyancy` | Default 1.2; per-body `entry.buoyancy` overrides |
| `linearDrag` / `angularDrag` | Fluid drag |

Bodies store `{ buoyancy, mass }` on `physics.dynamicBodies` (set via `addDynamicBox` / `addDynamicSphere` extras).

Visual: `createWaterSurface(engine, { x, z, width, length, y })` — transparent plane, TSL sine wave on `positionNode`.

## Pool

`createPoolInGround(engine, physics, materials, opts)` in `src/world/Pool.js`.

Four grass slabs around a rectangular hole, plus a concrete basin (floor to rim), water volume, and surface.

Sandbox: center `(28, 34)`, inner `36 × 22`, depth `1.4`, ground `128` m. Jump (v²/2g ≈ 1.8 m) is enough to climb out.

## Boat

`createBoat(engine, physics, materials, player, input, spawn)` in `src/vehicle/Boat.js`.

`kind`: `'fishing'` | `'speedboat'`. Default `'fishing'`.

| | Fishing | Speedboat |
|---|---|---|
| Mass | 180 kg | 220 kg |
| Thrust | 2400 | 5600 |
| Yaw torque | 1100 | 1400 |
| Damping | high | lower |

Dynamic hull + water buoyancy. While seated: W/S `AddForce` along hull forward, A/D `AddTorque` yaw.

Wake spray (`type: 'wake'`) comes off the stern and sides. Rate follows hull speed (none below ~1.2 m/s, full by ~8 m/s).

Look-at **E** is shared with cars (`bindSeat` in `src/player/Occupancy.js`): one enter volume, same-frame skip, leftover W/S ignored until release. One seat at a time.

```js
createBoat(engine, physics, materials, player, input, {
  kind: 'speedboat', x, y, z, interaction,
});
```

Spawn `y` at about `waterSurfaceY + 0.25`. Needs a water volume or the hull will not float.

The walking character also uses the volume: buoyancy lifts them to the surface so they can step onto a hull from the water the same way as from the bank. Do not pin the capsule to a Y height.

## Floating objects

Any dynamic sphere/box that enters the volume will float according to `buoyancy`. A beach ball uses `buoyancy: 2.6` so it sits high on the surface.
