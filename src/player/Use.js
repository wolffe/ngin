/**
 * Wires look-at prompts, carry, and inventory into one per-frame action pass.
 *
 * E — vehicle / boat (registered as interactables)
 * F — carry / drop
 * G — stow into inventory
 * 1–9 — drop that inventory slot in front of you
 * Scroll — hold distance while carrying; otherwise third-person zoom
 * RMB drag — rotate the held item
 */

import { createInteraction } from './Interaction.js';
import { createCarry } from './Carry.js';
import { createInventory } from './Inventory.js';
import { getOccupant } from './Occupancy.js';
import { actionLabel } from '../input/ActionMap.js';

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('../input/InputManager.js').createInputManager>} input
 * @param {ReturnType<import('./Player.js').createPlayer>} player
 * @param {{ prompt: HTMLElement, inventory: HTMLElement }} els
 */
export const createUse = (engine, physics, input, player, els) => {
    const interaction = createInteraction(engine.camera, els.prompt);
    const carry = createCarry(physics, player);
    const inventory = createInventory(els.inventory);

    engine.onUpdate(() => {
        const turn = input.consumeTurnDelta();
        const wheel = input.consumeWheel();

        if (!player.enabled || getOccupant()) {
            if (carry.carried) carry.drop(true);
            if (wheel) player.zoomOrbit(wheel);
            els.prompt.hidden = true;
            return;
        }

        if (carry.carried) {
            if (wheel) carry.setDistance(wheel);
            if (turn.dx || turn.dy) carry.tumble(turn.dx, turn.dy, engine.camera);
            if (input.wasPressed('carry')) carry.drop();
            else if (input.wasPressed('stow')) {
                const entry = carry.drop(true);
                if (entry?.stow) entry.stow();
            }
            const f = actionLabel('carry', input.actionMap);
            const g = actionLabel('stow', input.actionMap);
            els.prompt.innerHTML = `<b>${f}</b> Drop · <b>${g}</b> Stow · scroll distance · RMB rotate`;
            els.prompt.hidden = false;
            return;
        }

        if (wheel) player.zoomOrbit(wheel);

        interaction.update(input, {
            carry,
            inventory,
            carrying: false,
            origin: player.getPosition() ?? engine.camera.position,
        });
        inventory.pollDrop(input, player);
    });

    return { interaction, carry, inventory };
};
