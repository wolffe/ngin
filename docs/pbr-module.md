# Painterly textures

Color-only textures from the supplied `Free Painterly Textures 1k.zip`, extracted into `assets/textures/painterly/`. The archive contains 30 PNGs; no license or readme was included. Keep the original archive and confirm its source terms before redistribution.

## Load

```js
import { loadPainterlyMaterial } from "./graphics/MaterialLibrary.js";

const mat = await loadPainterlyMaterial(assets, "Worn Crate.png");
const geo = new THREE.BoxGeometry(2, 2, 2);
applyWorldUVs(geo, 2, origin);
const mesh = new THREE.Mesh(geo, mat);
```

The loader uses one sRGB color map, repeating UVs, mipmaps and 4x anisotropy. Materials remain lit and fog-aware (`MeshStandardNodeMaterial`, roughness 0.9, metalness 0), so existing lights, shadows and day/night still work. There are no normal, metallic, roughness, baked AO or height maps, no custom displacement shader, and no geometry preparation or subdivision requirement.

## Sandbox

Eight boxes cycle four textures: `Worn Crate.png`, `Mossy Wooden Planks.png`, `CobbleStoneGreyBrown.png`, and `PlasterMossy.png`. Only these four 1024x1024 images load during sandbox startup: 5,466,627 bytes (5.47 MB), compared with 48.79 MB for the former 24 PBR maps. Each box uses 12 triangles instead of the old displacement mesh's 3,072. The displacement setting and GUI slider have been removed.

Other extracted textures are available for future scenery without being loaded automatically. Screen-space ambient occlusion remains a separate optional effect. Procedural terrain, water animation, vehicle materials and imported models retain their existing appearance.

This document keeps its original URL for existing handbook links; the old multi-map PBR loader and texture folders have been removed.
