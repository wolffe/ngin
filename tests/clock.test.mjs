import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClock } from '../src/engine/Clock.js';

test('clock exposes its last delta and caps long frames', () => {
    const clock = createClock();
    assert.equal(clock.delta, 0);
    clock.tick(10);
    const frame = clock.tick(10.016);
    assert.equal(clock.delta, frame.delta);
    assert.ok(Math.abs(frame.delta - 0.016) < 1e-9);
    assert.equal(clock.tick(11).delta, 0.1);
    assert.equal(clock.time, clock.elapsed);
});

test('backwards timestamps cannot subtract elapsed time', () => {
    const clock = createClock();
    clock.tick(10);
    const elapsed = clock.elapsed;
    assert.equal(clock.tick(9).delta, 0);
    assert.equal(clock.elapsed, elapsed);
});