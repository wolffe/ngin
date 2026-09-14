/**
 * Buoyant hull you can enter with E. Thrust is AddForce / AddTorque in hull space.
 * Flotation comes from the water volume the boat sits in — no fake Y lock.
 *
 * Kinds: fishing (slow, heavy damping) | speedboat (more thrust, less drag).
 */

import * as THREE from 'three/webgpu';
import { bindSeat } from '../player/Occupancy.js';
import { createParticleEmitter } from '../graphics/Particles.js';
import { attachLamps } from './Lights.js';

const addMesh = (parent, geo, mat, px = 0, py = 0, pz = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(px, py, pz);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
};

const PROFILES = {
  fishing: {
    mass: 180,
    thrust: 2400,
    steerTorque: 1100,
    half: [0.58, 0.2, 1.55],
    enterRadius: 3.4,
    exitSide: 1.8,
    linearDamping: 0.85,
    angularDamping: 1.15,
    buoyancy: 1.55,
    cameraLift: 0.7,
  },
  speedboat: {
    mass: 220,
    thrust: 5600,
    steerTorque: 1400,
    half: [0.7, 0.16, 2.1],
    enterRadius: 3.6,
    exitSide: 2.0,
    linearDamping: 0.5,
    angularDamping: 0.8,
    buoyancy: 1.45,
    cameraLift: 0.55,
  },
};

const buildFishingMesh = (hull, mats) => {
  addMesh(hull, new THREE.BoxGeometry(1.15, 0.38, 3.1), mats.get('wood'));
  addMesh(hull, new THREE.BoxGeometry(1.15, 0.22, 0.55), mats.get('wood'), 0, 0.12, 1.7);
  addMesh(hull, new THREE.BoxGeometry(0.08, 0.28, 2.8), mats.get('wood'), 0.54, 0.22, 0);
  addMesh(hull, new THREE.BoxGeometry(0.08, 0.28, 2.8), mats.get('wood'), -0.54, 0.22, 0);
  addMesh(hull, new THREE.BoxGeometry(1.0, 0.08, 0.7), mats.get('wood'), 0, 0.18, -0.2);
  addMesh(hull, new THREE.BoxGeometry(0.2, 0.12, 0.2), mats.get('darkGrey'), 0, 0.28, -1.35);
  addMesh(hull, new THREE.BoxGeometry(0.18, 0.1, 0.08), mats.get('headlight'), 0.35, 0.08, 1.58);
  addMesh(hull, new THREE.BoxGeometry(0.18, 0.1, 0.08), mats.get('headlight'), -0.35, 0.08, 1.58);
  addMesh(hull, new THREE.BoxGeometry(0.16, 0.1, 0.08), mats.get('taillight'), 0.4, 0.08, -1.55);
  addMesh(hull, new THREE.BoxGeometry(0.16, 0.1, 0.08), mats.get('taillight'), -0.4, 0.08, -1.55);
};

const buildSpeedboatMesh = (hull, mats) => {
  addMesh(hull, new THREE.BoxGeometry(1.4, 0.28, 4.2), mats.get('blue'));
  addMesh(hull, new THREE.BoxGeometry(1.2, 0.12, 1.1), mats.get('blue'), 0, 0.14, 1.35);
  addMesh(hull, new THREE.BoxGeometry(1.15, 0.42, 0.06), mats.get('glassDark'), 0, 0.38, 0.55);
  addMesh(hull, new THREE.BoxGeometry(0.42, 0.12, 0.42), mats.get('darkGrey'), 0.28, 0.22, -0.35);
  addMesh(hull, new THREE.BoxGeometry(0.42, 0.12, 0.42), mats.get('darkGrey'), -0.28, 0.22, -0.35);
  addMesh(hull, new THREE.BoxGeometry(0.28, 0.35, 0.45), mats.get('chrome'), 0, 0.12, -2.15);
  addMesh(hull, new THREE.BoxGeometry(0.22, 0.12, 0.08), mats.get('headlight'), 0.45, 0.02, 2.12);
  addMesh(hull, new THREE.BoxGeometry(0.22, 0.12, 0.08), mats.get('headlight'), -0.45, 0.02, 2.12);
  addMesh(hull, new THREE.BoxGeometry(0.18, 0.1, 0.08), mats.get('taillight'), 0.42, 0.04, -2.12);
  addMesh(hull, new THREE.BoxGeometry(0.18, 0.1, 0.08), mats.get('taillight'), -0.42, 0.04, -2.12);
};

const MESH = { fishing: buildFishingMesh, speedboat: buildSpeedboatMesh };

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('../graphics/MaterialLibrary.js').createMaterialLibrary>} materials
 * @param {ReturnType<import('../player/Player.js').createPlayer>} player
 * @param {ReturnType<import('../input/InputManager.js').createInputManager>} input
 * @param {{ kind?: string, x?: number, y?: number, z?: number, id?: string, interaction?: object }} [spawn]
 */
export const createBoat = (engine, physics, materials, player, input, spawn = {}) => {
  const kind = spawn.kind && PROFILES[spawn.kind] ? spawn.kind : 'fishing';
  const spec = PROFILES[kind];
  const Jolt = physics.Jolt;
  const { bodyInterface } = physics;
  const id = spawn.id ?? `boat_${kind}`;
  const x = spawn.x ?? 0;
  const y = spawn.y ?? 0.3;
  const z = spawn.z ?? 0;

  physics.addDynamicBox(id, { x, y, z }, spec.half, null, spec.mass, {
    linearDamping: spec.linearDamping,
    angularDamping: spec.angularDamping,
    friction: 0.4,
    restitution: 0.05,
    buoyancy: spec.buoyancy,
  });
  const entry = physics.getDynamic(id);
  const boatBody = entry.body;

  const hull = new THREE.Group();
  MESH[kind](hull, materials);
  const lamps = attachLamps(hull, materials);
  engine.add(hull);
  entry.mesh = hull;

  const tmpQ = new THREE.Quaternion();
  const tmpFwd = new THREE.Vector3();
  const local = new THREE.Vector3();
  const force = new Jolt.Vec3();
  const torque = new Jolt.Vec3();

  const wake = createParticleEmitter(engine, {
    type: 'wake',
    rate: 0,
    physics,
    getOrigin: () => {
      const pick = Math.random();
      if (pick < 0.35) local.set(-spec.half[0] * 0.95, 0.02, (Math.random() - 0.25) * spec.half[2]);
      else if (pick < 0.7) local.set(spec.half[0] * 0.95, 0.02, (Math.random() - 0.25) * spec.half[2]);
      else local.set((Math.random() - 0.5) * spec.half[0], 0.02, -spec.half[2]);
      local.applyQuaternion(hull.quaternion);
      return {
        x: hull.position.x + local.x,
        y: hull.position.y + local.y,
        z: hull.position.z + local.z,
      };
    },
    getDrift: () => {
      const lin = boatBody.GetLinearVelocity();
      return { x: -lin.GetX() * 0.22, y: 0.35, z: -lin.GetZ() * 0.22 };
    },
  });

  const api = {
    kind,
    hull,
    body: boatBody,
    enter() {},
    exit() {},
    warmLights(on = true) {
      lamps.warm(on);
    },
  };

  const seat = bindSeat(engine, physics, player, input, {
    api,
    body: boatBody,
    root: hull,
    half: spec.half,
    kind,
    enterRadius: spec.enterRadius,
    exitSide: spec.exitSide,
    cameraLift: spec.cameraLift,
    interaction: spawn.interaction,
    onEnter: () => {},
    onExit: () => {
      lamps.setOn(false);
      lamps.setBrake(false);
    },
  });

  engine.onUpdate(() => {
    if (seat.occupied && input.wasPressed('flashlight')) lamps.toggle();
    const lin = boatBody.GetLinearVelocity();
    const speed = Math.hypot(lin.GetX(), lin.GetZ());
    wake.setRate(Math.max(0, Math.min(1, (speed - 1.2) / 7)));
  });

  physics.onPreStep(() => {
    if (!seat.occupied) return;
    const move = input.getMove();
    const want = move.z < 0 ? 1 : move.z > 0 ? -1 : 0;
    if (seat.releaseDrive(want)) return;
    const q = boatBody.GetRotation();
    tmpQ.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
    tmpFwd.set(0, 0, 1).applyQuaternion(tmpQ);

    if (want) {
      force.Set(tmpFwd.x * spec.thrust * want, 0, tmpFwd.z * spec.thrust * want);
      bodyInterface.AddForce(boatBody.GetID(), force, Jolt.EActivation_Activate);
    }
    if (move.x) {
      torque.Set(0, -move.x * spec.steerTorque, 0);
      bodyInterface.AddTorque(boatBody.GetID(), torque, Jolt.EActivation_Activate);
    }
  });

  return api;
};
