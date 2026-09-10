/**
 * Finite water volumes. Jolt's ApplyBuoyancyImpulse clips each body against
 * a water *plane* — we only call it when the body is inside this AABB so a
 * pool does not float objects sitting on the grass next to it.
 *
 * Visual: TSL waves + fresnel tint on a plane that tucks under the pool rim.
 */

import * as THREE from 'three/webgpu';
import {
  time,
  sin,
  positionLocal,
  positionWorld,
  cameraPosition,
  normalWorld,
  vec3,
  float,
  color as tslColor,
  mix,
  normalize,
} from 'three/tsl';

/**
 * @param {Awaited<ReturnType<import('./PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {{
 *   minX: number, maxX: number, minZ: number, maxZ: number,
 *   minY: number, surfaceY: number, maxY?: number,
 *   buoyancy?: number, linearDrag?: number, angularDrag?: number,
 * }} opts
 */
export const createWaterVolume = (physics, opts) => {
  const buoyancy = opts.buoyancy ?? 1.2;
  const linearDrag = opts.linearDrag ?? 0.5;
  const angularDrag = opts.angularDrag ?? 0.4;
  const maxY = opts.maxY ?? opts.surfaceY + 3;
  const { bodyInterface, physicsSystem } = physics;

  const surfacePos = new physics.Jolt.RVec3();
  const surfaceN = new physics.Jolt.Vec3(0, 1, 0);
  const fluidVel = new physics.Jolt.Vec3(0, 0, 0);

  physics.addWaterVolume({
    minX: opts.minX,
    maxX: opts.maxX,
    minZ: opts.minZ,
    maxZ: opts.maxZ,
    minY: opts.minY,
    maxY,
    surfaceY: opts.surfaceY,
  });

  physics.onPreStep((dt) => {
    const gravity = physicsSystem.GetGravity();
    for (const entry of physics.dynamicBodies) {
      if (!entry.body) continue;
      const p = entry.body.GetPosition();
      const x = p.GetX();
      const y = p.GetY();
      const z = p.GetZ();
      if (x < opts.minX || x > opts.maxX || z < opts.minZ || z > opts.maxZ) continue;
      if (y < opts.minY || y > maxY) continue;

      surfacePos.Set(x, opts.surfaceY, z);
      bodyInterface.ApplyBuoyancyImpulse(
        entry.body.GetID(),
        surfacePos,
        surfaceN,
        entry.buoyancy ?? buoyancy,
        linearDrag,
        angularDrag,
        fluidVel,
        gravity,
        dt
      );
    }
  });

  return { ...opts, maxY };
};

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {{ x: number, z: number, width: number, length: number, y: number }} opts
 */
export const createWaterSurface = (engine, opts) => {
  const mat = new THREE.MeshStandardNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    fog: true,
  });

  const t = time;
  const px = positionWorld.x;
  const pz = positionWorld.z;
  const wave = sin(px.mul(1.8).add(t.mul(1.35)))
    .add(sin(pz.mul(2.2).add(t.mul(1.05))))
    .add(sin(px.add(pz).mul(0.85).add(t.mul(0.7))));
  mat.positionNode = positionLocal.add(vec3(0, wave.mul(0.09), 0));

  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const ndotv = normalize(normalWorld).dot(viewDir).max(0);
  const fresnel = float(1).sub(ndotv).pow(2.2);
  const foam = wave.mul(0.28).add(0.5);
  const deep = tslColor(0x0a5a88);
  const shallow = tslColor(0x5ec8de);
  const rim = tslColor(0xb8eef8);
  mat.colorNode = mix(mix(deep, shallow, foam), rim, fresnel.mul(0.75));
  mat.roughnessNode = float(0.06).add(foam.mul(0.12));
  mat.metalnessNode = float(0.12);
  mat.opacityNode = float(0.7).add(fresnel.mul(0.18));

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(opts.width, opts.length, 48, 32),
    mat
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(opts.x, opts.y, opts.z);
  mesh.receiveShadow = true;
  engine.add(mesh);
  return mesh;
};
