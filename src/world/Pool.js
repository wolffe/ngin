/**
 * In-ground pool: four ground slabs around a rectangular hole, concrete basin,
 * water volume + surface. Grass uses world-space UVs so tiles stay square on every face.
 */

import * as THREE from 'three/webgpu';
import { createWaterVolume, createWaterSurface } from '../physics/Water.js';
import { applyWorldUVs } from '../graphics/WorldUVs.js';

/** World metres per 16px grass tile. */
const GRASS_TILE = 1;

const addBox = (engine, physics, id, material, x, y, z, hx, hy, hz, tile = null, visible = true) => {
  const geo = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
  if (tile != null) applyWorldUVs(geo, tile, { x, y, z });
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (visible) engine.add(mesh);
  physics.addStaticBox(id, { x, y, z }, [hx, hy, hz], visible ? mesh : undefined);
  return mesh;
};

const hash2 = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const coverGrass = (engine, materials, groundY, groundHy, half, hole) => {
  const pack = materials.pack('grass');
  if (!pack?.length) return;
  const geo = new THREE.BoxGeometry(1, groundHy * 2, 1);
  const dummy = new THREE.Object3D();
  const buckets = pack.map(() => []);
  const x0 = Math.floor(-half);
  const x1 = Math.ceil(half) - 1;
  const z0 = Math.floor(-half);
  const z1 = Math.ceil(half) - 1;
  for (let ix = x0; ix <= x1; ix++) {
    for (let iz = z0; iz <= z1; iz++) {
      if (ix + 0.5 > hole.x0 && ix + 0.5 < hole.x1 && iz + 0.5 > hole.z0 && iz + 0.5 < hole.z1) continue;
      const v = Math.min(pack.length - 1, (hash2(ix, iz) * pack.length) | 0);
      buckets[v].push([ix + 0.5, groundY, iz + 0.5]);
    }
  }
  buckets.forEach((positions, i) => {
    if (!positions.length) return;
    const mesh = new THREE.InstancedMesh(geo, pack[i], positions.length);
    let n = 0;
    for (const p of positions) {
      dummy.position.set(p[0], p[1], p[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    engine.add(mesh);
  });
};

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('../graphics/MaterialLibrary.js').createMaterialLibrary>} materials
 * @param {{
 *   groundSize?: number, groundY?: number, groundHy?: number,
 *   cx?: number, cz?: number, innerW?: number, innerL?: number,
 *   wall?: number, depth?: number, waterSurfaceY?: number,
 *   grassMaterial?: THREE.Material, grassTile?: number,
 * }} [opts]
 */
export const createPoolInGround = (engine, physics, materials, opts = {}) => {
  const groundSize = opts.groundSize ?? 80;
  const groundY = opts.groundY ?? -0.2;
  const groundHy = opts.groundHy ?? 0.2;
  const half = groundSize / 2;
  const cx = opts.cx ?? 20;
  const cz = opts.cz ?? 24;
  const innerW = opts.innerW ?? 12;
  const innerL = opts.innerL ?? 8;
  const wall = opts.wall ?? 0.45;
  const depth = opts.depth ?? 1.2;
  const waterSurfaceY = opts.waterSurfaceY ?? -0.08;

  const grass = opts.grassMaterial ?? materials.get('grass');
  const grassTile = opts.grassTile ?? GRASS_TILE;

  const holeW = innerW + wall * 2;
  const holeL = innerL + wall * 2;
  const x0 = cx - holeW / 2;
  const x1 = cx + holeW / 2;
  const z0 = cz - holeL / 2;
  const z1 = cz + holeL / 2;

  const gWestX = (-half + x0) / 2;
  const gWestHx = (x0 - -half) / 2;
  addBox(engine, physics, 'ground_west', grass, gWestX, groundY, 0, gWestHx, groundHy, half, grassTile, false);

  const gEastX = (x1 + half) / 2;
  const gEastHx = (half - x1) / 2;
  addBox(engine, physics, 'ground_east', grass, gEastX, groundY, 0, gEastHx, groundHy, half, grassTile, false);

  const gSouthZ = (-half + z0) / 2;
  const gSouthHz = (z0 - -half) / 2;
  addBox(engine, physics, 'ground_south', grass, cx, groundY, gSouthZ, holeW / 2, groundHy, gSouthHz, grassTile, false);

  const gNorthZ = (z1 + half) / 2;
  const gNorthHz = (half - z1) / 2;
  addBox(engine, physics, 'ground_north', grass, cx, groundY, gNorthZ, holeW / 2, groundHy, gNorthHz, grassTile, false);

  coverGrass(engine, materials, groundY, groundHy, half, { x0, x1, z0, z1 });

  const concrete = materials.get('concrete');
  const floorTop = -depth;
  const floorHy = 0.18;
  const floorY = floorTop - floorHy;
  addBox(engine, physics, 'pool_floor', concrete, cx, floorY, cz, innerW / 2, floorHy, innerL / 2);

  const rimY = 0.12;
  const wallBottom = floorY - floorHy;
  const wallHy = (rimY - wallBottom) / 2;
  const wallY = (rimY + wallBottom) / 2;
  const wallZ = innerL / 2 + wall / 2;
  const wallX = innerW / 2 + wall / 2;
  addBox(engine, physics, 'pool_wall_n', concrete, cx, wallY, cz + wallZ, innerW / 2 + wall, wallHy, wall / 2);
  addBox(engine, physics, 'pool_wall_s', concrete, cx, wallY, cz - wallZ, innerW / 2 + wall, wallHy, wall / 2);
  addBox(engine, physics, 'pool_wall_e', concrete, cx + wallX, wallY, cz, wall / 2, wallHy, innerL / 2);
  addBox(engine, physics, 'pool_wall_w', concrete, cx - wallX, wallY, cz, wall / 2, wallHy, innerL / 2);

  const waterPad = 0.08;
  const volume = createWaterVolume(physics, {
    minX: cx - innerW / 2 + waterPad,
    maxX: cx + innerW / 2 - waterPad,
    minZ: cz - innerL / 2 + waterPad,
    maxZ: cz + innerL / 2 - waterPad,
    minY: floorTop,
    maxY: waterSurfaceY + 3,
    surfaceY: waterSurfaceY,
    buoyancy: 1.25,
    linearDrag: 0.55,
    angularDrag: 0.45,
  });

  const surface = createWaterSurface(engine, {
    x: cx,
    z: cz,
    width: innerW + 0.08,
    length: innerL + 0.08,
    y: waterSurfaceY,
  });

  return {
    cx,
    cz,
    innerW,
    innerL,
    waterSurfaceY,
    floorY: floorTop,
    volume,
    surface,
  };
};
