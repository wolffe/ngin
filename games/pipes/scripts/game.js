import * as THREE from 'three/webgpu';
import { createEngine } from '../../../src/engine/Engine.js';
import { createInputManager } from '../../../src/input/InputManager.js';
import { createPhysicsWorld } from '../../../src/physics/PhysicsWorld.js';
import { createEnvironment } from '../../../src/graphics/Environment.js';
import { createCharacterModel } from '../../../src/player/CharacterModel.js';
import { createPlayer } from '../../../src/player/Player.js';

const PIPE_R = 0.42;
const SEG_LEN = 2.4;
const GROW_SPEED = 4.8;
const COLORS = [0xc45c6a, 0x3d6bb3, 0x4a9a6a, 0xc9a24a, 0x8a6bb8, 0x3aa8a0];
const DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const Y_UP = new THREE.Vector3(0, 1, 0);
const origin = { x: 0, y: 2.2, z: 0 };
const spawn = { x: SEG_LEN * 0.5, z: 0 };

/** @param {HTMLCanvasElement} canvas */
export const createPipesGame = async (canvas) => {
  const settings = {
    alwaysRun: false,
    invertMouse: false,
    viewMode: 'thirdPerson',
    lookMode: 'drag',
    fov: 72,
    mouseSensitivity: 0.003,
    thirdPersonDistance: 5.5,
    thirdPersonHeight: 0.8,
  };

  const engine = await createEngine(canvas);
  const input = createInputManager(canvas, engine);
  input.setLookMode(settings.lookMode);
  const physics = await createPhysicsWorld(engine);
  const environment = createEnvironment(engine);
  const character = createCharacterModel();

  environment.load('industrial');
  engine.scene.background = new THREE.Color(0x050508);

  const matCache = new Map();
  const pipeMat = (hex) => {
    if (matCache.has(hex)) return matCache.get(hex);
    const m = new THREE.MeshStandardNodeMaterial({
      color: hex,
      roughness: 0.16,
      metalness: 0.38,
      fog: true,
    });
    matCache.set(hex, m);
    return m;
  };

  const root = new THREE.Group();
  engine.add(root);

  const occupied = new Set();
  const cellKey = (x, y, z) => `${Math.round(x / SEG_LEN)},${Math.round(y / SEG_LEN)},${Math.round(z / SEG_LEN)}`;

  let segId = 0;
  const addCollider = (from, to) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const mid = { x: (from.x + to.x) * 0.5, y: (from.y + to.y) * 0.5, z: (from.z + to.z) * 0.5 };
    const hx = Math.max(PIPE_R, Math.abs(dx) * 0.5 + PIPE_R * 0.35);
    const hy = Math.max(PIPE_R, Math.abs(dy) * 0.5 + PIPE_R * 0.35);
    const hz = Math.max(PIPE_R, Math.abs(dz) * 0.5 + PIPE_R * 0.35);
    physics.addStaticBox(`pipe_${segId++}`, mid, [hx, hy, hz]);
    physics.addStaticBox(`pipe_j_${segId}`, to, [PIPE_R * 1.05, PIPE_R * 1.05, PIPE_R * 1.05]);
    occupied.add(cellKey(to.x, to.y, to.z));
  };

  const addElbow = (pos, color) => {
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(PIPE_R * 1.05, 12, 10), pipeMat(color));
    elbow.position.set(pos.x, pos.y, pos.z);
    elbow.castShadow = elbow.receiveShadow = true;
    root.add(elbow);
  };

  const orientCylinder = (mesh, dx, dy, dz) => {
    const len = Math.hypot(dx, dy, dz) || 1;
    mesh.quaternion.setFromUnitVectors(Y_UP, new THREE.Vector3(dx / len, dy / len, dz / len));
  };

  const addFinished = (from, to, color) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(PIPE_R, PIPE_R, len, 12, 1), pipeMat(color));
    cyl.position.set((from.x + to.x) * 0.5, (from.y + to.y) * 0.5, (from.z + to.z) * 0.5);
    orientCylinder(cyl, dx, dy, dz);
    cyl.castShadow = cyl.receiveShadow = true;
    root.add(cyl);
    addElbow(to, color);
    addCollider(from, to);
  };

  const startGrow = (from, dir, color) => {
    const d = DIRS[dir];
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(PIPE_R, PIPE_R, 1, 12, 1), pipeMat(color));
    orientCylinder(mesh, d[0], d[1], d[2]);
    mesh.scale.set(1, 0.001, 1);
    mesh.position.set(from.x, from.y, from.z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return { from: { ...from }, dir, color, grown: 0, mesh };
  };

  const pickDir = (head) => {
    const opposite = head.dir ^ 1;
    const candidates = [];
    for (let i = 0; i < DIRS.length; i++) {
      if (i === opposite) continue;
      const d = DIRS[i];
      const nx = head.x + d[0] * SEG_LEN;
      const ny = head.y + d[1] * SEG_LEN;
      const nz = head.z + d[2] * SEG_LEN;
      if (ny < 0.8 || ny > 14) continue;
      if (Math.hypot(nx, nz) > 28) continue;
      if (occupied.has(cellKey(nx, ny, nz))) continue;
      candidates.push(i);
    }
    if (!candidates.length) return null;
    if (candidates.includes(head.dir) && Math.random() < 0.55) return head.dir;
    return candidates[(Math.random() * candidates.length) | 0];
  };

  occupied.add(cellKey(origin.x, origin.y, origin.z));
  occupied.add(cellKey(spawn.x, origin.y, spawn.z));
  occupied.add(cellKey(spawn.x, origin.y + SEG_LEN, spawn.z));
  addElbow(origin, COLORS[0]);
  addFinished(origin, { x: -SEG_LEN, y: origin.y, z: 0 }, COLORS[0]);
  addFinished(origin, { x: SEG_LEN, y: origin.y, z: 0 }, COLORS[0]);

  let colorIdx = 1;
  /** @type {{ from: {x:number,y:number,z:number}, dir: number, color: number, grown: number, mesh: THREE.Mesh }[]} */
  const growing = [
    startGrow({ x: SEG_LEN, y: origin.y, z: 0 }, 0, COLORS[0]),
    startGrow(origin, 4, COLORS[1]),
    startGrow({ x: -SEG_LEN, y: origin.y, z: 0 }, 1, COLORS[2]),
  ];
  colorIdx = 3;

  physics.addStaticBox('void_floor', { x: 0, y: -40, z: 0 }, [80, 0.5, 80]);

  const player = createPlayer(engine, physics, input, settings, character);
  const spawnY = origin.y + PIPE_R + 0.1 + physics.halfHeight();
  physics.setCharacterPosition(spawn.x, spawnY, spawn.z);

  const completeGrow = (g, index) => {
    const d = DIRS[g.dir];
    const to = {
      x: g.from.x + d[0] * SEG_LEN,
      y: g.from.y + d[1] * SEG_LEN,
      z: g.from.z + d[2] * SEG_LEN,
    };
    g.mesh.scale.set(1, SEG_LEN, 1);
    g.mesh.position.set((g.from.x + to.x) * 0.5, (g.from.y + to.y) * 0.5, (g.from.z + to.z) * 0.5);
    addElbow(to, g.color);
    addCollider(g.from, to);
    const next = pickDir({ ...to, dir: g.dir, color: g.color });
    if (next != null) {
      growing[index] = startGrow(to, next, g.color);
      if (Math.random() < 0.12 && growing.length < 8) {
        const branch = pickDir({ ...to, dir: next, color: g.color });
        if (branch != null && branch !== next) {
          growing.push(startGrow(to, branch, COLORS[colorIdx++ % COLORS.length]));
        }
      }
      return;
    }
    growing.splice(index, 1);
    if (growing.length < 2) {
      const color = COLORS[colorIdx++ % COLORS.length];
      const dir = pickDir({ ...origin, dir: 0, color }) ?? 0;
      growing.push(startGrow(origin, dir, color));
    }
  };

  const resize = () => engine.resize(canvas.clientWidth, canvas.clientHeight);
  resize();
  window.addEventListener('resize', resize);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyV') player.toggleViewMode();
  });

  engine.onUpdate((dt) => {
    for (let i = growing.length - 1; i >= 0; i--) {
      const g = growing[i];
      g.grown = Math.min(SEG_LEN, g.grown + GROW_SPEED * dt);
      const len = Math.max(0.001, g.grown);
      const d = DIRS[g.dir];
      g.mesh.scale.set(1, len, 1);
      g.mesh.position.set(
        g.from.x + d[0] * len * 0.5,
        g.from.y + d[1] * len * 0.5,
        g.from.z + d[2] * len * 0.5,
      );
      if (g.grown >= SEG_LEN) completeGrow(g, i);
    }

    const pos = physics.getCharacterPosition();
    if (pos && pos.y < -6) {
      physics.setCharacterPosition(spawn.x, spawnY, spawn.z);
    }
  });

  await engine.start();

  return { engine, player, settings };
};
