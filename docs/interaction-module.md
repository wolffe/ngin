# Interaction, carry, inventory

Look-at prompts, physical carry, and a pocket inventory. Keys are actions in `ActionMap.js`, not hardcoded in each object.

Creator handbook (prompts, not APIs): [index.html](./index.html)

A camera-center ray picks what you look at. Range is the distance from the **player** to the hit point (so third-person orbit does not inflate reach). The ray itself is long enough for a third-person camera; player-to-hit is still the gate. Scroll zooms that camera when you are not carrying.

Cars and boats share `bindSeat` in `Occupancy.js`: a transparent enter volume on the hull/chassis, look-at E, same-frame skip so enter does not immediately exit.

## Boot

After `createPlayer`:

```js
const use = createUse(engine, physics, input, player, {
  prompt: document.getElementById('prompt'),
  inventory: document.getElementById('inventory'),
});
```

Needs `#prompt` and `#inventory` in the page. Pass `engine` into `createInputManager(canvas, engine)` so `wasPressed` flushes at end of frame.

## Keys

| Key | Action |
|-----|--------|
| E | Enter / exit vehicle or boat (look at it) |
| F | Carry the looked-at crate, or drop if already carrying |
| G | Stow into inventory (from look or while carrying) |
| Scroll | Hold distance while carrying |
| RMB drag | Rotate the held item (camera-relative) |
| 1–9 | Drop that inventory slot at the hold point |

## Modules

| Module | Path | Role |
|--------|------|------|
| Occupancy | `src/player/Occupancy.js` | One global seat; `bindSeat` for cars + boats |
| Interaction | `src/player/Interaction.js` | Camera-center ray → prompt + press |
| Carry | `src/player/Carry.js` | Velocity servo toward `player.getHoldPoint(dist)` |
| Inventory | `src/player/Inventory.js` | Stow / respawn |
| Use | `src/player/Use.js` | Wires the three + HUD |
| Crates | `src/player/Crates.js` | Orange pushable / carryable boxes |

## Interaction

```js
use.interaction.add({
  meshes: [mesh],
  maxDistance: 2,
  useAction: 'carry',      // F (default is 'interact' / E)
  altAction: 'stow',
  getText: (ctx) => ctx.carrying ? null : 'Carry crate',
  getAltText: (ctx) => ctx.carrying ? null : 'Stow crate',
  interact: () => use.carry.grab(entry),
  altInteract: () => entry.stow(),
});
```

Prompt key labels come from `actionLabel` / the action map. Vehicles pass `interaction: use.interaction` in their spawn options so E is look-at.

## Carry

Carry is **opt-in**, not a flag on the rigid body. `addDynamicBox` / `addDynamicSphere` only makes something shoveable. To pick it up, register a look-at action whose `interact` calls `use.carry.grab(entry)` with that body's `entry`. No `is_carryable` bit is scanned on physics objects. Sandbox crates do this; pushable cubes and marbles do not.

The body stays **dynamic**. Each physics pre-step, linear velocity is set toward the hold point (gain 14, max 9 m/s). Yank farther than `holdDist + 1.2` and it drops. Entering a seat drops the item.

The walking capsule ignores that body (`physics.setCarriedBody`) so looking down does not shove the player.

- First person: hold point is eye + look direction × `holdDist`
- Third person: hold point is in front of the character × `holdDist`
- Scroll changes `holdDist` (about 0.6–2.5 m)
- RMB drag tumbles a stored quaternion (camera up / camera right)
- Grab copies the body's current rotation so it does not snap

## Inventory

Stow removes the Jolt body and mesh. Each item has `drop(pos)` which respawns it (crates call `spawn` again and re-register the prompt).

## Input

`input.wasPressed('carry')` is true for one frame. `consumeMouseDelta` is look only; `consumeTurnDelta` is RMB. `createInputManager` must receive `engine` so presses clear in `onLateUpdate`.
