/**
 * One seated lock for every rideable (cars, boats, …).
 * Enter fails if another vehicle already holds the seat.
 * Look-at E, enter volume, same-frame skip, leftover W/S ignore, and exit live here.
 */

import * as THREE from 'three/webgpu';

/** @type {object | null} */
let occupant = null;

export const getOccupant = () => occupant;

export const occupySeat = (api) => {
  if (occupant) return false;
  occupant = api;
  return true;
};

export const vacateSeat = (api) => {
  if (occupant === api) occupant = null;
};

/** Park the walking capsule and follow this rideable. */
export const seatPlayer = (physics, player, getTarget, yaw) => {
  physics.setCharacterPosition(0, -20, 0);
  player.disable();
  player.setFollowTarget(getTarget);
  player.aimOrbitBehind(yaw);
};

/** Put the walker beside the rideable and restore locomotion. */
export const unseatPlayer = (physics, player, x, z) => {
  physics.setCharacterPosition(x, physics.halfHeight() + 0.05, z);
  player.clearFollowTarget();
  player.enable();
};

const VOLUME_MIN_H = 1.2;
const tmpQ = new THREE.Quaternion();
const tmpFwd = new THREE.Vector3();
const tmpSide = new THREE.Vector3();

const bodyPos = (body) => {
  const p = body.GetPosition();
  return { x: p.GetX(), y: p.GetY(), z: p.GetZ() };
};

const bodyYaw = (body) => {
  const q = body.GetRotation();
  tmpQ.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
  tmpFwd.set(0, 0, 1).applyQuaternion(tmpQ);
  return Math.atan2(tmpFwd.x, tmpFwd.z);
};

/**
 * Shared E-to-enter for cars and boats. Driving stays in the vehicle/boat module.
 *
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('./Player.js').createPlayer>} player
 * @param {ReturnType<import('../input/InputManager.js').createInputManager>} input
 * @param {{
 *   api: object,
 *   body: unknown,
 *   root: import('three').Object3D,
 *   half: [number, number, number],
 *   kind: string,
 *   enterRadius: number,
 *   exitSide: number,
 *   cameraLift: number,
 *   interaction?: object,
 *   onEnter?: Function,
 *   onExit?: Function,
 * }} opts
 */
export const bindSeat = (engine, physics, player, input, opts) => {
  const { api, body, root, half, kind, enterRadius, exitSide, cameraLift, interaction } = opts;
  const { bodyInterface } = physics;

  let occupied = false;
  let skipExit = false;
  let ignoreDriveUntilRelease = false;

  const volH = Math.max(half[1] * 2, VOLUME_MIN_H);
  const volume = new THREE.Mesh(
    new THREE.BoxGeometry(half[0] * 2, volH, half[2] * 2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  volume.position.y = volH / 2 - half[1];
  root.add(volume);

  const follow = () => {
    const c = bodyPos(body);
    return { x: c.x, y: c.y + cameraLift, z: c.z };
  };

  const enter = () => {
    if (!occupySeat(api)) return;
    occupied = true;
    seatPlayer(physics, player, follow, bodyYaw(body));
    ignoreDriveUntilRelease = true;
    skipExit = true;
    bodyInterface.ActivateBody(body.GetID());
    opts.onEnter?.();
  };

  const exit = () => {
    occupied = false;
    vacateSeat(api);
    const p = body.GetPosition();
    const q = body.GetRotation();
    tmpQ.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
    tmpSide.set(exitSide, 0, 0).applyQuaternion(tmpQ);
    unseatPlayer(physics, player, p.GetX() + tmpSide.x, p.GetZ() + tmpSide.z);
    opts.onExit?.();
  };

  api.enter = enter;
  api.exit = exit;
  Object.defineProperty(api, 'occupied', { get: () => occupied, configurable: true });

  if (interaction) {
    interaction.add({
      meshes: [volume],
      maxDistance: enterRadius,
      useAction: 'interact',
      getText: () => (occupied || getOccupant() ? null : `Enter ${kind}`),
      interact: enter,
    });
  }

  engine.onUpdate(() => {
    if (occupied && input.wasPressed('interact') && !skipExit) exit();
    skipExit = false;
  });

  return {
    get occupied() {
      return occupied;
    },
    /** @param {number} want W/S as +1 / -1 / 0 */
    releaseDrive(want) {
      if (!ignoreDriveUntilRelease) return false;
      if (want === 0) ignoreDriveUntilRelease = false;
      return ignoreDriveUntilRelease;
    },
  };
};
