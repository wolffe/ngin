import * as THREE from 'three/webgpu';

/** @param {THREE.WebGPURenderer} renderer */
export const createSceneGraph = (renderer) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 2000);
  camera.position.set(0, 2, 5);

  return {
    scene,
    camera,
    add(object) {
      scene.add(object);
    },
    remove(object) {
      scene.remove(object);
    },
  };
};
