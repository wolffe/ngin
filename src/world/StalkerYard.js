/**
 * Abandoned Pripyat-style yard: panelki, school, warehouse, offices, booths.
 */

import * as THREE from 'three/webgpu';
import { applyWorldUVs } from '../graphics/WorldUVs.js';

const UNIT = 1;

const hash = (x, y, z) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return s - Math.floor(s);
};

const pick = (materials, name, x, y, z) => {
    const pack = materials.pack(name);
    if (!pack?.length) return materials.get(name);
    return pack[(hash(x, y, z) * pack.length) | 0];
};

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('../graphics/MaterialLibrary.js').createMaterialLibrary>} materials
 * @param {{ x?: number, z?: number }} [opts]
 */
export const createStalkerYard = (engine, physics, materials, opts = {}) => {
    const ox = opts.x ?? 48;
    const oz = opts.z ?? -70;
    const cube = new THREE.BoxGeometry(UNIT, UNIT, UNIT);
    const dummy = new THREE.Object3D();
    /** @type {Map<THREE.Material, number[][]>} */
    const buckets = new Map();
    let nPhys = 0;

    const add = (wx, wy, wz, name) => {
        const mat = pick(materials, name, wx, wy, wz);
        let list = buckets.get(mat);
        if (!list) {
            list = [];
            buckets.set(mat, list);
        }
        list.push([wx, wy + UNIT / 2, wz]);
    };

    const fill = (x0, z0, x1, z1, y, name) => {
        for (let x = x0; x <= x1; x++) {
            for (let z = z0; z <= z1; z++) add(ox + x, y, oz + z, name);
        }
    };

    const skin = (x, y, z, h, kind) => {
        if (kind === 'warehouse') {
            if (y === 0) return 'concrete';
            if (y >= h - 1) return hash(x, y, z) > 0.55 ? 'rustyMetal' : 'corrugated';
            return hash(x, y * 2, z) > 0.78 ? 'rustyMetal' : 'corrugated';
        }
        if (kind === 'booth') return y >= h - 1 ? 'metal' : y < 1 ? 'concrete' : 'paintedMetal';
        if (kind === 'office') {
            if (y < 1) return 'brick';
            if (y >= h - 1) return 'plaster';
            if (hash(x, y, z) > 0.88) return 'brick';
            return 'plaster';
        }
        if (y < 2) return hash(x, y, z) > 0.55 ? 'brick' : 'plaster';
        if (kind === 'stripe' && y >= 2 && y <= 3) return 'brick';
        if (y === h - 1) return 'plaster';
        if (hash(x * 2.1, y + z, z) > 0.9) return 'brick';
        if (hash(x, y * 3, z) > 0.82) return 'plaster';
        return 'concrete';
    };

    const shell = (x0, z0, x1, z1, h, skip, kind) => {
        for (let y = 0; y < h; y++) {
            for (let x = x0; x <= x1; x++) {
                for (let z = z0; z <= z1; z++) {
                    const edge = x === x0 || x === x1 || z === z0 || z === z1;
                    if (!edge) continue;
                    if (skip?.(x, y, z)) continue;
                    add(ox + x, y, oz + z, skin(x, y, z, h, kind));
                }
            }
        }
    };

    const windows = (x0, z0, x1, z1, y0, y1, every = 3) => (x, y, z) => {
        if (y < y0 || y > y1) return false;
        if (y % 3 !== 1) return false;
        const face = z === z0 || z === z1;
        const side = x === x0 || x === x1;
        if (face && x > x0 && x < x1 && (x - x0) % every === 1) return true;
        if (side && z > z0 && z < z1 && (z - z0) % every === 1 && y >= y0) return true;
        return false;
    };

    const lotW = 42;
    const lotD = 46;
    const lot = new THREE.Mesh(new THREE.BoxGeometry(lotW, 0.14, lotD), pick(materials, 'asphalt', ox, 0, oz));
    applyWorldUVs(lot.geometry, 1, { x: ox + lotW / 2, y: 0.07, z: oz + lotD / 2 });
    lot.position.set(ox + lotW / 2 - 0.5, 0.07, oz + lotD / 2 - 0.5);
    lot.receiveShadow = true;
    engine.add(lot);
    physics.addStaticBox(
        'stalker_lot',
        { x: ox + lotW / 2 - 0.5, y: 0.07, z: oz + lotD / 2 - 0.5 },
        [lotW / 2, 0.07, lotD / 2]
    );

    const aW = 14;
    const aD = 8;
    const aH = 16;
    const arch = (x, y) => x >= 5 && x <= 8 && y <= 3;
    const aWin = windows(0, 0, aW - 1, aD - 1, 4, aH - 3);
    shell(0, 0, aW - 1, aD - 1, aH, (x, y, z) => arch(x, y) || aWin(x, y, z));
    fill(0, 0, aW - 1, aD - 1, 0, 'concrete');
    fill(0, 0, aW - 1, aD - 1, aH - 1, 'plaster');
    for (let y = 4; y < aH - 2; y += 3) {
        for (let x = 2; x < aW - 1; x += 4) {
            add(ox + x, y, oz - 1, 'concrete');
            add(ox + x + 1, y, oz - 1, 'concrete');
            add(ox + x, y + 1, oz - 1, 'paintedMetal');
            add(ox + x + 1, y + 1, oz - 1, 'paintedMetal');
        }
    }

    const cX0 = 21;
    const cZ0 = 0;
    const cX1 = 32;
    const cZ1 = 7;
    const cH = 12;
    const cWin = windows(cX0, cZ0, cX1, cZ1, 4, cH - 2);
    shell(cX0, cZ0, cX1, cZ1, cH, cWin, 'stripe');
    fill(cX0, cZ0, cX1, cZ1, 0, 'concrete');
    fill(cX0, cZ0, cX1, cZ1, cH - 1, 'plaster');

    const bX0 = 0;
    const bZ0 = 36;
    const bX1 = 13;
    const bZ1 = 43;
    const bH = 14;
    const bWin = windows(bX0, bZ0, bX1, bZ1, 3, bH - 2);
    shell(bX0, bZ0, bX1, bZ1, bH, bWin);
    fill(bX0, bZ0, bX1, bZ1, 0, 'concrete');
    fill(bX0, bZ0, bX1, bZ1, bH - 1, 'plaster');
    for (let y = 3; y < bH - 2; y += 3) {
        for (let x = bX0 + 3; x < bX1; x += 5) {
            add(ox + x, y, oz + bZ1 + 1, 'concrete');
            add(ox + x, y + 1, oz + bZ1 + 1, 'paintedMetal');
        }
    }

    const sX0 = 21;
    const sZ0 = 16;
    const sX1 = 40;
    const sZ1 = 22;
    const sH = 7;
    const sWin = windows(sX0, sZ0, sX1, sZ1, 2, sH - 2);
    const sDoor = (x, y, z) => z === sZ0 && y >= 1 && y <= 2 && x >= 29 && x <= 32;
    shell(sX0, sZ0, sX1, sZ1, sH, (x, y, z) => sWin(x, y, z) || sDoor(x, y, z));
    fill(sX0, sZ0, sX1, sZ1, 0, 'concrete');
    fill(sX0, sZ0, sX1, sZ1, sH - 1, 'plaster');

    const wX0 = 34;
    const wZ0 = 16;
    const wX1 = 40;
    const wZ1 = 34;
    const wWin = windows(wX0, wZ0, wX1, wZ1, 2, sH - 2);
    shell(wX0, wZ0, wX1, wZ1, sH, wWin);
    fill(wX0, wZ0, wX1, wZ1, 0, 'concrete');
    fill(wX0, wZ0, wX1, wZ1, sH - 1, 'plaster');

    const hX0 = 0;
    const hZ0 = 22;
    const hX1 = 16;
    const hZ1 = 32;
    const hH = 5;
    const hangar = (x, y, z) =>
        z === hZ0 && y >= 1 && y <= 3 && ((x >= 2 && x <= 6) || (x >= 10 && x <= 14));
    shell(hX0, hZ0, hX1, hZ1, hH, hangar, 'warehouse');
    fill(hX0, hZ0, hX1, hZ1, 0, 'asphalt');
    fill(hX0, hZ0, hX1, hZ1, hH - 1, 'corrugated');
    fill(hX0, hZ0, hX1, hZ1, hH, 'rustyMetal');

    const oX0 = 22;
    const oZ0 = 36;
    const oX1 = 35;
    const oZ1 = 44;
    const oH = 5;
    const ribbon = (x, y, z) => {
        if (y < 2 || y > 3) return false;
        const face = z === oZ0 || z === oZ1;
        const side = x === oX0 || x === oX1;
        if (face && x > oX0 && x < oX1 && (x - oX0) % 4 !== 0) return true;
        if (side && z > oZ0 && z < oZ1 && (z - oZ0) % 3 !== 0) return true;
        return false;
    };
    const oDoor = (x, y, z) => z === oZ0 && y >= 1 && y <= 2 && x >= 27 && x <= 30;
    shell(oX0, oZ0, oX1, oZ1, oH, (x, y, z) => ribbon(x, y, z) || oDoor(x, y, z), 'office');
    fill(oX0, oZ0, oX1, oZ1, 0, 'brick');
    fill(oX0, oZ0, oX1, oZ1, oH - 1, 'plaster');
    for (let x = oX0 + 2; x <= oX1 - 2; x++) add(ox + x, oH, oz + oZ0, 'rustyMetal');
    for (let s = 0; s < 3; s++) {
        add(ox + 28, 0, oz + oZ0 - 1 - s, 'concrete');
        add(ox + 29, 0, oz + oZ0 - 1 - s, 'concrete');
    }

    const booth = (x0, z0) => {
        shell(
            x0,
            z0,
            x0 + 3,
            z0 + 3,
            4,
            (x, y, z) => z === z0 && y >= 1 && y <= 2 && x >= x0 + 1 && x <= x0 + 2,
            'booth'
        );
        fill(x0, z0, x0 + 3, z0 + 3, 0, 'concrete');
        fill(x0, z0, x0 + 3, z0 + 3, 3, 'metal');
    };
    booth(16, 10);
    booth(16, 28);
    booth(36, 10);

    for (let x = 16; x <= 18; x++) {
        add(ox + x, 0, oz + 8, 'concrete');
        add(ox + x, 1, oz + 8, 'paintedMetal');
        add(ox + x, 0, oz + 9, 'concrete');
    }

    for (let i = 0; i < lotD - 1; i++) {
        if (i > 8 && i < 14) continue;
        add(ox - 1, 0, oz + i, 'rustyMetal');
        add(ox - 1, 1, oz + i, 'corrugated');
    }
    for (let i = 0; i < lotW - 1; i++) {
        if (i >= 5 && i <= 8) continue;
        if (i >= 15 && i <= 19) continue;
        add(ox + i, 0, oz - 1, 'metal');
        add(ox + i, 1, oz - 1, 'rustyMetal');
    }

    for (const [x, z] of [
        [10, 12],
        [18, 18],
        [24, 12],
        [28, 26],
        [10, 18],
        [32, 30],
    ]) {
        add(ox + x, 0, oz + z, 'concrete');
        add(ox + x + 1, 0, oz + z, 'concrete');
        if (hash(x, 1, z) > 0.4) add(ox + x, 0, oz + z + 1, 'brick');
    }

    for (let i = 0; i < 14; i++) {
        const x = 18 + ((hash(i, 2, 9) * 16) | 0);
        const z = 12 + ((hash(i, 4, 3) * 20) | 0);
        add(ox + x, 0, oz + z, hash(i, 0, 1) > 0.5 ? 'dirt' : 'grass');
    }

    buckets.forEach((positions, mat) => {
        const mesh = new THREE.InstancedMesh(cube, mat, positions.length);
        let n = 0;
        for (const p of positions) {
            dummy.position.set(p[0], p[1], p[2]);
            dummy.updateMatrix();
            mesh.setMatrixAt(n++, dummy.matrix);
            physics.addStaticBox(`stalker_${nPhys++}`, { x: p[0], y: p[1], z: p[2] }, [UNIT / 2, UNIT / 2, UNIT / 2]);
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        engine.add(mesh);
    });

    return { x: ox, z: oz, lotW, lotD };
};
