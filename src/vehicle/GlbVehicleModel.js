/**
 * Load a vehicle GLB (+ optional .parts.json), normalize into chassis space
 * (+z nose, centered), split body vs wheels. Wheels sync via GetWheelLocalTransform.
 */

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const WHEEL_RE = /wheel|tire|tyre|kolo|tocak|točak/i;
const box = new THREE.Box3();
const size = new THREE.Vector3();
const center = new THREE.Vector3();
const _mb = new THREE.Box3();

const loader = new GLTFLoader();

const loadGltf = (url) =>
  new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });

const loadSidecar = async (url) => {
  try {
    const res = await fetch(url.replace(/\.\w+$/, '.parts.json'));
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
};

const centroidOf = (geo) => {
  const p = geo.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) c.add(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
  return c.divideScalar(Math.max(1, p.count));
};

const cloneMat = (mat, sidecar, opaque) => {
  const c = mat.clone();
  if (sidecar.stripMaps) c.map = null;
  const rc = sidecar.recolor?.[c.name];
  if (rc) {
    const spec = typeof rc === 'string' ? { color: rc } : rc;
    if (spec.color && c.color) c.color.set(spec.color);
    if (spec.roughness != null && c.roughness != null) c.roughness = spec.roughness;
    if (spec.metalness != null && c.metalness != null) c.metalness = spec.metalness;
    if (spec.opacity != null) {
      c.opacity = spec.opacity;
      c.transparent = spec.opacity < 1;
    }
  }
  if (opaque) {
    c.transparent = false;
    c.opacity = 1;
  }
  c.side = THREE.DoubleSide;
  c.fog = true;
  return c;
};

/**
 * @param {string} url
 * @param {{ length?: number, flip?: boolean, rotateY?: number }} [opts]
 */
export const loadGlbVehicleModel = async (url, opts = {}) => {
  const [gltf, sidecar] = await Promise.all([loadGltf(url), loadSidecar(url)]);
  const source = gltf.scene.clone(true);
  source.updateMatrixWorld(true);

  const nameMap = sidecar.nameMap ?? {};
  const roleFor = (o) => {
    const chain = `${o.name}|${o.parent?.name ?? ''}`;
    for (const key of Object.keys(nameMap)) {
      if (chain.includes(key)) return nameMap[key];
    }
    if (/steering|movsteer/i.test(chain)) return 'steering';
    if (WHEEL_RE.test(chain)) return 'wheel';
    if (/ignore|plane|shadow|ground/i.test(chain)) return 'ignore';
    return 'body';
  };

  box.makeEmpty();
  source.traverse((o) => {
    if (!o.isMesh || roleFor(o) === 'ignore') return;
    o.geometry.computeBoundingBox();
    _mb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(_mb);
  });
  box.getSize(size);

  const norm = new THREE.Matrix4();
  if (opts.rotateY != null) {
    norm.makeRotationY(THREE.MathUtils.degToRad(opts.rotateY));
  } else if (sidecar.rotate != null) {
    norm.makeRotationY(THREE.MathUtils.degToRad(sidecar.rotate));
  } else if (size.x > size.z) {
    norm.makeRotationY(-Math.PI / 2);
  }
  const flip = opts.flip ?? !!sidecar.flip;
  if (flip) norm.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));

  const oriented = box.clone().applyMatrix4(norm);
  oriented.getSize(size);
  oriented.getCenter(center);
  const targetLength = opts.length ?? sidecar.length ?? Math.max(size.z, 3.6);
  const s = targetLength / Math.max(size.z, 0.001);
  norm.premultiply(new THREE.Matrix4().makeScale(s, s, s));
  norm.premultiply(
    new THREE.Matrix4().makeTranslation(-center.x * s, -oriented.min.y * s, -center.z * s)
  );

  /** @type {{ geo: THREE.BufferGeometry, mat: THREE.Material|THREE.Material[], opaque: boolean, role: string }[]} */
  const wheels = [];
  /** @type {{ geo: THREE.BufferGeometry, mat: THREE.Material|THREE.Material[], opaque: boolean }[]} */
  const bodies = [];

  source.traverse((o) => {
    if (!o.isMesh) return;
    const role = roleFor(o);
    if (role === 'ignore' || role === 'steering') return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(norm, o.matrixWorld));
    const opaque = sidecar.opaque?.includes(o.name) ?? false;
    const entry = { geo: g, mat: o.material, opaque, role };
    if (role === 'wheel') wheels.push(entry);
    else bodies.push(entry);
  });

  // Center baked content on chassis origin.
  box.makeEmpty();
  for (const e of [...bodies, ...wheels]) {
    e.geo.computeBoundingBox();
    box.union(e.geo.boundingBox);
  }
  box.getCenter(center);
  const shift = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
  for (const e of [...bodies, ...wheels]) e.geo.applyMatrix4(shift);

  const root = new THREE.Group();
  root.name = 'glb_vehicle';
  const body = new THREE.Group();
  body.name = 'body';
  for (const [i, b] of bodies.entries()) {
    const mat = Array.isArray(b.mat)
      ? b.mat.map((m) => cloneMat(m, sidecar, b.opaque))
      : cloneMat(b.mat, sidecar, b.opaque);
    const m = new THREE.Mesh(b.geo, mat);
    m.name = `body_${i}`;
    m.castShadow = m.receiveShadow = true;
    body.add(m);
  }
  root.add(body);

  const withC = wheels.map((w) => ({ ...w, c: centroidOf(w.geo) }));
  /** @type {{ list: typeof withC }[]} */
  const bySlot = [null, null, null, null];
  for (const w of withC) {
    const i = (w.c.z > 0 ? 0 : 2) + (w.c.x > 0 ? 0 : 1);
    if (!bySlot[i]) bySlot[i] = { list: [w] };
    else if (Math.hypot(w.c.x - bySlot[i].list[0].c.x, w.c.z - bySlot[i].list[0].c.z) < 0.5) {
      bySlot[i].list.push(w);
    } else {
      const mat = Array.isArray(w.mat)
        ? w.mat.map((m) => cloneMat(m, sidecar, w.opaque))
        : cloneMat(w.mat, sidecar, w.opaque);
      const extra = new THREE.Mesh(w.geo, mat);
      extra.castShadow = true;
      body.add(extra);
    }
  }

  /** @type {THREE.Group[]} */
  const wheelCarriers = [];
  /** @type {THREE.Vector3[]} */
  const measuredWheelCenters = [];
  /** @type {number[]} */
  const measuredWheelRadii = [];

  for (let i = 0; i < 4; i++) {
    const slot = bySlot[i];
    const carrier = new THREE.Group();
    carrier.name = `wheelCarrier_${i}`;
    if (slot) {
      const bb = new THREE.Box3();
      for (const src of slot.list) {
        src.geo.computeBoundingBox();
        bb.union(src.geo.boundingBox);
      }
      const c = bb.getCenter(new THREE.Vector3());
      const radius = (bb.max.y - bb.min.y) / 2;
      measuredWheelCenters.push(c.clone());
      measuredWheelRadii.push(radius);
      const wheel = new THREE.Group();
      for (const src of slot.list) {
        src.geo.translate(-c.x, -c.y, -c.z);
        src.geo.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
        const mat = Array.isArray(src.mat)
          ? src.mat.map((m) => cloneMat(m, sidecar, src.opaque))
          : cloneMat(src.mat, sidecar, src.opaque);
        const mesh = new THREE.Mesh(src.geo, mat);
        mesh.castShadow = mesh.receiveShadow = true;
        wheel.add(mesh);
      }
      carrier.add(wheel);
    } else {
      measuredWheelCenters.push(new THREE.Vector3(i % 2 === 0 ? 0.9 : -0.9, -0.2, i < 2 ? 1.4 : -1.4));
    }
    root.add(carrier);
    wheelCarriers.push(carrier);
  }

  box.setFromObject(body);
  box.getSize(size);
  const wheelRadius = measuredWheelRadii.length
    ? measuredWheelRadii.slice().sort((a, b) => a - b)[Math.floor(measuredWheelRadii.length / 2)]
    : null;

  return {
    root,
    body,
    wheelCarriers,
    measuredWheelCenters: measuredWheelRadii.length === 4 ? measuredWheelCenters : null,
    measuredWheelRadius: wheelRadius,
    measuredDims: { x: size.x, y: size.y, z: size.z },
    hasModelWheels: measuredWheelRadii.length === 4,
  };
};
