import * as THREE from 'three/webgpu';

/** @param {import('three').PerspectiveCamera} camera @param {{ fov?: number, near?: number, far?: number }} [opts] */
export const createCameraManager = (camera, opts = {}) => {
  if (opts.fov != null) camera.fov = opts.fov;
  if (opts.near != null) camera.near = opts.near;
  if (opts.far != null) camera.far = opts.far;
  camera.updateProjectionMatrix();

  /** @type {'firstPerson' | 'thirdPerson' | 'free'} */
  let mode = 'firstPerson';
  /** @type {((camera: THREE.PerspectiveCamera, dt: number) => void) | null} */
  let controller = null;

  return {
    camera,
    get mode() {
      return mode;
    },
    setMode(newMode, newController) {
      mode = newMode;
      controller = newController ?? null;
    },
    update(dt) {
      controller?.(camera, dt);
    },
    setFov(fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    },
  };
};

/** @param {{ sensitivity?: number }} [opts] */
export const createFirstPersonCamera = (opts = {}) => {
  const sensitivity = opts.sensitivity ?? 0.002;
  /** @type {{ yaw: number, pitch: number }} */
  const rotation = { yaw: 0, pitch: 0 };
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  return {
    rotation,
    bind(input, getOpts = () => ({})) {
      return (camera, dt) => {
        const opts = getOpts();
        const sens = opts.sensitivity ?? sensitivity;
        const { dx, dy } = input.consumeMouseDelta();
        const pitchSign = opts.invertMouse ? 1 : -1;
        rotation.yaw -= dx * sens;
        rotation.pitch += dy * sens * pitchSign;
        rotation.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, rotation.pitch));
        euler.set(rotation.pitch, rotation.yaw, 0);
        camera.quaternion.setFromEuler(euler);
      };
    },
    syncFromCamera(camera) {
      euler.setFromQuaternion(camera.quaternion, 'YXZ');
      rotation.pitch = euler.x;
      rotation.yaw = euler.y;
    },
  };
};

/** @param {{ distance?: number, height?: number, sensitivity?: number }} [opts] */
export const createThirdPersonCamera = (opts = {}) => {
  const distance = opts.distance ?? 3;
  const height = opts.height ?? 0.5;
  const sensitivity = opts.sensitivity ?? 0.002;
  /** @type {{ yaw: number, pitch: number }} */
  const orbit = { yaw: 0, pitch: 0.3 };
  const offset = new THREE.Vector3();
  const target = new THREE.Vector3();
  let hasTarget = false;

  return {
    orbit,
    bind(input, getTarget, getOpts = () => ({})) {
      hasTarget = false;
      return (camera, dt) => {
        const opts = getOpts();
        const dist = opts.distance ?? distance;
        const h = opts.height ?? height;
        const sens = opts.sensitivity ?? sensitivity;

        const { dx, dy } = input.consumeMouseDelta();
        const pitchSign = opts.invertMouse ? -1 : 1;
        orbit.yaw -= dx * sens;
        orbit.pitch += dy * sens * pitchSign;
        orbit.pitch = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, orbit.pitch));

        const pos = getTarget();
        const desiredY = pos.y + h;
        const follow = 1 - Math.exp(-16 * dt);
        if (!hasTarget) {
          target.set(pos.x, desiredY, pos.z);
          hasTarget = true;
        } else {
          target.x += (pos.x - target.x) * follow;
          target.y += (desiredY - target.y) * follow;
          target.z += (pos.z - target.z) * follow;
        }

        offset.set(
          Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * dist,
          Math.sin(orbit.pitch) * dist,
          Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * dist
        );
        camera.up.set(0, 1, 0);
        camera.position.copy(target).add(offset);
        camera.lookAt(target);
      };
    },
  };
};

/** @param {{ speed?: number, sensitivity?: number }} [opts] */
export const createFlyCamera = (opts = {}) => {
  const speed = opts.speed ?? 8;
  const sensitivity = opts.sensitivity ?? 0.002;
  /** @type {{ yaw: number, pitch: number }} */
  const rotation = { yaw: 0, pitch: 0 };
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  return {
    rotation,
    update(camera, input, dt) {
      const { dx, dy } = input.consumeMouseDelta();
      rotation.yaw -= dx * sensitivity;
      rotation.pitch -= dy * sensitivity;
      rotation.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, rotation.pitch));
      euler.set(rotation.pitch, rotation.yaw, 0);
      camera.quaternion.setFromEuler(euler);

      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      const move = input.getMove();
      const flyY = (input.isAction('jump') ? 1 : 0) - (input.isAction('crouch') ? 1 : 0);
      const sprint = input.isAction('sprint') ? 2 : 1;

      camera.position.addScaledVector(forward, -move.z * speed * sprint * dt);
      camera.position.addScaledVector(right, move.x * speed * sprint * dt);
      camera.position.y += flyY * speed * sprint * dt;
    },
  };
};
