/**
 * Look-at actions. A camera-center ray picks the first registered mesh in range.
 */

import * as THREE from 'three/webgpu';
import { actionLabel } from '../input/ActionMap.js';

const DEFAULT_RANGE = 3.0;
const AIM = new THREE.Vector2(0, 0);

/**
 * @param {import('three').Camera} camera
 * @param {HTMLElement} promptEl
 */
export const createInteraction = (camera, promptEl) => {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 48;
  /** @type {import('three').Object3D[]} */
  const targets = [];
  /** @type {object | null} */
  let current = null;

  const resolve = (object) => {
    let o = object;
    while (o) {
      if (o.userData.interactable) return o.userData.interactable;
      o = o.parent;
    }
    return null;
  };

  const show = (interactable, text, altText, input, ctx) => {
    current = interactable;
    const useAction = current.useAction ?? 'interact';
    const altAction = current.altAction ?? 'stow';
    promptEl.innerHTML = [
      text && `<b>${actionLabel(useAction, input.actionMap)}</b> ${text}`,
      altText && `<b>${actionLabel(altAction, input.actionMap)}</b> ${altText}`,
    ]
      .filter(Boolean)
      .join(' · ');
    promptEl.hidden = false;
    if (text && input.wasPressed(useAction)) current.interact(ctx);
    else if (altText && current.altInteract && input.wasPressed(altAction)) {
      current.altInteract(ctx);
    }
    return true;
  };

  return {
    /** @param {object} interactable */
    add(interactable) {
      for (const obj of interactable.meshes) {
        obj.userData.interactable = interactable;
        if (!targets.includes(obj)) targets.push(obj);
      }
      return interactable;
    },

    remove(interactable) {
      for (let i = targets.length - 1; i >= 0; i--) {
        if (targets[i].userData.interactable === interactable) {
          delete targets[i].userData.interactable;
          targets.splice(i, 1);
        }
      }
    },

    /**
     * @param {ReturnType<import('../input/InputManager.js').createInputManager>} input
     * @param {object} ctx
     */
    update(input, ctx) {
      if (!promptEl) return false;
      current = null;

      const origin = ctx.origin ?? camera.position;

      raycaster.setFromCamera(AIM, camera);
      const hits = raycaster.intersectObjects(targets, true);
      for (const hit of hits) {
        const interactable = resolve(hit.object);
        if (!interactable) continue;
        const range = interactable.maxDistance ?? DEFAULT_RANGE;
        const dx = hit.point.x - origin.x;
        const dy = hit.point.y - origin.y;
        const dz = hit.point.z - origin.z;
        if (Math.hypot(dx, dy, dz) > range) continue;
        const text = interactable.getText(ctx);
        const altText = interactable.getAltText?.(ctx) ?? null;
        if (!text && !altText) continue;
        return show(interactable, text, altText, input, ctx);
      }

      promptEl.hidden = true;
      return false;
    },
  };
};
