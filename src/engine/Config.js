/** @typedef {import('./Engine.js').Engine} Engine */

export const defaultConfig = () => ({
  renderer: {
    antialias: true,
    shadows: true,
    pixelRatio: 1,
  },
  camera: {
    fov: 75,
    near: 0.05,
    far: 2000,
  },
  environment: {
    preset: 'default-overcast',
  },
  physics: {
    gravity: [0, -18, 0],
  },
});

export const mergeConfig = (overrides = {}) => {
  const base = defaultConfig();
  return {
    ...base,
    ...overrides,
    renderer: { ...base.renderer, ...overrides.renderer },
    camera: { ...base.camera, ...overrides.camera },
    environment: { ...base.environment, ...overrides.environment },
    physics: { ...base.physics, ...overrides.physics },
  };
};
