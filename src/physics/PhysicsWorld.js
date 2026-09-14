/**
 * Jolt Physics world — CharacterVirtual + static/dynamic rigid bodies.
 * No npm build: loaded via import map (wasm-compat).
 */

import initJolt from 'jolt-physics';

/** @typedef {import('../engine/Engine.js').Engine} Engine */

export const LAYER_NON_MOVING = 0;
export const LAYER_MOVING = 1;

const halfHeight = (height, radius) => Math.max(height / 2 - radius, 0.01);

/**
 * @param {Engine} engine
 * @param {{ gravity?: [number, number, number] }} [opts]
 */
export const createPhysicsWorld = async (engine, opts = {}) => {
  const gravity = opts.gravity ?? engine.config.physics.gravity;
  const Jolt = await initJolt();

  const LAYER_COUNT = 2;
  const objectFilter = new Jolt.ObjectLayerPairFilterTable(LAYER_COUNT);
  objectFilter.EnableCollision(LAYER_NON_MOVING, LAYER_MOVING);
  objectFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING);

  const BP_NON_MOVING = new Jolt.BroadPhaseLayer(0);
  const BP_MOVING = new Jolt.BroadPhaseLayer(1);
  const bpInterface = new Jolt.BroadPhaseLayerInterfaceTable(LAYER_COUNT, 2);
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_NON_MOVING, BP_NON_MOVING);
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_MOVING, BP_MOVING);

  const settings = new Jolt.JoltSettings();
  settings.mObjectLayerPairFilter = objectFilter;
  settings.mBroadPhaseLayerInterface = bpInterface;
  settings.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(
    bpInterface,
    2,
    objectFilter,
    LAYER_COUNT
  );

  const jolt = new Jolt.JoltInterface(settings);
  Jolt.destroy(settings);

  const physicsSystem = jolt.GetPhysicsSystem();
  const bodyInterface = physicsSystem.GetBodyInterface();
  physicsSystem.SetGravity(new Jolt.Vec3(gravity[0], gravity[1], gravity[2]));

  const updateSettings = new Jolt.ExtendedUpdateSettings();
  updateSettings.mWalkStairsStepUp.Set(0, 0.55, 0);
  const objectVsBroadPhaseLayerFilter = jolt.GetObjectVsBroadPhaseLayerFilter();
  const objectLayerPairFilter = jolt.GetObjectLayerPairFilter();
  const movingBPFilter = new Jolt.DefaultBroadPhaseLayerFilter(
    objectVsBroadPhaseLayerFilter,
    LAYER_MOVING
  );
  const movingLayerFilter = new Jolt.DefaultObjectLayerFilter(
    objectLayerPairFilter,
    LAYER_MOVING
  );
  const bodyFilter = new Jolt.BodyFilter();
  const shapeFilter = new Jolt.ShapeFilter();

  /** @type {Array<{ id: string, body: unknown, mesh?: import('three').Object3D }>} */
  const staticColliders = [];
  /** @type {Array<{ id: string, body: unknown, mesh: import('three').Object3D }>} */
  const dynamicBodies = [];

  /** @type {{ height: number, radius: number, position: {x:number,y:number,z:number}, velocity: {x:number,y:number,z:number}, grounded: boolean } | null} */
  let characterState = null;
  /** @type {unknown} */
  let character = null;
  /** @type {unknown} */
  let standingShape = null;
  /** @type {unknown} */
  let crouchingShape = null;
  let crouched = false;
  const desiredVelocity = { x: 0, z: 0 };

  const tmpVec3 = new Jolt.Vec3();
  const tmpRVec3 = new Jolt.RVec3();
  // Always call sIdentity() fresh — the returned object must not be shared across calls
  const identQuat = () => Jolt.Quat.prototype.sIdentity();

  const makeCapsuleShape = (height, radius) => {
    const cylinderHalf = Math.max(height / 2 - radius, 0.01);
    const offset = new Jolt.Vec3(0, cylinderHalf + radius, 0);
    const capsule = new Jolt.CapsuleShapeSettings(cylinderHalf, radius);
    const rotated = new Jolt.RotatedTranslatedShapeSettings(offset, identQuat(), capsule);
    const shape = rotated.Create().Get();
    Jolt.destroy(offset);
    return shape;
  };

  const syncCharacterState = () => {
    if (!character || !characterState) return;
    const pos = character.GetPosition();
    const vel = character.GetLinearVelocity();
    const hh = halfHeight(characterState.height, characterState.radius);
    characterState.position.x = pos.GetX();
    characterState.position.y = pos.GetY() + hh;
    characterState.position.z = pos.GetZ();
    characterState.velocity.x = vel.GetX();
    characterState.velocity.y = vel.GetY();
    characterState.velocity.z = vel.GetZ();
    characterState.grounded =
      character.GetGroundState() === Jolt.EGroundState_OnGround;
  };

  const addBody = (body, id, mesh, list, extra = {}) => {
    bodyInterface.AddBody(body.GetID(), Jolt.EActivation_Activate);
    list.push({ id, body, mesh, ...extra });
    return id;
  };

  const createBoxBody = (
    position,
    halfExtents,
    motionType,
    layer,
    rotationEuler = null,
    mass = null,
    extras = {}
  ) => {
    const he = new Jolt.Vec3(halfExtents[0], halfExtents[1], halfExtents[2]);
    const shape = new Jolt.BoxShape(he, 0.05, null);
    Jolt.destroy(he);

    let rot = identQuat();
    if (rotationEuler) {
      tmpVec3.Set(rotationEuler.x, rotationEuler.y, rotationEuler.z);
      rot = Jolt.Quat.prototype.sEulerAngles(tmpVec3);
    }

    tmpRVec3.Set(position.x, position.y, position.z);
    const creation = new Jolt.BodyCreationSettings(shape, tmpRVec3, rot, motionType, layer);
    creation.mFriction = extras.friction ?? 0.5;
    creation.mRestitution = extras.restitution ?? 0.14;
    if (mass != null) {
      creation.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
      creation.mMassPropertiesOverride.mMass = mass;
    }
    if (extras.linearDamping != null) creation.mLinearDamping = extras.linearDamping;
    if (extras.angularDamping != null) creation.mAngularDamping = extras.angularDamping;
    const body = bodyInterface.CreateBody(creation);
    Jolt.destroy(creation);
    return body;
  };

  const createSphereBody = (position, radius, motionType, layer, mass = null, extras = {}) => {
    const shape = new Jolt.SphereShape(radius, null);
    tmpRVec3.Set(position.x, position.y, position.z);
    const creation = new Jolt.BodyCreationSettings(
      shape,
      tmpRVec3,
      identQuat(),
      motionType,
      layer
    );
    creation.mFriction = extras.friction ?? 0.4;
    creation.mRestitution = extras.restitution ?? 0.2;
    if (mass != null) {
      creation.mOverrideMassProperties = Jolt.EOverrideMassProperties_CalculateInertia;
      creation.mMassPropertiesOverride.mMass = mass;
    }
    if (extras.linearDamping != null) creation.mLinearDamping = extras.linearDamping;
    if (extras.angularDamping != null) creation.mAngularDamping = extras.angularDamping;
    const body = bodyInterface.CreateBody(creation);
    Jolt.destroy(creation);
    return body;
  };

  /** @type {Map<number, number>} ground body seq → bounce speed */
  const groundPads = new Map();
  /** @type {Array<{ origin: {x:number,y:number,z:number}, dir: {x:number,y:number,z:number}, reach: number, radius: number, acceleration: number }>} */
  const forceFields = [];
  /** @type {Array<{ minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number, surfaceY: number }>} */
  const waterVolumes = [];

  const RIDE_MASS = 20;

  const groundSeq = () => {
    if (!character) return -1;
    const gid = character.GetGroundBodyID();
    return gid.GetIndexAndSequenceNumber();
  };

  const groundIsRideable = () => {
    const seq = groundSeq();
    const dyn = dynamicBodies.find((e) => e.body.GetID().GetIndexAndSequenceNumber() === seq);
    return !dyn || (dyn.mass ?? 0) >= RIDE_MASS;
  };

  const inForceField = (px, py, pz, f) => {
    const rx = px - f.origin.x;
    const ry = py - f.origin.y;
    const rz = pz - f.origin.z;
    const along = rx * f.dir.x + ry * f.dir.y + rz * f.dir.z;
    if (along < 0 || along > f.reach) return false;
    return rx * rx + ry * ry + rz * rz - along * along <= f.radius * f.radius;
  };

  const fieldAccel = (px, py, pz) => {
    let ax = 0;
    let ay = 0;
    let az = 0;
    for (const f of forceFields) {
      if (!inForceField(px, py, pz, f)) continue;
      ax += f.dir.x * f.acceleration;
      ay += f.dir.y * f.acceleration;
      az += f.dir.z * f.acceleration;
    }
    return { ax, ay, az };
  };

  const rayCast = new Jolt.RRayCast();
  const raySettings = new Jolt.RayCastSettings();
  const rayCollector = new Jolt.CastRayClosestHitCollisionCollector();
  const rayOut = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, fraction: 1 };

  const castRay = (ox, oy, oz, dx, dy, dz, maxDist = 1) => {
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-8 || maxDist < 1e-5) return null;
    const inv = 1 / len;
    const nx = dx * inv;
    const ny = dy * inv;
    const nz = dz * inv;
    rayCast.mOrigin.Set(ox, oy, oz);
    rayCast.mDirection.Set(nx * maxDist, ny * maxDist, nz * maxDist);
    rayCollector.Reset();
    physicsSystem.GetNarrowPhaseQuery().CastRay(
      rayCast,
      raySettings,
      rayCollector,
      movingBPFilter,
      movingLayerFilter,
      bodyFilter,
      shapeFilter
    );
    if (!rayCollector.HadHit()) return null;
    const hit = rayCollector.mHit;
    const f = hit.mFraction;
    rayOut.x = ox + nx * maxDist * f;
    rayOut.y = oy + ny * maxDist * f;
    rayOut.z = oz + nz * maxDist * f;
    rayOut.fraction = f;
    rayOut.nx = -nx;
    rayOut.ny = -ny;
    rayOut.nz = -nz;
    try {
      const body = physicsSystem.GetBodyLockInterfaceNoLock().TryGetBody(hit.mBodyID);
      if (body) {
        tmpRVec3.Set(rayOut.x, rayOut.y, rayOut.z);
        const n = body.GetWorldSpaceSurfaceNormal(hit.mSubShapeID2, tmpRVec3);
        const nl = Math.hypot(n.GetX(), n.GetY(), n.GetZ()) || 1;
        rayOut.nx = n.GetX() / nl;
        rayOut.ny = n.GetY() / nl;
        rayOut.nz = n.GetZ() / nl;
      }
    } catch {
      /* keep inbound inverse */
    }
    return rayOut;
  };

  const addStaticBox = (id, position, halfExtents, mesh = null, rotationEuler = null, extras = {}) => {
    const body = createBoxBody(
      position,
      halfExtents,
      Jolt.EMotionType_Static,
      LAYER_NON_MOVING,
      rotationEuler,
      null,
      extras
    );
    const sid = addBody(body, id, mesh, staticColliders);
    if (extras.bounce) {
      groundPads.set(body.GetID().GetIndexAndSequenceNumber(), extras.bounce);
    }
    return sid;
  };

  const addForceField = ({ origin, direction, reach, radius, acceleration }) => {
    const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const field = {
      origin: { ...origin },
      dir: { x: direction.x / len, y: direction.y / len, z: direction.z / len },
      reach,
      radius,
      acceleration,
    };
    forceFields.push(field);
    return field;
  };

  const addWaterVolume = (opts) => {
    waterVolumes.push(opts);
    return opts;
  };

  const waterAt = (x, y, z) => {
    for (const w of waterVolumes) {
      if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
      if (y < w.minY || y > w.maxY) continue;
      return w;
    }
    return null;
  };

  /**
   * @param {string} id
   * @param {{ x: number, y: number, z: number }} position world origin for local points
   * @param {Array<[number, number, number]>} localPoints
   * @param {import('three').Object3D | null} [mesh]
   */
  const addStaticConvexHull = (id, position, localPoints, mesh = null) => {
    const hull = new Jolt.ConvexHullShapeSettings();
    for (const [x, y, z] of localPoints) {
      hull.mPoints.push_back(new Jolt.Vec3(x, y, z));
    }
    const shapeResult = hull.Create();
    const shape = shapeResult.Get();
    Jolt.destroy(hull);

    tmpRVec3.Set(position.x, position.y, position.z);
    const creation = new Jolt.BodyCreationSettings(
      shape,
      tmpRVec3,
      identQuat(),
      Jolt.EMotionType_Static,
      LAYER_NON_MOVING
    );
    creation.mFriction = 0.5;
    creation.mRestitution = 0.14;
    const body = bodyInterface.CreateBody(creation);
    Jolt.destroy(creation);
    return addBody(body, id, mesh, staticColliders);
  };

  /**
   * Static triangle mesh. `localTris` is a flat xyz list, 9 floats per triangle,
   * in the body's local space (CCW).
   * @param {string} id
   * @param {{ x: number, y: number, z: number }} position
   * @param {number[]} localTris
   * @param {import('three').Object3D | null} [mesh]
   */
  const addStaticMesh = (id, position, localTris, mesh = null) => {
    const count = (localTris.length / 9) | 0;
    const triangles = new Jolt.TriangleList();
    triangles.resize(count);
    for (let i = 0; i < count; i++) {
      const t = triangles.at(i);
      const o = i * 9;
      const a = t.get_mV(0);
      const b = t.get_mV(1);
      const c = t.get_mV(2);
      a.x = localTris[o];
      a.y = localTris[o + 1];
      a.z = localTris[o + 2];
      b.x = localTris[o + 3];
      b.y = localTris[o + 4];
      b.z = localTris[o + 5];
      c.x = localTris[o + 6];
      c.y = localTris[o + 7];
      c.z = localTris[o + 8];
    }
    const materials = new Jolt.PhysicsMaterialList();
    const meshSettings = new Jolt.MeshShapeSettings(triangles, materials);
    const shape = meshSettings.Create().Get();
    Jolt.destroy(triangles);
    Jolt.destroy(materials);
    Jolt.destroy(meshSettings);

    tmpRVec3.Set(position.x, position.y, position.z);
    const creation = new Jolt.BodyCreationSettings(
      shape,
      tmpRVec3,
      identQuat(),
      Jolt.EMotionType_Static,
      LAYER_NON_MOVING
    );
    creation.mFriction = 0.5;
    creation.mRestitution = 0.14;
    const body = bodyInterface.CreateBody(creation);
    Jolt.destroy(creation);
    return addBody(body, id, mesh, staticColliders);
  };

  const addDynamicBox = (id, position, halfExtents, mesh, mass = 8, extras = {}) => {
    const body = createBoxBody(
      position,
      halfExtents,
      Jolt.EMotionType_Dynamic,
      LAYER_MOVING,
      extras.rotationEuler ?? null,
      mass,
      extras
    );
    if (mesh) {
      mesh.userData.joltBody = body;
      mesh.userData.physicsId = id;
    }
    return addBody(body, id, mesh, dynamicBodies, {
      mass,
      buoyancy: extras.buoyancy ?? 1,
    });
  };

  const addDynamicSphere = (id, position, radius, mesh, mass = 5, extras = {}) => {
    const body = createSphereBody(
      position,
      radius,
      Jolt.EMotionType_Dynamic,
      LAYER_MOVING,
      mass,
      extras
    );
    if (mesh) {
      mesh.userData.joltBody = body;
      mesh.userData.physicsId = id;
    }
    return addBody(body, id, mesh, dynamicBodies, {
      mass,
      buoyancy: extras.buoyancy ?? 1,
    });
  };

  const getDynamic = (id) => dynamicBodies.find((e) => e.id === id) ?? null;

  const removeDynamic = (id) => {
    const idx = dynamicBodies.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    const entry = dynamicBodies[idx];
    const bodyId = entry.body.GetID();
    bodyInterface.RemoveBody(bodyId);
    bodyInterface.DestroyBody(bodyId);
    dynamicBodies.splice(idx, 1);
    return entry;
  };

  /** Body id of the object the player is carrying — character walks through it. */
  let carriedBodyId = -1;

  const bindCharacterListener = () => {
    if (!character || !Jolt.CharacterContactListenerJS) return;
    const contactListener = new Jolt.CharacterContactListenerJS();
    contactListener.OnAdjustBodyVelocity = () => {};
    contactListener.OnContactValidate = (_char, bodyID2) => {
      const id = Jolt.wrapPointer(bodyID2, Jolt.BodyID);
      return id.GetIndexAndSequenceNumber() !== carriedBodyId;
    };
    contactListener.OnCharacterContactValidate = () => true;
    contactListener.OnContactAdded = () => {};
    contactListener.OnContactPersisted = () => {};
    contactListener.OnContactRemoved = () => {};
    contactListener.OnCharacterContactAdded = () => {};
    contactListener.OnCharacterContactPersisted = () => {};
    contactListener.OnCharacterContactRemoved = () => {};
    contactListener.OnContactSolve = () => {};
    contactListener.OnCharacterContactSolve = () => {};
    character.SetListener(contactListener);
  };

  const createCharacter = ({
    height = 1.8,
    radius = 0.35,
    crouchHeight = 1.0,
    position = { x: 0, y: 1, z: 0 },
  } = {}) => {
    standingShape = makeCapsuleShape(height, radius);
    crouchingShape = makeCapsuleShape(crouchHeight, radius);

    const charSettings = new Jolt.CharacterVirtualSettings();
    charSettings.mMass = 80;
    charSettings.mMaxSlopeAngle = (45 * Math.PI) / 180;
    charSettings.mMaxStrength = 100;
    charSettings.mShape = standingShape;
    charSettings.mBackFaceMode = Jolt.EBackFaceMode_CollideWithBackFaces;
    charSettings.mCharacterPadding = 0.02;
    charSettings.mPenetrationRecoverySpeed = 0.5;
    charSettings.mPredictiveContactDistance = 0.1;
    charSettings.mSupportingVolume = new Jolt.Plane(Jolt.Vec3.prototype.sAxisY(), -radius);

    const feetY = position.y - halfHeight(height, radius);
    tmpRVec3.Set(position.x, Math.max(0.01, feetY), position.z);
    character = new Jolt.CharacterVirtual(
      charSettings,
      tmpRVec3,
      identQuat(),
      physicsSystem
    );

    characterState = {
      height,
      radius,
      position: { ...position },
      velocity: { x: 0, y: 0, z: 0 },
      grounded: false,
      standingHeight: height,
      crouchHeight,
      waterWalk: false,
    };
    crouched = false;
    bindCharacterListener();
    syncCharacterState();
    return characterState;
  };

  const setCrouching = (wantCrouch) => {
    if (!character || !characterState || wantCrouch === crouched) return crouched;
    const next = wantCrouch ? crouchingShape : standingShape;
    if (
      character.SetShape(
        next,
        1.5 * physicsSystem.GetPhysicsSettings().mPenetrationSlop,
        movingBPFilter,
        movingLayerFilter,
        bodyFilter,
        shapeFilter,
        jolt.GetTempAllocator()
      )
    ) {
      crouched = wantCrouch;
      characterState.height = wantCrouch
        ? characterState.crouchHeight
        : characterState.standingHeight;
      syncCharacterState();
    }
    return crouched;
  };

  const moveCharacter = (wishDir, speed, jump, dt, jumpForce = 8) => {
    if (!character || !characterState) return;

    desiredVelocity.x = wishDir.x * speed;
    desiredVelocity.z = wishDir.z * speed;

    character.UpdateGroundVelocity();
    const up = character.GetUp();
    const linearVelocity = character.GetLinearVelocity();
    const groundVelocity = character.GetGroundVelocity();
    const gravityVec = physicsSystem.GetGravity();

    const vertical =
      linearVelocity.GetX() * up.GetX() +
      linearVelocity.GetY() * up.GetY() +
      linearVelocity.GetZ() * up.GetZ();
    const groundVertical =
      groundVelocity.GetX() * up.GetX() +
      groundVelocity.GetY() * up.GetY() +
      groundVelocity.GetZ() * up.GetZ();

    const onGround = character.GetGroundState() === Jolt.EGroundState_OnGround;
    const movingTowardsGround = vertical - groundVertical < 0.1;
    const bounce = onGround ? groundPads.get(groundSeq()) : undefined;
    const ride = onGround && groundIsRideable();
    const feet = character.GetPosition();
    const wind = fieldAccel(feet.GetX(), feet.GetY() + characterState.height * 0.5, feet.GetZ());
    const windMag = Math.hypot(wind.ax, wind.ay, wind.az);
    const wvol = waterAt(feet.GetX(), feet.GetY(), feet.GetZ());
    const waterDepth = wvol ? wvol.surfaceY - feet.GetY() : 0;
    const swimming = waterDepth > 0.35;
    const waterWalk = !!(wvol && waterDepth > 0 && waterDepth < 0.55);
    characterState.waterWalk = waterWalk;

    if (swimming) updateSettings.mStickToFloorStepDown.Set(0, 0, 0);
    else updateSettings.mStickToFloorStepDown.Set(0, -0.5, 0);

    let vx;
    let vy;
    let vz;
    if (onGround && movingTowardsGround && windMag <= 10 && !swimming) {
      if (ride) {
        vx = groundVelocity.GetX();
        vy = groundVelocity.GetY();
        vz = groundVelocity.GetZ();
      } else {
        vx = 0;
        vy = 0;
        vz = 0;
      }
      if (bounce != null && vertical - groundVertical < bounce * 0.35) {
        const n = character.GetGroundNormal();
        const speed = jump ? bounce * 1.15 : bounce;
        vx += n.GetX() * speed;
        vy += n.GetY() * speed;
        vz += n.GetZ() * speed;
      } else if (jump) {
        vx += up.GetX() * jumpForce;
        vy += up.GetY() * jumpForce;
        vz += up.GetZ() * jumpForce;
      }
    } else {
      vx = up.GetX() * vertical;
      vy = up.GetY() * vertical;
      vz = up.GetZ() * vertical;
      if (jump && (onGround || waterWalk)) {
        vx += up.GetX() * jumpForce;
        vy += up.GetY() * jumpForce;
        vz += up.GetZ() * jumpForce;
      }
    }

    vx += gravityVec.GetX() * dt;
    vy += gravityVec.GetY() * dt;
    vz += gravityVec.GetZ() * dt;

    vx += wind.ax * dt;
    vy += wind.ay * dt;
    vz += wind.az * dt;

    if (wvol && waterDepth > 0) {
      const targetFeet = wvol.surfaceY - 0.12;
      const err = targetFeet - feet.GetY();
      if (vertical < 7) vy += err * 14 * dt;
    }

    vx += desiredVelocity.x;
    vz += desiredVelocity.z;

    tmpVec3.Set(vx, vy, vz);
    character.SetLinearVelocity(tmpVec3);

    character.ExtendedUpdate(
      dt,
      character.GetUp(),
      updateSettings,
      movingBPFilter,
      movingLayerFilter,
      bodyFilter,
      shapeFilter,
      jolt.GetTempAllocator()
    );

    // Edge contacts tilt the ground normal; standing still must not creep off the lip.
    if (desiredVelocity.x === 0 && desiredVelocity.z === 0 && windMag <= 10) {
      const ground = character.GetGroundState();
      if (
        ground === Jolt.EGroundState_OnGround ||
        ground === Jolt.EGroundState_OnSteepGround
      ) {
        const v = character.GetLinearVelocity();
        tmpVec3.Set(0, v.GetY(), 0);
        character.SetLinearVelocity(tmpVec3);
      }
    }

    syncCharacterState();
  };

  const syncDynamicMeshes = () => {
    for (const entry of dynamicBodies) {
      if (!entry.mesh) continue;
      const pos = entry.body.GetPosition();
      const rot = entry.body.GetRotation();
      entry.mesh.position.set(pos.GetX(), pos.GetY(), pos.GetZ());
      entry.mesh.quaternion.set(rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW());
    }
  };

  /** @type {((dt: number) => void)[]} */
  const preStepHooks = [];

  const step = (dt) => {
    const clamped = Math.min(dt, 1 / 30);
    for (const fn of preStepHooks) fn(clamped);
    for (const entry of dynamicBodies) {
      const p = entry.body.GetPosition();
      const a = fieldAccel(p.GetX(), p.GetY(), p.GetZ());
      if (a.ax === 0 && a.ay === 0 && a.az === 0) continue;
      const m = entry.mass ?? 1;
      tmpVec3.Set(a.ax * m, a.ay * m, a.az * m);
      bodyInterface.AddForce(entry.body.GetID(), tmpVec3);
      bodyInterface.ActivateBody(entry.body.GetID());
    }
    const numSteps = clamped > 1 / 55 ? 2 : 1;
    jolt.Step(clamped, numSteps);
    if (character && characterState) syncCharacterState();
    syncDynamicMeshes();
  };

  const getCharacterPosition = () =>
    characterState ? { ...characterState.position } : null;

  const setCharacterPosition = (x, y, z) => {
    if (!character || !characterState) return;
    const hh = halfHeight(characterState.height, characterState.radius);
    tmpRVec3.Set(x, y - hh, z);
    character.SetPosition(tmpRVec3);
    tmpVec3.Set(0, 0, 0);
    character.SetLinearVelocity(tmpVec3);
    syncCharacterState();
  };

  const physics = {
    Jolt,
    jolt,
    physicsSystem,
    bodyInterface,
    staticColliders,
    dynamicBodies,
    LAYER_NON_MOVING,
    LAYER_MOVING,
    halfHeight: (h, r) =>
      halfHeight(h ?? characterState?.height ?? 1.8, r ?? characterState?.radius ?? 0.35),
    get character() {
      return characterState;
    },
    addStaticBox,
    addForceField,
    fieldAccel,
    castRay,
    addWaterVolume,
    addStaticConvexHull,
    addStaticMesh,
    addDynamicBox,
    addDynamicSphere,
    getDynamic,
    removeDynamic,
    createCharacter,
    setCrouching,
    moveCharacter,
    getCharacterPosition,
    setCharacterPosition,
    syncDynamicMeshes,
    setCarriedBody(body) {
      carriedBodyId = body ? body.GetID().GetIndexAndSequenceNumber() : -1;
    },
    onPreStep(fn) {
      preStepHooks.push(fn);
      return () => {
        const i = preStepHooks.indexOf(fn);
        if (i >= 0) preStepHooks.splice(i, 1);
      };
    },
    step,
  };

  engine.register('physics', physics);
  return physics;
};
