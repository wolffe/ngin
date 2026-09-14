# Color textures

Nearest-filtered maps generated at runtime. No image packs.

Block sets (three shades each) live in `src/graphics/BlockTextures.js`:

```js
import { createBlockTextures } from "./graphics/BlockTextures.js";
import { createMaterialLibrary } from "./graphics/MaterialLibrary.js";

const { grass, dirt, rock, rustyMetal, grassBlock } = createBlockTextures();
const materials = createMaterialLibrary();
materials.get("grass");      // shade 0
materials.get("grass", 2);   // shade 2
materials.pack("rustyMetal"); // [0, 1, 2]
```

`grassBlock` is the dirt cube with a grass top and ragged grass sides. Generators for wood, brick, stone, and the noise helpers stay in `ProceduralTextures.js`.
