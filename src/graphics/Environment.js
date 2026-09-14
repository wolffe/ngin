import * as THREE from 'three/webgpu';
import { fog as tslFog, rangeFogFactor, uniform } from 'three/tsl';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { SunLightNode } from 'three/addons/lights/SunLightNode.js';
import { skyDomeTexture } from './ProceduralTextures.js';

const environmentPresets = {
    'default-overcast': {
        background: 0x8eb4d4,
        fog: { color: 0xb8cce0, near: 80, far: 260 },
        sun: { color: 0xfff4e0, intensity: 2.2, position: [24, 42, 18] },
        hemisphere: { sky: 0xb8d4f0, ground: 0x4a5c3a, intensity: 0.82 },
        ambient: { color: 0x8899aa, intensity: 0.34 },
        exposure: 1.05,
        skybox: true,
    },
    industrial: {
        background: 0x2a2a30,
        fog: { color: 0x2a2a30, near: 10, far: 80 },
        sun: { color: 0xffeedd, intensity: 1.4, position: [10, 30, 5] },
        hemisphere: { sky: 0x556677, ground: 0x222222, intensity: 0.48 },
        ambient: { color: 0x303040, intensity: 0.28 },
        exposure: 0.95,
    },
    sunny: {
        background: 0x87ceeb,
        fog: { color: 0x87ceeb, near: 50, far: 200 },
        sun: { color: 0xffffff, intensity: 2.8, position: [40, 60, 25] },
        hemisphere: { sky: 0xbbddff, ground: 0x556633, intensity: 0.95 },
        ambient: { color: 0x606080, intensity: 0.32 },
        exposure: 1.15,
        skybox: true,
    },
    dusk: {
        background: 0x6a4a62,
        fog: { color: 0x8a5a62, near: 40, far: 140 },
        sun: { color: 0xff8844, intensity: 1.4, position: [50, 8, 10] },
        hemisphere: { sky: 0xc07060, ground: 0x3a2a28, intensity: 0.58 },
        ambient: { color: 0x4a3040, intensity: 0.3 },
        exposure: 0.9,
    },
    night: {
        background: 0x1c3a6e,
        fog: { color: 0x2a4a7a, near: 40, far: 160 },
        sun: { color: 0xb8c8e8, intensity: 0.65, position: [-16, 36, 12] },
        hemisphere: { sky: 0x4a6aaa, ground: 0x1a2a40, intensity: 0.5 },
        ambient: { color: 0x2a3a58, intensity: 0.22 },
        exposure: 0.85,
    },
};

const SHADOW_FAR = 128;
const IBL_DAY = 1.2;
const IBL_NIGHT = 0.08;

const configureShadows = (sun) => {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = SHADOW_FAR;
    sun.shadow.bias = -0.00004;
    sun.shadow.normalBias = 0.008;
    sun.shadow.radius = 1.25;
    sun.shadow.intensity = 0.62;
    for (let cascade = 0; cascade < sun.shadow.getViewportCount(); cascade++) {
        sun.shadow.getCamera(cascade).layers.set(0);
    }
};

const DOME_RADIUS = 800;
const CLOUD_CELL = 14;
const CLOUD_GRID = 32;
const CLOUD_Y = 76;
const CLOUD_DRIFT = 0.7;

const cellHash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
};

const remapDomeUVs = (geometry) => {
    const uv = geometry.attributes.uv;
    if (!uv) return;
    for (let i = 0; i < uv.count; i++) {
        uv.setY(i, Math.max(0, Math.min(1, (uv.getY(i) - 0.5) * 2)));
    }
    uv.needsUpdate = true;
};

const createSkyDome = () => {
    const geo = new THREE.SphereGeometry(DOME_RADIUS, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    remapDomeUVs(geo);
    const mat = new THREE.MeshBasicNodeMaterial({
        fog: false,
        side: THREE.BackSide,
        depthWrite: false,
    });
    mat.map = skyDomeTexture();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
};

const createCloudField = () => {
    const dummy = new THREE.Object3D();
    const origin = -((CLOUD_GRID * CLOUD_CELL) / 2) + CLOUD_CELL / 2;
    /** @type {number[][]} */
    const cells = [];
    for (let iz = 0; iz < CLOUD_GRID; iz++) {
        for (let ix = 0; ix < CLOUD_GRID; ix++) {
            const blob = cellHash((ix / 3) | 0, ((iz / 3) | 0) + 4);
            const hole = cellHash(ix, iz + 11);
            if (blob < 0.5 || hole < 0.34) continue;
            cells.push([origin + ix * CLOUD_CELL, origin + iz * CLOUD_CELL, hole > 0.82 ? 2 : 1]);
        }
    }
    const geo = new THREE.BoxGeometry(CLOUD_CELL, 3.2, CLOUD_CELL);
    const mat = new THREE.MeshBasicNodeMaterial({ color: 0xd4d8dc, fog: true });
    let count = 0;
    for (const c of cells) count += c[2];
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    let n = 0;
    for (const [x, z, layers] of cells) {
        for (let layer = 0; layer < layers; layer++) {
            dummy.position.set(x, CLOUD_Y + layer * 3.2, z);
            dummy.updateMatrix();
            mesh.setMatrixAt(n++, dummy.matrix);
        }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    return mesh;
};

const lerpHex = (a, b, t) => {
    const ar = (a >> 16) & 255;
    const ag = (a >> 8) & 255;
    const ab = a & 255;
    const br = (b >> 16) & 255;
    const bg = (b >> 8) & 255;
    const bb = b & 255;
    const r = (ar + (br - ar) * t) | 0;
    const g = (ag + (bg - ag) * t) | 0;
    const bl = (ab + (bb - ab) * t) | 0;
    return (r << 16) | (g << 8) | bl;
};

/**
 * @param {import('../engine/Engine.js').Engine} engine
 */
export const createEnvironment = (engine) => {
    engine.renderer.library.addLight(SunLightNode, SunLight);
    /** @type {SunLight | null} */
    let sun = null;
    /** @type {THREE.HemisphereLight | null} */
    let hemi = null;
    /** @type {THREE.AmbientLight | null} */
    let ambient = null;
    let dome = null;
    let clouds = null;
    let skyOn = false;
    let cycleOn = false;
    let timeOfDay = 0.42;
    let cycleSpeed = 0.02;
    let ibl = IBL_DAY;
    /** @type {THREE.MeshStandardNodeMaterial[]} */
    const iblMats = [];
    const fogColorU = uniform(new THREE.Color(0xb8cce0));
    const fogNearU = uniform(80);
    const fogFarU = uniform(260);
    engine.scene.fogNode = tslFog(fogColorU, rangeFogFactor(fogNearU, fogFarU));

    const setIbl = (v) => {
        ibl = v;
        for (const mat of iblMats) mat.envMapIntensity = v;
    };

    const writeFog = (hex, near, far) => {
        if (engine.scene.fog) {
            engine.scene.fog.color.setHex(hex);
            engine.scene.fog.near = near;
            engine.scene.fog.far = far;
        } else {
            engine.scene.fog = new THREE.Fog(hex, near, far);
        }
        fogColorU.value.setHex(hex);
        fogNearU.value = near;
        fogFarU.value = far;
    };

    const setSkyVisible = (on) => {
        skyOn = on;
        if (on) {
            if (!dome) {
                dome = createSkyDome();
                engine.add(dome);
            }
            if (!clouds) {
                clouds = createCloudField();
                engine.add(clouds);
            }
            dome.visible = true;
            clouds.visible = true;
        } else {
            if (dome) dome.visible = false;
            if (clouds) clouds.visible = false;
        }
    };

    const apply = (presetName) => {
        const preset = environmentPresets[presetName] ?? environmentPresets['default-overcast'];
        engine.scene.background = new THREE.Color(preset.background);
        setSkyVisible(!!preset.skybox);

        if (preset.fog) writeFog(preset.fog.color, preset.fog.near, preset.fog.far);
        else engine.scene.fog = null;

        const sunI = preset.sun.intensity;
        setIbl(Math.max(IBL_NIGHT, Math.min(IBL_DAY, (sunI / 2.2) * IBL_DAY)));

        if (sun) {
            engine.scene.remove(sun);
            sun.dispose();
        }
        if (hemi) engine.scene.remove(hemi);
        if (ambient) engine.scene.remove(ambient);

        sun = new SunLight(preset.sun.color, preset.sun.intensity);
        sun.position.set(...preset.sun.position).normalize();
        configureShadows(sun);
        engine.scene.add(sun);

        if (preset.hemisphere) {
            hemi = new THREE.HemisphereLight(
                preset.hemisphere.sky,
                preset.hemisphere.ground,
                preset.hemisphere.intensity
            );
            engine.scene.add(hemi);
        }

        ambient = new THREE.AmbientLight(preset.ambient.color, preset.ambient.intensity);
        engine.scene.add(ambient);

        engine.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        engine.renderer.toneMappingExposure = preset.exposure;
    };

    /**
     * t = 0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk.
     * Mutates the current lights/fog/exposure. Optional — leave cycle off to keep a preset.
     */
    const applyTimeOfDay = (t) => {
        timeOfDay = ((t % 1) + 1) % 1;
        const angle = (timeOfDay - 0.25) * Math.PI * 2;
        const elev = Math.sin(angle);
        const day = Math.max(0, elev);

        if (sun) {
            const up = elev > 0.02;
            sun.position.set(Math.cos(angle), up ? Math.max(0.18, elev) : 0.45, 0.38).normalize();
            sun.intensity = up ? 0.4 + day * 2.4 : 0.65;
            sun.color.setHex(up ? 0xfff4e0 : 0xb8c8e8);
        }
        if (hemi) {
            hemi.intensity = 0.5 + day * 0.32;
            hemi.color.setHex(lerpHex(0x4a6aaa, 0xb8d4f0, day));
            hemi.groundColor.setHex(lerpHex(0x1a2a40, 0x4a5c3a, day));
        }
        if (ambient) {
            ambient.intensity = 0.22 + day * 0.12;
            ambient.color.setHex(lerpHex(0x2a3a58, 0x8899aa, day));
        }

        engine.renderer.toneMappingExposure = 0.85 + day * 0.2;
        writeFog(lerpHex(0x2a4a7a, 0xb8cce0, day), 40 + day * 40, 160 + day * 100);
        setIbl(IBL_NIGHT + day * (IBL_DAY - IBL_NIGHT));
        engine.scene.background = new THREE.Color(lerpHex(0x1c3a6e, 0x8eb4d4, day));
        if (dome) dome.material.color.setHex(lerpHex(0x6a7a9a, 0xffffff, day));
        if (clouds) {
            clouds.visible = skyOn && day > 0.12;
            clouds.material.color.setHex(lerpHex(0x6a7080, 0xd4d8dc, day));
        }
    };

    engine.onUpdate((dt) => {
        if (dome?.visible) dome.position.copy(engine.camera.position);
        if (clouds?.visible) clouds.position.x += dt * CLOUD_DRIFT;
        if (!cycleOn) return;
        timeOfDay = (timeOfDay + dt * cycleSpeed) % 1;
        applyTimeOfDay(timeOfDay);
    });

    return {
        load: apply,
        presets: () => Object.keys(environmentPresets),
        getPreset: (name) => environmentPresets[name],
        get sun() {
            return sun;
        },
        get envMap() {
            return null;
        },
        trackIbl(mat) {
            iblMats.push(mat);
            mat.envMapIntensity = ibl;
        },
        getTimeOfDay: () => timeOfDay,
        setTimeOfDay: applyTimeOfDay,
        setCycle(on) {
            cycleOn = !!on;
            if (cycleOn) applyTimeOfDay(timeOfDay);
        },
        get cycle() {
            return cycleOn;
        },
        setCycleSpeed(v) {
            cycleSpeed = v;
        },
        get cycleSpeed() {
            return cycleSpeed;
        },
    };
};

/** @param {import('../engine/Engine.js').Engine} engine */
export const createLighting = (engine) => ({
    addPointLight: (position, color = 0xffffff, intensity = 1) => {
        const light = new THREE.PointLight(color, intensity, 20);
        light.position.set(...position);
        engine.scene.add(light);
        return light;
    },
});
