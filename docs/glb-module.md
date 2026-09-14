# GLB models

Load a GLTF once, clone it into the world, optionally give it a collider. Carry is the same opt-in look-at as crates.

Creator handbook (prompts, not APIs): [index.html](./index.html)#glb

## Load

`createAssetManager()` in `src/assets/AssetManager.js` caches by URL. Do not add `gltf.scene` directly — a second place of the same URL would steal the first graph.

## Place

`placeGltf(engine, physics, gltf, opts)` in `src/assets/placeGltf.js` clones the scene.

```js
const gltf = await assets.loadGltf("./assets/models/prop.glb");
placeGltf(engine, physics, gltf, {
    id: "building",
    x: 24,
    z: -24,
    targetHeight: 12,
    body: "static-mesh",
});
```

| Option         | Role                                                                             |
| -------------- | -------------------------------------------------------------------------------- |
| `id`           | Physics id                                                                       |
| `x` `y` `z`    | Place on XZ; `y` defaults to sit on y = 0                                        |
| `targetHeight` | Uniform scale so the bbox height matches                                         |
| `scale`        | Extra multiply if you skip `targetHeight`                                        |
| `sitOnGround`  | Default true: feet on `y`                                                        |
| `body`         | `'none'` \| `'static-mesh'` \| `'dynamic-box'`                                   |
| `batchStatic`  | Opt-in merging of compatible opaque static meshes by material; defaults to false |
| `mass`         | Dynamic box mass                                                                 |
| `use`          | If set with `dynamic-box`, registers F carry / G stow                            |

Static scenery uses `physics.addStaticMesh` (Jolt `MeshShape` from the placed triangles). Dynamic props use a bbox box — concave mesh is not a Jolt dynamic.

The visual is parented to a holder at the bbox center so `syncDynamicMeshes` does not jump the scene origin.

Keep GLB props off the R6 player. Driveable cars use `createVehicle({ meshUrl })` in the vehicle module, not `placeGltf`.

Sandbox: `low_poly_building.glb` at `(24, -24)`, height 12 m, `static-mesh`, with `batchStatic: true`. Batching runs after collision triangle collection and does not mutate cached source geometry. Transparent, skinned, instanced, morph-target and mirrored parts are excluded; models with animation clips are not batched. Only opt in for scenery whose individual mesh transforms and identities will not be used later. The combined meshes have coarser frustum culling than their original parts.
