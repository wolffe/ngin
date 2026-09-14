# Effects: particles, weather, day/night

## Particles

`createParticleEmitter(engine, opts)` in `src/graphics/Particles.js`. Camera-facing quads. One factory, named types:

| type     | Where                       |
| -------- | --------------------------- |
| `fire`   | Campfire puffs              |
| `smoke`  | Rising grey column          |
| `sparks` | Short ballistic specks      |
| `spray`  | Hose / fountain jet         |
| `dust`   | Tire dirt, rate from speed  |
| `wake`   | Boat spray, rate from speed |

```js
createParticleEmitter(engine, { type: "smoke", position: { x, y, z } });

const dust = createParticleEmitter(engine, {
    type: "dust",
    rate: 0,
    getOrigin: () => wheelPos,
    getDrift: () => ({ x: -vx * 0.18, y: 0.25, z: -vz * 0.18 }),
});
dust.setRate(speed01); // 0–1
```

`createFirePuffs` is `type: 'fire'`. Soft disc map for now; pass `map` to swap in a texture. All puffs take scene fog; additive types (fire, sparks, wake) fade to black in fog so they do not glow through it.

Sandbox: fire pit uses fire + sparks + smoke; fountain uses spray; every vehicle emits dust; both boats emit wake.

## Weather

`createWeather(engine)` — rain (vertical streaks) and snow (camera-facing flakes), off by default. They spawn around the camera and recycle when you walk away. Streaks and flakes use small nearest-filtered pixel-art textures so they stay crisp without lowering the screen resolution.

```js
weather.setRain(true);
weather.setSnow(true);
```

GUI toggles in the sandbox.

## Ambient occlusion

`createAO(engine)` uses half-resolution SSAO with eight samples, a 0.6-unit radius and intensity 3 for readable contact shading on block-style geometry. It is off by default. A single-sampled, opaque layer-0 normal/depth prepass excludes particle and weather billboards. AO affects ambient lighting through `builtinAOContext`, not the final scene color, so unlit smoke/fire are not darkened by a fullscreen multiply. The beauty pass retains MSAA.

AO on/off shares one beauty pipeline: the toggle changes a uniform and skips the prepass/SSAO updates while off. The sandbox precompiles materials and exercises third-person, weather and lamp variants behind the loading screen. New materials or light configurations introduced later still require their own warm-up.

The normal/depth and SSAO passes run explicitly before the beauty pass, not recursively while a scene material is rendering. The toggle uses `mix(1, ao, strength)`: in TSL, chained `factor.mix(first, second)` takes the factor as its receiver, so `float(1).mix(ao, strength)` would incorrectly output the strength itself.

The browser regression compares a stationary ambient-lit cube/floor with AO off, on, and off again. It requires visible contact darkening, no image brightening, unchanged unlit billboard color, and exact restoration when disabled. An error-free or merely nonblank render does not prove that AO works.

`softParticles()` fades intersections against scene depth. It can improve smoke/spray contact edges, but does not fix AO composition or shader-compilation stalls; it is not currently enabled.

## Day / night (optional)

`createEnvironment` loads named presets (`default-overcast`, `sunny`, `dusk`, `night`, `industrial`).

Optional cycle, off until you turn it on:

```js
environment.setCycle(true);
environment.setTimeOfDay(0.5); // 0 midnight · 0.25 dawn · 0.5 noon · 0.75 dusk
```

Moves the sun, intensity, fog, and exposure. Night is navy, not pitch black. Does not rebuild the sky cubemap every frame. Lit textured surfaces darken with the rest of the scene.

The sun uses the r186 `SunLight` addon with two automatically fitted, texel-stabilized cascades. Shadows cover up to 128 world units of view depth, with 2048x2048 per cascade in a 4096x2048 atlas. Cascade cameras render layer 0 only, excluding layer-1 particles and weather. Larger worlds do not require a world-fixed ortho box; shadow distance and resolution remain quality/performance tradeoffs.

## Lighting

Native WebGPU uses Three's clustered point-light addon. Spotlights and SunLight remain on the normal lighting path. Solid material colors and lamp emissive intensities use native uniform-backed properties so color variations can share shader programs.

`MaterialLibrary` uses `MeshStandardNodeMaterial` for solids and 16×16 procedural maps (`grass`, `dirt`, `stone`, `rock`, `wood`, `brick`). Textured ground uses `createMappedMaterial` (lit + fog). Do not use `MeshBasicNodeMaterial` for grass. `createEnvironment` registers `SunLightNode` with the renderer and creates a shadow-casting `SunLight`; its position is a direction toward the sun, not a camera-relative location, and it has no target. Player flashlight: `createFlashlight(engine, input, player, settings)` in `src/player/Flashlight.js`, toggle with L on foot (disabled while seated). Vehicle / boat lamps: `attachLamps` in `src/vehicle/Lights.js`, L toggles headlights while seated; braking brightens red tails. Fog is `THREE.Fog` plus a matching `scene.fogNode`, driven by the preset and the cycle.
