import * as THREE from 'three/webgpu';
import { fog as tslFog, rangeFogFactor, uniform } from 'three/tsl';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { SunLightNode } from 'three/addons/lights/SunLightNode.js';
import { skyboxTexture } from './ProceduralTextures.js';

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
    let skybox = null;
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

    const apply = (presetName) => {
        const preset = environmentPresets[presetName] ?? environmentPresets['default-overcast'];
        skybox = preset.skybox ? (skybox ?? skyboxTexture({ size: 64 })) : null;
        engine.scene.background = preset.skybox ? skybox : new THREE.Color(preset.background);
        engine.scene.backgroundBlurriness = 0;
        engine.scene.backgroundIntensity = 1;

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
        const night = 1 - day;

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

        if (night > 0.4) {
            engine.scene.background = new THREE.Color(lerpHex(0x1c3a6e, 0x8eb4d4, day));
        } else if (skybox) {
            engine.scene.background = skybox;
        } else {
            engine.scene.background = new THREE.Color(lerpHex(0x1c3a6e, 0x8eb4d4, day));
        }
    };

    engine.onUpdate((dt) => {
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
            return skybox;
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
