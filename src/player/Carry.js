/**
 * Physical carry. The body stays dynamic and is pulled toward the player's
 * hold point with a velocity servo so it bumps walls instead of clipping.
 */

import * as THREE from 'three/webgpu';

const SERVO_GAIN = 14;
const MAX_SPEED = 9;
const HOLD_MIN = 0.6;
const HOLD_MAX = 2.5;
const HOLD_DEFAULT = 1.1;
const HOLD_STEP = 0.15;
const YANK_PAD = 1.2;
const TURN_SENS = 0.005;

/**
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('./Player.js').createPlayer>} player
 */
export const createCarry = (physics, player) => {
  const { Jolt, bodyInterface } = physics;
  const vel = new Jolt.Vec3(0, 0, 0);
  const zero = new Jolt.Vec3(0, 0, 0);
  const rot = new Jolt.Quat(0, 0, 0, 1);
  const hold = new THREE.Vector3();
  const holdQuat = new THREE.Quaternion();
  const yawQ = new THREE.Quaternion();
  const pitchQ = new THREE.Quaternion();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();

  /** @type {null | { id: string, body: unknown, mesh: import('three').Object3D, name: string, kind: string, mass: number, size: number, stow?: Function }} */
  let carried = null;
  let holdDist = HOLD_DEFAULT;

  const grab = (entry) => {
    if (carried || !entry?.body) return;
    carried = entry;
    const r = entry.body.GetRotation();
    holdQuat.set(r.GetX(), r.GetY(), r.GetZ(), r.GetW());
    physics.setCarriedBody(entry.body);
    bodyInterface.ActivateBody(entry.body.GetID());
  };

  const drop = (gentle = false) => {
    const c = carried;
    if (!c) return null;
    if (gentle) {
      c.body.SetLinearVelocity(zero);
      c.body.SetAngularVelocity(zero);
    }
    carried = null;
    physics.setCarriedBody(null);
    return c;
  };

  physics.onPreStep(() => {
    if (!carried) return;
    const p = player.getHoldPoint(holdDist);
    hold.set(p.x, p.y, p.z);

    const bp = carried.body.GetPosition();
    const dx = hold.x - bp.GetX();
    const dy = hold.y - bp.GetY();
    const dz = hold.z - bp.GetZ();
    const dist = Math.hypot(dx, dy, dz);
    if (dist > holdDist + YANK_PAD) {
      drop();
      return;
    }

    let sx = dx * SERVO_GAIN;
    let sy = dy * SERVO_GAIN;
    let sz = dz * SERVO_GAIN;
    const speed = Math.hypot(sx, sy, sz);
    if (speed > MAX_SPEED) {
      const k = MAX_SPEED / speed;
      sx *= k;
      sy *= k;
      sz *= k;
    }
    vel.Set(sx, sy, sz);
    carried.body.SetLinearVelocity(vel);
    carried.body.SetAngularVelocity(zero);

    rot.Set(holdQuat.x, holdQuat.y, holdQuat.z, holdQuat.w);
    bodyInterface.SetRotation(carried.body.GetID(), rot, Jolt.EActivation_Activate);
  });

  return {
    grab,
    drop,
    setDistance(steps) {
      holdDist = Math.min(HOLD_MAX, Math.max(HOLD_MIN, holdDist - steps * HOLD_STEP));
    },
    tumble(dx, dy, camera) {
      if (!carried) return;
      up.copy(camera.up).normalize();
      right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
      yawQ.setFromAxisAngle(up, dx * TURN_SENS);
      pitchQ.setFromAxisAngle(right, dy * TURN_SENS);
      holdQuat.premultiply(pitchQ).premultiply(yawQ).normalize();
    },
    get carried() {
      return carried;
    },
    get holdDist() {
      return holdDist;
    },
  };
};
