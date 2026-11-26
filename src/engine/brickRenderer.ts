import * as THREE from 'three';
import {
  PLATE_HEIGHT,
  getRotatedSize,
} from '../types';
import type {
  BrickData,
  MaterialKind,
  Rotation,
  StampBrick,
  TimeOfDay,
} from '../types';
import { getColorDef } from '../data/colors';
import { getPartDef } from '../data/parts';
import {
  getPartGeometry,
  getPartGeometryLibrary,
} from './partGeometry';
import type { FixedMaterialBucket } from './partGeometry';

interface InstanceRef {
  poolKey: string;
  index: number;
}

interface BrickRenderRecord {
  brick: BrickData;
  refs: InstanceRef[];
  basePos: THREE.Vector3;
  baseQuat: THREE.Quaternion;
}

interface PoolEntry {
  key: string;
  mesh: THREE.InstancedMesh;
  capacity: number;
  count: number;
  brickIds: number[]; // index -> brickId
  isPrimary: boolean;
  material: THREE.MeshStandardMaterial;
}

interface BounceAnim {
  brickId: number;
  elapsed: number;
  duration: number;
}

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  color: THREE.Color;
  life: number;
  maxLife: number;
  scale: number;
}

interface PhysicsBody {
  brickId: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  angVel: THREE.Vector3;
  startPos: THREE.Vector3;
  startQuat: THREE.Quaternion;
  halfH: number;
}

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const tmpQuat = new THREE.Quaternion();
const tmpAxis = new THREE.Vector3();

export class BrickRenderer {
  public readonly root = new THREE.Group();
  private pools = new Map<string, PoolEntry>();
  private records = new Map<number, BrickRenderRecord>();

  // Shared materials
  private primaryMaterials: Record<MaterialKind, THREE.MeshStandardMaterial>;
  private fixedMaterials: Record<FixedMaterialBucket, THREE.MeshStandardMaterial>;

  // Bounce animations on newly placed bricks
  private bounceAnims = new Map<number, BounceAnim>();

  // Sparkle/confetti particles
  private particleMesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private readonly MAX_PARTICLES = 260;

  // Ghost preview group
  private ghostGroup = new THREE.Group();
  private ghostValidMat: THREE.MeshStandardMaterial;
  private ghostInvalidMat: THREE.MeshStandardMaterial;
  private ghostOutline: THREE.LineSegments;
  private ghostBasePad: THREE.Mesh;
  private currentGhostKey = '';

  // Hover highlight (for delete / paint / eyedropper)
  private hoverOutline: THREE.LineSegments;

  // Dynamic point lights for glowing lamps & streetlights at night/sunset!
  private glowLightPool: THREE.PointLight[] = [];
  private glowSources = new Map<number, { pos: THREE.Vector3; color: THREE.Color }>();
  private currentTimeOfDay: TimeOfDay = 'day';

  // Dynamite physics smash state!
  private physicsBodies: PhysicsBody[] = [];
  private physicsState: 'idle' | 'smashed' | 'rewinding' = 'idle';
  private rewindProgress = 0;

  constructor(scene: THREE.Scene) {
    this.root.name = 'BricksRoot';
    scene.add(this.root);

    // Glossy ABS toy-brick plastic materials!
    this.primaryMaterials = {
      solid: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.24,
        metalness: 0.04,
      }),
      metallic: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.2,
        metalness: 0.72,
      }),
      transparent: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.1,
        metalness: 0.05,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      }),
      glow: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.9,
        roughness: 0.18,
        metalness: 0.0,
      }),
    };

    this.fixedMaterials = {
      glass: new THREE.MeshStandardMaterial({
        color: 0xa5e6ff,
        roughness: 0.08,
        metalness: 0.12,
        transparent: true,
        opacity: 0.56,
      }),
      rubber: new THREE.MeshStandardMaterial({
        color: 0x1e2228,
        roughness: 0.85,
        metalness: 0.02,
      }),
      metal_silver: new THREE.MeshStandardMaterial({
        color: 0xd1dae3,
        roughness: 0.22,
        metalness: 0.78,
      }),
      metal_gold: new THREE.MeshStandardMaterial({
        color: 0xf4c430,
        roughness: 0.22,
        metalness: 0.78,
      }),
      wood_trunk: new THREE.MeshStandardMaterial({
        color: 0x7c4a26,
        roughness: 0.65,
        metalness: 0.02,
      }),
      plant_stem: new THREE.MeshStandardMaterial({
        color: 0x22a84a,
        roughness: 0.35,
        metalness: 0.02,
      }),
      figure_skin: new THREE.MeshStandardMaterial({
        color: 0xffdfb8,
        roughness: 0.3,
        metalness: 0.02,
      }),
      blush_pink: new THREE.MeshStandardMaterial({
        color: 0xfda4af,
        roughness: 0.35,
        metalness: 0.0,
      }),
      flower_center: new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        roughness: 0.25,
        metalness: 0.03,
      }),
      pom_white: new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.32,
        metalness: 0.02,
      }),
      dark_ink: new THREE.MeshStandardMaterial({
        color: 0x15191f,
        roughness: 0.4,
        metalness: 0.05,
      }),
      glow_warm: new THREE.MeshStandardMaterial({
        color: 0xfff5c0,
        emissive: 0xffc83d,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
      glow_cyan: new THREE.MeshStandardMaterial({
        color: 0xb8f6ff,
        emissive: 0x22d3ee,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    };

    // Pre-warm geometry library
    getPartGeometryLibrary();

    // Particle pool
    const pGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    const pMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.1,
    });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, this.MAX_PARTICLES);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.particleMesh.castShadow = false;
    scene.add(this.particleMesh);

    // Ghost preview
    this.ghostValidMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.58,
      roughness: 0.25,
      depthWrite: false,
    });
    this.ghostInvalidMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xbe123c,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.55,
      roughness: 0.3,
      depthWrite: false,
    });

    const boxEdgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.ghostOutline = new THREE.LineSegments(
      boxEdgeGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    );
    this.ghostOutline.visible = false;
    scene.add(this.ghostOutline);

    this.ghostBasePad = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.ghostBasePad.rotation.x = -Math.PI / 2;
    this.ghostBasePad.visible = false;
    scene.add(this.ghostBasePad);

    this.ghostGroup.visible = false;
    scene.add(this.ghostGroup);

    // Hover outline for Delete/Paint/Eyedropper
    this.hoverOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0xff3b5c, linewidth: 2 })
    );
    this.hoverOutline.visible = false;
    scene.add(this.hoverOutline);

    // Dynamic point lights for lamps, streetlights & glowing blocks at night/sunset!
    for (let i = 0; i < 8; i++) {
      const pl = new THREE.PointLight(0xffe08a, 0, 18, 1.5);
      pl.visible = false;
      scene.add(pl);
      this.glowLightPool.push(pl);
    }
  }

  public setTimeOfDay(time: TimeOfDay) {
    this.currentTimeOfDay = time;
    const isNight = time === 'night';
    const isSunset = time === 'sunset';
    this.primaryMaterials.glow.emissiveIntensity = isNight ? 2.5 : isSunset ? 1.5 : 0.85;
    this.fixedMaterials.glow_warm.emissiveIntensity = isNight ? 2.8 : isSunset ? 1.6 : 0.95;
    this.fixedMaterials.glow_cyan.emissiveIntensity = isNight ? 2.6 : isSunset ? 1.5 : 0.95;
  }

  public syncGlowLights(focusPos: THREE.Vector3) {
    const isNight = this.currentTimeOfDay === 'night';
    const isSunset = this.currentTimeOfDay === 'sunset';
    if (!isNight && !isSunset) {
      for (const pl of this.glowLightPool) {
        pl.visible = false;
        pl.intensity = 0;
      }
      return;
    }

    const candidates = Array.from(this.glowSources.values());
    candidates.sort(
      (a, b) => a.pos.distanceToSquared(focusPos) - b.pos.distanceToSquared(focusPos)
    );
    const intensity = isNight ? 18 : 7.5;
    const dist = isNight ? 20 : 14;

    for (let i = 0; i < this.glowLightPool.length; i++) {
      const pl = this.glowLightPool[i];
      if (i < candidates.length) {
        pl.position.copy(candidates[i].pos);
        pl.color.copy(candidates[i].color);
        pl.intensity = intensity;
        pl.distance = dist;
        pl.visible = true;
      } else {
        pl.visible = false;
        pl.intensity = 0;
      }
    }
  }

  public isSmashed(): boolean {
    return this.physicsState !== 'idle';
  }

  private getOrCreatePool(
    key: string,
    geometry: THREE.BufferGeometry,
    material: THREE.MeshStandardMaterial,
    isPrimary: boolean
  ): PoolEntry {
    const existing = this.pools.get(key);
    if (existing) return existing;

    const initialCap = 64;
    const mesh = new THREE.InstancedMesh(geometry, material, initialCap);
    mesh.count = 0;
    mesh.castShadow = material !== this.primaryMaterials.transparent && material !== this.fixedMaterials.glass;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    // Initialize instanceColor buffer for primary pools
    if (isPrimary) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(initialCap * 3),
        3
      );
    }

    this.root.add(mesh);
    const pool: PoolEntry = {
      key,
      mesh,
      capacity: initialCap,
      count: 0,
      brickIds: [],
      isPrimary,
      material,
    };
    this.pools.set(key, pool);
    return pool;
  }

  private growPool(pool: PoolEntry) {
    const newCap = pool.capacity * 2;
    const newMesh = new THREE.InstancedMesh(pool.mesh.geometry, pool.material, newCap);
    newMesh.castShadow = pool.mesh.castShadow;
    newMesh.receiveShadow = pool.mesh.receiveShadow;
    newMesh.frustumCulled = false;
    newMesh.count = pool.count;

    // Copy existing matrices
    const oldMatArr = pool.mesh.instanceMatrix.array as Float32Array;
    const newMatArr = newMesh.instanceMatrix.array as Float32Array;
    newMatArr.set(oldMatArr.subarray(0, pool.count * 16));
    newMesh.instanceMatrix.needsUpdate = true;

    if (pool.isPrimary) {
      const newColors = new Float32Array(newCap * 3);
      if (pool.mesh.instanceColor) {
        newColors.set(
          (pool.mesh.instanceColor.array as Float32Array).subarray(0, pool.count * 3)
        );
      }
      newMesh.instanceColor = new THREE.InstancedBufferAttribute(newColors, 3);
      newMesh.instanceColor.needsUpdate = true;
    }

    this.root.remove(pool.mesh);
    pool.mesh.dispose();
    this.root.add(newMesh);
    pool.mesh = newMesh;
    pool.capacity = newCap;
  }

  private computeBrickTransform(brick: BrickData): {
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
  } {
    const def = getPartDef(brick.partId);
    const [rx, , rz] = getRotatedSize(def.sx, def.sy, def.sz, brick.rot);
    const pos = new THREE.Vector3(
      brick.x + rx * 0.5,
      brick.y * PLATE_HEIGHT,
      brick.z + rz * 0.5
    );
    const quat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -brick.rot * (Math.PI / 2)
    );
    return { pos, quat };
  }

  public addBrick(brick: BrickData, animate = true) {
    if (this.records.has(brick.id)) return;
    const bundle = getPartGeometry(brick.partId);
    const def = getPartDef(brick.partId);
    const colDef = getColorDef(brick.colorId);
    const matKind: MaterialKind = def.alwaysGlow && !bundle.accents.glow_warm
      ? 'glow'
      : colDef.kind;

    const { pos, quat } = this.computeBrickTransform(brick);
    const refs: InstanceRef[] = [];

    dummy.position.copy(pos);
    dummy.quaternion.copy(quat);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();

    if (bundle.primary) {
      const poolKey = `p:${brick.partId}:${matKind}`;
      const pool = this.getOrCreatePool(
        poolKey,
        bundle.primary,
        this.primaryMaterials[matKind],
        true
      );
      if (pool.count >= pool.capacity) this.growPool(pool);
      const idx = pool.count++;
      pool.mesh.count = pool.count;
      pool.brickIds[idx] = brick.id;
      pool.mesh.setMatrixAt(idx, dummy.matrix);
      tmpColor.set(colDef.hex);
      pool.mesh.setColorAt(idx, tmpColor);
      pool.mesh.instanceMatrix.needsUpdate = true;
      if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
      refs.push({ poolKey, index: idx });
    }

    for (const [bucket, geo] of Object.entries(bundle.accents) as Array<
      [FixedMaterialBucket, THREE.BufferGeometry]
    >) {
      const poolKey = `a:${brick.partId}:${bucket}`;
      const pool = this.getOrCreatePool(poolKey, geo, this.fixedMaterials[bucket], false);
      if (pool.count >= pool.capacity) this.growPool(pool);
      const idx = pool.count++;
      pool.mesh.count = pool.count;
      pool.brickIds[idx] = brick.id;
      pool.mesh.setMatrixAt(idx, dummy.matrix);
      pool.mesh.instanceMatrix.needsUpdate = true;
      refs.push({ poolKey, index: idx });
    }

    this.records.set(brick.id, { brick, refs, basePos: pos, baseQuat: quat });

    if (def.alwaysGlow || colDef.kind === 'glow') {
      const lightPos = pos.clone();
      lightPos.y += def.id === 'streetlight' ? def.sy * PLATE_HEIGHT - 0.45 : def.sy * PLATE_HEIGHT * 0.65;
      const lightCol = new THREE.Color(
        def.id === 'streetlight' ? '#ffd97d' : colDef.emissive ?? colDef.hex
      );
      this.glowSources.set(brick.id, { pos: lightPos, color: lightCol });
    }

    if (animate) {
      this.bounceAnims.set(brick.id, { brickId: brick.id, elapsed: 0, duration: 0.22 });
      this.spawnParticles(pos, colDef.hex, 7);
    }
  }

  public removeBrick(brickId: number, spawnEffect = true) {
    const rec = this.records.get(brickId);
    if (!rec) return;

    if (spawnEffect) {
      const colDef = getColorDef(rec.brick.colorId);
      this.spawnParticles(rec.basePos, colDef.hex, 10);
    }

    for (const ref of rec.refs) {
      const pool = this.pools.get(ref.poolKey);
      if (!pool) continue;
      const lastIdx = pool.count - 1;
      const idx = ref.index;

      if (idx !== lastIdx) {
        // Swap last element into removed slot in O(1)
        const swappedBrickId = pool.brickIds[lastIdx];
        const m = new THREE.Matrix4();
        pool.mesh.getMatrixAt(lastIdx, m);
        pool.mesh.setMatrixAt(idx, m);
        if (pool.isPrimary && pool.mesh.instanceColor) {
          pool.mesh.getColorAt(lastIdx, tmpColor);
          pool.mesh.setColorAt(idx, tmpColor);
          pool.mesh.instanceColor.needsUpdate = true;
        }
        pool.brickIds[idx] = swappedBrickId;

        const swappedRec = this.records.get(swappedBrickId);
        if (swappedRec) {
          for (const sr of swappedRec.refs) {
            if (sr.poolKey === ref.poolKey && sr.index === lastIdx) {
              sr.index = idx;
              break;
            }
          }
        }
      }

      pool.count--;
      pool.mesh.count = pool.count;
      pool.brickIds.pop();
      pool.mesh.instanceMatrix.needsUpdate = true;
    }

    this.records.delete(brickId);
    this.bounceAnims.delete(brickId);
    this.glowSources.delete(brickId);
  }

  public updateBrickColor(brick: BrickData) {
    // Re-add so material kind switches cleanly (e.g. solid <-> transparent <-> glow)
    this.removeBrick(brick.id, false);
    this.addBrick(brick, true);
  }

  public rebuildAll(bricks: BrickData[]) {
    this.cancelSmashImmediate();
    for (const pool of this.pools.values()) {
      pool.count = 0;
      pool.mesh.count = 0;
      pool.brickIds.length = 0;
    }
    this.records.clear();
    this.bounceAnims.clear();
    this.glowSources.clear();

    for (const b of bricks) {
      this.addBrick(b, false);
    }
  }

  private setRecordTransform(
    rec: BrickRenderRecord,
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    scaleX = 1,
    scaleY = 1,
    scaleZ = 1
  ) {
    dummy.position.copy(pos);
    dummy.quaternion.copy(quat);
    dummy.scale.set(scaleX, scaleY, scaleZ);
    dummy.updateMatrix();

    for (const ref of rec.refs) {
      const pool = this.pools.get(ref.poolKey);
      if (!pool) continue;
      pool.mesh.setMatrixAt(ref.index, dummy.matrix);
      pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  public spawnParticles(origin: THREE.Vector3, hexColor: string, count = 8) {
    const baseColor = new THREE.Color(hexColor);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.MAX_PARTICLES) {
        this.particles.shift();
      }
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.6 + Math.random() * 3.4;
      this.particles.push({
        pos: new THREE.Vector3(
          origin.x + (Math.random() - 0.5) * 0.8,
          origin.y + 0.5 + Math.random() * 0.5,
          origin.z + (Math.random() - 0.5) * 0.8
        ),
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          3.2 + Math.random() * 4.0,
          Math.sin(angle) * speed
        ),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12
        ),
        color: baseColor.clone().offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.12),
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
        scale: 0.65 + Math.random() * 0.65,
      });
    }
  }

  public spawnCelebrationConfetti(center: THREE.Vector3) {
    const palette = ['#FF5252', '#FFD740', '#69F0AE', '#40C4FF', '#E040FB', '#FFAB40'];
    for (let i = 0; i < 42; i++) {
      const hex = palette[i % palette.length];
      this.spawnParticles(
        new THREE.Vector3(
          center.x + (Math.random() - 0.5) * 8,
          center.y + 4 + Math.random() * 5,
          center.z + (Math.random() - 0.5) * 8
        ),
        hex,
        1
      );
    }
  }

  // ==================== Ghost Preview & Hover Highlight ====================

  public updateSingleGhost(
    partId: string,
    colorId: string,
    x: number,
    y: number,
    z: number,
    rot: Rotation,
    valid: boolean
  ) {
    const key = `single:${partId}:${colorId}:${valid ? 1 : 0}`;
    if (this.currentGhostKey !== key) {
      this.clearGhostChildren();
      this.currentGhostKey = key;
      const bundle = getPartGeometry(partId);
      const col = getColorDef(colorId);
      const mat = valid ? this.ghostValidMat.clone() : this.ghostInvalidMat;
      if (valid) {
        mat.color.set(col.hex);
        mat.emissive.set(col.hex);
        mat.emissiveIntensity = 0.28;
      }
      const mesh = new THREE.Mesh(bundle.ghost, mat);
      this.ghostGroup.add(mesh);
    }

    const def = getPartDef(partId);
    const [rx, ry, rz] = getRotatedSize(def.sx, def.sy, def.sz, rot);
    const cx = x + rx * 0.5;
    const cy = y * PLATE_HEIGHT;
    const cz = z + rz * 0.5;
    const h = ry * PLATE_HEIGHT;

    this.ghostGroup.position.set(cx, cy, cz);
    this.ghostGroup.rotation.set(0, -rot * (Math.PI / 2), 0);
    this.ghostGroup.visible = true;

    this.ghostOutline.position.set(cx, cy + h * 0.5, cz);
    this.ghostOutline.scale.set(rx + 0.04, h + 0.04, rz + 0.04);
    (this.ghostOutline.material as THREE.LineBasicMaterial).color.setHex(
      valid ? 0xffffff : 0xff3b5c
    );
    this.ghostOutline.visible = true;

    this.ghostBasePad.position.set(cx, cy + 0.02, cz);
    this.ghostBasePad.scale.set(rx, rz, 1);
    (this.ghostBasePad.material as THREE.MeshBasicMaterial).color.setHex(
      valid ? 0x38bdf8 : 0xf43f5e
    );
    this.ghostBasePad.visible = true;
  }

  public updateStampGhost(
    stampId: string,
    bricks: StampBrick[],
    ox: number,
    oy: number,
    oz: number,
    rot: Rotation,
    valid: boolean
  ) {
    const key = `stamp:${stampId}:${rot}:${valid ? 1 : 0}`;
    if (this.currentGhostKey !== key) {
      this.clearGhostChildren();
      this.currentGhostKey = key;

      for (const sb of bricks) {
        const def = getPartDef(sb.partId);
        const totalRot = ((sb.rot + rot) % 4) as Rotation;
        const [rx, , rz] = getRotatedSize(def.sx, def.sy, def.sz, totalRot);
        const [rdx, rdz] = this.rotateStampOffset(sb.dx, sb.dz, sb.partId, sb.rot, rot);
        const bundle = getPartGeometry(sb.partId);
        const col = getColorDef(sb.colorId);
        const mat = valid
          ? new THREE.MeshStandardMaterial({
              color: col.hex,
              transparent: true,
              opacity: 0.65,
              roughness: 0.3,
              depthWrite: false,
            })
          : this.ghostInvalidMat;
        const m = new THREE.Mesh(bundle.ghost, mat);
        m.position.set(rdx + rx * 0.5, sb.dy * PLATE_HEIGHT, rdz + rz * 0.5);
        m.rotation.y = -totalRot * (Math.PI / 2);
        this.ghostGroup.add(m);
      }
    }

    this.ghostGroup.position.set(ox, oy * PLATE_HEIGHT, oz);
    this.ghostGroup.rotation.set(0, 0, 0);
    this.ghostGroup.visible = true;
    this.ghostOutline.visible = false;
    this.ghostBasePad.visible = false;
  }

  public rotateStampOffset(
    dx: number,
    dz: number,
    partId: string,
    brickRot: Rotation,
    stampRot: Rotation
  ): [number, number] {
    const def = getPartDef(partId);
    const [bx, , bz] = getRotatedSize(def.sx, def.sy, def.sz, brickRot);
    // Rotate around origin matching Three.js -stampRot*PI/2
    switch (stampRot) {
      case 0:
        return [dx, dz];
      case 1:
        return [-(dz + bz), dx];
      case 2:
        return [-(dx + bx), -(dz + bz)];
      case 3:
        return [dz, -(dx + bx)];
    }
  }

  private clearGhostChildren() {
    while (this.ghostGroup.children.length > 0) {
      const ch = this.ghostGroup.children[0] as THREE.Mesh;
      this.ghostGroup.remove(ch);
      if (
        ch.material !== this.ghostValidMat &&
        ch.material !== this.ghostInvalidMat &&
        ch.material instanceof THREE.Material
      ) {
        ch.material.dispose();
      }
    }
  }

  public hideGhost() {
    this.ghostGroup.visible = false;
    this.ghostOutline.visible = false;
    this.ghostBasePad.visible = false;
  }

  public showHoverHighlight(brick: BrickData | null, hexColor = 0xff3b5c) {
    if (!brick) {
      this.hoverOutline.visible = false;
      return;
    }
    const def = getPartDef(brick.partId);
    const [rx, ry, rz] = getRotatedSize(def.sx, def.sy, def.sz, brick.rot);
    const h = ry * PLATE_HEIGHT;
    this.hoverOutline.position.set(
      brick.x + rx * 0.5,
      brick.y * PLATE_HEIGHT + h * 0.5,
      brick.z + rz * 0.5
    );
    this.hoverOutline.scale.set(rx + 0.08, h + 0.08, rz + 0.08);
    (this.hoverOutline.material as THREE.LineBasicMaterial).color.setHex(hexColor);
    this.hoverOutline.visible = true;
  }

  // ==================== Fun Dynamite Physics Smash & Magic Rewind! ====================

  public triggerDynamiteExplosion(center: THREE.Vector3, radius = 14): number {
    this.bounceAnims.clear();

    // If first blast, initialize physics body list only for affected bricks (or add more on subsequent blasts!)
    const existingIds = new Set(this.physicsBodies.map((b) => b.brickId));
    let affected = 0;

    for (const [id, rec] of this.records) {
      const def = getPartDef(rec.brick.partId);
      const halfH = def.sy * PLATE_HEIGHT * 0.5;
      const existing = existingIds.has(id)
        ? this.physicsBodies.find((b) => b.brickId === id)
        : undefined;

      const curPos = existing ? existing.pos : rec.basePos;
      const delta = curPos.clone().sub(center);
      const dist = delta.length();

      if (dist <= radius) {
        const power = (1 - dist / radius) * 18 + 6;
        if (delta.lengthSq() < 0.01) delta.set(Math.random() - 0.5, 1, Math.random() - 0.5);
        delta.normalize();
        const impulse = new THREE.Vector3(
          delta.x * power + (Math.random() - 0.5) * 5,
          Math.abs(delta.y) * power * 0.7 + 7 + Math.random() * 8,
          delta.z * power + (Math.random() - 0.5) * 5
        );
        const angVel = new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        );

        if (existing) {
          existing.vel.add(impulse);
          existing.angVel.add(angVel);
        } else {
          this.physicsBodies.push({
            brickId: id,
            pos: rec.basePos.clone(),
            vel: impulse,
            quat: rec.baseQuat.clone(),
            angVel,
            startPos: rec.basePos.clone(),
            startQuat: rec.baseQuat.clone(),
            halfH,
          });
        }
        affected++;
      }
    }

    // Fiery comic blast particles!
    this.spawnParticles(center, '#FF6D00', 22);
    this.spawnParticles(center, '#FFD600', 18);
    this.spawnParticles(center, '#FF1744', 14);

    if (this.physicsBodies.length > 0) {
      this.physicsState = 'smashed';
    }
    return affected;
  }

  public startMagicRewind() {
    if (this.physicsState !== 'smashed') return;
    this.physicsState = 'rewinding';
    this.rewindProgress = 0;
  }

  public cancelSmashImmediate() {
    if (this.physicsBodies.length > 0) {
      for (const body of this.physicsBodies) {
        const rec = this.records.get(body.brickId);
        if (rec) {
          this.setRecordTransform(rec, rec.basePos, rec.baseQuat, 1, 1, 1);
        }
      }
    }
    this.physicsBodies.length = 0;
    this.physicsState = 'idle';
  }

  // ==================== Per-Frame Animation Update ====================

  public update(dt: number) {
    const clampedDt = Math.min(dt, 0.05);

    // 1) Placement bounce animations
    if (this.bounceAnims.size > 0) {
      for (const [id, anim] of this.bounceAnims) {
        anim.elapsed += clampedDt;
        const rec = this.records.get(id);
        if (!rec) {
          this.bounceAnims.delete(id);
          continue;
        }
        const t = Math.min(1, anim.elapsed / anim.duration);
        if (t >= 1) {
          this.setRecordTransform(rec, rec.basePos, rec.baseQuat, 1, 1, 1);
          this.bounceAnims.delete(id);
        } else {
          // Drop from slight height + joyful squash & stretch!
          const drop = Math.pow(1 - t, 2.5) * 0.85;
          const squash = Math.sin(t * Math.PI) * 0.14;
          const pos = rec.basePos.clone();
          pos.y += drop;
          this.setRecordTransform(
            rec,
            pos,
            rec.baseQuat,
            1 + squash * 0.5,
            1 - squash * 0.5,
            1 + squash * 0.5
          );
        }
      }
    }

    // 2) Dynamite physics simulation or magic rewind!
    if (this.physicsState === 'smashed') {
      const gravity = -30;
      for (const body of this.physicsBodies) {
        const rec = this.records.get(body.brickId);
        if (!rec) continue;

        body.vel.y += gravity * clampedDt;
        body.pos.addScaledVector(body.vel, clampedDt);

        // Floor bounce at y = 0
        if (body.pos.y < 0.05) {
          body.pos.y = 0.05;
          if (Math.abs(body.vel.y) > 1.8) {
            body.vel.y = -body.vel.y * 0.42;
          } else {
            body.vel.y = 0;
          }
          body.vel.x *= 0.86;
          body.vel.z *= 0.86;
          body.angVel.multiplyScalar(0.84);
        }

        // Rotate by angular velocity
        const speed = body.angVel.length();
        if (speed > 0.02) {
          tmpAxis.copy(body.angVel).divideScalar(speed);
          tmpQuat.setFromAxisAngle(tmpAxis, speed * clampedDt);
          body.quat.premultiply(tmpQuat).normalize();
        }

        this.setRecordTransform(rec, body.pos, body.quat);
      }
    } else if (this.physicsState === 'rewinding') {
      this.rewindProgress += clampedDt * 1.85;
      const t = Math.min(1, this.rewindProgress);
      // Smooth cubic ease-out back into place
      const ease = 1 - Math.pow(1 - t, 3);
      for (const body of this.physicsBodies) {
        const rec = this.records.get(body.brickId);
        if (!rec) continue;
        const p = new THREE.Vector3().lerpVectors(body.pos, body.startPos, ease);
        // Cute upward arc while flying back home
        p.y += Math.sin(t * Math.PI) * 2.5;
        const q = new THREE.Quaternion().slerpQuaternions(body.quat, body.startQuat, ease);
        this.setRecordTransform(rec, p, q);
      }
      if (t >= 1) {
        this.cancelSmashImmediate();
      }
    }

    // 3) Particles update
    if (this.particles.length > 0) {
      let aliveCount = 0;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life += clampedDt;
        if (p.life >= p.maxLife) {
          this.particles.splice(i, 1);
          continue;
        }
        p.vel.y -= 16 * clampedDt;
        p.pos.addScaledVector(p.vel, clampedDt);
        if (p.pos.y < 0.12) {
          p.pos.y = 0.12;
          p.vel.y *= -0.35;
        }
        p.rot.x += p.rotVel.x * clampedDt;
        p.rot.y += p.rotVel.y * clampedDt;
        p.rot.z += p.rotVel.z * clampedDt;

        const shrink = 1 - p.life / p.maxLife;
        dummy.position.copy(p.pos);
        dummy.rotation.copy(p.rot);
        dummy.scale.setScalar(p.scale * shrink);
        dummy.updateMatrix();
        this.particleMesh.setMatrixAt(aliveCount, dummy.matrix);
        this.particleMesh.setColorAt(aliveCount, p.color);
        aliveCount++;
      }
      this.particleMesh.count = aliveCount;
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    } else if (this.particleMesh.count !== 0) {
      this.particleMesh.count = 0;
    }
  }
}
