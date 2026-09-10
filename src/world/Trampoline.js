/**
 * Bounce pad. CharacterVirtual ignores rigid-body restitution, so the pad is
 * a tagged static box; PhysicsWorld launches along the ground normal.
 */

import * as THREE from 'three/webgpu';

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('../graphics/MaterialLibrary.js').createMaterialLibrary>} materials
 * @param {{ id?: string, x?: number, z?: number, width?: number, depth?: number, bounce?: number }} [opts]
 */
export const createTrampoline = (engine, physics, materials, opts = {}) => {
  const x = opts.x ?? -10;
  const z = opts.z ?? 10;
  const w = opts.width ?? 3.2;
  const d = opts.depth ?? 3.2;
  const h = 0.2;
  const bounce = opts.bounce ?? 15;

  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.25, h, d + 0.25),
    materials.get('darkGrey')
  );
  frame.position.y = h / 2;
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.2, 0.08, d - 0.2),
    materials.get('blue')
  );
  pad.position.y = h - 0.02;
  pad.receiveShadow = true;
  group.add(pad);

  engine.add(group);
  physics.addStaticBox(
    opts.id ?? 'trampoline',
    { x, y: h / 2, z },
    [w / 2, h / 2, d / 2],
    group,
    null,
    { bounce, friction: 0.85 }
  );

  return { group };
};
