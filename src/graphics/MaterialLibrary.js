import * as THREE from 'three/webgpu';

const presets = () => ({
    concrete: { color: 0x888888, roughness: 0.85, metalness: 0.0 },
    asphalt: { color: 0x333333, roughness: 0.95, metalness: 0.0 },
    metal: { color: 0xaaaaaa, roughness: 0.35, metalness: 0.9 },
    wood: { color: 0x8b6914, roughness: 0.75, metalness: 0.0 },
    orange: { color: 0xe67a22, roughness: 0.55, metalness: 0.08 },
    dirt: { color: 0x6b4423, roughness: 0.95, metalness: 0.0 },
    grass: { color: 0x3a7d33, roughness: 0.9, metalness: 0.0 },
    rock: { color: 0x666666, roughness: 0.88, metalness: 0.0 },
    teal: { color: 0x2a8f9e, roughness: 0.7, metalness: 0.05 },
    pushable: { color: 0x6bbf4e, roughness: 0.65, metalness: 0.05 },
    glass: { color: 0xaaccff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.4 },
    glassDark: { color: 0x223344, roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.55 },
    water: { color: 0x2266aa, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 },
    red: { color: 0xcc2222, roughness: 0.45, metalness: 0.15 },
    blue: { color: 0x2244aa, roughness: 0.45, metalness: 0.15 },
    yellow: { color: 0xddaa22, roughness: 0.5, metalness: 0.1 },
    white: { color: 0xeeeeee, roughness: 0.5, metalness: 0.05 },
    darkGrey: { color: 0x222222, roughness: 0.8, metalness: 0.0 },
    chrome: { color: 0xcccccc, roughness: 0.1, metalness: 0.95 },
    rubber: { color: 0x1a1a1a, roughness: 0.95, metalness: 0.0 },
    taillight: { color: 0xff2200, roughness: 0.2, metalness: 0.3 },
    headlight: { color: 0xffffcc, roughness: 0.1, metalness: 0.4 },
});

/** Lit, fog-aware material for a texture used as albedo. */
export const createMappedMaterial = (map, roughness = 0.9, extras = {}) => {
    const mat = new THREE.MeshStandardNodeMaterial({
        roughness,
        metalness: extras.metalness ?? 0,
        transparent: extras.transparent ?? false,
        alphaTest: extras.alphaTest ?? 0,
        fog: true,
        side: extras.side ?? THREE.FrontSide,
    });
    mat.map = map;
    return mat;
};

export const loadPainterlyMaterial = async (assets, filename) => {
    const map = await assets.loadTexture(`./assets/textures/painterly/${encodeURIComponent(filename)}`);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.anisotropy = 4;
    map.needsUpdate = true;
    return createMappedMaterial(map);
};

/** @returns {{ get: (name: string) => THREE.MeshStandardNodeMaterial, list: () => string[] }} */
export const createMaterialLibrary = () => {
    /** @type {Map<string, THREE.MeshStandardNodeMaterial>} */
    const materials = new Map();

    for (const [name, def] of Object.entries(presets())) {
        const mat = new THREE.MeshStandardNodeMaterial({
            color: def.color,
            roughness: def.roughness,
            metalness: def.metalness,
            transparent: def.transparent ?? false,
            opacity: def.opacity ?? 1,
            fog: true,
        });
        materials.set(name, mat);
    }

    return {
        get: (name) => materials.get(name) ?? materials.get('concrete'),
        list: () => [...materials.keys()],
    };
};
