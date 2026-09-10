/**
 * World-metre UVs. Default BoxGeometry maps every face 0–1, which stretches a
 * texture on tall or long faces. These UVs keep a 1:1 metre aspect on every
 * triangle (triplanar from the dominant normal).
 *
 * Pass `origin` as the mesh position so adjacent static meshes share the same
 * tiling. Requires RepeatWrapping (ProceduralTextures already sets it).
 */

/**
 * @param {import('three').BufferGeometry} geometry
 * @param {number} [tile] world metres per texture tile
 * @param {{ x?: number, y?: number, z?: number }} [origin] mesh world position
 */
export const applyWorldUVs = (geometry, tile = 1, origin = null) => {
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  if (!pos || !nrm || !uv) return geometry;

  const inv = 1 / tile;
  const ox = origin?.x ?? 0;
  const oy = origin?.y ?? 0;
  const oz = origin?.z ?? 0;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox;
    const y = pos.getY(i) + oy;
    const z = pos.getZ(i) + oz;
    const ax = Math.abs(nrm.getX(i));
    const ay = Math.abs(nrm.getY(i));
    const az = Math.abs(nrm.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, z * inv, y * inv);
    else if (ay >= ax && ay >= az) uv.setXY(i, x * inv, z * inv);
    else uv.setXY(i, x * inv, y * inv);
  }

  uv.needsUpdate = true;
  return geometry;
};
