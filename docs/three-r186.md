# Three.js r186 assessment

Reviewed 2026-09-09. Upgrade: 0.185.0 to 0.186.0.

## Scope and decision

Reviewed every entry in the [r186 changelog](https://github.com/mrdoob/three.js/releases/tag/r186), the [185-to-186 migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186), and the tagged example sources for the highlighted effects. This is changelog-wide applicability triage, not a source-level audit of every upstream PR.

Keep the existing WebGPU/TSL architecture. Upgrade all four import-map entries together. Do not enable new visual features by default or infer an FPS gain without an A/B benchmark.

Implemented:

- Pin core, WebGPU, TSL and addons to 0.186.0. The import map now lives in the independent [sandbox page](../games/sandbox/index.html) and [starter page](../games/template/index.html); [game.html](../game.html) remains the demo's compatibility redirect.
- Update the website and creator documentation's version references.
- Remove the ignored GTAO `distanceFallOff` assignment in [AO.js](../src/graphics/AO.js).
- Initially give GTAO single-sampled depth to fix r186 `textureGather` validation errors with inherited MSAA depth. The subsequent performance fix below replaces this initial configuration and restores beauty-pass MSAA with AO enabled.
- Extend [browser-check.mjs](../tests/browser-check.mjs) to cover revision, boot, GPU errors, AO/weather, frame changes and nonblank desktop/mobile game screenshots.

## Most Relevant Changes

| Change                                                                                                                                               | Applies here?                                       | Visual/performance consequence                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GTAO: quadratic stepping, sphere falloff, clip-space marching, banding fix, baked sample counts (#33895, #33903, #33919, #33930, #33931)             | Initial upgrade path; subsequently replaced by SSAO | Better GTAO sampling/falloff and shader optimizations. Appearance changes even with the same radius/strength. Changing sample count recompiles the shader.                                                                  |
| PBR multiscattering, energy conservation and DFG LUT optimizations (#33983, #33984, #33985, #34046, #34055)                                          | Yes, standard/physical node materials               | More correct lighting and less shader work in affected paths. Rough metals and diffuse surfaces may change brightness; not a reason to retune all assets blindly. Iridescence/sheen-specific fixes are dormant unless used. |
| PMREM spiral blur (#32367)                                                                                                                           | Yes when PBR environment maps are filtered          | Changes rough environment reflections and filtering work. Primarily environment preparation, not a guaranteed per-frame saving.                                                                                             |
| Fullscreen pass MSAA removal and QuadMesh optimization (#33936, #33917)                                                                              | Yes when AO post-processing is active               | Avoid unnecessary fullscreen work. This does not make multisampled input depth valid for GTAO.                                                                                                                              |
| Bind-group comparisons, cache keys, refresh types, render-list/resource cleanup (#34276, #34288, #34162, #33941, #34327, related binding/node fixes) | Yes, renderer internals                             | Automatic correctness/overhead improvements; workload-dependent rather than a promised speedup.                                                                                                                             |
| Dynamic shadow-map size detection (#34360, #34361)                                                                                                   | Infrastructure benefit                              | Relevant if quality controls start resizing shadow maps. Our sun currently stays at 2048x2048.                                                                                                                              |
| Watertight triangle ray intersections (#33661)                                                                                                       | Yes, Three.js raycasts                              | More reliable hits at shared triangle edges. Does not change Jolt collision detection.                                                                                                                                      |
| GLTFLoader instancing, missing skin attributes, rotated texture transforms (#33927, #33988, #34033)                                                  | Optional GLB asset path                             | Fixes affected imported assets; the default sandbox's procedural assets do not demonstrate these cases.                                                                                                                     |

## Your Selections

### Retroreflection

[Tagged example](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_materials_retroreflection.html), introduced by #33949 with follow-up lighting, naming and update fixes (#34057, #33995, #34079, #33992).

Use `MeshPhysicalNodeMaterial` with `retroreflectivity` on reflective signs, cone bands, road markers or vehicle safety tape. The final r186 property is `retroreflectivity`, not the early changelog name `retroreflective`.

Our [vehicle lights](../src/vehicle/Lights.js) already illuminate surfaces with spotlights. Retroreflection belongs on the receiving surface, not the headlight bulb or beam. It is most visible when the camera is near the light direction, so test both driver and third-person views. It is a visual feature with added material shader cost, not an optimization.

The demo's wet pavement, planar reflection, blur, bloom and extra reflected light are separate effects. Upgrading or enabling retroreflectivity alone will not reproduce the entire image. Recommendation: try a small set of roadside reflectors first, without the expensive reflection stack.

### Fog Scattering

[Tagged example](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_custom_fog_scattering.html), with #34491 and 511de1d refinements.

The example blends scene color with a Gaussian-blurred version using a depth-derived exponential fog factor. Blur runs at half resolution. It also instances tree variants and limits camera distance where fog has hidden nearly all scene color.

Our [environment](../src/graphics/Environment.js) uses a linear TSL fog node and day/night uniforms. A matching depth-weighted blur could soften distant industrial silhouettes and improve atmospheric depth. It must use our fog curve and share the AO pipeline: both cannot independently replace `engine.setDraw()`.

This is a screen-space approximation, not volumetric light transport or shadowed headlight shafts. #34319's separate volumetric fog example is more relevant to visible beams, with a larger GPU budget. Recommendation: optional half-resolution scattering, followed by profiling. Fog itself does not cull geometry; shorter far distance is a separate optimization that needs scene-aware limits.

### SunLight Cleanup and Two Cascades

[#34258](https://github.com/mrdoob/three.js/pull/34258) removes a redundant fade ternary, derives cascade camera orientation directly from the light matrix, moves invariant snap-resolution work outside the loop, removes the public shadow-class export and aligns style. It is mostly cleanup with small local savings, not a new sunlight effect.

[52184ab](https://github.com/mrdoob/three.js/commit/52184ab39216913eb2984cbcffaf0efe1b677378) changes the SunLight shadow cascade count from four to two and its atlas from 2x2 to 2x1. That reduces cascade rendering and atlas storage relative to the earlier four-cascade implementation at equal per-cascade resolution. It does not halve total frame cost.

At the initial dependency upgrade, our sun was a camera-following `DirectionalLight` with one 2048x2048 shadow map over a 128-unit-wide region. The four-to-two upstream change did not reduce its cost.

SunLight was introduced in #34221, gained WebGPU support in #34259 and moved to addons in #34326. It requires node-library registration with WebGPURenderer. It has no `target`: its position defines a direction toward the origin.

Follow-up adoption on 2026-09-09: `createEnvironment` now registers and uses SunLight, removing the manual orthographic bounds, target and camera-follow hook. Two 2048x2048 cascades share a 4096x2048 atlas, with a maximum view-depth range of 128 world units. Native cascade fitting, texel snapping and transition blending handle camera movement. Both cascade cameras stay on layer 0, excluding weather/particles. Preset replacement disposes the old sun. Day/night changes the light direction directly and preserves the existing colors, intensities, fog and exposure.

This prioritizes outdoor shadow coverage and less application code. At the same per-map resolution, the atlas has twice the pixel area of the previous single map, and renders two cascade views. No GPU speedup is claimed. Browser checks cover native registration, both cascade cameras, movement tracking, day/night, disposal, AO/weather and desktop/mobile rendering. Clouds and god rays remain separate future work.

## Performance Follow-Up

Reported AO-toggle and first-view stalls were traced to new shader variants during gameplay. The sandbox now warms one shared beauty pipeline, including third-person, weather and lamp states, before exposing controls. AO is half-resolution SSAO with eight samples and an opaque-only normal/depth prepass. It affects ambient lighting instead of multiplying the finished scene, excluding unlit billboards from the darkening. Beauty-pass MSAA is retained. See [effects](./effects-module.md).

Solid materials now share uniform-backed properties, native WebGPU uses clustered point lights, and the engine uses `renderer.setAnimationLoop()`. The default static building opts into material-based geometry batching, preserving its collision mesh. In the 1280x720 camera-sweep probe, batching reduced peak draw calls from approximately 2,100 to 990 without reducing triangle detail or shadow resolution.

The performance probe enforces no new shader builds and no frame gap of 250 ms or more across AO toggles, camera turns, weather and third-person scenarios. This is a stall regression gate, not a smooth-frame-rate guarantee. Measured startup and frame times vary substantially with machine load; cold shader preparation remains expensive. It is not an r185/r186 A/B benchmark.

AO correctness follow-up: fixed a chained TSL `mix` expression that output the toggle strength instead of blending between 1 and occlusion. Also scheduled the normal/depth and SSAO work before the beauty pass to avoid nested scene-render state interference. A cube/floor pixel regression now checks actual darkening, no brightening, unchanged billboards and toggle restoration. Intensity is 3; resolution and sample count remain unchanged. Earlier nonblank-render tests and performance passes did not establish AO correctness.

## Other Candidates

- `SSAONode` with depth-aware blur (#33921): adopted in the performance follow-up above.
- `softParticles()` (#33887): could soften spray, smoke/dust and snow intersections with terrain. Needs scene depth and careful composition, so it is not a drop-in material flag.
- Sky/SkyMesh cloud improvements (#33942), slower cloud speed and overflow fix (#34058): useful for a procedural animated sky, but our sky is a generated texture, so no new clouds appear automatically.
- LightProbeGrid WebGPU support and incremental baking (#33913, #34486): useful for static indoor/industrial indirect lighting. Baking and changing day/night need an explicit strategy.
- Faster BloomNode blur (#33923): relevant if adding controlled lamp/emissive bloom. We have no bloom pass today. DualKawaseBloomNode was added and removed within this release; do not import it.
- OITPassNode (#34253, #34274): possible solution for complex overlapping transparent effects, but adds render work and is not automatically preferable to the current particles/water.
- VXGINode (#34402): dynamic diffuse GI experiment, not a low-cost default for this sandbox.
- Improved fog-example instancing/far clipping and rain/clustered-light demos: useful techniques, not automatic improvements to our CPU-updated weather or existing light setup.

## Remaining Changelog Coverage

All remaining entries were considered; these groups do not require game changes for this upgrade:

- Core animation bookkeeping, interpolation, serialization/copy, clipping persistence, geometry disposal, bitmap-loader fixes, large power-of-two math, frustum extension and Object3D disposal: fixes are inherited where those APIs run. No custom Object3D subclasses or geometry reuse-after-dispose were found in the game code reviewed.
- WebGPU compute/atomics, storage textures/buffers, integer/interleaved attributes, occlusion queries, render bundles, array cameras, 3D targets, XR/MSAA layers, packed dot products and timestamp fixes: relevant infrastructure, but these specialized paths are not used by this game.
- WebGLRenderer-only fixes and classic UnrealBloomPass optimizations: not the active native WebGPU renderer. WebGLBackend/WebGLOutput fixes can matter for WebGPURenderer's fallback, which is distinct from WebGLRenderer.
- TSL math/type/bitcast/packing/subgroup fixes, code-builder improvements, rotation/billboard options, node lifetime/cache fixes and tree-shaking: inherited for used nodes; compute/math extensions need explicit adoption. CDN builds here are not tree-shaken by an application bundler.
- BatchedMesh, skinning limits, line/toon nodes, RTT, SSR, DOF, denoise, SMAA, SSAA, temporal helpers, clustered-light disposal and wood material changes: no direct matching configured effect in this sandbox. Our weather uses InstancedMesh, not BatchedMesh.
- Gaussian splats/SPZ/PLY and glTF splat extensions, Rhino/3DM/3MF/FBX/USD/PCD/MaterialX loaders, exporters, CSS2D/HTMLMesh, Sculptor and procedural city/building tools: optional future asset/tooling capabilities, not current game features or automatic rendering upgrades.
- Inspector, controls addons, XR controllers and editor changes: the game uses lil-gui and its own input/player/camera logic. Upstream FirstPersonControls changes do not change our controls.
- Docs, manual, tour, tests, CI, devtools, screenshots, example assets/tags, formatting and build tooling: no direct runtime effect. Minified builds were removed, but our imports already use unminified modules. CommonJS deprecation does not affect browser ES modules.

## Migration Checks and Verification

The migration-guide removals/renames for PCFSoftShadowMap, Source, LightProbeGrid, Sky's up uniform, SimplifyModifier and toTrianglesDrawMode have no matching application use. DotScreen/RGBShift changes do not apply. Renderer disposal is now async; our terminal shutdown calls it without doing subsequent GPU work, so this upgrade does not require changing the engine's public API.

Verification includes the published CDN URLs, seven existing unit tests, website layout/link checks, and live native-WebGPU boot and AO-on rendering. The browser regression captures desktop/mobile screenshots, checks console/GPU errors, and verifies static-model batching geometry and collision invariants. This is not exhaustive vehicle gameplay, fallback-renderer coverage, arbitrary imported-GLB coverage or an r185/r186 performance benchmark.
