/**
 * Headlights (white, forward) and taillights (red, rear) parented to a chassis.
 * L toggles headlights while seated. Brake brightens reds even with headlights off.
 * Do not toggle `castShadow` at runtime.
 */

import * as THREE from 'three/webgpu';

const HEAD_COLOR = 0xfff4d6;
const TAIL_COLOR = 0xff1a12;
const HEAD_ON = 24;
const HEAD_RANGE = 44;
const HEAD_ANGLE = 0.4;
const HEAD_PENUMBRA = 0.38;
const TAIL_RUN = 2.2;
const TAIL_BRAKE = 7.5;
const TAIL_RANGE = 7;

const makeLampMat = (albedo, emit) => {
    const mat = new THREE.MeshStandardNodeMaterial({
        color: albedo,
        emissive: emit,
        emissiveIntensity: 0,
        roughness: 0.15,
        metalness: 0.35,
        fog: true,
    });
    return mat;
};

/**
 * @param {import('three').Object3D} root
 * @param {ReturnType<import('../graphics/MaterialLibrary.js').createMaterialLibrary>} materials
 */
export const attachLamps = (root, materials) => {
    const headShared = materials.get('headlight');
    const tailShared = materials.get('taillight');
    const headLamp = makeLampMat(0xffffcc, HEAD_COLOR);
    const tailLamp = makeLampMat(0xff2200, TAIL_COLOR);
    const heads = [];
    const tails = [];

    const fixtures = [];
    root.traverse((obj) => {
        if (!obj.isMesh) return;
        if (obj.material === headShared) fixtures.push(['head', obj]);
        else if (obj.material === tailShared) fixtures.push(['tail', obj]);
    });

    for (const [kind, obj] of fixtures) {
        if (kind === 'head') {
            obj.material = headLamp;
            const light = new THREE.SpotLight(HEAD_COLOR, 0, HEAD_RANGE, HEAD_ANGLE, HEAD_PENUMBRA, 1.2);
            light.castShadow = false;
            light.position.copy(obj.position);
            const target = new THREE.Object3D();
            target.position.set(obj.position.x, obj.position.y - 0.55, obj.position.z + 18);
            root.add(light);
            root.add(target);
            light.target = target;
            heads.push(light);
        } else {
            obj.material = tailLamp;
            const light = new THREE.PointLight(TAIL_COLOR, 0, TAIL_RANGE, 1.8);
            light.position.copy(obj.position);
            root.add(light);
            tails.push(light);
        }
    }

    let on = false;
    let braking = false;

    const apply = () => {
        const headI = on ? HEAD_ON : 0;
        let tailI = 0;
        let tailGlow = 0;
        if (braking) {
            tailI = TAIL_BRAKE;
            tailGlow = 8;
        } else if (on) {
            tailI = TAIL_RUN;
            tailGlow = 2.4;
        }
        for (const light of heads) light.intensity = headI;
        for (const light of tails) light.intensity = tailI;
        headLamp.emissiveIntensity = on ? 5 : 0;
        tailLamp.emissiveIntensity = tailGlow;
    };

    const setOn = (v) => {
        on = !!v;
        apply();
    };

    return {
        get on() {
            return on;
        },
        setOn,
        toggle() {
            setOn(!on);
        },
        setBrake(v) {
            braking = !!v;
            apply();
        },
        /** Force lamp pipelines on for a boot warm-up frame. */
        warm(on = true) {
            if (on) {
                setOn(true);
                braking = true;
                apply();
            } else {
                braking = false;
                setOn(false);
                apply();
            }
        },
    };
};
