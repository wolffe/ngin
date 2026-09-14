# Color textures

Nearest-filtered maps generated at runtime. No image packs.

Block sets (three shades each) live in `src/graphics/BlockTextures.js`. `materials.get('grass')` picks a random shade; pass an index to pin one.

```js
import { createBlockTextures } from "./graphics/BlockTextures.js";
import { createMaterialLibrary } from "./graphics/MaterialLibrary.js";

const { grass, dirt, rock, rustyMetal, grassBlock, concrete, asphalt, metal } = createBlockTextures();
const materials = createMaterialLibrary();
materials.get("grass");
materials.get("concrete", 1);
materials.pack("paintedMetal");
```

Packs: grass, dirt, rock, rustyMetal, grassBlock, wood, brick, stone, concrete, asphalt, metal, plaster, corrugated, paintedMetal.

`grassBlock` is dirt with a grass top and ragged 16-pixel grass sides.
