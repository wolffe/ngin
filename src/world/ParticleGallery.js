/**
 * Row of every named particle effect for sandbox comparison.
 */

import * as THREE from 'three/webgpu';
import { texture as tslTexture } from 'three/tsl';
import { createEffect } from '../graphics/Particles.js';
import { effectNames } from '../graphics/ParticleEffects.js';
import { applyWorldUVs } from '../graphics/WorldUVs.js';
import { createFan } from './Fan.js';

const labelTex = (text) => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a1a18';
  ctx.fillRect(0, 0, 256, 48);
  ctx.fillStyle = '#d8d4c8';
  ctx.font = '22px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 26, 240);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
};

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('../graphics/MaterialLibrary.js').createMaterialLibrary>} materials
 * @param {{ x?: number, z?: number, step?: number }} [opts]
 */
export const createParticleGallery = (engine, physics, materials, opts = {}) => {
  const x0 = opts.x ?? -36;
  const z0 = opts.z ?? -20;
  const step = opts.step ?? 4;
  const names = effectNames();
  const padMat = materials.get('asphalt');
  const slabMat = materials.get('concrete');

  names.forEach((name, i) => {
    const x = x0;
    const z = z0 + i * step;
    const padGeo = new THREE.BoxGeometry(1.6, 0.08, 1.6);
    applyWorldUVs(padGeo, 1, { x, y: 0.04, z });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(x, 0.04, z);
    pad.receiveShadow = true;
    engine.add(pad);
    physics.addStaticBox(`fx_pad_${i}`, { x, y: 0.04, z }, [0.8, 0.04, 0.8]);
    createEffect(engine, name, { position: { x, y: 0.12, z }, physics });

    const plateMat = new THREE.MeshBasicNodeMaterial();
    plateMat.colorNode = tslTexture(labelTex(name));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.32), plateMat);
    plate.position.set(x, 0.09, z);
    plate.rotation.x = -Math.PI / 2;
    engine.add(plate);
  });

  const smokeI = names.indexOf('smoke');
  if (smokeI >= 0) {
    const z = z0 + smokeI * step;
    const roofGeo = new THREE.BoxGeometry(2.4, 0.16, 2.4);
    applyWorldUVs(roofGeo, 1, { x: x0, y: 1.55, z });
    const roof = new THREE.Mesh(roofGeo, slabMat);
    roof.position.set(x0, 1.55, z);
    roof.castShadow = true;
    engine.add(roof);
    physics.addStaticBox('fx_smoke_ceiling', { x: x0, y: 1.55, z }, [1.2, 0.08, 1.2]);
  }

  const sparkI = names.indexOf('sparks');
  if (sparkI >= 0) {
    const z = z0 + sparkI * step;
    const wallGeo = new THREE.BoxGeometry(0.2, 2, 2.2);
    applyWorldUVs(wallGeo, 1, { x: x0 + 1.1, y: 1, z });
    const wall = new THREE.Mesh(wallGeo, slabMat);
    wall.position.set(x0 + 1.1, 1, z);
    wall.castShadow = true;
    engine.add(wall);
    physics.addStaticBox('fx_spark_wall', { x: x0 + 1.1, y: 1, z }, [0.1, 1, 1.1]);
  }

  const fireI = names.indexOf('fire');
  if (fireI >= 0) {
    createFan(engine, physics, materials, {
      id: 'fx_gallery_fan',
      x: x0 - 1.6,
      y: 0.22,
      z: z0 + fireI * step,
      direction: { x: 1, y: 0.15, z: 0 },
      reach: 6,
      radius: 1.1,
      acceleration: 36,
    });
  }

  return { x: x0, z: z0, step, names };
};
