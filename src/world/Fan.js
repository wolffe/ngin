/**
 * Ground fan. A cylinder force field along `direction` pushes the character
 * (and dynamic bodies) — up, sideways, or any unit vector.
 */

import * as THREE from 'three/webgpu';

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('../graphics/MaterialLibrary.js').createMaterialLibrary>} materials
 * @param {{
 *   id?: string,
 *   x?: number, y?: number, z?: number,
 *   direction?: { x: number, y: number, z: number },
 *   reach?: number,
 *   radius?: number,
 *   acceleration?: number
 * }} [opts]
 */
export const createFan = (engine, physics, materials, opts = {}) => {
  const x = opts.x ?? 6;
  const y = opts.y ?? 0.22;
  const z = opts.z ?? 14;
  const raw = opts.direction ?? { x: 0, y: 1, z: 0 };
  const len = Math.hypot(raw.x, raw.y, raw.z) || 1;
  const dir = { x: raw.x / len, y: raw.y / len, z: raw.z / len };
  const reach = opts.reach ?? 5.5;
  const radius = opts.radius ?? 1.2;
  const acceleration = opts.acceleration ?? 42;

  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dir.x, dir.y, dir.z)
  );

  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.72, 0.28, 16, 1, true),
    materials.get('metal')
  );
  housing.castShadow = true;
  group.add(housing);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 8, 22), materials.get('darkGrey'));
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const rotor = new THREE.Group();
  const bladeMat = materials.get('yellow');
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 1.28), bladeMat);
    blade.rotation.y = (i / 4) * Math.PI * 2;
    blade.castShadow = true;
    rotor.add(blade);
  }
  group.add(rotor);

  engine.add(group);
  const rot = new THREE.Euler().setFromQuaternion(group.quaternion, 'XYZ');
  physics.addStaticBox(
    opts.id ?? `fan_${x}_${z}`,
    { x, y, z },
    [0.7, 0.14, 0.7],
    group,
    { x: rot.x, y: rot.y, z: rot.z }
  );
  physics.addForceField({
    origin: { x: x + dir.x * 0.25, y: y + dir.y * 0.25, z: z + dir.z * 0.25 },
    direction: dir,
    reach,
    radius,
    acceleration,
  });

  engine.onUpdate((dt) => {
    rotor.rotation.y += dt * 16;
  });

  return { group };
};
