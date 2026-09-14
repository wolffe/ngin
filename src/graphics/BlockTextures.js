/**
 * Standard block maps: three shades per kind, same noise as ProceduralTextures.
 */

import {
  dirtTexture,
  grassBlockAtlas,
  grassTexture,
  rockTexture,
  rustyMetalTexture,
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

const rustCoverage = [0.28, 0.45, 0.68];

/**
 * @param {{ size?: number, repeat?: number }} [opts]
 * @returns {{
 *   grass: import('three').CanvasTexture[],
 *   dirt: import('three').CanvasTexture[],
 *   rock: import('three').CanvasTexture[],
 *   rustyMetal: import('three').CanvasTexture[],
 *   grassBlock: import('three').CanvasTexture[],
 * }}
 */
export const createBlockTextures = (opts = {}) => {
  const size = opts.size ?? 64;
  const repeat = opts.repeat ?? 1;
  const n = VARIANT_COUNT;
  const grass = [];
  const dirt = [];
  const rock = [];
  const rustyMetal = [];
  const grassBlock = [];
  for (let i = 0; i < n; i++) {
    grass.push(grassTexture({ size, repeat, seed: 101 + i * 17, palette: GRASS_SHADES[i] ?? undefined }));
    dirt.push(dirtTexture({ size, repeat, seed: 419 + i * 23, palette: DIRT_SHADES[i] ?? undefined }));
    rock.push(rockTexture({ size, repeat, seed: 907 + i * 29, palette: ROCK_SHADES[i] ?? undefined }));
    rustyMetal.push(rustyMetalTexture({ size, repeat, seed: 1103 + i * 31, rust: rustCoverage[i] }));
    grassBlock.push(
      grassBlockAtlas({
        size,
        seed: 101 + i * 19,
        grassPalette: GRASS_SHADES[i] ?? undefined,
        dirtPalette: DIRT_SHADES[i] ?? undefined,
      })
    );
  }
  return { grass, dirt, rock, rustyMetal, grassBlock };
};
