import { createActionMap } from './ActionMap.js';

/** @typedef {'drag' | 'capture'} LookMode */

/**
 * Keyboard + mouse. Pass `engine` so edge-presses (`wasPressed`) flush after the frame.
 *
 * Look delta: capture without RMB, or LMB drag.
 * Turn delta: RMB held (carry uses this). Wheel is a signed step.
 *
 * @param {HTMLElement} [canvas]
 * @param {import('../engine/Engine.js').Engine} [engine]
 */
export const createInputManager = (canvas = null, engine = null) => {
    const actionMap = createActionMap();
    /** @type {Set<string>} */
    const keysDown = new Set();
    /** @type {Set<string>} */
    const pressedCodes = new Set();
    /** @type {Set<number>} */
    const buttons = new Set();
    const look = { dx: 0, dy: 0 };
    const turn = { dx: 0, dy: 0 };
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pointerLocked = false;
    let wheelDelta = 0;
    /** @type {LookMode} */
    let lookMode = 'drag';

    const applyCursorClasses = () => {
        if (!canvas) return;
        canvas.classList.remove('look-drag', 'look-capture');
        if (lookMode === 'drag') {
            canvas.classList.add('look-drag');
        } else if (pointerLocked) {
            canvas.classList.add('look-capture');
        }
    };

    const requestCapture = () => {
        if (!canvas || lookMode !== 'capture') return;
        const result = canvas.requestPointerLock();
        if (result?.catch) {
            result.catch(() => { });
        }
    };

    const addPointerDelta = (target, e) => {
        if (pointerLocked) {
            target.dx += e.movementX;
            target.dy += e.movementY;
            return;
        }
        target.dx += e.clientX - lastX;
        target.dy += e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
    };

    const onKeyDown = (e) => {
        if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            e.preventDefault();
        }
        if (e.repeat) return;
        pressedCodes.add(e.code);
        keysDown.add(e.code);
    };
    const onKeyUp = (e) => {
        keysDown.delete(e.code);
    };

    const onPointerDown = (e) => {
        buttons.add(e.button);
        lastX = e.clientX;
        lastY = e.clientY;
        if (e.button === 0) {
            if (lookMode === 'capture') {
                requestCapture();
                return;
            }
            dragging = true;
        }
    };

    const onPointerUp = (e) => {
        buttons.delete(e.button);
        if (e.button === 0) dragging = false;
    };

    const onPointerMove = (e) => {
        if (buttons.has(2)) {
            addPointerDelta(turn, e);
            return;
        }
        if (lookMode === 'capture' && pointerLocked) {
            addPointerDelta(look, e);
            return;
        }
        if (lookMode === 'drag' && dragging) addPointerDelta(look, e);
    };

    const onPointerLockChange = () => {
        pointerLocked = document.pointerLockElement === canvas;
        if (!pointerLocked) dragging = false;
        applyCursorClasses();
    };

    const onWheel = (e) => {
        wheelDelta += Math.sign(e.deltaY);
    };

    const reset = () => {
        keysDown.clear();
        pressedCodes.clear();
        buttons.clear();
        dragging = false;
        wheelDelta = 0;
        look.dx = look.dy = turn.dx = turn.dy = 0;
    };
    const onContextMenu = (e) => e.preventDefault();

    window.addEventListener('blur', reset);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('pointerlockchange', onPointerLockChange);

    if (canvas) {
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('contextmenu', onContextMenu);
        applyCursorClasses();
    }

    const isAction = (action) => {
        const codes = actionMap.actions[action];
        if (!codes) return false;
        for (const code of codes) {
            if (keysDown.has(code)) return true;
        }
        return false;
    };

    const wasPressed = (action) => {
        const codes = actionMap.actions[action];
        if (!codes) return false;
        for (const code of codes) {
            if (pressedCodes.has(code)) return true;
        }
        return false;
    };

    const wasCodePressed = (code) => pressedCodes.has(code);

    const consume = (pair) => {
        const dx = pair.dx;
        const dy = pair.dy;
        pair.dx = 0;
        pair.dy = 0;
        return { dx, dy };
    };

    const getMove = () => ({
        x: (isAction('moveRight') ? 1 : 0) - (isAction('moveLeft') ? 1 : 0),
        z: (isAction('moveBack') ? 1 : 0) - (isAction('moveForward') ? 1 : 0),
    });

    const unsubscribe = engine?.onLateUpdate(() => {
        pressedCodes.clear();
        wheelDelta = 0;
    });

    return {
        actionMap,
        isAction,
        wasPressed,
        wasCodePressed,
        isMouseDown: (button) => buttons.has(button),
        getMove,
        consumeWheel() {
            const w = wheelDelta;
            wheelDelta = 0;
            return w;
        },
        get lookMode() {
            return lookMode;
        },
        get dragging() {
            return dragging;
        },
        get pointerLocked() {
            return pointerLocked;
        },
        setLookMode(mode) {
            lookMode = mode === 'capture' ? 'capture' : 'drag';
            dragging = false;
            buttons.clear();
            look.dx = 0;
            look.dy = 0;
            turn.dx = 0;
            turn.dy = 0;
            if (lookMode === 'drag') {
                document.exitPointerLock?.();
            }
            applyCursorClasses();
        },
        releaseCapture() {
            document.exitPointerLock?.();
            dragging = false;
        },
        consumeMouseDelta() {
            return consume(look);
        },
        consumeTurnDelta() {
            return consume(turn);
        },
        dispose() {
            unsubscribe?.();
            reset();
            if (canvas && document.pointerLockElement === canvas) document.exitPointerLock?.();
            canvas?.classList.remove('look-drag', 'look-capture');
            window.removeEventListener('blur', reset);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('wheel', onWheel);
            document.removeEventListener('pointerlockchange', onPointerLockChange);
            canvas?.removeEventListener('pointerdown', onPointerDown);
            canvas?.removeEventListener('contextmenu', onContextMenu);
        },
    };
};
