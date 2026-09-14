/**
 * Jolt wheeled vehicles — enter with E, exit with E.
 *
 * Physics: WheeledVehicleController, 4WD, Jolt automatic transmission.
 * Visuals: chassis synced from body.GetPosition/Rotation each frame via
 *          syncDynamicMeshes; cosmetic roll/pitch added on top from acceleration.
 *
 * Vehicle kinds: car, truck, bus, kenworth (cab + trailer via PointConstraint).
 */

import * as THREE from 'three/webgpu';
import { LAYER_MOVING } from '../physics/PhysicsWorld.js';
import { bindSeat } from '../player/Occupancy.js';
import { createParticleEmitter } from '../graphics/Particles.js';
import { attachLamps } from './Lights.js';
import { loadGlbVehicleModel } from './GlbVehicleModel.js';

const FL = 0, FR = 1, BL = 2, BR = 3;

const rad = (d) => d * Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ─── Shared physics/dynamics ─────────────────────────────────────────────────
const SHARED = {
    comY: -0.45,
    maxPitchRoll: 60,
    antiRollFront: 600,
    antiRollRear: 600,
    suspensionFreq: 1.0,
    suspensionDamp: 0.95,
    angularDamping: 0.5,
    linearDamping: 0.02,
    restitution: 0.2,
    bodyFriction: 0.35,
    rollGain: 0.007,
    maxRoll: 4.2,
    pitchGain: 0.006,
    maxPitch: 2.5,
    dynSmooth: 0.12,
};

// ─── Per-vehicle profiles ─────────────────────────────────────────────────────
const PROFILES = {
    car: {
        ...SHARED,
        halfLength: 2.0, halfWidth: 0.9, halfHeight: 0.2,
        wheelRadius: 0.3, wheelWidth: 0.18,
        wheelOffsetH: 1.4, wheelOffsetV: 0.18,
        suspensionMin: 0.14, suspensionMax: 0.42,
        mass: 1500, torque: 500, clutch: 10,
        brakeTorque: 3200, handBrakeTorque: 14000,
        enterRadius: 3.2, exitSide: 2.4, spawnY: 1.15,
        maxSteer: 32,
    },
    truck: {
        ...SHARED,
        halfLength: 3.4, halfWidth: 1.2, halfHeight: 0.38,
        wheelRadius: 0.45, wheelWidth: 0.28,
        wheelOffsetH: 2.2, wheelOffsetV: 0.22,
        suspensionMin: 0.28, suspensionMax: 0.875,
        mass: 5200, torque: 3800, clutch: 18,
        brakeTorque: 7200, handBrakeTorque: 32000,
        enterRadius: 4.2, exitSide: 2.8, spawnY: 1.45,
        maxSteer: 28,
    },
    bus: {
        ...SHARED,
        halfLength: 4.8, halfWidth: 1.2, halfHeight: 0.35,
        wheelRadius: 0.45, wheelWidth: 0.26,
        wheelOffsetH: 3.4, wheelOffsetV: 0.2,
        suspensionMin: 0.25, suspensionMax: 0.8,
        mass: 9000, torque: 4200, clutch: 22,
        brakeTorque: 9500, handBrakeTorque: 38000,
        enterRadius: 4.8, exitSide: 3.0, spawnY: 1.6,
        maxSteer: 24,
    },
    kenworth: {
        ...SHARED,
        halfLength: 3.2, halfWidth: 1.25, halfHeight: 0.45,
        wheelRadius: 0.5, wheelWidth: 0.3,
        wheelOffsetH: 2.0, wheelOffsetV: 0.24,
        suspensionMin: 0.3, suspensionMax: 0.95,
        mass: 7500, torque: 5500, clutch: 24,
        brakeTorque: 10000, handBrakeTorque: 42000,
        enterRadius: 5.0, exitSide: 3.2, spawnY: 1.7,
        maxSteer: 34,
        angularDamping: 0.3,
        // Trailer spec
        trailer: {
            halfLength: 5.5, halfWidth: 1.3, halfHeight: 0.5,
            wheelRadius: 0.5, wheelWidth: 0.3,
            wheelOffsetH: 3.8, wheelOffsetV: 0.24,
            suspensionMin: 0.3, suspensionMax: 0.95,
            mass: 4000,
            brakeTorque: 6000, handBrakeTorque: 24000,
            antiRollFront: 800, antiRollRear: 800,
        },
    },
};

// ─── Mesh builders ────────────────────────────────────────────────────────────

const addMesh = (parent, geo, mat, px = 0, py = 0, pz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
};

const buildCarMesh = (chassis, spec, mats) => {
    const { halfLength: hL, halfWidth: hW, halfHeight: hH } = spec;

    // Body
    addMesh(chassis, new THREE.BoxGeometry(hW * 2, hH * 2, hL * 2), mats.get('red'));

    // Cabin (windowed)
    addMesh(chassis, new THREE.BoxGeometry(hW * 1.9, 0.65, 1.7), mats.get('darkGrey'), 0, hH + 0.32, -0.35);

    // Windshield front
    addMesh(chassis, new THREE.BoxGeometry(hW * 1.7, 0.5, 0.05), mats.get('glassDark'), 0, hH + 0.35, 0.5);
    // Windshield rear
    addMesh(chassis, new THREE.BoxGeometry(hW * 1.7, 0.45, 0.05), mats.get('glassDark'), 0, hH + 0.32, -1.15);

    // Hood
    addMesh(chassis, new THREE.BoxGeometry(hW * 1.9, 0.08, 0.9), mats.get('red'), 0, hH + 0.04, hL - 0.45);

    // Bumpers
    addMesh(chassis, new THREE.BoxGeometry(hW * 2.05, 0.15, 0.12), mats.get('chrome'), 0, -hH + 0.08, hL + 0.06);
    addMesh(chassis, new THREE.BoxGeometry(hW * 2.05, 0.15, 0.12), mats.get('chrome'), 0, -hH + 0.08, -hL - 0.06);

    // Headlights
    addMesh(chassis, new THREE.BoxGeometry(0.28, 0.14, 0.06), mats.get('headlight'), hW - 0.22, 0.0, hL + 0.03);
    addMesh(chassis, new THREE.BoxGeometry(0.28, 0.14, 0.06), mats.get('headlight'), -hW + 0.22, 0.0, hL + 0.03);

    // Taillights
    addMesh(chassis, new THREE.BoxGeometry(0.24, 0.12, 0.06), mats.get('taillight'), hW - 0.2, 0.0, -hL - 0.03);
    addMesh(chassis, new THREE.BoxGeometry(0.24, 0.12, 0.06), mats.get('taillight'), -hW + 0.2, 0.0, -hL - 0.03);
};

const buildTruckMesh = (chassis, spec, mats) => {
    const { halfLength: hL, halfWidth: hW, halfHeight: hH } = spec;

    // Flatbed body
    addMesh(chassis, new THREE.BoxGeometry(hW * 2, hH * 2, hL * 2), mats.get('blue'));

    // Cargo bed walls
    addMesh(chassis, new THREE.BoxGeometry(hW * 2, 0.5, hL * 1.2), mats.get('blue'), 0, hH + 0.25, -0.55);
    addMesh(chassis, new THREE.BoxGeometry(0.08, 0.5, hL * 1.2), mats.get('blue'), hW - 0.04, hH + 0.63, -0.55);
    addMesh(chassis, new THREE.BoxGeometry(0.08, 0.5, hL * 1.2), mats.get('blue'), -hW + 0.04, hH + 0.63, -0.55);

    // Cabin
    addMesh(chassis, new THREE.BoxGeometry(hW * 2, 1.15, 1.6), mats.get('blue'), 0, hH + 0.55, hL - 0.85);

    // Windshield
    addMesh(chassis, new THREE.BoxGeometry(hW * 1.8, 0.8, 0.06), mats.get('glassDark'), 0, hH + 0.7, hL - 0.02);

    // Bumper
    addMesh(chassis, new THREE.BoxGeometry(hW * 2.1, 0.2, 0.15), mats.get('chrome'), 0, -hH + 0.1, hL + 0.07);

    // Headlights
    addMesh(chassis, new THREE.BoxGeometry(0.32, 0.18, 0.08), mats.get('headlight'), hW - 0.25, 0.0, hL + 0.04);
    addMesh(chassis, new THREE.BoxGeometry(0.32, 0.18, 0.08), mats.get('headlight'), -hW + 0.25, 0.0, hL + 0.04);

    // Taillights
    addMesh(chassis, new THREE.BoxGeometry(0.28, 0.16, 0.08), mats.get('taillight'), hW - 0.22, 0.0, -hL - 0.04);
    addMesh(chassis, new THREE.BoxGeometry(0.28, 0.16, 0.08), mats.get('taillight'), -hW + 0.22, 0.0, -hL - 0.04);
};

const buildBusMesh = (chassis, spec, mats) => {
    const { halfLength: hL, halfWidth: hW, halfHeight: hH } = spec;

    // Main body
    addMesh(chassis, new THREE.BoxGeometry(hW * 2, hH * 2, hL * 2), mats.get('yellow'));

    // Upper body (passenger area)
    addMesh(chassis, new THREE.BoxGeometry(hW * 2, 1.4, hL * 1.9), mats.get('yellow'), 0, hH + 0.7, 0);

    // Roof
    addMesh(chassis, new THREE.BoxGeometry(hW * 1.9, 0.08, hL * 1.85), mats.get('darkGrey'), 0, hH + 1.44, 0);

    // Windows (both sides)
    for (let i = -3; i <= 3; i++) {
        const wz = i * 1.15;
        addMesh(chassis, new THREE.BoxGeometry(0.06, 0.65, 0.8), mats.get('glassDark'), hW + 0.03, hH + 0.75, wz);
        addMesh(chassis, new THREE.BoxGeometry(0.06, 0.65, 0.8), mats.get('glassDark'), -hW - 0.03, hH + 0.75, wz);
    }

    // Windshield
    addMesh(chassis, new THREE.BoxGeometry(hW * 1.8, 1.0, 0.06), mats.get('glassDark'), 0, hH + 0.8, hL + 0.03);
    // Rear window
    addMesh(chassis, new THREE.BoxGeometry(hW * 1.6, 0.7, 0.06), mats.get('glassDark'), 0, hH + 0.85, -hL - 0.03);

    // Bumpers
    addMesh(chassis, new THREE.BoxGeometry(hW * 2.1, 0.22, 0.14), mats.get('chrome'), 0, -hH + 0.1, hL + 0.07);
    addMesh(chassis, new THREE.BoxGeometry(hW * 2.1, 0.22, 0.14), mats.get('chrome'), 0, -hH + 0.1, -hL - 0.07);

    // Headlights
    addMesh(chassis, new THREE.BoxGeometry(0.35, 0.2, 0.08), mats.get('headlight'), hW - 0.25, 0.05, hL + 0.04);
    addMesh(chassis, new THREE.BoxGeometry(0.35, 0.2, 0.08), mats.get('headlight'), -hW + 0.25, 0.05, hL + 0.04);

    // Taillights
    addMesh(chassis, new THREE.BoxGeometry(0.3, 0.2, 0.08), mats.get('taillight'), hW - 0.22, 0.05, -hL - 0.04);
    addMesh(chassis, new THREE.BoxGeometry(0.3, 0.2, 0.08), mats.get('taillight'), -hW + 0.22, 0.05, -hL - 0.04);
};

const buildKenworthMesh = (chassis, spec, mats) => {
    const { halfLength: hL, halfWidth: hW, halfHeight: hH } = spec;

    // Chassis frame
    addMesh(chassis, new THREE.BoxGeometry(hW * 2, hH * 2, hL * 2), mats.get('darkGrey'));

    // Hood — long nose Kenworth style
    addMesh(chassis, new THREE.BoxGeometry(hW * 1.8, 0.55, 2.2), mats.get('red'), 0, hH + 0.28, hL - 1.1);

    // Cabin (sleeper cab — tall and boxy)
    addMesh(chassis, new THREE.BoxGeometry(hW * 2.1, 1.5, 1.8), mats.get('red'), 0, hH + 0.75, -0.3);

    // Cabin roof fairing
    addMesh(chassis, new THREE.BoxGeometry(hW * 2.0, 0.1, 1.6), mats.get('darkGrey'), 0, hH + 1.55, -0.3);

    // Windshield
    addMesh(chassis, new THREE.BoxGeometry(hW * 1.85, 0.95, 0.06), mats.get('glassDark'), 0, hH + 0.95, 0.6);

    // Side windows
    addMesh(chassis, new THREE.BoxGeometry(0.06, 0.6, 0.7), mats.get('glassDark'), hW + 0.08, hH + 1.0, 0.0);
    addMesh(chassis, new THREE.BoxGeometry(0.06, 0.6, 0.7), mats.get('glassDark'), -hW - 0.08, hH + 1.0, 0.0);

    // Front bumper (heavy chrome)
    addMesh(chassis, new THREE.BoxGeometry(hW * 2.2, 0.3, 0.18), mats.get('chrome'), 0, -hH + 0.15, hL + 0.09);

    // Exhaust stacks (both sides)
    addMesh(chassis, new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), mats.get('chrome'), hW + 0.15, hH + 0.9, -0.8);
    addMesh(chassis, new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), mats.get('chrome'), -hW - 0.15, hH + 0.9, -0.8);

    // Headlights
    addMesh(chassis, new THREE.BoxGeometry(0.35, 0.22, 0.08), mats.get('headlight'), hW - 0.28, 0.15, hL + 0.05);
    addMesh(chassis, new THREE.BoxGeometry(0.35, 0.22, 0.08), mats.get('headlight'), -hW + 0.28, 0.15, hL + 0.05);

    // Taillights
    addMesh(chassis, new THREE.BoxGeometry(0.3, 0.18, 0.08), mats.get('taillight'), hW - 0.24, 0.05, -hL - 0.04);
    addMesh(chassis, new THREE.BoxGeometry(0.3, 0.18, 0.08), mats.get('taillight'), -hW + 0.24, 0.05, -hL - 0.04);

    // Fuel tanks (under cab, both sides)
    addMesh(chassis, new THREE.CylinderGeometry(0.18, 0.18, 1.2, 8), mats.get('chrome'), hW + 0.05, -hH - 0.1, -0.6);
    addMesh(chassis, new THREE.CylinderGeometry(0.18, 0.18, 1.2, 8), mats.get('chrome'), -hW - 0.05, -hH - 0.1, -0.6);
};

const buildTrailerMesh = (chassis, tSpec, mats) => {
    const { halfLength: hL, halfWidth: hW, halfHeight: hH } = tSpec;

    // Container body
    addMesh(chassis, new THREE.BoxGeometry(hW * 2, hH * 2, hL * 2), mats.get('white'));

    // Container upper walls (tall box trailer)
    addMesh(chassis, new THREE.BoxGeometry(hW * 2, 2.0, hL * 2), mats.get('white'), 0, hH + 1.0, 0);

    // Roof
    addMesh(chassis, new THREE.BoxGeometry(hW * 1.95, 0.06, hL * 1.95), mats.get('darkGrey'), 0, hH + 2.03, 0);

    // Undercarriage frame
    addMesh(chassis, new THREE.BoxGeometry(0.3, 0.15, hL * 1.6), mats.get('darkGrey'), 0.5, -hH - 0.08, -0.5);
    addMesh(chassis, new THREE.BoxGeometry(0.3, 0.15, hL * 1.6), mats.get('darkGrey'), -0.5, -hH - 0.08, -0.5);

    // Rear bumper
    addMesh(chassis, new THREE.BoxGeometry(hW * 2.1, 0.2, 0.12), mats.get('chrome'), 0, -hH + 0.1, -hL - 0.06);

    // Taillights
    addMesh(chassis, new THREE.BoxGeometry(0.3, 0.2, 0.08), mats.get('taillight'), hW - 0.25, 0.0, -hL - 0.04);
    addMesh(chassis, new THREE.BoxGeometry(0.3, 0.2, 0.08), mats.get('taillight'), -hW + 0.25, 0.0, -hL - 0.04);

    // Mud flaps (rear)
    addMesh(chassis, new THREE.BoxGeometry(0.04, 0.35, 0.02), mats.get('rubber'), hW - 0.15, -hH - 0.18, -hL + 0.2);
    addMesh(chassis, new THREE.BoxGeometry(0.04, 0.35, 0.02), mats.get('rubber'), -hW + 0.15, -hH - 0.18, -hL + 0.2);
};

const MESH_BUILDERS = {
    car: buildCarMesh,
    truck: buildTruckMesh,
    bus: buildBusMesh,
    kenworth: buildKenworthMesh,
};

// ─── Core vehicle factory ─────────────────────────────────────────────────────

const hullBoxes = (kind, spec) => {
    const hW = spec.halfWidth, hH = spec.halfHeight, hL = spec.halfLength;
    if (kind === 'car') return [
        [hW, hH, hL, 0, 0, 0],
        [hW * 0.95, 0.34, 0.85, 0, hH + 0.32, -0.35],
    ];
    if (kind === 'truck') return [
        [hW, hH, hL, 0, 0, 0],
        [hW, 0.25, hL * 0.6, 0, hH + 0.25, -0.55],
        [hW, 0.58, 0.8, 0, hH + 0.55, hL - 0.85],
    ];
    if (kind === 'bus') return [
        [hW, hH, hL, 0, 0, 0],
        [hW, 0.75, hL * 0.95, 0, hH + 0.7, 0],
    ];
    if (kind === 'kenworth') return [
        [hW, hH, hL, 0, 0, 0],
        [hW * 0.9, 0.28, 1.1, 0, hH + 0.28, hL - 1.1],
        [hW * 1.05, 0.75, 0.9, 0, hH + 0.75, -0.3],
    ];
    if (kind === 'trailer') return [
        [hW, hH, hL, 0, 0, 0],
        [hW, 1.03, hL, 0, hH + 1.0, 0],
    ];
    return [[hW, hH, hL, 0, 0, 0]];
};

const buildVehicleBody = (Jolt, bodyInterface, spec, x, y, z, kind = 'car') => {
    const ident = () => Jolt.Quat.prototype.sIdentity();
    const compound = new Jolt.StaticCompoundShapeSettings();
    for (const [hx, hy, hz, px, py, pz] of hullBoxes(kind, spec)) {
        compound.AddShapeShapeSettings(
            new Jolt.Vec3(px, py, pz),
            ident(),
            new Jolt.BoxShapeSettings(new Jolt.Vec3(hx, hy, hz)),
            0,
        );
    }
    const com = new Jolt.Vec3(0, spec.comY, 0);
    const shape = new Jolt.OffsetCenterOfMassShapeSettings(com, compound).Create().Get();
    const creation = new Jolt.BodyCreationSettings(
        shape, new Jolt.RVec3(x, y, z), ident(),
        Jolt.EMotionType_Dynamic, LAYER_MOVING,
    );
    creation.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
    creation.mMassPropertiesOverride.mMass = spec.mass;
    creation.mFriction = spec.bodyFriction ?? 0.35;
    creation.mRestitution = spec.restitution ?? 0.2;
    creation.mLinearDamping = spec.linearDamping ?? 0.02;
    creation.mAngularDamping = spec.angularDamping ?? 0.5;
    const body = bodyInterface.CreateBody(creation);
    Jolt.destroy(creation);
    return body;
};

const buildVehicleConstraint = (Jolt, physicsSystem, body, spec, hasEngine = true, wheelLocals = null) => {
    const settings = new Jolt.VehicleConstraintSettings();
    settings.mMaxPitchRollAngle = rad(spec.maxPitchRoll ?? 60);
    settings.mWheels.clear();

    const maxSteer = rad(spec.maxSteer ?? 30);
    const wR = spec.wheelRadius, wW = spec.wheelWidth;
    const hW = spec.halfWidth, oH = spec.wheelOffsetH, oV = spec.wheelOffsetV;

    const addWheel = (px, py, pz, steer, hbTorque) => {
        const w = new Jolt.WheelSettingsWV();
        w.mPosition = new Jolt.Vec3(px, py, pz);
        w.mMaxSteerAngle = steer;
        w.mMaxBrakeTorque = spec.brakeTorque;
        w.mMaxHandBrakeTorque = hbTorque;
        w.mRadius = wR;
        w.mWidth = wW;
        w.mSuspensionMinLength = spec.suspensionMin;
        w.mSuspensionMaxLength = spec.suspensionMax;
        w.mSuspensionSpring.mFrequency = spec.suspensionFreq ?? 1.0;
        w.mSuspensionSpring.mDamping = spec.suspensionDamp ?? 0.95;
        settings.mWheels.push_back(w);
    };

    const hb = spec.handBrakeTorque;
    if (wheelLocals?.length === 4) {
        const steers = [maxSteer, maxSteer, 0, 0];
        for (let i = 0; i < 4; i++) {
            const p = wheelLocals[i];
            addWheel(p.x, p.y, p.z, steers[i], hb);
        }
    } else {
        addWheel(hW, -oV, oH, maxSteer, hb);
        addWheel(-hW, -oV, oH, maxSteer, hb);
        addWheel(hW, -oV, -oH, 0, hb);
        addWheel(-hW, -oV, -oH, 0, hb);
    }

    const ctrlSettings = new Jolt.WheeledVehicleControllerSettings();
    if (hasEngine) {
        ctrlSettings.mEngine.mMaxTorque = spec.torque;
        ctrlSettings.mTransmission.mClutchStrength = spec.clutch ?? 10;
    } else {
        ctrlSettings.mEngine.mMaxTorque = 0;
    }
    settings.mController = ctrlSettings;

    ctrlSettings.mDifferentials.clear();
    for (const [l, r] of [[FL, FR], [BL, BR]]) {
        const d = new Jolt.VehicleDifferentialSettings();
        d.mLeftWheel = l; d.mRightWheel = r;
        d.mLimitedSlipRatio = 1.4;
        d.mEngineTorqueRatio = 0.5;
        ctrlSettings.mDifferentials.push_back(d);
    }
    ctrlSettings.mDifferentialLimitedSlipRatio = 1.4;

    settings.mAntiRollBars.clear();
    const arf = spec.antiRollFront ?? 600;
    const arr = spec.antiRollRear ?? 600;
    for (const [l, r, s] of [[FL, FR, arf], [BL, BR, arr]]) {
        const bar = new Jolt.VehicleAntiRollBar();
        bar.mLeftWheel = l; bar.mRightWheel = r; bar.mStiffness = s;
        settings.mAntiRollBars.push_back(bar);
    }

    const constraint = new Jolt.VehicleConstraint(body, settings);
    constraint.SetVehicleCollisionTester(new Jolt.VehicleCollisionTesterCastCylinder(LAYER_MOVING, 0.05));
    physicsSystem.AddConstraint(constraint);
    physicsSystem.AddStepListener(new Jolt.VehicleConstraintStepListener(constraint));

    const controller = Jolt.castObject(constraint.GetController(), Jolt.WheeledVehicleController);
    return { constraint, controller };
};

const buildWheelMeshes = (chassis, spec, mats) => {
    const meshes = Array.from({ length: 4 }, () => {
        const hub = new THREE.Group();
        // Tyre
        const tyre = new THREE.Mesh(
            new THREE.CylinderGeometry(spec.wheelRadius, spec.wheelRadius, spec.wheelWidth, 16, 1),
            mats.get('rubber'),
        );
        tyre.castShadow = true;
        hub.add(tyre);
        // Rim (slightly smaller)
        const rim = new THREE.Mesh(
            new THREE.CylinderGeometry(spec.wheelRadius * 0.55, spec.wheelRadius * 0.55, spec.wheelWidth + 0.01, 8, 1),
            mats.get('chrome'),
        );
        rim.castShadow = true;
        hub.add(rim);
        chassis.add(hub);
        return hub;
    });
    return meshes;
};

// ─── createVehicle ────────────────────────────────────────────────────────────

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {ReturnType<import('../graphics/MaterialLibrary.js').createMaterialLibrary>} materials
 * @param {ReturnType<import('../player/Player.js').createPlayer>} player
 * @param {ReturnType<import('../input/InputManager.js').createInputManager>} input
 * @param {{
 *   kind?: string, x?: number, y?: number, z?: number, id?: string,
 *   interaction?: object, meshUrl?: string, length?: number, flip?: boolean, rotateY?: number,
 * }} [spawn]
 */
export const createVehicle = async (engine, physics, materials, player, input, spawn = {}) => {
    const kind = spawn.kind && PROFILES[spawn.kind] ? spawn.kind : (spawn.meshUrl ? 'truck' : 'car');
    const spec = { ...PROFILES[kind] };
    const Jolt = physics.Jolt;
    const { bodyInterface, physicsSystem } = physics;
    const id = spawn.id ?? (spawn.meshUrl ? 'vehicle_glb' : `vehicle_${kind}`);
    const x = spawn.x ?? 0;
    const z = spawn.z ?? -12;

    /** @type {Awaited<ReturnType<typeof loadGlbVehicleModel>> | null} */
    let glb = null;
    /** @type {{ x: number, y: number, z: number }[] | null} */
    let wheelLocals = null;

    if (spawn.meshUrl) {
        glb = await loadGlbVehicleModel(spawn.meshUrl, {
            length: spawn.length,
            flip: spawn.flip,
            rotateY: spawn.rotateY,
        });
        const d = glb.measuredDims;
        spec.halfLength = d.z * 0.5;
        spec.halfWidth = d.x * 0.5;
        spec.halfHeight = Math.max(0.22, d.y * 0.2);
        if (glb.measuredWheelRadius) spec.wheelRadius = glb.measuredWheelRadius;
        if (glb.measuredWheelCenters) {
            const cs = glb.measuredWheelCenters;
            const sag = 9.81 / ((2 * Math.PI * (spec.suspensionFreq ?? 1)) ** 2);
            const rest = spec.suspensionMax - sag;
            wheelLocals = cs.map((c) => ({ x: c.x, y: c.y + rest, z: c.z }));
            spec.halfWidth = (Math.abs(cs[0].x) + Math.abs(cs[1].x)) * 0.5;
            spec.wheelOffsetH = (Math.abs(cs[0].z) + Math.abs(cs[2].z)) * 0.5;
        }
        spec.enterRadius = Math.max(spec.enterRadius, Math.hypot(spec.halfWidth, spec.halfLength) * 0.85);
        spec.exitSide = Math.max(spec.exitSide, spec.halfWidth + 1.2);
    }

    const y = spawn.y ?? (() => {
        if (!glb?.measuredWheelCenters) return spec.spawnY;
        const avgCy = glb.measuredWheelCenters.reduce((s, c) => s + c.y, 0) / 4;
        return spec.wheelRadius - avgCy + 0.08;
    })();

    // ── Physics body ──────────────────────────────────────────────────────────
    const hullKind = glb ? 'car' : kind;
    const carBody = buildVehicleBody(Jolt, bodyInterface, spec, x, y, z, hullKind);
    bodyInterface.AddBody(carBody.GetID(), Jolt.EActivation_Activate);

    // ── Visual mesh ───────────────────────────────────────────────────────────
    const chassis = new THREE.Group();
    if (glb) {
        chassis.add(glb.root);
    } else {
        MESH_BUILDERS[kind](chassis, spec, materials);
    }
    const lamps = attachLamps(chassis, materials);
    engine.add(chassis);
    physics.dynamicBodies.push({ id, body: carBody, mesh: chassis });

    // ── Vehicle constraint ────────────────────────────────────────────────────
    const { constraint, controller } = buildVehicleConstraint(
        Jolt, physicsSystem, carBody, spec, true, wheelLocals,
    );

    // ── Wheel meshes ──────────────────────────────────────────────────────────
    const wheelMeshes = (glb?.hasModelWheels)
        ? glb.wheelCarriers
        : buildWheelMeshes(chassis, spec, materials);
    const wRight = new Jolt.Vec3(0, 1, 0);
    const wUp = new Jolt.Vec3(1, 0, 0);

    const syncWheels = () => {
        for (let i = 0; i < 4; i++) {
            const tf = constraint.GetWheelLocalTransform(i, wRight, wUp);
            const t = tf.GetTranslation();
            const q = tf.GetRotation().GetQuaternion();
            wheelMeshes[i].position.set(t.GetX(), t.GetY(), t.GetZ());
            wheelMeshes[i].quaternion.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
        }
    };
    syncWheels();

    // ── Trailer (Kenworth only) ───────────────────────────────────────────────
    let trailerBody = null, trailerChassis = null, trailerConstraint = null;
    let trailerWheelMeshes = null, trailerVehicleConstraint = null;
    let tWRight = null, tWUp = null;
    let trailerLamps = null;

    if (!glb && kind === 'kenworth' && spec.trailer) {
        const tSpec = spec.trailer;
        const hitchGap = 0.4;
        const trailerZ = z - spec.halfLength - tSpec.halfLength - hitchGap;

        trailerBody = buildVehicleBody(Jolt, bodyInterface, {
            ...tSpec, comY: -0.35, bodyFriction: 0.35, restitution: 0.2,
            linearDamping: 0.02, angularDamping: 0.5, maxSteer: 0,
        }, x, y, trailerZ, 'trailer');
        bodyInterface.AddBody(trailerBody.GetID(), Jolt.EActivation_Activate);

        // Cab and trailer boxes meet at the hitch — ignore that pair or contact
        // acts like a weld and they yaw as one.
        const pairFilter = new Jolt.GroupFilterTable(2);
        pairFilter.DisableCollision(0, 1);
        const cabGroup = carBody.GetCollisionGroup();
        cabGroup.SetGroupFilter(pairFilter);
        cabGroup.SetGroupID(1);
        cabGroup.SetSubGroupID(0);
        const trailGroup = trailerBody.GetCollisionGroup();
        trailGroup.SetGroupFilter(pairFilter);
        trailGroup.SetGroupID(1);
        trailGroup.SetSubGroupID(1);

        trailerChassis = new THREE.Group();
        buildTrailerMesh(trailerChassis, tSpec, materials);
        trailerLamps = attachLamps(trailerChassis, materials);
        engine.add(trailerChassis);
        physics.dynamicBodies.push({ id: id + '_trailer', body: trailerBody, mesh: trailerChassis });

        // Vehicle constraint for trailer (no engine, just wheels + brakes)
        const tResult = buildVehicleConstraint(Jolt, physicsSystem, trailerBody, tSpec, false);
        trailerVehicleConstraint = tResult.constraint;

        trailerWheelMeshes = buildWheelMeshes(trailerChassis, tSpec, materials);
        tWRight = new Jolt.Vec3(0, 1, 0);
        tWUp = new Jolt.Vec3(1, 0, 0);

        // ── Point constraint (fifth-wheel) ───────────────────────────────────
        // mPoint1/mPoint2 are RVec3. World-space coincident hitch so the
        // trailer yaws independently around the kingpin.
        const hitchWorld = new Jolt.RVec3(x, y, z - spec.halfLength);
        const hitchSettings = new Jolt.PointConstraintSettings();
        hitchSettings.mSpace = Jolt.EConstraintSpace_WorldSpace;
        hitchSettings.mPoint1 = hitchWorld;
        hitchSettings.mPoint2 = hitchWorld;

        trailerConstraint = hitchSettings.Create(carBody, trailerBody);
        physicsSystem.AddConstraint(trailerConstraint);
    }

    const syncTrailerWheels = () => {
        if (!trailerWheelMeshes || !trailerVehicleConstraint) return;
        for (let i = 0; i < 4; i++) {
            const tf = trailerVehicleConstraint.GetWheelLocalTransform(i, tWRight, tWUp);
            const t = tf.GetTranslation();
            const q = tf.GetRotation().GetQuaternion();
            trailerWheelMeshes[i].position.set(t.GetX(), t.GetY(), t.GetZ());
            trailerWheelMeshes[i].quaternion.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
        }
    };

    // ── Cosmetic lean / pitch ─────────────────────────────────────────────────
    const maxRollRad = rad(spec.maxRoll);
    const maxPitchRad = rad(spec.maxPitch);
    let dynRoll = 0, dynPitch = 0, prevFwdSpeed = 0;

    // ── State ─────────────────────────────────────────────────────────────────
    let dirKeyFresh = true;
    const STOP_SPEED = 0.35;
    const tmpVel = new THREE.Vector3();
    const tmpInvQ = new THREE.Quaternion();
    const wheelWorld = new THREE.Vector3();

    const tireFrom = (wheels, body, radius) => createParticleEmitter(engine, {
        type: 'dust',
        rate: 0,
        getOrigin: () => {
            const rear = Math.random() < 0.7;
            const i = rear ? (Math.random() < 0.5 ? BL : BR) : (Math.random() < 0.5 ? FL : FR);
            wheels[i].getWorldPosition(wheelWorld);
            return { x: wheelWorld.x, y: wheelWorld.y - radius * 0.55, z: wheelWorld.z };
        },
        getDrift: () => {
            const lin = body.GetLinearVelocity();
            return { x: -lin.GetX() * 0.18, y: 0.25, z: -lin.GetZ() * 0.18 };
        },
    });

    const tire = tireFrom(wheelMeshes, carBody, spec.wheelRadius);
    const trailerTire = trailerWheelMeshes
        ? tireFrom(trailerWheelMeshes, trailerBody, spec.trailer.wheelRadius)
        : null;

    const localForwardSpeed = () => {
        const lin = carBody.GetLinearVelocity();
        const q = carBody.GetRotation();
        tmpInvQ.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW()).conjugate();
        tmpVel.set(lin.GetX(), lin.GetY(), lin.GetZ()).applyQuaternion(tmpInvQ);
        return tmpVel.z;
    };

    const api = {
        kind: glb ? 'glb' : kind, chassis, body: carBody,
        enter() { },
        exit() { },
        warmLights(on = true) {
            lamps.warm(on);
            trailerLamps?.warm(on);
        },
    };

    const seat = bindSeat(engine, physics, player, input, {
        api,
        body: carBody,
        root: chassis,
        half: [spec.halfWidth, 1.2, spec.halfLength],
        kind: api.kind,
        enterRadius: spec.enterRadius,
        exitSide: spec.exitSide,
        cameraLift: 0.4,
        interaction: spawn.interaction,
        onEnter: () => {
            dirKeyFresh = false;
            controller.SetDriverInput(0, 0, 0, 0);
        },
        onExit: () => {
            controller.SetDriverInput(0, 0, 0, 0);
            lamps.setOn(false);
            lamps.setBrake(false);
            trailerLamps?.setOn(false);
            trailerLamps?.setBrake(false);
        },
    });

    // ── Physics step ──────────────────────────────────────────────────────────
    physics.onPreStep(() => {
        if (!seat.occupied) { controller.SetDriverInput(0, 0, 0, 0); return; }

        const move = input.getMove();
        const speed = localForwardSpeed();
        const handBrake = input.isAction('jump') ? 1 : 0;
        const want = move.z < 0 ? 1 : move.z > 0 ? -1 : 0;
        let forward = 0, brake = 0;
        const holdingEnter = seat.releaseDrive(want);

        if (want === 0) {
            dirKeyFresh = true;
        } else if (!holdingEnter) {
            const movingFwd = speed > STOP_SPEED;
            const movingRev = speed < -STOP_SPEED;
            if (handBrake) {
                brake = 1;
                dirKeyFresh = false;
            } else if (want === 1 && movingRev || want === -1 && movingFwd) {
                brake = 1;
                dirKeyFresh = false;
            } else if (movingFwd || movingRev) {
                forward = want;
            } else if (dirKeyFresh) {
                forward = want;
            } else {
                brake = 1;
            }
        } else if (handBrake) {
            brake = 1;
        }

        controller.SetDriverInput(forward, move.x, brake, handBrake);
        lamps.setBrake(brake || handBrake);
        trailerLamps?.setBrake(brake || handBrake);
        if (forward || move.x || brake || handBrake) {
            bodyInterface.ActivateBody(carBody.GetID());
            if (trailerBody) bodyInterface.ActivateBody(trailerBody.GetID());
        }

        // Cosmetic dynamics
        const fwdSpeed = localForwardSpeed();
        const wy = carBody.GetAngularVelocity().GetY();
        const lateralAcc = fwdSpeed * wy;
        const longAcc = clamp((fwdSpeed - prevFwdSpeed) * 60, -12, 12);
        prevFwdSpeed = fwdSpeed;
        dynRoll += (clamp(spec.rollGain * lateralAcc, -maxRollRad, maxRollRad) - dynRoll) * spec.dynSmooth;
        dynPitch += (clamp(-spec.pitchGain * longAcc, -maxPitchRad, maxPitchRad) - dynPitch) * spec.dynSmooth;
    });

    engine.onUpdate(() => {
        if (seat.occupied && input.wasPressed('flashlight')) {
            lamps.toggle();
            if (trailerLamps) trailerLamps.setOn(lamps.on);
        }
        syncWheels();
        syncTrailerWheels();
        chassis.rotateZ(dynRoll);
        chassis.rotateX(dynPitch);
        const lin = carBody.GetLinearVelocity();
        const speed = Math.hypot(lin.GetX(), lin.GetZ());
        tire.setRate(Math.max(0, Math.min(1, (speed - 3) / 14)));
        if (trailerTire && trailerBody) {
            const tLin = trailerBody.GetLinearVelocity();
            const tSpeed = Math.hypot(tLin.GetX(), tLin.GetZ());
            trailerTire.setRate(Math.max(0, Math.min(1, (tSpeed - 3) / 14)));
        }
    });

    return api;
};
