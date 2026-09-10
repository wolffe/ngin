import * as THREE from 'three/webgpu';
import { placeGltf } from '../src/assets/placeGltf.js';

export const checkStaticModelBatching = () => {
    const assert = (condition, message) => {
        if (!condition) throw new Error(`Static model batching: ${message}`);
    };
    const source = new THREE.Group();
    const group = new THREE.Group();
    group.position.set(3, 2, -1);
    group.rotation.y = 0.7;
    source.add(group);
    const material = new THREE.MeshStandardNodeMaterial();
    const glass = new THREE.MeshStandardNodeMaterial({ transparent: true, opacity: 0.5 });
    const geometry = new THREE.BoxGeometry();
    for (let index = 0; index < 6; index++) {
        const mesh = new THREE.Mesh(geometry, index < 4 ? material : glass);
        mesh.position.set(index * 2, index % 2, -index);
        mesh.scale.set(1, 2, 0.5);
        if (index === 3) mesh.scale.x = -1;
        group.add(mesh);
    }
    const hidden = new THREE.Group();
    hidden.visible = false;
    hidden.add(new THREE.Mesh(geometry, material));
    source.add(hidden);
    const originalPositions = Array.from(geometry.attributes.position.array);
    const scene = new THREE.Scene();
    const collisions = [];
    const engine = { add: object => scene.add(object) };
    const physics = {
        addStaticMesh: (id, origin, triangles) => {
            collisions.push(triangles);
            return id;
        },
        getDynamic: () => null,
    };
    const options = { x: 12, y: 4, z: -8, targetHeight: 9, body: 'static-mesh' };
    const original = placeGltf(engine, physics, { scene: source }, options).root;
    const batched = placeGltf(engine, physics, { scene: source }, { ...options, batchStatic: true }).root;
    const snapshot = root => {
        const vertices = [];
        let meshes = 0;
        let transparent = 0;
        root.updateMatrixWorld(true);
        root.traverseVisible(object => {
            if (!object.isMesh) return;
            meshes++;
            if (object.material.transparent) transparent++;
            const { index, attributes } = object.geometry;
            const vertex = new THREE.Vector3();
            for (let offset = 0; offset < (index?.count ?? attributes.position.count); offset++) {
                vertex.fromBufferAttribute(attributes.position, index ? index.getX(offset) : offset)
                    .applyMatrix4(object.matrixWorld);
                vertices.push(vertex.toArray().map(value => value.toFixed(3)).join(','));
            }
        });
        return { vertices: vertices.sort().join(';'), meshes, transparent };
    };
    const before = snapshot(original);
    const after = snapshot(batched);
    assert(before.vertices === after.vertices, 'world-space vertices changed');
    assert(after.meshes === before.meshes - 2, 'compatible meshes were not combined');
    assert(after.transparent === 2, 'transparent meshes were combined');
    assert(JSON.stringify(collisions[0]) === JSON.stringify(collisions[1]), 'collision triangles changed');
    assert(JSON.stringify(originalPositions) === JSON.stringify(Array.from(geometry.attributes.position.array)), 'shared geometry was mutated');
    assert(group.children.length === 6, 'source scene was mutated');
    const animated = placeGltf(engine, physics, { scene: source, animations: [{}] }, { ...options, batchStatic: true }).root;
    assert(snapshot(animated).meshes === before.meshes, 'animated model was batched');
    const geometries = new Set([geometry]);
    scene.traverse(object => { if (object.isMesh) geometries.add(object.geometry); });
    for (const item of geometries) item.dispose();
    material.dispose();
    glass.dispose();
    return true;
};