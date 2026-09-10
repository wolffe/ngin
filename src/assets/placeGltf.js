/**
 * Place a cloned GLB in the world. Optional static triangle mesh or dynamic box.
 * Carry is opt-in: pass `use` with `body: 'dynamic-box'`.
 */

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tmp = new THREE.Vector3();
const size = new THREE.Vector3();
const center = new THREE.Vector3();
const box = new THREE.Box3();

const batchStaticMeshes = (root) => {
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    const batches = new Map();
    root.traverseVisible((object) => {
        if (!object.isMesh || object.isSkinnedMesh || object.isInstancedMesh || object.children.length) return;
        const { geometry, material } = object;
        if (Array.isArray(material) || material.transparent || Object.keys(geometry.morphAttributes).length) return;
        if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return;
        const transform = inverse.clone().multiply(object.matrixWorld);
        if (transform.determinant() <= 0) return;
        const attributes = Object.entries(geometry.attributes).sort(([left], [right]) => left.localeCompare(right))
            .map(([name, attribute]) => [name, attribute.itemSize, attribute.normalized, attribute.array?.constructor.name]);
        const key = JSON.stringify([material.uuid, attributes, object.layers.mask, object.renderOrder]);
        if (!batches.has(key)) batches.set(key, []);
        batches.get(key).push({ object, transform });
    });
    for (const parts of batches.values()) {
        if (parts.length < 2) continue;
        const geometries = parts.map(({ object, transform }) => {
            const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
            return geometry.applyMatrix4(transform);
        });
        const geometry = mergeGeometries(geometries);
        for (const temporary of geometries) temporary.dispose();
        if (!geometry) continue;
        const original = parts[0].object;
        const mesh = new THREE.Mesh(geometry, original.material);
        mesh.name = `batch_${original.material.name || original.material.id}`;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.layers.mask = original.layers.mask;
        mesh.renderOrder = original.renderOrder;
        root.add(mesh);
        for (const { object } of parts) object.removeFromParent();
    }
};

/** World-space triangles, then shifted into `origin` local space (9 floats each). */
const collectLocalTriangles = (root, origin) => {
    const tris = [];
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
        const geo = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry;
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            tmp.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
            tris.push(tmp.x - origin.x, tmp.y - origin.y, tmp.z - origin.z);
        }
    });
    return tris;
};

/**
 * @param {import('../engine/Engine.js').Engine} engine
 * @param {Awaited<ReturnType<import('../physics/PhysicsWorld.js').createPhysicsWorld>>} physics
 * @param {{ scene: import('three').Object3D }} gltf
 * @param {{
 *   id?: string,
 *   x?: number, y?: number, z?: number,
 *   scale?: number,
 *   targetHeight?: number,
 *   sitOnGround?: boolean,
 *   body?: 'none' | 'static-mesh' | 'dynamic-box',
 *   batchStatic?: boolean,
 *   mass?: number,
 *   name?: string,
 *   use?: ReturnType<import('../player/Use.js').createUse>,
 * }} [opts]
 */
export const placeGltf = (engine, physics, gltf, opts = {}) => {
    const root = gltf.scene.clone(true);
    const id = opts.id ?? `gltf_${crypto.randomUUID().slice(0, 8)}`;
    const x = opts.x ?? 0;
    const z = opts.z ?? 0;
    const bodyKind = opts.body ?? 'none';

    root.traverse((obj) => {
        if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
        }
    });

    if (opts.targetHeight != null) {
        box.setFromObject(root);
        box.getSize(size);
        root.scale.multiplyScalar(opts.targetHeight / Math.max(size.y, 0.001));
    } else if (opts.scale != null) {
        root.scale.multiplyScalar(opts.scale);
    }

    box.setFromObject(root);
    box.getSize(size);
    box.getCenter(center);
    const sit = opts.sitOnGround !== false;
    const y = opts.y ?? (sit ? 0 : center.y);
    root.position.set(x - center.x, sit ? y - box.min.y : y, z - center.z);
    engine.add(root);

    box.setFromObject(root);
    box.getSize(size);
    box.getCenter(center);

    let physicsId = null;
    let mesh = root;
    if (bodyKind !== 'none') {
        const holder = new THREE.Group();
        holder.position.copy(center);
        engine.add(holder);
        holder.attach(root);
        mesh = holder;
        if (bodyKind === 'static-mesh') {
            physicsId = physics.addStaticMesh(id, center, collectLocalTriangles(holder, center), holder);
        } else if (bodyKind === 'dynamic-box') {
            physicsId = physics.addDynamicBox(
                id,
                center,
                [size.x / 2, size.y / 2, size.z / 2],
                holder,
                opts.mass ?? 8
            );
        }
    }

    if (opts.batchStatic && bodyKind === 'static-mesh' && !gltf.animations?.length) {
        batchStaticMeshes(root);
    }

    const entry = {
        id,
        name: opts.name ?? id,
        kind: 'gltf',
        mesh: mesh,
        body: mesh.userData.joltBody ?? physics.getDynamic(id)?.body ?? null,
        mass: opts.mass ?? 8,
        size: Math.max(size.x, size.y, size.z),
    };

    if (opts.use && bodyKind === 'dynamic-box' && entry.body) {
        let interactable;
        const stow = () => {
            if (opts.use.carry.carried === entry) opts.use.carry.drop(true);
            opts.use.interaction.remove(interactable);
            physics.removeDynamic(id);
            engine.remove(mesh);
            opts.use.inventory.add({
                name: entry.name,
                drop: (pos) =>
                    placeGltf(engine, physics, gltf, { ...opts, x: pos.x, y: pos.y, z: pos.z, sitOnGround: false }),
            });
        };
        entry.stow = stow;
        interactable = opts.use.interaction.add({
            meshes: [mesh],
            maxDistance: 2,
            useAction: 'carry',
            altAction: 'stow',
            getText: (ctx) => (ctx.carrying ? null : `Carry ${entry.name}`),
            getAltText: (ctx) => (ctx.carrying ? null : `Stow ${entry.name}`),
            interact: () => opts.use.carry.grab(entry),
            altInteract: stow,
        });
    }

    return { root, entry, physicsId };
};
