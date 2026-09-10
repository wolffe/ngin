import GUI from 'lil-gui';
import Stats from 'three/addons/libs/stats.module.js';
import * as THREE from 'three/webgpu';
import { createEngine } from '../../../src/engine/Engine.js';
import { createInputManager } from '../../../src/input/InputManager.js';
import { createPhysicsWorld } from '../../../src/physics/PhysicsWorld.js';
import { createPushables } from '../../../src/physics/Pushables.js';
import { createWalkWedge } from '../../../src/physics/Wedge.js';
import { createEnvironment } from '../../../src/graphics/Environment.js';
import { createMaterialLibrary, loadPainterlyMaterial } from '../../../src/graphics/MaterialLibrary.js';
import { createWeather } from '../../../src/graphics/Weather.js';
import { createAO } from '../../../src/graphics/AO.js';
import { createAssetManager } from '../../../src/assets/AssetManager.js';
import { placeGltf } from '../../../src/assets/placeGltf.js';
import { createCharacterModel } from '../../../src/player/CharacterModel.js';
import { createPlayer } from '../../../src/player/Player.js';
import { createFlashlight } from '../../../src/player/Flashlight.js';
import { createUse } from '../../../src/player/Use.js';
import { createOrangeCrates } from '../../../src/player/Crates.js';
import { createVehicle } from '../../../src/vehicle/Vehicle.js';
import { createBoat } from '../../../src/vehicle/Boat.js';
import { createPoolInGround } from '../../../src/world/Pool.js';
import { createFirePit } from '../../../src/world/FirePit.js';
import { createFountain } from '../../../src/world/Fountain.js';
import { createTrampoline } from '../../../src/world/Trampoline.js';
import { createFan } from '../../../src/world/Fan.js';
import { createVoxelHill } from '../../../src/world/VoxelHill.js';
import { applyWorldUVs } from '../../../src/graphics/WorldUVs.js';

const DPR_KEY = 'ngin.pixelRatio';
const DPR_STEPS = [0.85, 1, 1.25, 1.5, 2];

const readDpr = () => {
    const n = Number(localStorage.getItem(DPR_KEY));
    return DPR_STEPS.includes(n) ? n : 1;
};

/** @param {HTMLCanvasElement} canvas @param {{ onBoot?: (label: string, pct: number) => void }} [opts] */
export const createSandbox = async (canvas, opts = {}) => {
    const boot = (label, pct) => opts.onBoot?.(label, pct);

    const settings = {
        alwaysRun: false,
        invertMouse: false,
        viewMode: 'firstPerson',
        lookMode: 'drag',
        fov: 75,
        mouseSensitivity: 0.003,
        thirdPersonDistance: 3,
        thirdPersonHeight: 0.5,
        dayNight: false,
        timeOfDay: 0.42,
        rain: false,
        snow: false,
        ao: false,
        pixelRatio: readDpr(),
    };

    boot('Starting engine…', 8);
    const engine = await createEngine(canvas, { renderer: { pixelRatio: settings.pixelRatio } });
    const input = createInputManager(canvas, engine);
    input.setLookMode(settings.lookMode);

    boot('Loading physics…', 18);
    const physics = await createPhysicsWorld(engine);
    const environment = createEnvironment(engine);
    const materials = createMaterialLibrary();
    const assets = createAssetManager();
    const weather = createWeather(engine);
    const ao = createAO(engine);

    const character = createCharacterModel();

    boot('Building world…', 28);
    environment.load('default-overcast');

    const pool = createPoolInGround(engine, physics, materials, {
        groundSize: 128,
        cx: 28,
        cz: 34,
        innerW: 36,
        innerL: 22,
        depth: 1.4,
    });

    createVoxelHill(engine, physics, { originX: -58, originZ: 42 });

    boot('Loading textures…', 40);
    const painterlyTextures = ['Worn Crate.png', 'Mossy Wooden Planks.png', 'CobbleStoneGreyBrown.png', 'PlasterMossy.png'];
    const painterlyMaterials = await Promise.all(
        painterlyTextures.map(filename => loadPainterlyMaterial(assets, filename))
    );
    const boxes = [
        [5, 1, 5], [-6, 1, 4], [3, 1, -7], [-4, 1.5, -5], [0, 0.75, 10],
        [18, 1, -12], [-20, 1.2, 22], [22, 0.8, 8],
    ];
    boxes.forEach(([x, h, z], i) => {
        const geo = new THREE.BoxGeometry(2, h * 2, 2);
        applyWorldUVs(geo, 2, { x, y: h, z });
        const mesh = new THREE.Mesh(geo, painterlyMaterials[i % painterlyMaterials.length]);
        mesh.position.set(x, h, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        engine.add(mesh);
        physics.addStaticBox(`box_${i}`, { x, y: h, z }, [1, h, 1], mesh);
    });

    const rampMat = materials.get('teal');
    const placeRamp = (id, x, y, z, halfExtents, rotX) => {
        const [hx, hy, hz] = halfExtents;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), rampMat);
        mesh.position.set(x, y, z);
        mesh.rotation.x = rotX;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        engine.add(mesh);
        physics.addStaticBox(id, { x, y, z }, halfExtents, mesh, { x: rotX, y: 0, z: 0 });
    };

    placeRamp('ramp_low', -15, 0.8, -18, [3, 0.25, 6], -0.22);
    placeRamp('ramp_mid', 16, 1.4, 8, [3.5, 0.25, 8], -0.32);
    placeRamp('ramp_steep', 28, 2.2, -8, [2.5, 0.25, 7], -0.45);

    createWalkWedge(engine, physics, materials.get('teal'), {
        id: 'walk_wedge',
        x: -28,
        z: -26,
        width: 10,
        length: 16,
        height: 4,
    });

    boot('Loading models…', 52);
    const buildingGltf = await assets.loadGltf('./assets/models/low_poly_building.glb');
    placeGltf(engine, physics, buildingGltf, {
        id: 'building',
        x: 24,
        z: -24,
        targetHeight: 12,
        body: 'static-mesh',
        batchStatic: true,
    });

    boot('Spawning player…', 62);
    const player = createPlayer(engine, physics, input, settings, character);
    const flashlight = createFlashlight(engine, input, player, settings);
    const use = createUse(engine, physics, input, player, {
        prompt: document.getElementById('prompt'),
        inventory: document.getElementById('inventory'),
    });

    createPushables(engine, physics, materials);

    const crates = createOrangeCrates(engine, physics, materials, use);
    crates.spawn(1.3, 0.4, 2.1, 0.7, 7);
    crates.spawn(2.4, 0.4, 1.5, 0.6, 6);
    crates.spawn(1.2, 0.4, 3.3, 0.8, 9);
    crates.spawn(2.6, 0.45, 3.2, 0.55, 5);

    const vehicleSpawn = { interaction: use.interaction };
    boot('Spawning vehicles…', 72);
    const rides = [
        createVehicle(engine, physics, materials, player, input, { kind: 'car', x: 0, y: 1.15, z: -12, ...vehicleSpawn }),
        createVehicle(engine, physics, materials, player, input, { kind: 'truck', x: 9, y: 1.5, z: -12, ...vehicleSpawn }),
        createVehicle(engine, physics, materials, player, input, { kind: 'bus', x: -10, y: 1.6, z: -12, ...vehicleSpawn }),
        createVehicle(engine, physics, materials, player, input, { kind: 'kenworth', x: -20, y: 1.7, z: -12, ...vehicleSpawn }),
        createBoat(engine, physics, materials, player, input, {
            kind: 'fishing',
            id: 'pool_fishing',
            x: pool.cx - 12,
            y: pool.waterSurfaceY + 0.25,
            z: pool.cz,
            interaction: use.interaction,
        }),
        createBoat(engine, physics, materials, player, input, {
            kind: 'speedboat',
            id: 'pool_speedboat',
            x: pool.cx + 10,
            y: pool.waterSurfaceY + 0.22,
            z: pool.cz - 4,
            interaction: use.interaction,
        }),
    ];

    const beachMat = new THREE.MeshStandardNodeMaterial({
        color: 0xe23b3b,
        roughness: 0.45,
        metalness: 0.05,
        fog: true,
    });
    const beach = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), beachMat);
    beach.position.set(pool.cx + 2.4, pool.waterSurfaceY + 0.5, pool.cz + 1.6);
    beach.castShadow = true;
    beach.receiveShadow = true;
    engine.add(beach);
    physics.addDynamicSphere(
        'beach_ball',
        { x: pool.cx + 2.4, y: pool.waterSurfaceY + 0.5, z: pool.cz + 1.6 },
        0.5,
        beach,
        2.5,
        { buoyancy: 2.6, linearDamping: 0.5, angularDamping: 0.4 }
    );

    createFirePit(engine, physics, materials, { x: 6, z: 18 });
    createFountain(engine, materials, {
        x: pool.cx,
        y: 0,
        z: pool.cz - pool.innerL / 2 - 1.6,
    });
    createTrampoline(engine, physics, materials, { x: -12, z: 8 });
    createFan(engine, physics, materials, { id: 'fan_up', x: 4, z: 16 });
    createFan(engine, physics, materials, {
        id: 'fan_side',
        x: 9,
        y: 0.7,
        z: 16,
        direction: { x: 1, y: 0, z: 0 },
        reach: 7,
        acceleration: 28,
    });

    const resize = () => {
        engine.resize(canvas.clientWidth, canvas.clientHeight);
    };
    resize();
    window.addEventListener('resize', resize);

    boot('Warming GPU…', 84);
    flashlight.setOn(true);
    for (const ride of rides) ride.warmLights?.(true);
    character.setVisible(true);
    weather.setRain(true);
    weather.setSnow(true);
    const culling = new Map();
    engine.scene.traverse((object) => {
        if (!object.isMesh) return;
        culling.set(object, object.frustumCulled);
        object.frustumCulled = false;
    });
    engine.scene.updateMatrixWorld(true);
    engine.camera.updateMatrixWorld(true);
    try {
        await ao.warm(label => boot(label, 86));
    } finally {
        for (const [object, culled] of culling) object.frustumCulled = culled;
        character.setVisible(settings.viewMode === 'thirdPerson');
        weather.setRain(settings.rain);
        weather.setSnow(settings.snow);
    }

    const gui = new GUI({ title: 'Sandbox' });
    gui.domElement.style.visibility = 'hidden';
    gui.add(settings, 'alwaysRun').name('Always Run');
    gui.add(settings, 'invertMouse').name('Invert Mouse');

    const camera = gui.addFolder('Camera');
    const viewCtrl = camera
        .add(settings, 'viewMode', ['firstPerson', 'thirdPerson'])
        .name('view')
        .onChange((v) => player.setViewMode(v));
    camera
        .add(settings, 'lookMode', ['drag', 'capture'])
        .name('mouse look')
        .onChange((v) => {
            settings.lookMode = v;
            input.setLookMode(v);
            updateHint();
        });
    camera.add(settings, 'fov', 50, 110, 1);
    camera.add(settings, 'mouseSensitivity', 0.0005, 0.008, 0.0001);
    camera
        .add(settings, 'pixelRatio', DPR_STEPS)
        .name('pixel ratio')
        .onChange((v) => {
            const n = Number(v);
            settings.pixelRatio = n;
            localStorage.setItem(DPR_KEY, String(n));
            engine.setPixelRatio(n);
        });

    const sky = gui.addFolder('Sky');
    sky.add(settings, 'dayNight').name('day/night cycle').onChange((v) => {
        environment.setCycle(v);
    });
    sky.add(settings, 'timeOfDay', 0, 1, 0.01).name('time of day').onChange((v) => {
        environment.setTimeOfDay(v);
    });

    const wx = gui.addFolder('Weather');
    wx.add(settings, 'rain').name('rain').onChange((v) => weather.setRain(v));
    wx.add(settings, 'snow').name('snow').onChange((v) => weather.setSnow(v));

    gui.add(settings, 'ao').name('ambient occlusion').onChange((v) => ao.setEnabled(v));

    const hint = document.getElementById('hint');
    const updateHint = () => {
        const look =
            settings.lookMode === 'capture'
                ? 'click canvas to capture mouse · Esc to release'
                : 'drag to look';
        if (hint) {
            hint.textContent = `WASD move · Shift run · C crouch · Space jump · E enter/exit · F carry · G stow · L flashlight / vehicle lights · scroll zoom (third person) or hold distance · RMB while holding · V view · ${look}`;
        }
    };
    updateHint();

    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyV') {
            player.toggleViewMode();
            viewCtrl.updateDisplay();
        }
    });

    const stats = new Stats();
    stats.showPanel(0);
    stats.dom.style.position = 'fixed';
    stats.dom.style.top = '0';
    stats.dom.style.left = '0';
    stats.dom.style.visibility = 'hidden';
    document.body.appendChild(stats.dom);
    engine.onUpdate(() => stats.update());

    boot('Compiling shaders…', 92);
    ao.setEnabled(true);
    player.setViewMode('thirdPerson');
    weather.setRain(true);
    weather.setSnow(true);
    await engine.start();

    await new Promise((resolve) => {
        let left = 16;
        const tick = engine.onUpdate(() => {
            boot('Compiling shaders…', 92 + Math.min(7, ((16 - left) / 16) * 7));
            if (--left === 8) {
                player.setViewMode('firstPerson');
                weather.setRain(settings.rain);
                weather.setSnow(settings.snow);
                ao.setEnabled(settings.ao);
                flashlight.setOn(false);
                for (const ride of rides) ride.warmLights?.(false);
            }
            if (left > 0) return;
            tick();
            resolve();
        });
    });

    gui.domElement.style.visibility = '';
    stats.dom.style.visibility = '';
    boot('Ready', 100);

    return { engine, player, settings, gui };
};
