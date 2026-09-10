import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Load and cache GLTF/textures. Place with `placeGltf` so the cache is cloned. */

export const createAssetManager = () => {
  const gltfLoader = new GLTFLoader();
  /** @type {Map<string, unknown>} */
  const cache = new Map();

  const loadGltf = (url) => {
    if (cache.has(url)) return Promise.resolve(cache.get(url));
    return new Promise((resolve, reject) => {
      gltfLoader.load(
        url,
        (gltf) => {
          cache.set(url, gltf);
          resolve(gltf);
        },
        undefined,
        reject
      );
    });
  };

  const loadTexture = (url) => {
    if (cache.has(url)) return Promise.resolve(cache.get(url));
    const loader = new THREE.TextureLoader();
    return loader.loadAsync(url).then((tex) => {
      cache.set(url, tex);
      return tex;
    });
  };

  return {
    loadGltf,
    loadTexture,
    get: (key) => cache.get(key),
    clear: () => cache.clear(),
  };
};
