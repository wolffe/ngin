export const defaultActions = () => ({
  moveForward: ['KeyW', 'ArrowUp'],
  moveBack: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE'],
  carry: ['KeyF'],
  stow: ['KeyG'],
  crouch: ['KeyC'],
  flashlight: ['KeyL'],
});

/** @param {Record<string, string[]>} [custom] */
export const createActionMap = (custom = {}) => {
  const actions = { ...defaultActions(), ...custom };
  /** @type {Map<string, Set<string>>} */
  const codeToAction = new Map();

  for (const [action, codes] of Object.entries(actions)) {
    for (const code of codes) {
      if (!codeToAction.has(code)) codeToAction.set(code, new Set());
      codeToAction.get(code).add(action);
    }
  }

  return { actions, codeToAction };
};

/** @param {string} code @param {ReturnType<typeof createActionMap>} map */
export const codeToActions = (code, map) => map.codeToAction.get(code) ?? new Set();

/** @param {string} code */
export const codeLabel = (code) => {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Shift')) return 'Shift';
  return code;
};

/** @param {string} action @param {ReturnType<typeof createActionMap>} map */
export const actionLabel = (action, map) => {
  const code = map.actions[action]?.[0];
  return code ? codeLabel(code) : '?';
};
