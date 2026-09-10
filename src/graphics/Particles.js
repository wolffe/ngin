/**
 * CPU particles — camera-facing quads.
 *
 * Types: fire, smoke, sparks, spray (hose), dust (tires), wake (boats).
 * Canvas disc for now; pass `map` when you have a texture.
 */

import * as THREE from 'three/webgpu';
import { color as tslColor, rangeFogFactor, texture as tslTexture, uniform } from 'three/tsl';

const fogNear = uniform(80).onRenderUpdate(({ scene }) => (scene.fog && scene.fog.near) || 1e6);
const fogFar = uniform(260).onRenderUpdate(({ scene }) => (scene.fog && scene.fog.far) || 1e6);
const fogFade = rangeFogFactor(fogNear, fogFar).oneMinus();

const dummy = new THREE.Object3D();
const plane = new THREE.PlaneGeometry(1, 1);

let discTex = null;
const discTexture = () => {
  if (discTex) return discTex;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.35, 'rgba(255, 255, 255, 0.65)');
  g.addColorStop(0.7, 'rgba(255, 255, 255, 0.18)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  discTex = new THREE.CanvasTexture(canvas);
  discTex.colorSpace = THREE.SRGBColorSpace;
  discTex.wrapS = THREE.ClampToEdgeWrapping;
  discTex.wrapT = THREE.ClampToEdgeWrapping;
  discTex.needsUpdate = true;
  return discTex;
};

const PRESETS = {
  fire: {
    count: 40,
    color: 0xff7a1a,
    additive: true,
    life: [0.5, 1.05],
    size0: 0.4,
    size1: 1.85,
    spawn: (o, vel) => {
      o.x += (Math.random() - 0.5) * 0.3;
      o.y += Math.random() * 0.08;
      o.z += (Math.random() - 0.5) * 0.3;
      vel.x = (Math.random() - 0.5) * 0.22;
      vel.y = 0.65 + Math.random() * 1.05;
      vel.z = (Math.random() - 0.5) * 0.22;
    },
    integrate: (o, vel, dt) => {
      o.x += vel.x * dt;
      o.y += vel.y * dt;
      o.z += vel.z * dt;
    },
  },
  smoke: {
    count: 36,
    color: 0x7a7a7a,
    additive: false,
    life: [1.5, 2.8],
    size0: 0.55,
    size1: 2.6,
    spawn: (o, vel) => {
      o.x += (Math.random() - 0.5) * 0.28;
      o.y += 0.35;
      o.z += (Math.random() - 0.5) * 0.28;
      vel.x = (Math.random() - 0.5) * 0.2;
      vel.y = 0.4 + Math.random() * 0.5;
      vel.z = (Math.random() - 0.5) * 0.2;
    },
    integrate: (o, vel, dt) => {
      o.x += vel.x * dt;
      o.y += vel.y * dt;
      o.z += vel.z * dt;
    },
  },
  sparks: {
    count: 50,
    color: 0xffcc55,
    additive: true,
    life: [0.25, 0.7],
    size0: 0.07,
    size1: 0.04,
    spawn: (o, vel) => {
      o.x += (Math.random() - 0.5) * 0.2;
      o.y += 0.2;
      o.z += (Math.random() - 0.5) * 0.2;
      vel.x = (Math.random() - 0.5) * 4;
      vel.y = 2 + Math.random() * 4;
      vel.z = (Math.random() - 0.5) * 4;
    },
    integrate: (o, vel, dt) => {
      vel.y -= 12 * dt;
      o.x += vel.x * dt;
      o.y += vel.y * dt;
      o.z += vel.z * dt;
    },
  },
  spray: {
    count: 70,
    color: 0xc8e8ff,
    additive: false,
    life: [0.4, 0.9],
    size0: 0.08,
    size1: 0.14,
    spawn: (o, vel) => {
      o.x += (Math.random() - 0.5) * 0.12;
      o.z += (Math.random() - 0.5) * 0.12;
      vel.x = (Math.random() - 0.5) * 0.6;
      vel.y = 3.5 + Math.random() * 1.5;
      vel.z = (Math.random() - 0.5) * 0.6;
    },
    integrate: (o, vel, dt) => {
      vel.y -= 9 * dt;
      o.x += vel.x * dt;
      o.y += vel.y * dt;
      o.z += vel.z * dt;
    },
  },
  dust: {
    count: 48,
    color: 0xc4a574,
    additive: false,
    life: [0.45, 0.95],
    size0: 0.32,
    size1: 1.35,
    spawn: (o, vel) => {
      o.x += (Math.random() - 0.5) * 0.18;
      o.z += (Math.random() - 0.5) * 0.18;
      vel.x = (Math.random() - 0.5) * 0.7;
      vel.y = 0.35 + Math.random() * 0.65;
      vel.z = (Math.random() - 0.5) * 0.7;
    },
    integrate: (o, vel, dt) => {
      vel.x *= Math.max(0, 1 - 1.4 * dt);
      vel.z *= Math.max(0, 1 - 1.4 * dt);
      vel.y -= 0.8 * dt;
      o.x += vel.x * dt;
      o.y += vel.y * dt;
      o.z += vel.z * dt;
    },
  },
  wake: {
    count: 64,
    color: 0xe8f4ff,
    additive: true,
    life: [0.35, 0.8],
    size0: 0.1,
    size1: 0.48,
    spawn: (o, vel) => {
      o.x += (Math.random() - 0.5) * 0.16;
      vel.x = (Math.random() - 0.5) * 1.6;
      vel.y = 0.7 + Math.random() * 1.8;
      vel.z = (Math.random() - 0.5) * 1.6;
    },
    integrate: (o, vel, dt) => {
      vel.y -= 8 * dt;
      o.x += vel.x * dt;
      o.y += vel.y * dt;
      o.z += vel.z * dt;
    },
  },
};

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {{
 *   type?: string,
 *   position?: {x:number,y:number,z:number},
 *   count?: number,
 *   enabled?: boolean,
 *   rate?: number,
 *   map?: THREE.Texture,
 *   getOrigin?: () => {x:number,y:number,z:number},
 *   getDrift?: () => {x:number,y:number,z:number},
 * }} [opts]
 */
export const createParticleEmitter = (engine, opts = {}) => {
  const type = PRESETS[opts.type] ? opts.type : 'spray';
  const preset = PRESETS[type];
  const count = opts.count ?? preset.count;
  const origin = { ...(opts.position ?? { x: 0, y: 0, z: 0 }) };
  let enabled = opts.enabled ?? true;
  let rate = opts.rate ?? 1;
  let getOrigin = opts.getOrigin ?? null;
  let getDrift = opts.getDrift ?? null;
  const avgLife = (preset.life[0] + preset.life[1]) * 0.5;

  const map = opts.map ?? discTexture();
  const sample = tslTexture(map);
  const tint = tslColor(preset.color).mul(sample);
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    blending: preset.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  // Additive + mix-to-fog-color still adds light through fog. Fade to black instead.
  if (preset.additive) {
    mat.fog = false;
    mat.colorNode = tint.mul(fogFade);
  } else {
    mat.colorNode = tint;
  }

  const mesh = new THREE.InstancedMesh(plane, mat, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.layers.set(1);
  engine.camera.layers.enable(1);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  engine.add(mesh);

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const ages = new Float32Array(count);
  const lives = new Float32Array(count);
  const seeds = new Float32Array(count);
  const spins = new Float32Array(count);
  const live = new Uint8Array(count);
  const scratch = { x: 0, y: 0, z: 0 };
  const vel = { x: 0, y: 0, z: 0 };
  let emitAcc = 0;

  const park = (i) => {
    live[i] = 0;
    dummy.position.set(0, -999, 0);
    dummy.scale.setScalar(0);
    dummy.quaternion.set(0, 0, 0, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };

  const respawn = (i) => {
    if (getOrigin) {
      const p = getOrigin();
      scratch.x = p.x;
      scratch.y = p.y;
      scratch.z = p.z;
    } else {
      scratch.x = origin.x;
      scratch.y = origin.y;
      scratch.z = origin.z;
    }
    vel.x = 0;
    vel.y = 0;
    vel.z = 0;
    preset.spawn(scratch, vel);
    if (getDrift) {
      const d = getDrift();
      vel.x += d.x;
      vel.y += d.y;
      vel.z += d.z;
    }
    positions[i * 3] = scratch.x;
    positions[i * 3 + 1] = scratch.y;
    positions[i * 3 + 2] = scratch.z;
    velocities[i * 3] = vel.x;
    velocities[i * 3 + 1] = vel.y;
    velocities[i * 3 + 2] = vel.z;
    ages[i] = 0;
    lives[i] = preset.life[0] + Math.random() * (preset.life[1] - preset.life[0]);
    seeds[i] = 0.85 + Math.random() * 0.3;
    spins[i] = Math.random() * Math.PI * 2;
    live[i] = 1;
  };

  dummy.scale.setScalar(0);
  for (let i = 0; i < count; i++) park(i);
  if (rate > 0) {
    for (let i = 0; i < count; i++) {
      respawn(i);
      ages[i] = Math.random() * lives[i];
    }
  }
  mesh.instanceMatrix.needsUpdate = true;

  engine.onUpdate((dt) => {
    mesh.visible = enabled;
    if (!enabled) return;
    const cap = Math.min(dt, 0.05);
    const camQ = engine.camera.quaternion;

    for (let i = 0; i < count; i++) {
      if (!live[i]) continue;
      ages[i] += cap;
      if (ages[i] > lives[i]) {
        park(i);
        continue;
      }
      scratch.x = positions[i * 3];
      scratch.y = positions[i * 3 + 1];
      scratch.z = positions[i * 3 + 2];
      vel.x = velocities[i * 3];
      vel.y = velocities[i * 3 + 1];
      vel.z = velocities[i * 3 + 2];
      preset.integrate(scratch, vel, cap);
      positions[i * 3] = scratch.x;
      positions[i * 3 + 1] = scratch.y;
      positions[i * 3 + 2] = scratch.z;
      velocities[i * 3] = vel.x;
      velocities[i * 3 + 1] = vel.y;
      velocities[i * 3 + 2] = vel.z;
      const t = ages[i] / lives[i];
      const envelope = t < 0.12 ? t / 0.12 : t > 0.55 ? 1 - (t - 0.55) / 0.45 : 1;
      const size = (preset.size0 + t * (preset.size1 - preset.size0)) * seeds[i] * envelope;
      dummy.position.set(scratch.x, scratch.y, scratch.z);
      dummy.quaternion.copy(camQ);
      dummy.rotateZ(spins[i]);
      dummy.scale.setScalar(Math.max(0, size));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    if (rate > 0) {
      emitAcc += rate * (count / avgLife) * cap;
      if (emitAcc > 4) emitAcc = 4;
      while (emitAcc >= 1) {
        let slot = -1;
        for (let i = 0; i < count; i++) {
          if (!live[i]) {
            slot = i;
            break;
          }
        }
        if (slot < 0) break;
        emitAcc -= 1;
        respawn(slot);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return {
    mesh,
    type,
    setEnabled(v) {
      enabled = v;
    },
    setRate(v) {
      rate = Math.max(0, Math.min(1, v));
    },
    setPosition(x, y, z) {
      origin.x = x;
      origin.y = y;
      origin.z = z;
    },
    get enabled() {
      return enabled;
    },
  };
};

/** @param {import('../engine/Engine.js').Engine} engine */
export const createFirePuffs = (engine, opts = {}) =>
  createParticleEmitter(engine, { ...opts, type: 'fire' });
