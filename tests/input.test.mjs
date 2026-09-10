import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInputManager } from '../src/input/InputManager.js';

const dispatch = (target, type, properties = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, properties);
    target.dispatchEvent(event);
    return event;
};

const setup = () => {
    globalThis.window = new EventTarget();
    globalThis.document = new EventTarget();
    const canvas = new EventTarget();
    canvas.classList = { add() { }, remove() { } };
    const hooks = new Set();
    const input = createInputManager(canvas, {
        onLateUpdate(hook) {
            hooks.add(hook);
            return () => hooks.delete(hook);
        },
    });
    return { input, canvas, hooks };
};

test('blur clears held keys, edge presses, pointer buttons and deltas', () => {
    const { input, canvas } = setup();
    dispatch(window, 'keydown', { code: 'KeyW' });
    dispatch(canvas, 'pointerdown', { button: 0, clientX: 1, clientY: 1 });
    dispatch(window, 'pointermove', { clientX: 12, clientY: 8 });
    dispatch(window, 'wheel', { deltaY: 100 });
    assert.equal(input.getMove().z, -1);
    dispatch(window, 'blur');
    assert.deepEqual(input.getMove(), { x: 0, z: 0 });
    assert.equal(input.wasCodePressed('KeyW'), false);
    assert.equal(input.dragging, false);
    assert.equal(input.isMouseDown(0), false);
    assert.equal(input.consumeWheel(), 0);
    assert.deepEqual(input.consumeMouseDelta(), { dx: 0, dy: 0 });
    input.dispose();
});

test('dispose removes canvas listeners and the late-update hook', () => {
    const { input, canvas, hooks } = setup();
    assert.equal(dispatch(canvas, 'contextmenu').defaultPrevented, true);
    assert.equal(hooks.size, 1);
    input.dispose();
    assert.equal(hooks.size, 0);
    assert.equal(dispatch(canvas, 'contextmenu').defaultPrevented, false);
    dispatch(window, 'keydown', { code: 'KeyW' });
    assert.equal(input.getMove().z, 0);
});

test('action polling respects rebound keys and unknown actions', () => {
    const { input } = setup();
    input.actionMap.actions.moveForward = ['KeyI'];
    dispatch(window, 'keydown', { code: 'KeyI' });
    assert.equal(input.getMove().z, -1);
    assert.equal(input.isAction('missing'), false);
    dispatch(window, 'keyup', { code: 'KeyI' });
    assert.equal(input.getMove().z, 0);
    input.dispose();
});