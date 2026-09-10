/**
 * Jolt dynamic pushables — cubes and spheres the character can shove and stand on.
 */

import * as THREE from 'three/webgpu';
import { float, texture as tslTexture } from 'three/tsl';
import { tennisTexture } from '../graphics/ProceduralTextures.js';

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('./PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('../graphics/MaterialLibrary.js').createMaterialLibrary>} materials
 */
export const createPushables = (engine, physics, materials) => {
  const boxMat = materials.get('pushable');
  const tennisMap = tennisTexture({ size: 256 });
  const ballMat = new THREE.MeshStandardNodeMaterial({
    map: tennisMap,
    roughness: 0.85,
    metalness: 0,
    fog: true,
  });
  ballMat.colorNode = tslTexture(tennisMap);
  ballMat.roughnessNode = float(0.85);

  /** @type {import('three').Mesh[]} */
  const meshes = [];

  const addCube = (id, x, y, z, size = 1, mass = 8) => {
    const half = size / 2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), boxMat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    engine.add(mesh);
    physics.addDynamicBox(id, { x, y, z }, [half, half, half], mesh, mass);
    meshes.push(mesh);
    return mesh;
  };

  const addSphere = (id, x, y, z, radius = 0.45, mass = 5, segments = 24) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, segments, Math.max(8, segments - 8)),
      ballMat
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    engine.add(mesh);
    physics.addDynamicSphere(id, { x, y, z }, radius, mesh, mass);
    meshes.push(mesh);
    return mesh;
  };

  // Cubes — jumpable / pushable
  addCube('push_cube_0', 4, 0.6, 2, 1.2, 10);
  addCube('push_cube_1', 6, 0.5, 4, 1, 8);
  addCube('push_cube_2', 8, 0.75, 1, 1.5, 14);
  addCube('push_cube_3', -5, 0.5, 6, 1, 8);
  addCube('push_cube_4', -8, 0.4, 3, 0.8, 5);

  // Spheres
  addSphere('push_ball_0', 2, 0.5, -4, 0.5, 4);
  addSphere('push_ball_1', -3, 0.55, -6, 0.55, 5);
  addSphere('push_ball_2', 10, 0.6, -2, 0.6, 6);
  addSphere('push_ball_3', -10, 0.45, 8, 0.45, 3);

  // Large sphere + a pile of marbles
  addSphere('push_ball_large', 14, 1.25, 6, 1.25, 38);
  const tinyCount = 100;
  const tinyCols = 10;
  const tinySpacing = 0.32;
  const tinyOriginX = 10.5;
  const tinyOriginZ = 1.5;
  const tinyRadius = 0.14;
  for (let i = 0; i < tinyCount; i++) {
    const col = i % tinyCols;
    const row = Math.floor(i / tinyCols);
    addSphere(
      `push_ball_tiny_${i}`,
      tinyOriginX + col * tinySpacing,
      tinyRadius,
      tinyOriginZ + row * tinySpacing,
      tinyRadius,
      0.35,
      8
    );
  }

  return {
    meshes,
    addCube,
    addSphere,
  };
};
