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

const pixelCanvas = (size, rand, colorAt) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = colorAt(x, y, rand);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
};

const jitter = (rand, palette, spread) => {
  const pick = palette[(rand() * palette.length) | 0];
  const j = ((rand() - 0.5) * spread) | 0;
  return [
    Math.max(0, Math.min(255, pick[0] + j)),
    Math.max(0, Math.min(255, pick[1] + j)),
    Math.max(0, Math.min(255, pick[2] + j)),
  ];
};

// ─── Grass ────────────────────────────────────────────────────────────────────

/**
 * Pixelated grass — small grid of greens with occasional dark/light variation.
 * @param {{ size?: number, repeat?: number, seed?: number }} [opts]
 */
export const grassTexture = (opts = {}) => {
  const size = opts.size ?? 16;
  const palette = [
    [86, 102, 62],
    [76, 94, 56],
    [94, 108, 70],
    [68, 90, 54],
    [82, 98, 64],
    [90, 104, 66],
  ];
  return makeTexture(
    pixelCanvas(size, prng(opts.seed ?? 101), (_x, _y, rand) => jitter(rand, palette, 10)),
    opts.repeat ?? 12,
    opts.repeat ?? 12
  );
};

// ─── Stone ────────────────────────────────────────────────────────────────────

/**
 * Pixelated stone / cobble — greys with occasional blue-ish or brown-ish tints.
 * @param {{ size?: number, repeat?: number, seed?: number }} [opts]
 */
export const stoneTexture = (opts = {}) => {
  const size = opts.size ?? 16;
  const palette = [
    [128, 126, 122],
    [118, 118, 116],
    [108, 108, 106],
    [136, 124, 116],
    [100, 100, 102],
    [122, 120, 118],
  ];
  const crack = Math.max(4, (size / 2) | 0);
  return makeTexture(
    pixelCanvas(size, prng(opts.seed ?? 207), (x, y, rand) => {
      if ((x % crack === 0 || y % 8 === 0) && rand() > 0.5) {
        const v = 72 + ((rand() * 16) | 0);
        return [v, v, v - 2];
      }
      return jitter(rand, palette, 12);
    }),
    opts.repeat ?? 4,
    opts.repeat ?? 4
  );
};

/**
 * Pixelated dirt — browns with occasional darker clumps.
 * @param {{ size?: number, repeat?: number, seed?: number }} [opts]
 */
export const dirtTexture = (opts = {}) => {
  const size = opts.size ?? 16;
  const palette = [
    [108, 82, 58],
    [96, 74, 52],
    [88, 68, 48],
    [116, 88, 64],
    [80, 62, 44],
    [102, 78, 56],
  ];
  return makeTexture(
    pixelCanvas(size, prng(opts.seed ?? 419), (_x, _y, rand) => jitter(rand, palette, 10)),
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
  const s = opts.size ?? 16;
  const grassRand = prng((opts.seed ?? 101) + 1);
  const dirtRand = prng((opts.seed ?? 419) + 1);
  const grassPal = [
    [86, 102, 62],
    [76, 94, 56],
    [94, 108, 70],
    [68, 90, 54],
    [82, 98, 64],
  ];
  const dirtPal = [
    [108, 82, 58],
    [96, 74, 52],
    [88, 68, 48],
    [116, 88, 64],
    [80, 62, 44],
  ];
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s * 3;
  const ctx = canvas.getContext('2d');
  const fillBand = (y0, rand, palette, spread) => {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const [r, g, b] = jitter(rand, palette, spread);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y0 + y, 1, 1);
      }
    }
  };
  fillBand(0, grassRand, grassPal, 10);
  fillBand(s, dirtRand, dirtPal, 10);
  const lip = Math.max(2, (s / 5) | 0);
  for (let y = 0; y < lip; y++) {
    for (let x = 0; x < s; x++) {
      const [r, g, b] = jitter(grassRand, grassPal, 8);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, s + y, 1, 1);
    }
  }
  fillBand(s * 2, prng((opts.seed ?? 419) + 7), dirtPal, 10);
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
    const g = 78 + ((rand() * 28) | 0);
    ctx.fillStyle = `rgb(${48 + ((rand() * 16) | 0)},${g},${42 + ((rand() * 14) | 0)})`;
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

// ─── Sky cubemap ──────────────────────────────────────────────────────────────

const hash2 = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const noise2 = (x, y) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return (
    hash2(ix, iy) * (1 - ux) * (1 - uy) +
    hash2(ix + 1, iy) * ux * (1 - uy) +
    hash2(ix, iy + 1) * (1 - ux) * uy +
    hash2(ix + 1, iy + 1) * ux * uy
  );
};

const fbm2 = (x, y) => {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    v += a * noise2(x * f, y * f);
    a *= 0.5;
    f *= 2;
  }
  return v;
};

const skyDir = (face, u, v) => {
  const a = u * 2 - 1;
  const b = v * 2 - 1;
  if (face === 0) return [1, -b, -a];
  if (face === 1) return [-1, -b, a];
  if (face === 2) return [a, 1, b];
  if (face === 3) return [a, -1, -b];
  if (face === 4) return [a, -b, 1];
  return [-a, -b, -1];
};

/**
 * Soft daylight cubemap (zenith, horizon haze, clouds, sun disc).
 * @param {{ size?: number }} [opts]
 */
export const skyboxTexture = (opts = {}) => {
  const size = opts.size ?? 256;
  const sun = [0.42, 0.78, 0.32];
  const slen = Math.hypot(sun[0], sun[1], sun[2]);
  sun[0] /= slen; sun[1] /= slen; sun[2] /= slen;

  const canvases = [0, 1, 2, 3, 4, 5].map((face) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let [dx, dy, dz] = skyDir(face, (x + 0.5) / size, (y + 0.5) / size);
        const len = Math.hypot(dx, dy, dz) || 1;
        dx /= len; dy /= len; dz /= len;

        const h = Math.max(0, Math.min(1, dy * 0.5 + 0.5));
        let r = 110 + h * 70;
        let g = 155 + h * 55;
        let b = 210 + h * 35;
        if (dy < 0.08) {
          const t = Math.max(0, (dy + 0.15) / 0.23);
          r = 170 + t * (r - 170);
          g = 185 + t * (g - 185);
          b = 195 + t * (b - 195);
        }

        if (dy > 0.02) {
          const cx = Math.atan2(dz, dx) * 1.8;
          const cy = dy * 4.2;
          const cloud = Math.max(0, fbm2(cx + 2.4, cy) - 0.48) * 1.6;
          const w = cloud * cloud * (0.55 + dy * 0.4);
          r += (245 - r) * w;
          g += (248 - g) * w;
          b += (252 - b) * w;
        }

        const ndot = dx * sun[0] + dy * sun[1] + dz * sun[2];
        const glow = Math.max(0, ndot);
        r += 70 * glow ** 8;
        g += 50 * glow ** 8;
        b += 20 * glow ** 10;
        if (glow > 0.997) {
          r = 255; g = 250; b = 230;
        }

        const i = (y * size + x) * 4;
        data[i]     = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  });

  const cube = new THREE.CubeTexture(canvases);
  cube.needsUpdate = true;
  cube.colorSpace = THREE.SRGBColorSpace;
  return cube;
};
