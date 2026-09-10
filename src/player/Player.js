import * as THREE from 'three/webgpu';
import {
  createFirstPersonCamera,
  createThirdPersonCamera,
  createCameraManager,
} from '../camera/CameraManager.js';

/** @typedef {import('../engine/Engine.js').Engine} Engine */
/** @typedef {ReturnType<import('./CharacterModel.js').createCharacterModel>} CharacterModel */

const lerp = (a, b, t) => a + (b - a) * t;

const lerpAngle = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

const TURN_RATE = 18;
const TP_DISTANCE_MIN = 1.2;
const TP_DISTANCE_MAX = 14;
const TP_DISTANCE_STEP = 0.45;
const TP_HEIGHT = 0.5;

/** Fixed locomotion — games import createPlayer; tweak via Always Run only. */
const WALK_SPEED = 4;
const RUN_SPEED = 7;
const CROUCH_SPEED = 2;
const JUMP_FORCE = 8;
const STANDING_HEIGHT = 1.8;
const CROUCH_HEIGHT = 1.0;
const STANDING_EYE_HEIGHT = 1.6;
const CROUCH_EYE_HEIGHT = 0.9;

/** Camera forward on the ground plane (+Z object faces this when yaw = 0). */
const forwardFacing = (yaw) => Math.atan2(-Math.sin(yaw), -Math.cos(yaw));

/**
 * @param {Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('../input/InputManager.js').createInputManager>} input
 * @param {object} settings
 * @param {CharacterModel} character
 */
export const createPlayer = (engine, physics, input, settings, character) => {
  const radius = 0.35;
  const cameraManager = createCameraManager(engine.camera, { fov: settings.fov });
  const fpCamera = createFirstPersonCamera({ sensitivity: settings.mouseSensitivity });
  const modelHeight = character.modelHeight || 1.65;
  const anchorHeight = character.anchorHeight || modelHeight * 0.45;
  const tpCamera = createThirdPersonCamera({
    distance: settings.thirdPersonDistance ?? 3,
    height: settings.thirdPersonHeight ?? TP_HEIGHT,
    sensitivity: settings.mouseSensitivity,
  });

  physics.createCharacter({
    height: STANDING_HEIGHT,
    radius,
    crouchHeight: CROUCH_HEIGHT,
    position: { x: 0, y: physics.halfHeight(STANDING_HEIGHT, radius), z: 0 },
  });

  engine.add(character.root);
  character.setVisible(settings.viewMode === 'thirdPerson');

  let enabled = true;
  let facing = 0;
  let currentHeight = STANDING_HEIGHT;
  let jumpPressed = false;
  let isMoving = false;
  let moveSpeed = 0;
  /** @type {null | (() => { x: number, y: number, z: number })} */
  let followOverride = null;
  let hideCharacter = false;

  const getTarget = () => {
    if (followOverride) return followOverride();
    const pos = physics.getCharacterPosition();
    if (!pos) return { x: 0, y: anchorHeight, z: 0 };
    const hh = physics.halfHeight(physics.character.height, radius);
    const feetY = pos.y - hh;
    return {
      x: pos.x,
      y: feetY + anchorHeight,
      z: pos.z,
    };
  };

  const cameraOpts = () => ({
    sensitivity: settings.mouseSensitivity,
    invertMouse: !!settings.invertMouse,
    distance: settings.thirdPersonDistance ?? 3,
    height: settings.thirdPersonHeight ?? TP_HEIGHT,
  });

  const applyCameraMode = () => {
    character.setVisible(!hideCharacter && settings.viewMode === 'thirdPerson');
    if (settings.viewMode === 'firstPerson' && !followOverride) {
      cameraManager.setMode('firstPerson', fpCamera.bind(input, cameraOpts));
    } else {
      cameraManager.setMode('thirdPerson', tpCamera.bind(input, getTarget, cameraOpts));
    }
  };

  applyCameraMode();

  const crouchT = (h) =>
    (STANDING_HEIGHT - h) / (STANDING_HEIGHT - CROUCH_HEIGHT);

  const update = (dt) => {
    if (!physics.character) return;

    cameraManager.setFov(settings.fov);

    if (!enabled) {
      cameraManager.update(dt);
      physics.step(dt);
      return;
    }

    const crouchHeld = input.isAction('crouch');
    physics.setCrouching(crouchHeld);

    const targetHeight = crouchHeld ? CROUCH_HEIGHT : STANDING_HEIGHT;
    currentHeight += (targetHeight - currentHeight) * Math.min(1, dt * 10);

    const wantJump = input.isAction('jump');
    const doJump = wantJump && !jumpPressed && (physics.character.grounded || physics.character.waterWalk) && !crouchHeld;
    jumpPressed = wantJump;

    cameraManager.update(dt);

    const move = input.getMove();
    let speed = WALK_SPEED;
    if (crouchHeld) speed = CROUCH_SPEED;
    else if (settings.alwaysRun || input.isAction('sprint')) speed = RUN_SPEED;

    const yaw =
      settings.viewMode === 'firstPerson' ? fpCamera.rotation.yaw : tpCamera.orbit.yaw;

    const runMove = (wishDir) => {
      physics.moveCharacter(wishDir, speed, doJump, dt, JUMP_FORCE);
    };

    isMoving = move.x !== 0 || move.z !== 0;
    moveSpeed = isMoving ? speed : 0;

    if (isMoving) {
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const wishDir = {
        x: move.x * cos + move.z * sin,
        z: -move.x * sin + move.z * cos,
      };
      const len = Math.hypot(wishDir.x, wishDir.z) || 1;
      wishDir.x /= len;
      wishDir.z /= len;
      runMove(wishDir);
      if (settings.viewMode === 'thirdPerson') {
        facing = lerpAngle(
          facing,
          Math.atan2(wishDir.x, wishDir.z),
          1 - Math.exp(-TURN_RATE * dt)
        );
      }
    } else {
      physics.moveCharacter({ x: 0, z: 0 }, 0, doJump, dt, JUMP_FORCE);
    }

    physics.step(dt);

    const pos = physics.getCharacterPosition();
    if (!pos) return;

    const t = Math.max(0, Math.min(1, crouchT(currentHeight)));
    const eye = lerp(STANDING_EYE_HEIGHT, CROUCH_EYE_HEIGHT, t);
    const halfH = physics.halfHeight(physics.character.height, radius);
    const feetY = pos.y - halfH;

    if (settings.viewMode === 'firstPerson') {
      engine.camera.position.set(pos.x, pos.y + eye - radius, pos.z);
    } else {
      character.setTransform(feetY, pos.x, pos.z, facing, t);

      character.update(dt, {
        speed: moveSpeed,
        grounded: physics.character.grounded,
        runSpeed: RUN_SPEED,
      });
    }
  };

  const lookDir = new THREE.Vector3();
  const holdQuat = new THREE.Quaternion();
  const holdEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  const getHoldPoint = (dist = 1.1) => {
    const pos = physics.getCharacterPosition();
    if (!pos) return { x: 0, y: 1, z: 0 };

    if (settings.viewMode === 'firstPerson' && !followOverride) {
      const t = Math.max(0, Math.min(1, crouchT(currentHeight)));
      const eye = lerp(STANDING_EYE_HEIGHT, CROUCH_EYE_HEIGHT, t);
      holdEuler.set(fpCamera.rotation.pitch, fpCamera.rotation.yaw, 0);
      holdQuat.setFromEuler(holdEuler);
      lookDir.set(0, 0, -1).applyQuaternion(holdQuat);
      return {
        x: pos.x + lookDir.x * dist,
        y: pos.y + eye - radius + lookDir.y * dist - 0.15,
        z: pos.z + lookDir.z * dist,
      };
    }

    const yaw = facing;
    return {
      x: pos.x + Math.sin(yaw) * dist,
      y: pos.y + 0.35,
      z: pos.z + Math.cos(yaw) * dist,
    };
  };

  engine.onUpdate(update);

  return {
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
    },
    setFollowTarget(fn) {
      followOverride = fn;
      hideCharacter = !!fn;
      if (fn) settings.viewMode = 'thirdPerson';
      applyCameraMode();
    },
    clearFollowTarget() {
      followOverride = null;
      hideCharacter = false;
      applyCameraMode();
    },
    aimOrbitBehind(subjectYaw) {
      tpCamera.orbit.yaw = subjectYaw + Math.PI;
      tpCamera.orbit.pitch = 0.32;
      fpCamera.rotation.yaw = tpCamera.orbit.yaw;
    },
    setViewMode(mode) {
      const prev = settings.viewMode;
      settings.viewMode = mode;
      if (mode === 'thirdPerson' && prev !== 'thirdPerson') {
        tpCamera.orbit.yaw = fpCamera.rotation.yaw;
        facing = forwardFacing(tpCamera.orbit.yaw);
      } else if (mode === 'firstPerson' && prev !== 'firstPerson') {
        fpCamera.rotation.yaw = tpCamera.orbit.yaw;
      }
      applyCameraMode();
    },
    toggleViewMode() {
      this.setViewMode(settings.viewMode === 'firstPerson' ? 'thirdPerson' : 'firstPerson');
    },
    zoomOrbit(steps) {
      const cur = settings.thirdPersonDistance ?? 3;
      settings.thirdPersonDistance = Math.min(
        TP_DISTANCE_MAX,
        Math.max(TP_DISTANCE_MIN, cur + steps * TP_DISTANCE_STEP)
      );
    },
    refreshCameraBindings() {
      applyCameraMode();
    },
    get enabled() {
      return enabled;
    },
    getHoldPoint,
    getPosition() {
      return physics.getCharacterPosition();
    },
    getFacing() {
      if (settings.viewMode === 'firstPerson' && !followOverride) {
        return forwardFacing(fpCamera.rotation.yaw);
      }
      return facing;
    },
  };
};
