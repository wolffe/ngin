/**
 * Standard block maps: three shades per kind, same noise as ProceduralTextures.
 */

import {
  brickTexture,
  dirtTexture,
  grassBlockAtlas,
  grassTexture,
  noiseTexture,
  rockTexture,
  rustyMetalTexture,
  stoneTexture,
  woodTexture,
} from './ProceduralTextures.js';

export const VARIANT_COUNT = 3;

const GRASS_SHADES = [
  null,
  [
    [118, 142, 48],
    [96, 124, 40],
    [138, 152, 54],
    [78, 104, 36],
    [128, 136, 50],
    [108, 128, 44],
  ],
  [
    [158, 164, 56],
    [136, 148, 48],
    [184, 176, 68],
    [112, 128, 42],
    [170, 158, 60],
    [144, 150, 52],
  ],
];

const DIRT_SHADES = [
  null,
  [
    [138, 88, 44],
    [118, 72, 34],
    [152, 98, 48],
    [102, 62, 28],
    [128, 80, 38],
  ],
  [
    [186, 122, 58],
    [168, 104, 48],
    [204, 136, 66],
    [148, 88, 40],
    [176, 112, 52],
  ],
];

const ROCK_SHADES = [
  null,
  [
    [96, 90, 86],
    [78, 76, 74],
    [108, 100, 94],
    [66, 64, 62],
  ],
  [
    [132, 112, 88],
    [112, 96, 76],
    [148, 124, 96],
    [92, 80, 66],
  ],
];

const CONCRETE = [
  [
    [136, 134, 130],
    [120, 118, 116],
    [148, 146, 140],
    [108, 106, 104],
  ],
  [
    [118, 118, 116],
    [104, 104, 102],
    [130, 128, 124],
    [90, 90, 88],
  ],
  [
    [148, 144, 136],
    [132, 128, 122],
    [158, 152, 144],
    [114, 110, 106],
  ],
];

const ASPHALT = [
  [
    [58, 56, 54],
    [48, 48, 46],
    [70, 66, 62],
    [40, 40, 38],
  ],
  [
    [66, 62, 58],
    [54, 52, 48],
    [78, 72, 66],
    [44, 42, 40],
  ],
  [
    [52, 50, 52],
    [42, 42, 44],
    [62, 58, 60],
    [36, 36, 38],
  ],
];

const METAL = [
  [
    [124, 124, 122],
    [108, 108, 106],
    [138, 136, 132],
    [92, 92, 90],
  ],
  [
    [110, 112, 110],
    [94, 96, 94],
    [122, 122, 118],
    [80, 82, 80],
  ],
  [
    [132, 128, 118],
    [116, 112, 104],
    [144, 138, 126],
    [98, 96, 88],
  ],
];

const PLASTER = [
  [
    [186, 176, 158],
    [168, 160, 144],
    [198, 188, 168],
    [152, 146, 132],
  ],
  [
    [172, 164, 148],
    [154, 148, 134],
    [184, 174, 156],
    [138, 132, 120],
  ],
  [
    [158, 148, 128],
    [140, 132, 114],
    [170, 158, 136],
    [124, 116, 100],
  ],
];

const PAINT = [
  [
    [92, 108, 78],
    [76, 94, 66],
    [108, 118, 86],
    [64, 82, 58],
  ],
  [
    [108, 96, 64],
    [92, 82, 54],
    [122, 108, 72],
    [78, 70, 48],
  ],
  [
    [86, 90, 78],
    [70, 76, 68],
    [98, 100, 86],
    [58, 64, 56],
  ],
];

const rustCoverage = [0.28, 0.45, 0.68];

const trio = (fn) => [0, 1, 2].map(fn);

/**
 * @param {{ size?: number, repeat?: number }} [opts]
 */
export const createBlockTextures = (opts = {}) => {
  const size = opts.size ?? 64;
  const repeat = opts.repeat ?? 1;
  const n = (i, s) => s + i * 17;

  return {
    grass: trio((i) => grassTexture({ size, repeat, seed: n(i, 101), palette: GRASS_SHADES[i] ?? undefined })),
    dirt: trio((i) => dirtTexture({ size, repeat, seed: n(i, 419), palette: DIRT_SHADES[i] ?? undefined })),
    rock: trio((i) => rockTexture({ size, repeat, seed: n(i, 907), palette: ROCK_SHADES[i] ?? undefined })),
    rustyMetal: trio((i) => rustyMetalTexture({ size, repeat, seed: n(i, 1103), rust: rustCoverage[i] })),
    grassBlock: trio((i) =>
      grassBlockAtlas({
        size,
        seed: n(i, 101),
        grassPalette: GRASS_SHADES[i] ?? undefined,
        dirtPalette: DIRT_SHADES[i] ?? undefined,
      })
    ),
    wood: trio((i) => woodTexture({ size, repeat, seed: n(i, 611) })),
    brick: trio((i) => brickTexture({ size, repeat, seed: n(i, 823) })),
    stone: trio((i) => stoneTexture({ size, repeat, seed: n(i, 207) })),
    concrete: trio((i) => noiseTexture({ size, repeat, seed: n(i, 1301), palette: CONCRETE[i] })),
    asphalt: trio((i) =>
      noiseTexture({ size, repeat, seed: n(i, 1409), palette: ASPHALT[i], spread: 12, rim: 'grid', cracks: true })
    ),
    metal: trio((i) => noiseTexture({ size, repeat, seed: n(i, 1511), palette: METAL[i], spread: 10 })),
    plaster: trio((i) => noiseTexture({ size, repeat, seed: n(i, 1613), palette: PLASTER[i] })),
    corrugated: trio((i) =>
      noiseTexture({
        size,
        repeat,
        seed: n(i, 1717),
        palette: METAL[i],
        ridges: 2,
      })
    ),
    paintedMetal: trio((i) => noiseTexture({ size, repeat, seed: n(i, 1811), palette: PAINT[i] })),
  };
};
