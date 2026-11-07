import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

// <StaticMerge> cuts draw calls for scenery that never moves. Once, right
// after mount, it bakes every eligible mesh inside it into one merged mesh
// per material look, and stops drawing the originals (they stay mounted, so
// React is unaffected). A low-poly building made of 80 boxes becomes ~6 draws.
//
// Only wrap things that never move, never appear/disappear, and never swap
// geometry after mount. Inside, these are skipped automatically (they keep
// working as usual):
//   - meshes with pointer handlers (onClick, onPointerOver...), on the mesh
//     itself or on any group above it inside the wrapper
//   - InstancedMesh, Points, Lines, skinned meshes, multi-material meshes
//   - anything hidden at mount time
//   - anything under a group/mesh with userData={{ noMerge: true }}
// So a flag on a pole: put userData={{ noMerge: true }} on the waving flag's
// group, and the pole still merges.
//
// Materials are grouped by their look (type, colors, flags, textures), so
// inline <meshStandardMaterial color="..."/> with the same values merge too.
// Parts that appear or disappear with the time of day (a lantern's night
// glow) are fine if you pass version={night > 0.3}: the merge is redone
// whenever version changes.
//
// Material objects keep being shared, so emissive tweaks at night on a shared
// material (useGlowMaterial etc.) still show on the merged mesh.

const sig = (m) =>
  [
    m.type,
    m.color?.getHexString(),
    m.emissive?.getHexString(),
    m.emissiveIntensity,
    m.roughness,
    m.metalness,
    m.flatShading,
    m.transparent,
    m.opacity,
    m.side,
    m.vertexColors,
    m.depthWrite,
    m.depthTest,
    m.blending,
    m.fog,
    m.toneMapped,
    m.map?.uuid,
    m.alphaMap?.uuid,
    m.emissiveMap?.uuid,
    m.onBeforeCompile ? m.uuid : '', // custom shaders never merge across materials
    m.userData?.noMerge ? m.uuid : '',
  ].join('|');

function needs(m) {
  return {
    uv: !!(m.map || m.alphaMap || m.emissiveMap),
    color: !!m.vertexColors,
  };
}

const tmp = new THREE.Matrix4();
const nrm = new THREE.Matrix3();
const v = new THREE.Vector3();

export default function StaticMerge({ children, enabled = true, version = 0 }) {
  const ref = useRef();
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const root = ref.current;
    if (!root) return undefined;
    root.updateWorldMatrix(true, true);
    const inv = root.matrixWorld.clone().invert();
    const buckets = new Map();

    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material)) return;
      for (let p = o; p && p !== root; p = p.parent) {
        if (!p.visible || p.userData?.noMerge) return;
        if ((p.__r3f?.eventCount || 0) > 0) return; // tappable (itself or a parent group): keep it real
      }
      if (o.material.userData?.noMerge) return;
      const g = o.geometry;
      if (!g?.attributes?.position) return;
      const need = needs(o.material);
      if (!g.attributes.normal || (need.uv && !g.attributes.uv) || (need.color && !g.attributes.color)) return;
      tmp.multiplyMatrices(inv, o.matrixWorld);
      if (tmp.determinant() < 0 && o.material.side !== THREE.DoubleSide) return; // mirrored: winding would flip
      const key = sig(o.material);
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { material: o.material, need, items: [] }));
      b.items.push({ o, g, m: tmp.clone() });
    });

    const added = [];
    const hidden = [];
    for (const b of buckets.values()) {
      if (b.items.length < 2) continue; // nothing to gain
      let count = 0;
      for (const it of b.items) count += it.g.index ? it.g.index.count : it.g.attributes.position.count;
      const pos = new Float32Array(count * 3);
      const nor = new Float32Array(count * 3);
      const uv = b.need.uv ? new Float32Array(count * 2) : null;
      const col = b.need.color ? new Float32Array(count * 3) : null;
      let k = 0;
      for (const it of b.items) {
        const { g, m } = it;
        nrm.getNormalMatrix(m);
        const P = g.attributes.position;
        const N = g.attributes.normal;
        const U = g.attributes.uv;
        const C = g.attributes.color;
        const idx = g.index;
        const n = idx ? idx.count : P.count;
        for (let i = 0; i < n; i++) {
          const j = idx ? idx.getX(i) : i;
          v.fromBufferAttribute(P, j).applyMatrix4(m);
          pos[k * 3] = v.x;
          pos[k * 3 + 1] = v.y;
          pos[k * 3 + 2] = v.z;
          v.fromBufferAttribute(N, j).applyMatrix3(nrm).normalize();
          nor[k * 3] = v.x;
          nor[k * 3 + 1] = v.y;
          nor[k * 3 + 2] = v.z;
          if (uv) {
            uv[k * 2] = U.getX(j);
            uv[k * 2 + 1] = U.getY(j);
          }
          if (col) {
            col[k * 3] = C.getX(j);
            col[k * 3 + 1] = C.getY(j);
            col[k * 3 + 2] = C.itemSize > 2 ? C.getZ(j) : 0;
          }
          k++;
        }
        it.o.layers.disableAll(); // stop drawing the original; React still owns it
        hidden.push(it.o);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, b.material);
      mesh.raycast = () => {}; // taps go to the ground/water underneath as before
      mesh.renderOrder = b.items[0].o.renderOrder;
      mesh.userData.merged = true;
      root.add(mesh);
      added.push(mesh);
    }

    return () => {
      for (const mesh of added) {
        root.remove(mesh);
        mesh.geometry.dispose();
      }
      for (const o of hidden) o.layers.enable(0);
    };
  }, [enabled, version]);

  return <group ref={ref}>{children}</group>;
}
