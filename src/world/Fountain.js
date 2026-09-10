/**
 * Fountain spray for the particle demo (a short pipe + spray emitter).
 */

import * as THREE from 'three/webgpu';
import { createParticleEmitter } from '../graphics/Particles.js';

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {ReturnType<import('../graphics/MaterialLibrary.js').createMaterialLibrary>} materials
 * @param {{ x?: number, y?: number, z?: number }} [opts]
 */
export const createFountain = (engine, materials, opts = {}) => {
  const x = opts.x ?? 0;
  const y = opts.y ?? 0;
  const z = opts.z ?? 0;

  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.09, 1.15, 8),
    materials.get('chrome')
  );
  pipe.position.set(x, y + 0.58, z);
  pipe.castShadow = true;
  engine.add(pipe);

  const spray = createParticleEmitter(engine, {
    type: 'spray',
    position: { x, y: y + 1.2, z },
  });

  return { pipe, spray };
};
