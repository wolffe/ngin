/**
 * Spotlight on L. First person: from the camera. Third person: in front of the body.
 * Casts shadows while on. Do not toggle `castShadow` at runtime (WebGPU disposes
 * the shadow map and then reads `depthTexture` on null).
 */

import * as THREE from 'three/webgpu';
import { getOccupant } from './Occupancy.js';

const COLOR = 0xffe6c2;
const RANGE = 28;
const ANGLE = 0.95;
const PENUMBRA = 0.72;
const DECAY = 1.15;
const ON = 18;
const HOLD = 0.62;
const CHEST = 0.45;

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {ReturnType<import('../input/InputManager.js').createInputManager>} input
 * @param {ReturnType<import('./Player.js').createPlayer>} player
 * @param {object} settings
 */
export const createFlashlight = (engine, input, player, settings) => {
  const light = new THREE.SpotLight(COLOR, 0, RANGE, ANGLE, PENUMBRA, DECAY);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 0.25;
  light.shadow.camera.far = RANGE;
  light.shadow.bias = -0.00008;
  light.shadow.normalBias = 0.025;
  light.shadow.radius = 1.5;
  light.shadow.autoUpdate = false;
  light.shadow.camera.layers.enable(0);
  light.shadow.camera.layers.enable(31);
  light.shadow.camera.updateProjectionMatrix();

  const dir = new THREE.Vector3();
  engine.add(light);
  engine.add(light.target);
  let on = false;

  const setOn = (v) => {
    on = !!v;
    light.intensity = on ? ON : 0;
    light.shadow.autoUpdate = on;
    if (on) light.shadow.needsUpdate = true;
  };

  engine.onUpdate(() => {
    if (getOccupant()) {
      if (on) setOn(false);
      return;
    }
    if (input.wasPressed('flashlight')) setOn(!on);
  });

  engine.onLateUpdate(() => {
    if (!on) return;
    const cam = engine.camera;
    cam.getWorldDirection(dir);

    const pos = player.enabled ? player.getPosition() : null;
    if (settings.viewMode === 'thirdPerson' && pos) {
      const yaw = player.getFacing();
      light.position.set(
        pos.x + Math.sin(yaw) * HOLD,
        pos.y + CHEST,
        pos.z + Math.cos(yaw) * HOLD
      );
      light.target.position.copy(light.position).addScaledVector(dir, 12);
    } else {
      light.position.copy(cam.position).addScaledVector(dir, 0.28);
      light.target.position.copy(light.position).addScaledVector(dir, 12);
    }
    light.target.updateMatrixWorld();
  });

  return {
    get on() {
      return on;
    },
    setOn,
  };
};
