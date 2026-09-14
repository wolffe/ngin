/**
 * CPU particles — camera-facing quads driven by named effect rows.
 */

import * as THREE from 'three/webgpu';
import { color as tslColor, rangeFogFactor, texture as tslTexture, uniform } from 'three/tsl';
import { EFFECTS } from './ParticleEffects.js';

const fogNear = uniform(80).onRenderUpdate(({ scene }) => (scene.fog && scene.fog.near) || 1e6);
const fogFar = uniform(260).onRenderUpdate(({ scene }) => (scene.fog && scene.fog.far) || 1e6);
const fogFade = rangeFogFactor(fogNear, fogFar).oneMinus();

const dummy = new THREE.Object3D();
const plane = new THREE.PlaneGeometry(1, 1);
const GRAVITY = 18;
const velDir = new THREE.Vector3();
const camInv = new THREE.Quaternion();

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

const jitter = (span) => (Math.random() * 2 - 1) * span;

const mixHex = (a, b) => {
  if (b == null) return a;
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (((ar + br) >> 1) << 16) | (((ag + bg) >> 1) << 8) | ((ab + bb) >> 1);
};

const resolveSpec = (opts) => {
  if (opts.spec) return opts.spec;
  const rows = EFFECTS[opts.type];
  if (rows?.length) return rows[0];
  return EFFECTS.spray[0];
};

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {{
 *   type?: string,
 *   spec?: object,
 *   position?: {x:number,y:number,z:number},
 *   count?: number,
 *   enabled?: boolean,
 *   rate?: number,
 *   map?: THREE.Texture,
 *   physics?: object,
 *   getOrigin?: () => {x:number,y:number,z:number},
 *   getDrift?: () => {x:number,y:number,z:number},
 * }} [opts]
 */
export const createParticleEmitter = (engine, opts = {}) => {
  const spec = resolveSpec(opts);
  const count = Math.max(1, opts.count ?? spec.count ?? 32);
  const origin = { ...(opts.position ?? { x: 0, y: 0, z: 0 }) };
  let enabled = opts.enabled ?? true;
  let rate = opts.rate ?? (spec.burst ? 0 : (spec.rate ?? 1));
  const physics = opts.physics ?? engine.get?.('physics') ?? null;
  let getOrigin = opts.getOrigin ?? null;
  let getDrift = opts.getDrift ?? null;
  const life0 = Array.isArray(spec.life) ? spec.life[0] : 0.6;
  const life1 = Array.isArray(spec.life) ? spec.life[1] : life0;
  const avgLife = (life0 + life1) * 0.5;
  const size0 = spec.size ?? spec.size0 ?? 0.3;
  const size1 = spec.size1 ?? size0 + (spec.sizeincrease ?? 0);
  const off = spec.originoffset ?? [0, 0, 0];
  const oj = spec.originjitter ?? [0, 0, 0];
  const voff = spec.velocityoffset ?? [0, 0, 0];
  const vj = spec.velocityjitter ?? [0, 0, 0];
  const vmul = spec.velocitymultiplier ?? 1;
  const tintHex = mixHex(spec.color ?? 0xffffff, spec.color2);
  const additive = !!spec.additive;
  const bounce = spec.bounce ?? 0;
  const slide = !!spec.slide;
  const wind = spec.wind ?? 0;
  const gravity = spec.gravity ?? 0;
  const friction = spec.airfriction ?? 0;
  const spark = spec.orientation === 'spark';

  const map = opts.map ?? discTexture();
  const sample = tslTexture(map);
  const tint = tslColor(tintHex).mul(sample);
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  if (additive) {
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
  let retrigger = 0;

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
    scratch.x += off[0] + jitter(oj[0]);
    scratch.y += off[1] + jitter(oj[1]);
    scratch.z += off[2] + jitter(oj[2]);
    vel.x = (voff[0] + jitter(vj[0])) * vmul;
    vel.y = (voff[1] + jitter(vj[1])) * vmul;
    vel.z = (voff[2] + jitter(vj[2])) * vmul;
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
    lives[i] = life0 + Math.random() * (life1 - life0);
    seeds[i] = 0.85 + Math.random() * 0.3;
    spins[i] = Math.random() * Math.PI * 2;
    live[i] = 1;
  };

  const burst = () => {
    for (let i = 0; i < count; i++) respawn(i);
    mesh.instanceMatrix.needsUpdate = true;
  };

  dummy.scale.setScalar(0);
  for (let i = 0; i < count; i++) park(i);
  if (spec.burst) burst();
  else if (rate > 0) {
    for (let i = 0; i < count; i++) {
      respawn(i);
      ages[i] = Math.random() * lives[i];
    }
  }
  mesh.instanceMatrix.needsUpdate = true;

  const integrate = (o, v, dt) => {
    if (gravity) v.y -= GRAVITY * gravity * dt;
    if (friction) {
      const drag = friction < 0 ? 1 - friction * dt : Math.max(0, 1 - friction * dt);
      v.x *= drag;
      v.y *= drag;
      v.z *= drag;
    }
    if (wind && physics?.fieldAccel) {
      const a = physics.fieldAccel(o.x, o.y, o.z);
      v.x += a.ax * wind * dt;
      v.y += a.ay * wind * dt;
      v.z += a.az * wind * dt;
    }
    const step = Math.hypot(v.x, v.y, v.z) * dt;
    if (bounce !== 0 && physics?.castRay && step > 1e-4) {
      const hit = physics.castRay(o.x, o.y, o.z, v.x, v.y, v.z, step + 0.03);
      if (hit) {
        if (bounce < 0) return false;
        o.x = hit.x + hit.nx * 0.02;
        o.y = hit.y + hit.ny * 0.02;
        o.z = hit.z + hit.nz * 0.02;
        const vn = v.x * hit.nx + v.y * hit.ny + v.z * hit.nz;
        if (slide) {
          v.x -= hit.nx * vn;
          v.y -= hit.ny * vn;
          v.z -= hit.nz * vn;
        } else {
          v.x -= 2 * vn * hit.nx;
          v.y -= 2 * vn * hit.ny;
          v.z -= 2 * vn * hit.nz;
          v.x *= bounce;
          v.y *= bounce;
          v.z *= bounce;
        }
        return true;
      }
    }
    o.x += v.x * dt;
    o.y += v.y * dt;
    o.z += v.z * dt;
    return true;
  };

  engine.onUpdate((dt) => {
    mesh.visible = enabled;
    if (!enabled) return;
    const cap = Math.min(dt, 0.05);
    const camQ = engine.camera.quaternion;

    if (spec.burst && spec.retrigger > 0) {
      retrigger += cap;
      if (retrigger >= spec.retrigger) {
        retrigger = 0;
        burst();
      }
    }

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
      if (!integrate(scratch, vel, cap)) {
        park(i);
        continue;
      }
      positions[i * 3] = scratch.x;
      positions[i * 3 + 1] = scratch.y;
      positions[i * 3 + 2] = scratch.z;
      velocities[i * 3] = vel.x;
      velocities[i * 3 + 1] = vel.y;
      velocities[i * 3 + 2] = vel.z;
      const t = ages[i] / lives[i];
      const envelope = t < 0.12 ? t / 0.12 : t > 0.55 ? 1 - (t - 0.55) / 0.45 : 1;
      const size = Math.max(0.01, (size0 + t * (size1 - size0)) * seeds[i] * envelope);
      dummy.position.set(scratch.x, scratch.y, scratch.z);
      dummy.quaternion.copy(camQ);
      if (spark) {
        const spd = Math.hypot(vel.x, vel.y, vel.z);
        velDir.set(vel.x, vel.y, vel.z).applyQuaternion(camInv.copy(camQ).invert());
        dummy.rotateZ(Math.atan2(velDir.y, velDir.x));
        dummy.scale.set(size * (0.45 + spd * 0.14), size * 0.28, 1);
      } else {
        dummy.rotateZ(spins[i]);
        dummy.scale.setScalar(size);
      }
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
    type: opts.type ?? 'custom',
    burst,
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

/**
 * Spawn every row of a named effect.
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {string} name
 * @param {object} [opts]
 */
export const createEffect = (engine, name, opts = {}) => {
  const rows = EFFECTS[name];
  if (!rows?.length) return { name, emitters: [] };
  const emitters = rows.map((spec) => createParticleEmitter(engine, { ...opts, spec, type: name }));
  return {
    name,
    emitters,
    burst() {
      for (const e of emitters) e.burst();
    },
    setEnabled(v) {
      for (const e of emitters) e.setEnabled(v);
    },
    setPosition(x, y, z) {
      for (const e of emitters) e.setPosition(x, y, z);
    },
  };
};

/** @param {import('../engine/Engine.js').Engine} engine */
export const createFirePuffs = (engine, opts = {}) =>
  createParticleEmitter(engine, { ...opts, type: 'fire' });
