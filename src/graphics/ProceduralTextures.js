/**
 * Procedural pixelated noise textures — generated on a small canvas then
 * uploaded as NearestFilter textures so they stay crisp and blocky.
 *
 * Each generator returns a THREE.CanvasTexture ready for use as a map/colorNode source.
 */

import * as THREE from 'three/webgpu';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Seed-able pseudo-random (mulberry32). */
const prng = (seed = 42) => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const makeTexture = (canvas, repeatX = 1, repeatY = 1) => {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const texHash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const clampByte = (n) => Math.max(0, Math.min(255, n | 0));

const TEXEL = 16;
const DEFAULT_SIZE = 64;
const SATURATION = 0.8;

const desat = (r, g, b) => {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [
    clampByte(y + (r - y) * SATURATION),
    clampByte(y + (g - y) * SATURATION),
    clampByte(y + (b - y) * SATURATION),
  ];
};

const clump = (x, y, seed, palette, spread, size = DEFAULT_SIZE) => {
  const step = Math.max(1, (size / TEXEL) | 0);
  const tx = (x / step) | 0;
  const ty = (y / step) | 0;
  const pick = palette[(texHash(tx, ty + seed) * palette.length) | 0];
  const j = ((texHash(tx + seed, ty) - 0.5) * spread) | 0;
  return [clampByte(pick[0] + j), clampByte(pick[1] + j), clampByte(pick[2] + j)];
};

const RIM_LIGHT = 'rgba(236, 220, 176, 0.35)';

const paintRim = (ctx, x0, y0, size, mode = 'frame') => {
  ctx.fillStyle = RIM_LIGHT;
  ctx.fillRect(x0, y0, size, 1);
  ctx.fillRect(x0, y0, 1, size);
  if (mode === 'frame') {
    ctx.fillRect(x0, y0 + size - 1, size, 1);
    ctx.fillRect(x0 + size - 1, y0, 1, size);
  }
};

const pixelCanvas = (size, colorAt, rim = 'frame') => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = desat(...colorAt(x, y));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  paintRim(ctx, 0, 0, size, rim);
  return canvas;
};

// ─── Grass ────────────────────────────────────────────────────────────────────

/**
 * Pixelated grass — warm olive with yellow flecks, like sunlit turf.
 * @param {{ size?: number, repeat?: number, seed?: number }} [opts]
 */
export const grassTexture = (opts = {}) => {
  const size = opts.size ?? DEFAULT_SIZE;
  const seed = opts.seed ?? 101;
  const palette = opts.palette ?? [
    [142, 156, 52],
    [118, 138, 44],
    [166, 168, 62],
    [96, 118, 40],
    [154, 148, 56],
    [128, 142, 48],
  ];
  return makeTexture(
    pixelCanvas(size, (x, y) => clump(x, y, seed, palette, 18, size), 'grid'),
    opts.repeat ?? 12,
    opts.repeat ?? 12
  );
};

// ─── Stone ────────────────────────────────────────────────────────────────────

/**
 * Warm sandstone / cobble — beige chunks with darker grout.
 * @param {{ size?: number, repeat?: number, seed?: number }} [opts]
 */
export const stoneTexture = (opts = {}) => {
  const size = opts.size ?? DEFAULT_SIZE;
  const seed = opts.seed ?? 207;
  const t = Math.max(1, (size / TEXEL) | 0);
  const palette = [
    [186, 162, 118],
    [168, 146, 104],
    [204, 178, 128],
    [148, 130, 94],
    [176, 154, 110],
  ];
  return makeTexture(
    pixelCanvas(size, (x, y) => {
      if ((x % (8 * t) === 0 || y % (8 * t) === 0) && texHash((x / t) | 0, ((y / t) | 0) + seed) > 0.82) {
        const v = 88 + ((texHash((x / t) | 0, (y / t) | 0) * 14) | 0);
        return [v + 6, v, v - 8];
      }
      return clump(x, y, seed, palette, 16, size);
    }),
    opts.repeat ?? 4,
    opts.repeat ?? 4
  );
};

/**
 * Terracotta dirt — orange-brown clumps.
 * @param {{ size?: number, repeat?: number, seed?: number }} [opts]
 */
export const dirtTexture = (opts = {}) => {
  const size = opts.size ?? DEFAULT_SIZE;
  const seed = opts.seed ?? 419;
  const palette = opts.palette ?? [
    [168, 108, 52],
    [148, 90, 42],
    [186, 122, 58],
    [128, 78, 36],
    [158, 98, 46],
  ];
  return makeTexture(
    pixelCanvas(size, (x, y) => clump(x, y, seed, palette, 16, size)),
    opts.repeat ?? 1,
    opts.repeat ?? 1
  );
};

/**
 * Honey oak planks — warm grain, dark seams.
 * @param {{ size?: number, repeat?: number, seed?: number }} [opts]
 */
export const woodTexture = (opts = {}) => {
  const size = opts.size ?? DEFAULT_SIZE;
  const seed = opts.seed ?? 611;
  const t = Math.max(1, (size / TEXEL) | 0);
  const palette = [
    [168, 114, 58],
    [148, 96, 46],
    [186, 128, 64],
    [132, 88, 42],
  ];
  return makeTexture(
    pixelCanvas(size, (x, y) => {
      if ((x % (4 * t)) < t) return [92, 62, 32];
      const [r, g, b] = clump(x, y, seed, palette, 12, size);
      const grain = ((y / t) | 0) % 5 === 0 ? -12 : 0;
      return [clampByte(r + grain), clampByte(g + grain), clampByte(b + grain)];
    }),
    opts.repeat ?? 1,
    opts.repeat ?? 1
  );
};

/**
 * Warm terracotta brick with sandy mortar.
 * @param {{ size?: number, repeat?: number, seed?: number }} [opts]
 */
export const brickTexture = (opts = {}) => {
  const size = opts.size ?? DEFAULT_SIZE;
  const seed = opts.seed ?? 823;
  const t = Math.max(1, (size / TEXEL) | 0);
  const palette = [
    [176, 86, 56],
    [158, 74, 48],
    [192, 102, 66],
    [140, 68, 44],
  ];
  const canvas = pixelCanvas(size, (x, y) => clump(x, y, seed, palette, 14, size));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = RIM_LIGHT;
  for (let y = 0; y < size; y += 4 * t) ctx.fillRect(0, y, size, t);
  for (let row = 0; row < TEXEL / 4; row++) {
    const ox = row % 2 === 0 ? 0 : 4 * t;
    for (let x = ox; x < size; x += 8 * t) ctx.fillRect(x, row * 4 * t, t, 4 * t);
  }
  return makeTexture(canvas, opts.repeat ?? 1, opts.repeat ?? 1);
};

/**
 * Darker basalt with warm dust.
 * @param {{ size?: number, repeat?: number, seed?: number }} [opts]
 */
export const rockTexture = (opts = {}) => {
  const size = opts.size ?? DEFAULT_SIZE;
  const seed = opts.seed ?? 907;
  const palette = opts.palette ?? [
    [118, 102, 84],
    [96, 86, 72],
    [132, 112, 90],
    [82, 74, 64],
  ];
  return makeTexture(
    pixelCanvas(size, (x, y) => clump(x, y, seed, palette, 16, size)),
    opts.repeat ?? 1,
    opts.repeat ?? 1
  );
};

/**
 * Pitted steel with terracotta rust blooms. `rust` 0–1 is coverage.
 * @param {{ size?: number, repeat?: number, seed?: number, rust?: number, metalPalette?: number[][], rustPalette?: number[][] }} [opts]
 */
export const rustyMetalTexture = (opts = {}) => {
  const size = opts.size ?? DEFAULT_SIZE;
  const seed = opts.seed ?? 1103;
  const rustAmt = opts.rust ?? 0.45;
  const metalPal = opts.metalPalette ?? [
    [108, 104, 100],
    [92, 90, 88],
    [122, 116, 110],
    [78, 78, 76],
  ];
  const rustPal = opts.rustPalette ?? [
    [124, 82, 62],
    [108, 72, 56],
    [138, 90, 68],
    [92, 64, 52],
  ];
  const t = Math.max(1, (size / TEXEL) | 0);
  return makeTexture(
    pixelCanvas(size, (x, y) => {
      const tx = (x / t) | 0;
      const ty = (y / t) | 0;
      const bloom = texHash((tx / 4) | 0, ((ty / 4) | 0) + seed);
      const speck = texHash(tx + seed, ty);
      const rusty = bloom < rustAmt || speck < rustAmt * 0.35;
      if (!rusty && speck > 0.92) return [62, 58, 54];
      return clump(x, y, seed, rusty ? rustPal : metalPal, 14, size);
    }),
    opts.repeat ?? 1,
    opts.repeat ?? 1
  );
};

/**
 * Generic 16-texel clump map with optional panel joints or corrugation.
 * @param {{
 *   size?: number, repeat?: number, seed?: number, palette?: number[][],
 *   spread?: number, panel?: { x: number, y: number, color: number[] },
 *   ridges?: number, rim?: 'frame' | 'grid',
 * }} [opts]
 */
export const noiseTexture = (opts = {}) => {
  const size = opts.size ?? DEFAULT_SIZE;
  const seed = opts.seed ?? 1;
  const palette = opts.palette ?? [
    [128, 124, 118],
    [112, 110, 106],
    [140, 134, 126],
  ];
  const t = Math.max(1, (size / TEXEL) | 0);
  const panel = opts.panel;
  const ridges = opts.ridges ?? 0;
  return makeTexture(
    pixelCanvas(
      size,
      (x, y) => {
        if (panel && (x % (panel.x * t) < t || y % (panel.y * t) < t)) {
          return panel.color;
        }
        const [r, g, b] = clump(x, y, seed, palette, opts.spread ?? 14, size);
        if (opts.cracks) {
          const tx = (x / t) | 0;
          const ty = (y / t) | 0;
          if (texHash(tx, ty + seed) > 0.87 && ((tx + ty * 3) % 5 === 0)) {
            return [clampByte(r - 28), clampByte(g - 26), clampByte(b - 24)];
          }
        }
        if (ridges && ((y / t) | 0) % ridges === 0) {
          return [clampByte(r - 22), clampByte(g - 20), clampByte(b - 18)];
        }
        return [r, g, b];
      },
      opts.rim ?? 'frame'
    ),
    opts.repeat ?? 1,
    opts.repeat ?? 1
  );
};

/**
 * Minecraft grass block atlas: top / side (dirt + grass lip) / bottom.
 * 16×48, ClampWrapping. Use `applyGrassBlockUVs` on a unit box.
 * @param {{ size?: number, seed?: number }} [opts]
 */
export const grassBlockAtlas = (opts = {}) => {
  const s = opts.size ?? DEFAULT_SIZE;
  const grassPal = opts.grassPalette ?? [
    [142, 156, 52],
    [118, 138, 44],
    [166, 168, 62],
    [96, 118, 40],
    [154, 148, 56],
  ];
  const dirtPal = opts.dirtPalette ?? [
    [168, 108, 52],
    [148, 90, 42],
    [186, 122, 58],
    [128, 78, 36],
    [158, 98, 46],
  ];
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s * 3;
  const ctx = canvas.getContext('2d');
  const fillBand = (y0, seed, palette, spread) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const [r, g, b] = desat(...clump(x, y, seed, palette, spread, s));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y0 + y, 1, 1);
      }
    }
    paintRim(ctx, 0, y0, s);
  };
  fillBand(0, (opts.seed ?? 101) + 1, grassPal, 18);
  fillBand(s, (opts.seed ?? 419) + 1, dirtPal, 16);
  const t = Math.max(1, (s / TEXEL) | 0);
  const seed = opts.seed ?? 101;
  for (let col = 0; col < TEXEL; col++) {
    let drop = 2 + ((texHash(col, seed + 4) * 4) | 0);
    if (texHash(col, seed + 11) > 0.78 && drop < 6) drop += 1;
    for (let row = 0; row < drop; row++) {
      if (row > 1 && texHash(col * 3, row + seed) < 0.18) continue;
      for (let py = 0; py < t; py++) {
        for (let px = 0; px < t; px++) {
          const x = col * t + px;
          const y = row * t + py;
          if (x <= 0 || x >= s - 1 || y >= s) continue;
          const [r, g, b] = desat(...clump(x, y, seed + 4, grassPal, 12, s));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, s + y, 1, 1);
        }
      }
    }
  }
  paintRim(ctx, 0, s, s);
  fillBand(s * 2, (opts.seed ?? 419) + 7, dirtPal, 16);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

/**
 * Map box faces onto the grass-block atlas (top / side / bottom thirds).
 * @param {import('three').BufferGeometry} geometry
 */
export const applyGrassBlockUVs = (geometry) => {
  const uv = geometry.attributes.uv;
  const nrm = geometry.attributes.normal;
  if (!uv || !nrm) return geometry;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const ny = nrm.getY(i);
    let v0 = 1 / 3;
    if (ny > 0.5) v0 = 2 / 3;
    else if (ny < -0.5) v0 = 0;
    uv.setXY(i, u, v0 + v / 3);
  }
  uv.needsUpdate = true;
  return geometry;
};

/**
 * Cutout grass tuft (alpha blades) for Minecraft-style decoration.
 * @param {{ size?: number, seed?: number }} [opts]
 */
export const grassTuftTexture = (opts = {}) => {
  const size = opts.size ?? 16;
  const rand = prng(opts.seed ?? 418);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 6; i++) {
    const x = 2 + ((rand() * (size - 5)) | 0);
    const w = 1;
    const h = size * (0.4 + rand() * 0.5);
    const g = 118 + ((rand() * 36) | 0);
    const [r, gg, b] = desat(72 + ((rand() * 28) | 0), g, 36 + ((rand() * 16) | 0));
    ctx.fillStyle = `rgb(${r},${gg},${b})`;
    ctx.fillRect(x | 0, size - h, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

// ─── Tennis ball ──────────────────────────────────────────────────────────────

/**
 * Felt + white seam, mapped once around a sphere (no tiling).
 * @param {{ size?: number, seed?: number }} [opts]
 */
export const tennisTexture = (opts = {}) => {
  const size = opts.size ?? 256;
  const rand = prng(opts.seed ?? 314);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const felt = (base, spread) => {
    const n = ((rand() - 0.5) * spread) | 0;
    return Math.max(0, Math.min(255, base + n));
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const seam = Math.abs(v - 0.5 - 0.28 * Math.sin(u * Math.PI * 2));
      const i = (y * size + x) * 4;
      if (seam < 0.055) {
        const edge = seam > 0.038;
        data[i]     = edge ? 210 : 245;
        data[i + 1] = edge ? 210 : 245;
        data[i + 2] = edge ? 200 : 240;
      } else {
        data[i]     = felt(176, 18);
        data[i + 1] = felt(186, 16);
        data[i + 2] = felt(72, 14);
      }
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

/**
 * Pixelated zenith→horizon strip for a skydome (u wraps, v clamps).
 * @param {{ width?: number, height?: number }} [opts]
 */
export const skyDomeTexture = (opts = {}) => {
  const w = opts.width ?? 32;
  const h = opts.height ?? 16;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    for (let x = 0; x < w; x++) {
      let r = 88 + t * 78;
      let g = 124 + t * 48;
      let b = 168 + t * 28;
      if (t > 0.7) {
        const k = (t - 0.7) / 0.3;
        r += 16 * k;
        g += 6 * k;
        b -= 10 * k;
      }
      const du = x / w - 0.38;
      const dv = t - 0.22;
      const d2 = du * du + dv * dv;
      if (d2 < 0.01) {
        r = 248;
        g = 236;
        b = 196;
      } else if (d2 < 0.04) {
        r += 36;
        g += 24;
        b += 8;
      }
      const [sr, sg, sb] = desat(r, g, b);
      ctx.fillStyle = `rgb(${sr},${sg},${sb})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

/** Same strip as skyDomeTexture (older name). */
export const skyboxTexture = skyDomeTexture;
