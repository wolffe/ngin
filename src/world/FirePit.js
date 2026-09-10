/**
 * Campfire: ring of stones, logs, fire + sparks + smoke, a flickering point light.
 */

import * as THREE from 'three/webgpu';
import { createParticleEmitter } from '../graphics/Particles.js';

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('../graphics/MaterialLibrary.js').createMaterialLibrary>} materials
 * @param {{ x?: number, z?: number }} [opts]
 */
export const createFirePit = (engine, physics, materials, opts = {}) => {
  const x = opts.x ?? 10;
  const z = opts.z ?? 22;
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const rock = materials.get('rock');
  const wood = materials.get('wood');

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.22), rock);
    stone.position.set(Math.cos(a) * 0.45, 0.09, Math.sin(a) * 0.45);
    stone.rotation.y = a;
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
  }

  const logA = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.12), wood);
  logA.position.set(0, 0.12, 0);
  logA.rotation.y = 0.4;
  logA.castShadow = true;
  group.add(logA);
  const logB = logA.clone();
  logB.rotation.y = -0.7;
  group.add(logB);

  engine.add(group);
  physics.addStaticBox('firepit', { x, y: 0.12, z }, [0.5, 0.12, 0.5], group);

  const fire = createParticleEmitter(engine, { type: 'fire', position: { x, y: 0.22, z } });
  const sparks = createParticleEmitter(engine, { type: 'sparks', position: { x, y: 0.3, z } });
  const smoke = createParticleEmitter(engine, { type: 'smoke', position: { x, y: 0.55, z } });

  const light = new THREE.PointLight(0xff7a22, 2.2, 16);
  light.position.set(x, 0.7, z);
  engine.scene.add(light);

  let t = 0;
  engine.onUpdate((dt) => {
    t += dt;
    light.intensity = 1.8 + Math.sin(t * 11) * 0.35 + Math.sin(t * 23) * 0.15;
  });

  return { group, fire, sparks, smoke, light };
};
