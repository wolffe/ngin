import * as THREE from 'three/webgpu';

const STUD = 0.3;
const LIMB_SWING = 0.85;
const LIMB_CYCLE = 1.55;

const SHIRT = 0xc45c2a;
const SKIN = 0xe8c4a0;
const PANTS = 0x2f4f7a;

const TORSO = { w: 2 * STUD, h: 2 * STUD, d: STUD };
const LIMB_W = STUD;
const LIMB_D = STUD;
const THIGH_H = STUD;
const SHIN_H = STUD;
const HEAD = 1.25 * STUD;

const HIP_Y = THIGH_H + SHIN_H;
const SHOULDER_Y = HIP_Y + TORSO.h;
const MODEL_HEIGHT = SHOULDER_Y + HEAD;

/** @param {number} hex */
const flatMat = (hex) => {
    const mat = new THREE.MeshStandardNodeMaterial({
        color: hex,
        flatShading: true,
        roughness: 1,
        metalness: 0,
        fog: true,
    });
    return mat;
};

const lerpAngle = (current, target, t) => {
    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return current + delta * t;
};

const createR6 = () => {
    const group = new THREE.Group();
    const pantsMat = flatMat(PANTS);
    const skinMat = flatMat(SKIN);

    /** @type {Array<{ name: string, joint: THREE.Group, restY: number }>} */
    const uppers = [];

    const addUpper = (name, w, h, d, mat, jx, jy, offsetY) => {
        const joint = new THREE.Group();
        joint.position.set(jx, jy, 0);
        group.add(joint);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.y = offsetY;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        joint.add(mesh);
        const part = { name, joint, restY: jy };
        uppers.push(part);
        return part;
    };

    const addLeg = (x) => {
        const hip = new THREE.Group();
        hip.position.set(x, HIP_Y, 0);
        group.add(hip);

        const thigh = new THREE.Mesh(new THREE.BoxGeometry(LIMB_W, THIGH_H, LIMB_D), pantsMat);
        thigh.position.y = -THIGH_H / 2;
        thigh.castShadow = true;
        thigh.receiveShadow = true;
        hip.add(thigh);

        const knee = new THREE.Group();
        knee.position.y = -THIGH_H;
        hip.add(knee);

        const shin = new THREE.Mesh(new THREE.BoxGeometry(LIMB_W, SHIN_H, LIMB_D), pantsMat);
        shin.position.y = -SHIN_H / 2;
        shin.castShadow = true;
        shin.receiveShadow = true;
        knee.add(shin);

        return { hip, knee };
    };

    const torso = addUpper('torso', TORSO.w, TORSO.h, TORSO.d, flatMat(SHIRT), 0, SHOULDER_Y, -TORSO.h / 2);
    const head = addUpper('head', HEAD, HEAD, HEAD, skinMat, 0, SHOULDER_Y, HEAD / 2);
    const armL = addUpper(
        'armL',
        LIMB_W,
        THIGH_H + SHIN_H,
        LIMB_D,
        skinMat,
        -(TORSO.w + LIMB_W) / 2,
        SHOULDER_Y,
        -(THIGH_H + SHIN_H) / 2
    );
    const armR = addUpper(
        'armR',
        LIMB_W,
        THIGH_H + SHIN_H,
        LIMB_D,
        skinMat,
        (TORSO.w + LIMB_W) / 2,
        SHOULDER_Y,
        -(THIGH_H + SHIN_H) / 2
    );
    const legL = addLeg(-LIMB_W / 2);
    const legR = addLeg(LIMB_W / 2);

    const arms = [
        { part: armL, sign: 1 },
        { part: armR, sign: -1 },
    ];
    const legs = [
        { ...legL, sign: -1 },
        { ...legR, sign: 1 },
    ];

    let phase = 0;
    let amp = 0;
    let lift = 0;
    let crouchT = 0;

    const animate = (dt, speed, grounded, runSpeed) => {
        const ease = 1 - Math.exp(-14 * dt);
        amp += ((grounded ? Math.min(1, speed / runSpeed) * LIMB_SWING : 0) - amp) * ease;
        lift += ((grounded ? 0 : -1.1) - lift) * ease;
        phase += speed * LIMB_CYCLE * dt;

        const thighA = -crouchT * 0.62;
        const kneeA = crouchT * 1.15;
        const plantedY = THIGH_H * Math.cos(thighA) + SHIN_H * Math.cos(thighA + kneeA);
        const drop = HIP_Y - plantedY;
        const swing = Math.sin(phase) * amp * (1 - crouchT * 0.3);

        for (const part of uppers) {
            part.joint.position.y = part.restY - drop;
        }
        torso.joint.rotation.x = crouchT * 0.14;

        for (const { part, sign } of arms) {
            part.joint.rotation.x = lift + crouchT * 0.18 + swing * sign;
        }

        for (const { hip, knee, sign } of legs) {
            hip.position.y = plantedY;
            hip.rotation.x = thighA + swing * sign;
            knee.rotation.x = kneeA + Math.max(0, -swing * sign) * 0.45;
        }

        head.joint.rotation.x = lerpAngle(head.joint.rotation.x, 0, 0.2);
        head.joint.rotation.y = lerpAngle(head.joint.rotation.y, 0, 0.2);
    };

    return {
        group,
        head,
        setCrouch(t) {
            crouchT = t;
        },
        animate,
        height: MODEL_HEIGHT,
    };
};

export const createCharacterModel = () => {
    const r6 = createR6();

    return {
        root: r6.group,
        modelHeight: r6.height,
        anchorHeight: r6.height * 0.45,
        setVisible(visible) {
            r6.group.visible = visible;
        },
        setTransform(worldFeetY, x, z, rotationY, crouchT = 0) {
            r6.group.position.set(x, worldFeetY, z);
            r6.group.rotation.y = rotationY;
            r6.setCrouch(crouchT);
        },
        /**
         * @param {number} dt
         * @param {{ speed: number, grounded: boolean, runSpeed?: number }} state
         */
        update(dt, state) {
            r6.animate(dt, state.speed, state.grounded, state.runSpeed ?? 7);
        },
    };
};
