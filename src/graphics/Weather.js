/**
 * Camera-local rain (vertical streaks) and snow (camera-facing flakes).
 * Instanced meshes so they stay visible under WebGPU; points were too small.
 */

import * as THREE from 'three/webgpu';
import { color as tslColor, float } from 'three/tsl';

const dummy = new THREE.Object3D();
const RANGE2 = 20 * 20;

const unlit = (hex, opacity) => {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
  mat.colorNode = tslColor(hex);
  mat.opacityNode = float(opacity);
  return mat;
};

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {{
 *   count: number,
 *   geo: THREE.BufferGeometry,
 *   mat: THREE.Material,
 *   spawn: (o: {x:number,y:number,z:number}, vel: {x:number,y:number,z:number}, cam: {x:number,y:number,z:number}) => void,
 *   integrate: (o: {x:number,y:number,z:number}, vel: {x:number,y:number,z:number}, dt: number, age: number) => void,
 *   life: [number, number],
 *   billboard?: boolean,
 * }} spec
 */
const createInstancedField = (engine, spec) => {
  const count = spec.count;
  const mesh = new THREE.InstancedMesh(spec.geo, spec.mat, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.layers.set(1);
  engine.camera.layers.enable(1);
  engine.add(mesh);

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const ages = new Float32Array(count);
  const lives = new Float32Array(count);
  const o = { x: 0, y: 0, z: 0 };
  const vel = { x: 0, y: 0, z: 0 };
  const cam = { x: 0, y: 0, z: 0 };
  let enabled = false;

  const respawn = (i) => {
    cam.x = engine.camera.position.x;
    cam.y = engine.camera.position.y;
    cam.z = engine.camera.position.z;
    o.x = 0;
    o.y = 0;
    o.z = 0;
    vel.x = 0;
    vel.y = 0;
    vel.z = 0;
    spec.spawn(o, vel, cam);
    positions[i * 3] = o.x;
    positions[i * 3 + 1] = o.y;
    positions[i * 3 + 2] = o.z;
    velocities[i * 3] = vel.x;
    velocities[i * 3 + 1] = vel.y;
    velocities[i * 3 + 2] = vel.z;
    ages[i] = 0;
    lives[i] = spec.life[0] + Math.random() * (spec.life[1] - spec.life[0]);
  };

  for (let i = 0; i < count; i++) {
    respawn(i);
    ages[i] = Math.random() * lives[i];
  }

  engine.onUpdate((dt) => {
    mesh.visible = enabled;
    if (!enabled) return;
    const cap = Math.min(dt, 0.05);
    const camPos = engine.camera.position;
    const camQ = engine.camera.quaternion;
    for (let i = 0; i < count; i++) {
      ages[i] += cap;
      const dx = positions[i * 3] - camPos.x;
      const dz = positions[i * 3 + 2] - camPos.z;
      if (
        ages[i] > lives[i] ||
        positions[i * 3 + 1] < camPos.y - 8 ||
        dx * dx + dz * dz > RANGE2
      ) {
        respawn(i);
      } else {
        o.x = positions[i * 3];
        o.y = positions[i * 3 + 1];
        o.z = positions[i * 3 + 2];
        vel.x = velocities[i * 3];
        vel.y = velocities[i * 3 + 1];
        vel.z = velocities[i * 3 + 2];
        spec.integrate(o, vel, cap, ages[i]);
        positions[i * 3] = o.x;
        positions[i * 3 + 1] = o.y;
        positions[i * 3 + 2] = o.z;
        velocities[i * 3] = vel.x;
        velocities[i * 3 + 1] = vel.y;
        velocities[i * 3 + 2] = vel.z;
      }
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      if (spec.billboard) dummy.quaternion.copy(camQ);
      else dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return {
    mesh,
    setEnabled(v) {
      enabled = !!v;
    },
    get enabled() {
      return enabled;
    },
  };
};

/**
 * @param {import('../engine/Engine.js').Engine} engine
 */
export const createWeather = (engine) => {
  const rain = createInstancedField(engine, {
    count: 1100,
    geo: new THREE.BoxGeometry(0.028, 1.12, 0.028),
    mat: unlit(0xb7d4ee, 0.62),
    life: [0.45, 0.9],
    spawn: (o, vel, cam) => {
      o.x = cam.x + (Math.random() - 0.5) * 32;
      o.y = cam.y + 6 + Math.random() * 12;
      o.z = cam.z + (Math.random() - 0.5) * 32;
      vel.x = 1.2;
      vel.y = -22 - Math.random() * 8;
      vel.z = 0.4;
    },
    integrate: (o, vel, dt) => {
      o.x += vel.x * dt;
      o.y += vel.y * dt;
      o.z += vel.z * dt;
    },
  });

  const snow = createInstancedField(engine, {
    count: 650,
    geo: new THREE.PlaneGeometry(0.26, 0.26),
    mat: unlit(0xe8f0ff, 0.92),
    billboard: true,
    life: [3.5, 6],
    spawn: (o, vel, cam) => {
      o.x = cam.x + (Math.random() - 0.5) * 30;
      o.y = cam.y + 5 + Math.random() * 10;
      o.z = cam.z + (Math.random() - 0.5) * 30;
      vel.x = (Math.random() - 0.5) * 0.7;
      vel.y = -1.3 - Math.random() * 0.7;
      vel.z = (Math.random() - 0.5) * 0.7;
    },
    integrate: (o, vel, dt, age) => {
      o.x += vel.x * dt + Math.sin(age * 1.3 + o.z) * 0.55 * dt;
      o.y += vel.y * dt;
      o.z += vel.z * dt + Math.cos(age * 0.9 + o.x) * 0.35 * dt;
    },
  });

  return {
    rain,
    snow,
    setRain(on) {
      rain.setEnabled(on);
    },
    setSnow(on) {
      snow.setEnabled(on);
    },
  };
};
