/**
 * Orange crates the player can shove, carry (F), stow (G), and drop (1–9).
 */

import * as THREE from 'three/webgpu';

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('../graphics/MaterialLibrary.js').createMaterialLibrary>} materials
 * @param {ReturnType<import('./Use.js').createUse>} use
 */
export const createOrangeCrates = (engine, physics, materials, use) => {
  const mat = materials.get('orange');
  let n = 0;

  const spawn = (x, y, z, size = 0.7, mass = 7) => {
    const id = `crate_${n++}`;
    const half = size / 2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    engine.add(mesh);
    physics.addDynamicBox(id, { x, y, z }, [half, half, half], mesh, mass, { buoyancy: 0.9 });

    const entry = {
      id,
      name: 'crate',
      kind: 'crate',
      mesh,
      body: mesh.userData.joltBody,
      mass,
      size,
    };

    let interactable;
    const stow = () => {
      if (use.carry.carried === entry) use.carry.drop(true);
      use.interaction.remove(interactable);
      physics.removeDynamic(id);
      engine.remove(mesh);
      use.inventory.add({
        name: 'crate',
        drop: (pos) => spawn(pos.x, pos.y, pos.z, size, mass),
      });
    };
    entry.stow = stow;

    interactable = use.interaction.add({
      meshes: [mesh],
      maxDistance: 2,
      useAction: 'carry',
      altAction: 'stow',
      getText: (ctx) => (ctx.carrying ? null : 'Carry crate'),
      getAltText: (ctx) => (ctx.carrying ? null : 'Stow crate'),
      interact: () => use.carry.grab(entry),
      altInteract: stow,
    });

    return entry;
  };

  return { spawn };
};
