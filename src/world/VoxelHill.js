/**
 * Minecraft-style hill: instanced grass / dirt / stone cubes, cutout grass
 * tufts, one static collision column per cell.
 */

import * as THREE from 'three/webgpu';
import { createMappedMaterial } from '../graphics/MaterialLibrary.js';
import { applyGrassBlockUVs, grassTuftTexture } from '../graphics/ProceduralTextures.js';
import { createBlockTextures } from '../graphics/BlockTextures.js';

const UNIT = 1;
const COLS = 20;
const ROWS = 18;

const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
};

const fillInstances = (mesh, positions) => {
    const dummy = new THREE.Object3D();
    dummy.scale.setScalar(UNIT);
    for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        dummy.position.set(p[0], p[1], p[2]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
};

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {{ originX?: number, originZ?: number, grassMaterial?: THREE.Material, materials?: ReturnType<import('../graphics/MaterialLibrary.js').createMaterialLibrary> }} [opts]
 */
export const createVoxelHill = (engine, physics, opts = {}) => {
    const originX = opts.originX ?? -52;
    const originZ = opts.originZ ?? 36;

    const heights = new Uint8Array(COLS * ROWS);
    for (let iz = 0; iz < ROWS; iz++) {
        for (let ix = 0; ix < COLS; ix++) {
            const tx = ix / (COLS - 1);
            const tz = iz / (ROWS - 1);
            const mound = Math.max(0, 1 - Math.hypot(tx, 1 - tz));
            const n = (hash(ix, iz) - 0.5) * 2.2;
            heights[iz * COLS + ix] = Math.max(1, Math.min(12, Math.round(1 + mound * 10 + n)));
        }
    }

    const hAt = (ix, iz) =>
        ix < 0 || iz < 0 || ix >= COLS || iz >= ROWS ? 0 : heights[iz * COLS + ix];

    const cellX = (ix) => originX + ix * UNIT;
    const cellZ = (iz) => originZ + iz * UNIT;

    const grassPos = [];
    const dirtPos = [];
    const stonePos = [];
    const tuftPos = [];

    for (let iz = 0; iz < ROWS; iz++) {
        for (let ix = 0; ix < COLS; ix++) {
            const h = hAt(ix, iz);
            const nMin = Math.min(hAt(ix - 1, iz), hAt(ix + 1, iz), hAt(ix, iz - 1), hAt(ix, iz + 1));
            const drop = h - nMin;
            const x = cellX(ix);
            const z = cellZ(iz);

            physics.addStaticBox(
                `hill_${ix}_${iz}`,
                { x, y: (h * UNIT) / 2, z },
                [UNIT / 2, (h * UNIT) / 2, UNIT / 2]
            );

            for (let y = 0; y < h; y++) {
                const enclosed =
                    y > 0 &&
                    y < h - 1 &&
                    hAt(ix - 1, iz) > y &&
                    hAt(ix + 1, iz) > y &&
                    hAt(ix, iz - 1) > y &&
                    hAt(ix, iz + 1) > y;
                if (enclosed) continue;

                const cy = y * UNIT + UNIT / 2;
                let bucket = dirtPos;
                if (y === 0 || (y < h - 2 && hash(ix + y * 3, iz) > 0.62)) bucket = stonePos;
                if (y === h - 1) {
                    bucket = drop >= 3 ? stonePos : drop >= 2 ? dirtPos : grassPos;
                }
                bucket.push([x, cy, z]);
            }

            if (hAt(ix, iz) > 0 && drop < 2 && hash(ix * 4.2, iz * 5.1) > 0.55) {
                tuftPos.push([x, h * UNIT + UNIT * 0.28, z]);
            }
        }
    }

    const cube = new THREE.BoxGeometry(1, 1, 1);
    const grassGeo = cube.clone();
    applyGrassBlockUVs(grassGeo);
    const fromLib = opts.materials;
    const blocks = fromLib ? null : createBlockTextures();
    const grassMats = opts.grassMaterial
        ? [opts.grassMaterial]
        : fromLib
            ? fromLib.pack('grassBlock')
            : blocks.grassBlock.map((map) => createMappedMaterial(map, 0.92));
    const dirtMats = fromLib
        ? fromLib.pack('dirt')
        : blocks.dirt.map((map) => createMappedMaterial(map, 0.94));
    const rockMats = fromLib
        ? fromLib.pack('rock')
        : blocks.rock.map((map) => createMappedMaterial(map, 0.9));

    const place = (positions, geo, mats) => {
        const buckets = mats.map(() => []);
        for (const p of positions) {
            const v = Math.min(mats.length - 1, (hash(p[0] * 1.7, p[2] * 2.3 + p[1]) * mats.length) | 0);
            buckets[v].push(p);
        }
        for (let i = 0; i < mats.length; i++) {
            if (!buckets[i].length) continue;
            const mesh = new THREE.InstancedMesh(geo, mats[i], buckets[i].length);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            fillInstances(mesh, buckets[i]);
            engine.add(mesh);
        }
    };

    place(grassPos, grassGeo, grassMats);
    place(dirtPos, cube, dirtMats);
    place(stonePos, cube, rockMats);

    if (tuftPos.length) {
        const tuft = grassTuftTexture();
        const tuftMat = createMappedMaterial(tuft, 0.92, {
            transparent: true,
            alphaTest: 0.35,
            side: THREE.DoubleSide,
        });
        const plane = new THREE.PlaneGeometry(UNIT * 0.85, UNIT * 0.7);
        const tuftMesh = new THREE.InstancedMesh(plane, tuftMat, tuftPos.length * 2);
        const dummy = new THREE.Object3D();
        let n = 0;
        for (const [x, y, z] of tuftPos) {
            dummy.position.set(x, y, z);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            tuftMesh.setMatrixAt(n++, dummy.matrix);
            dummy.rotation.y = Math.PI / 2;
            dummy.updateMatrix();
            tuftMesh.setMatrixAt(n++, dummy.matrix);
        }
        tuftMesh.instanceMatrix.needsUpdate = true;
        tuftMesh.computeBoundingSphere();
        engine.add(tuftMesh);
    }

    return { originX, originZ, cols: COLS, rows: ROWS, unit: UNIT };
};
