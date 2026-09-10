import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInventory } from '../src/player/Inventory.js';

test('invalid slot indexes cannot remove an item', () => {
    const inventory = createInventory(null);
    const item = { name: 'Crate', drop() { } };
    inventory.add(item);
    for (const index of [NaN, undefined, null, '0', 0.5, -1, 1]) {
        assert.equal(inventory.take(index), null);
    }
    assert.equal(inventory.items.length, 1);
    assert.equal(inventory.take(0), item);
    assert.equal(inventory.items.length, 0);
});

test('digit input drops the selected slot at the hold point', () => {
    const inventory = createInventory(null);
    const position = { x: 1, y: 2, z: 3 };
    let dropped;
    inventory.add({ name: 'Crate', drop(value) { dropped = value; } });
    inventory.pollDrop({ wasCodePressed: (code) => code === 'Digit1' }, { getHoldPoint: () => position });
    assert.equal(dropped, position);
    assert.equal(inventory.items.length, 0);
});