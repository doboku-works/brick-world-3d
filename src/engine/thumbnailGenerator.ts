import * as THREE from 'three';
import { PARTS } from '../data/parts';
import { getColorDef } from '../data/colors';
import { getPartGeometry } from './partGeometry';
import type { FixedMaterialBucket } from './partGeometry';

/**
 * Generates crisp real 3D thumbnails for every single brick part at startup
 * using a tiny temporary offscreen renderer (100% local, zero external images!).
 */
export function generatePartThumbnails(): Map<string, string> {
  const result = new Map<string, string>();

  const size = 112;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(size, size);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xb8d4f0, 1.05);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfffaf0, 1.5);
  key.position.set(6, 9, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x93c5fd, 0.55);
  rim.position.set(-6, 4, -5);
  scene.add(rim);

  const fixedMats: Record<FixedMaterialBucket, THREE.MeshStandardMaterial> = {
    glass: new THREE.MeshStandardMaterial({
      color: 0xa5e6ff,
      roughness: 0.1,
      transparent: true,
      opacity: 0.58,
    }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1e2228, roughness: 0.85 }),
    metal_silver: new THREE.MeshStandardMaterial({ color: 0xd1dae3, roughness: 0.22, metalness: 0.72 }),
    metal_gold: new THREE.MeshStandardMaterial({ color: 0xf4c430, roughness: 0.22, metalness: 0.72 }),
    wood_trunk: new THREE.MeshStandardMaterial({ color: 0x7c4a26, roughness: 0.65 }),
    plant_stem: new THREE.MeshStandardMaterial({ color: 0x22a84a, roughness: 0.35 }),
    figure_skin: new THREE.MeshStandardMaterial({ color: 0xffdfb8, roughness: 0.3 }),
    blush_pink: new THREE.MeshStandardMaterial({ color: 0xfda4af, roughness: 0.35 }),
    flower_center: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25 }),
    pom_white: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.32 }),
    dark_ink: new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.4 }),
    glow_warm: new THREE.MeshStandardMaterial({
      color: 0xfff5c0,
      emissive: 0xffc83d,
      emissiveIntensity: 1.3,
    }),
    glow_cyan: new THREE.MeshStandardMaterial({
      color: 0xb8f6ff,
      emissive: 0x22d3ee,
      emissiveIntensity: 1.3,
    }),
  };

  const holder = new THREE.Group();
  scene.add(holder);

  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const sz = new THREE.Vector3();

  for (const part of PARTS) {
    while (holder.children.length > 0) {
      holder.remove(holder.children[0]);
    }

    const bundle = getPartGeometry(part.id);
    const colDef = getColorDef(part.previewColorId ?? 'red');

    const primaryMat = new THREE.MeshStandardMaterial({
      color: colDef.hex,
      roughness: colDef.kind === 'metallic' ? 0.22 : colDef.kind === 'transparent' ? 0.1 : 0.25,
      metalness: colDef.kind === 'metallic' ? 0.7 : 0.04,
      transparent: colDef.kind === 'transparent',
      opacity: colDef.kind === 'transparent' ? 0.65 : 1,
      emissive: part.alwaysGlow || colDef.kind === 'glow' ? colDef.hex : '#000000',
      emissiveIntensity: part.alwaysGlow || colDef.kind === 'glow' ? 0.65 : 0,
    });

    if (bundle.primary) {
      holder.add(new THREE.Mesh(bundle.primary, primaryMat));
    }
    for (const [bucket, geo] of Object.entries(bundle.accents) as Array<
      [FixedMaterialBucket, THREE.BufferGeometry]
    >) {
      holder.add(new THREE.Mesh(geo, fixedMats[bucket]));
    }

    // Auto-frame the part nicely from an iconic 3/4 isometric-like angle!
    box.setFromObject(holder);
    box.getCenter(center);
    box.getSize(sz);
    const radius = Math.max(sz.x, sz.y, sz.z, 0.85) * 0.58;
    const dist = (radius / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))) * 1.18;

    camera.position.set(
      center.x + dist * 0.72,
      center.y + dist * 0.58,
      center.z + dist * 0.82
    );
    camera.lookAt(center);

    renderer.render(scene, camera);
    result.set(part.id, renderer.domElement.toDataURL('image/png'));
    primaryMat.dispose();
  }

  for (const m of Object.values(fixedMats)) m.dispose();
  renderer.dispose();

  return result;
}
