import * as THREE from 'three/webgpu';
import { createEngine } from '../../../src/engine/Engine.js';
import { createInputManager } from '../../../src/input/InputManager.js';
import { createPhysicsWorld } from '../../../src/physics/PhysicsWorld.js';
import { createEnvironment } from '../../../src/graphics/Environment.js';
import { createMaterialLibrary } from '../../../src/graphics/MaterialLibrary.js';
import { applyWorldUVs } from '../../../src/graphics/WorldUVs.js';
import { createCharacterModel } from '../../../src/player/CharacterModel.js';
import { createPlayer } from '../../../src/player/Player.js';

/** @param {HTMLCanvasElement} canvas */
export const createTemplateGame = async (canvas) => {
  const settings = {
    alwaysRun: false,
    invertMouse: false,
    viewMode: 'thirdPerson',
    lookMode: 'drag',
    fov: 75,
    mouseSensitivity: 0.003,
    thirdPersonDistance: 3,
    thirdPersonHeight: 0.5,
  };

  const engine = await createEngine(canvas);
  const input = createInputManager(canvas, engine);
  input.setLookMode(settings.lookMode);
  const physics = await createPhysicsWorld(engine);
  const environment = createEnvironment(engine);
  const materials = createMaterialLibrary();
  const character = createCharacterModel();

  environment.load('default-sunny');

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(24, 0.4, 24),
    materials.get('grass')
  );
  ground.position.y = -0.2;
  applyWorldUVs(ground.geometry, 1, { x: 0, y: -0.2, z: 0 });
  ground.receiveShadow = true;
  engine.add(ground);
  physics.addStaticBox('ground', { x: 0, y: -0.2, z: 0 }, [12, 0.2, 12]);

  const player = createPlayer(engine, physics, input, settings, character);

  const resize = () => engine.resize(canvas.clientWidth, canvas.clientHeight);
  resize();
  window.addEventListener('resize', resize);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyV') player.toggleViewMode();
  });

  // Game-specific logic here:
  // engine.onUpdate((dt) => { ... });

  await engine.start();

  return { engine, player, settings };
};
