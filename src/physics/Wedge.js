import * as THREE from 'three/webgpu';

/**
 * Walkable wedge (triangular prism) — visual + Jolt convex hull.
 *
 * Local layout: low edge at z = -length/2 (y = 0), high face at z = +length/2 (y = height).
 *
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('./PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {THREE.Material} material
 * @param {{ id?: string, x?: number, z?: number, width?: number, length?: number, height?: number }} [opts]
 */
export const createWalkWedge = (engine, physics, material, opts = {}) => {
  const id = opts.id ?? 'wedge';
  const x = opts.x ?? 0;
  const z = opts.z ?? 0;
  const width = opts.width ?? 8;
  const length = opts.length ?? 14;
  const height = opts.height ?? 3.5;

  const hw = width / 2;
  const hl = length / 2;

  const A = [-hw, 0, -hl];
  const B = [hw, 0, -hl];
  const C = [-hw, 0, hl];
  const D = [hw, 0, hl];
  const E = [-hw, height, hl];
  const F = [hw, height, hl];

  const points = [A, B, C, D, E, F];

  // CCW from outside (Three.js front faces)
  const tri = (p, q, r) => [...p, ...q, ...r];
  const positions = new Float32Array([
    ...tri(A, F, B),
    ...tri(A, E, F),
    ...tri(A, D, C),
    ...tri(A, B, D),
    ...tri(C, F, E),
    ...tri(C, D, F),
    ...tri(A, C, E),
    ...tri(B, F, D),
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, 0, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  engine.add(mesh);

  physics.addStaticConvexHull(id, { x, y: 0, z }, points, mesh);

  return { mesh, points, height, length, width };
};
