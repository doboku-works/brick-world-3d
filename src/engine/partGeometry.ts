import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLATE_HEIGHT } from '../types';
import type { PartDef } from '../types';
import { PARTS } from '../data/parts';

export type FixedMaterialBucket =
  | 'glass'
  | 'rubber'
  | 'metal_silver'
  | 'metal_gold'
  | 'wood_trunk'
  | 'plant_stem'
  | 'figure_skin'
  | 'blush_pink'
  | 'flower_center'
  | 'pom_white'
  | 'dark_ink'
  | 'glow_warm'
  | 'glow_cyan';

export interface PartGeometryBundle {
  partId: string;
  /** Colored by the brick's selected colorId */
  primary: THREE.BufferGeometry | null;
  /** Fixed-color accent sub-geometries */
  accents: Partial<Record<FixedMaterialBucket, THREE.BufferGeometry>>;
  /** Merged single geometry for ghost preview & bounding calculations */
  ghost: THREE.BufferGeometry;
}

const GAP_XZ = 0.022;
const GAP_Y = 0.01;
const STUD_RADIUS = 0.305;
const STUD_HEIGHT = 0.165;
const STUD_SEGMENTS = 12;

function toNonIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.attributes.normal) {
    g.computeVertexNormals();
  }
  // Remove UV attribute so mergeGeometries never mismatches attributes
  if (g.attributes.uv) {
    g.deleteAttribute('uv');
  }
  return g;
}

function mergeList(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geos.length === 0) return null;
  const normalized = geos.map(toNonIndexed);
  const merged = mergeGeometries(normalized, false);
  for (const g of normalized) g.dispose();
  if (!merged) {
    throw new Error('Failed to merge geometries');
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function makeBox(
  w: number,
  h: number,
  d: number,
  cx: number,
  bottomY: number,
  cz: number
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(cx, bottomY + h * 0.5, cz);
  return geo;
}

/** Slightly chamfered-look box: main core + slightly inset top bevel lip for crisp brick seams */
function makeBrickBox(
  w: number,
  h: number,
  d: number,
  cx: number,
  bottomY: number,
  cz: number
): THREE.BufferGeometry[] {
  const bevel = Math.min(0.035, h * 0.12);
  if (h < 0.25) {
    return [makeBox(w, h, d, cx, bottomY, cz)];
  }
  const mainH = h - bevel;
  const g1 = makeBox(w, mainH, d, cx, bottomY, cz);
  const g2 = makeBox(w - 0.04, bevel, d - 0.04, cx, bottomY + mainH, cz);
  return [g1, g2];
}

function makeStud(cx: number, topY: number, cz: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(
    STUD_RADIUS * 0.96,
    STUD_RADIUS,
    STUD_HEIGHT,
    STUD_SEGMENTS,
    1,
    false
  );
  geo.translate(cx, topY + STUD_HEIGHT * 0.5, cz);
  return geo;
}

function makeCylinder(
  rTop: number,
  rBot: number,
  h: number,
  cx: number,
  bottomY: number,
  cz: number,
  segs = 18
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, segs);
  geo.translate(cx, bottomY + h * 0.5, cz);
  return geo;
}

/** Extruded profile along X axis (centered at cx=0), profile in (z, y) plane */
function makeExtrudedAlongX(
  pointsZY: Array<[number, number]>,
  widthX: number,
  offsetX = 0
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pointsZY[0][0], pointsZY[0][1]);
  for (let i = 1; i < pointsZY.length; i++) {
    shape.lineTo(pointsZY[i][0], pointsZY[i][1]);
  }
  shape.closePath();

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: widthX,
    bevelEnabled: false,
    curveSegments: 8,
  });
  // ExtrudeGeometry builds shape in XY and extrudes along +Z.
  // Rotate so shape X -> Z, shape Y -> Y, extrude Z -> X.
  // Rotation around Y by +PI/2 maps (x, y, z) -> (z, y, -x)
  // Better: map explicitly via matrix:
  // newX = z - widthX/2 + offsetX
  // newY = y
  // newZ = x
  const pos = extrude.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i);
    const sz = pos.getZ(i);
    pos.setXYZ(i, sz - widthX * 0.5 + offsetX, sy, sx);
  }
  // Flip winding because determinant of mapping (z, y, x) is -1
  const nonIdx = extrude.index ? extrude.toNonIndexed() : extrude;
  const p = nonIdx.attributes.position;
  for (let i = 0; i < p.count; i += 3) {
    const x1 = p.getX(i + 1), y1 = p.getY(i + 1), z1 = p.getZ(i + 1);
    const x2 = p.getX(i + 2), y2 = p.getY(i + 2), z2 = p.getZ(i + 2);
    p.setXYZ(i + 1, x2, y2, z2);
    p.setXYZ(i + 2, x1, y1, z1);
  }
  nonIdx.computeVertexNormals();
  return nonIdx;
}

function addTopStudsForFootprint(
  list: THREE.BufferGeometry[],
  sx: number,
  sz: number,
  topY: number,
  footprint?: ReadonlyArray<readonly [number, number]>
) {
  if (footprint) {
    for (const [lx, lz] of footprint) {
      list.push(makeStud(lx + 0.5 - sx * 0.5, topY, lz + 0.5 - sz * 0.5));
    }
  } else {
    for (let lx = 0; lx < sx; lx++) {
      for (let lz = 0; lz < sz; lz++) {
        list.push(makeStud(lx + 0.5 - sx * 0.5, topY, lz + 0.5 - sz * 0.5));
      }
    }
  }
}

function buildPart(def: PartDef): PartGeometryBundle {
  const primary: THREE.BufferGeometry[] = [];
  const accentLists: Partial<Record<FixedMaterialBucket, THREE.BufferGeometry[]>> = {};

  const addAccent = (bucket: FixedMaterialBucket, geo: THREE.BufferGeometry) => {
    if (!accentLists[bucket]) accentLists[bucket] = [];
    accentLists[bucket]!.push(geo);
  };

  const w = def.sx - GAP_XZ;
  const h = def.sy * PLATE_HEIGHT - GAP_Y;
  const d = def.sz - GAP_XZ;
  const id = def.id;

  if (id === 'brick_corner') {
    // L-shape occupying (0,0), (1,0), (0,1) inside 2x2
    // Part A: (0,0)-(1,0) along X => width 2-GAP, depth 1-GAP, centered at cx=0, cz=-0.5
    primary.push(...makeBrickBox(2 - GAP_XZ, h, 1 - GAP_XZ, 0, 0, -0.5));
    // Part B: (0,1) => width 1-GAP, depth 1-GAP, centered at cx=-0.5, cz=+0.5
    primary.push(...makeBrickBox(1 - GAP_XZ, h, 1 - GAP_XZ, -0.5, 0, 0.5));
    addTopStudsForFootprint(primary, def.sx, def.sz, h, def.footprint);
  } else if (id.startsWith('brick_') || id.startsWith('plate_') || id.startsWith('tile_')) {
    primary.push(...makeBrickBox(w, h, d, 0, 0, 0));
    if (def.hasTopStuds) {
      addTopStudsForFootprint(primary, def.sx, def.sz, h);
    }
  } else if (id === 'slope_1x2' || id === 'slope_2x2' || id === 'slope_2x3' || id === 'slope_2x4') {
    // Back row (z near -d/2) is full height with 1 row of studs, sloping down toward +d/2
    const zMin = -d * 0.5;
    const zMax = d * 0.5;
    const flatBack = zMin + 0.92;
    const lipH = 0.22;
    primary.push(
      makeExtrudedAlongX(
        [
          [zMin, 0],
          [zMax, 0],
          [zMax, lipH],
          [flatBack, h],
          [zMin, h],
        ],
        w
      )
    );
    // Studs on the back flat row (lz = 0)
    for (let lx = 0; lx < def.sx; lx++) {
      primary.push(makeStud(lx + 0.5 - def.sx * 0.5, h, 0.5 - def.sz * 0.5));
    }
  } else if (id === 'slope_corner') {
    // 2x2 outer roof corner: peak at (-0.5, -0.5) square, sloping down to +X and +Z
    const x0 = -w * 0.5, x1 = w * 0.5;
    const z0 = -d * 0.5, z1 = d * 0.5;
    const xm = x0 + 0.92;
    const zm = z0 + 0.92;
    const lip = 0.22;
    // Build via custom triangles (clean pyramid-like corner hip roof)
    const verts: number[] = [];
    const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
      verts.push(...a, ...b, ...c);
    };
    const quad = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
      dd: [number, number, number]
    ) => {
      tri(a, b, c);
      tri(a, c, dd);
    };
    // Base corners
    const b00: [number, number, number] = [x0, 0, z0];
    const b10: [number, number, number] = [x1, 0, z0];
    const b11: [number, number, number] = [x1, 0, z1];
    const b01: [number, number, number] = [x0, 0, z1];
    // Lip corners on outer edges
    const l10: [number, number, number] = [x1, lip, z0];
    const l11: [number, number, number] = [x1, lip, z1];
    const l01: [number, number, number] = [x0, lip, z1];
    // Top flat plateau at (-x, -z) corner
    const t00: [number, number, number] = [x0, h, z0];
    const tm0: [number, number, number] = [xm, h, z0];
    const tmm: [number, number, number] = [xm, h, zm];
    const t0m: [number, number, number] = [x0, h, zm];

    // Bottom (-Y)
    quad(b00, b10, b11, b01);
    // Top plateau (+Y)
    quad(t00, t0m, tmm, tm0);
    // Back -Z face
    tri(b00, t00, tm0);
    quad(b00, tm0, l10, b10);
    // Left -X face
    tri(b00, t0m, t00);
    quad(b00, b01, l01, t0m);
    // Outer +X lip
    quad(b10, l10, l11, b11);
    // Outer +Z lip
    quad(b01, b11, l11, l01);
    // Slope face +X (outward normal +X, +Y)
    quad(tm0, tmm, l11, l10);
    // Slope face +Z (outward normal +Z, +Y)
    quad(t0m, l01, l11, tmm);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    primary.push(g);
    primary.push(makeStud(-0.5, h, -0.5));
  } else if (id === 'slope_inv_1x2') {
    const zMin = -d * 0.5;
    const zMax = d * 0.5;
    const baseBack = zMin + 0.92;
    const topLip = h - 0.24;
    primary.push(
      makeExtrudedAlongX(
        [
          [zMin, 0],
          [baseBack, 0],
          [zMax, topLip],
          [zMax, h],
          [zMin, h],
        ],
        w
      )
    );
    addTopStudsForFootprint(primary, def.sx, def.sz, h);
  } else if (id === 'curve_1x2' || id === 'curve_2x2') {
    const zMin = -d * 0.5;
    const zMax = d * 0.5;
    const pts: Array<[number, number]> = [
      [zMin, 0],
      [zMax, 0],
      [zMax, 0.16],
    ];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = (t * Math.PI) / 2;
      const zz = zMin + Math.cos(angle) * d;
      const yy = 0.16 + Math.sin(angle) * (h - 0.16);
      pts.push([zz, yy]);
    }
    pts.push([zMin, h]);
    primary.push(makeExtrudedAlongX(pts, w));
  } else if (id === 'arch_1x4' || id === 'arch_1x6') {
    const zMin = -d * 0.5;
    const zMax = d * 0.5;
    const pillarW = 0.96;
    const innerHalf = d * 0.5 - pillarW;
    const archSpringY = h * 0.42;
    const archTopY = h - 0.34;
    const pts: Array<[number, number]> = [
      [zMin, 0],
      [zMin + pillarW, 0],
      [zMin + pillarW, archSpringY],
    ];
    const arcSteps = 12;
    for (let i = 0; i <= arcSteps; i++) {
      const ang = Math.PI - (i / arcSteps) * Math.PI;
      const zz = Math.cos(ang) * innerHalf;
      const yy = archSpringY + Math.sin(ang) * (archTopY - archSpringY);
      pts.push([zz, yy]);
    }
    pts.push([zMax - pillarW, 0]);
    pts.push([zMax, 0]);
    pts.push([zMax, h]);
    pts.push([zMin, h]);
    primary.push(makeExtrudedAlongX(pts, w));
    addTopStudsForFootprint(primary, def.sx, def.sz, h);
  } else if (id === 'pyramid_2x2') {
    const baseH = 0.22;
    primary.push(makeBox(w, baseH, d, 0, 0, 0));
    const pyr = new THREE.ConeGeometry(w * 0.7071, h - baseH, 4);
    pyr.rotateY(Math.PI / 4);
    pyr.translate(0, baseH + (h - baseH) * 0.5, 0);
    primary.push(pyr);
  } else if (id === 'cyl_1x1' || id === 'cyl_1x1_plate' || id === 'cyl_2x2') {
    const r = def.sx * 0.5 - GAP_XZ * 0.5;
    primary.push(makeCylinder(r, r, h, 0, 0, 0, 20));
    if (def.sx === 1) {
      primary.push(makeStud(0, h, 0));
    } else {
      addTopStudsForFootprint(primary, def.sx, def.sz, h);
    }
  } else if (id === 'cone_1x1' || id === 'cone_2x2') {
    const rBot = def.sx * 0.5 - GAP_XZ * 0.5;
    const rTop = def.sx === 1 ? 0.16 : 0.26;
    const baseH = 0.2;
    primary.push(makeCylinder(rBot, rBot, baseH, 0, 0, 0, 20));
    primary.push(makeCylinder(rTop, rBot, h - baseH, 0, baseH, 0, 20));
    if (def.sx === 2) {
      primary.push(makeStud(0, h, 0));
    }
  } else if (id === 'dome_2x2') {
    const r = def.sx * 0.5 - GAP_XZ * 0.5;
    const baseH = 0.22;
    primary.push(makeCylinder(r, r, baseH, 0, 0, 0, 20));
    const hemi = new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    hemi.scale(1, (h - baseH) / r, 1);
    hemi.translate(0, baseH, 0);
    primary.push(hemi);
  } else if (id === 'window_1x2' || id === 'window_1x4') {
    const frameT = 0.24;
    // Bottom sill & top header
    primary.push(makeBox(w, frameT, d, 0, 0, 0));
    primary.push(makeBox(w, frameT, d, 0, h - frameT, 0));
    // Left & right jambs
    primary.push(makeBox(w, h - frameT * 2, frameT, 0, frameT, -d * 0.5 + frameT * 0.5));
    primary.push(makeBox(w, h - frameT * 2, frameT, 0, frameT, d * 0.5 - frameT * 0.5));
    // Center muntin bars (cross)
    primary.push(makeBox(w * 0.45, h - frameT * 2, 0.12, 0, frameT, 0));
    if (def.sy >= 6) {
      primary.push(makeBox(w * 0.45, 0.12, d - frameT * 2, 0, h * 0.5 - 0.06, 0));
    }
    // Glass pane
    addAccent('glass', makeBox(0.14, h - frameT * 2, d - frameT * 2, 0, frameT, 0));
    addTopStudsForFootprint(primary, def.sx, def.sz, h);
  } else if (id === 'door_1x3') {
    const frameT = 0.26;
    // Outer frame (top, left, right)
    primary.push(makeBox(w, frameT, d, 0, h - frameT, 0));
    primary.push(makeBox(w, h - frameT, frameT, 0, 0, -d * 0.5 + frameT * 0.5));
    primary.push(makeBox(w, h - frameT, frameT, 0, 0, d * 0.5 - frameT * 0.5));
    // Door threshold
    primary.push(makeBox(w, 0.14, d, 0, 0, 0));
    // Recessed door leaf
    const leafW = w * 0.52;
    const leafH = h - frameT - 0.14;
    const leafD = d - frameT * 2 - 0.06;
    primary.push(makeBox(leafW, leafH * 0.58, leafD, 0, 0.14, 0));
    // Upper door window frame + glass
    const winY = 0.14 + leafH * 0.58;
    const winH = leafH * 0.42;
    primary.push(makeBox(leafW, winH, 0.24, 0, winY, -leafD * 0.5 + 0.12));
    primary.push(makeBox(leafW, winH, 0.24, 0, winY, leafD * 0.5 - 0.12));
    primary.push(makeBox(leafW, 0.2, leafD, 0, winY + winH - 0.2, 0));
    addAccent('glass', makeBox(0.12, winH - 0.2, leafD - 0.48, 0, winY, 0));
    // Golden door knobs on both sides
    addAccent('metal_gold', makeBox(0.14, 0.14, 0.14, leafW * 0.5 + 0.07, h * 0.42, leafD * 0.34));
    addAccent('metal_gold', makeBox(0.14, 0.14, 0.14, -leafW * 0.5 - 0.07, h * 0.42, leafD * 0.34));
    addTopStudsForFootprint(primary, def.sx, def.sz, h);
  } else if (id === 'fence_1x4') {
    // Bottom rail & top rail
    primary.push(makeBox(w * 0.65, 0.22, d, 0, 0, 0));
    primary.push(makeBox(w * 0.65, 0.22, d, 0, h - 0.22, 0));
    // Vertical pickets
    const posts = 5;
    for (let i = 0; i < posts; i++) {
      const z = -d * 0.5 + 0.16 + (i / (posts - 1)) * (d - 0.32);
      primary.push(makeBox(w * 0.45, h - 0.22, 0.22, 0, 0.11, z));
    }
    addTopStudsForFootprint(primary, def.sx, def.sz, h);
  } else if (id === 'stairs_2x4') {
    // 4 clean steps going up from +Z toward -Z
    const steps = 4;
    const stepD = d / steps;
    const stepH = h / steps;
    for (let i = 0; i < steps; i++) {
      const sh = stepH * (i + 1);
      const cz = d * 0.5 - stepD * (i + 0.5);
      primary.push(makeBox(w, sh, stepD, 0, 0, cz));
    }
  } else if (id === 'lamp_1x1' || id === 'lamp_2x2') {
    primary.push(...makeBrickBox(w, h, d, 0, 0, 0));
    addTopStudsForFootprint(primary, def.sx, def.sz, h);
  } else if (id === 'streetlight') {
    // Base pedestal + tall pole + lantern head
    primary.push(makeCylinder(0.42, 0.46, 0.32, 0, 0, 0, 14));
    primary.push(makeCylinder(0.14, 0.2, h - 1.15, 0, 0.32, 0, 12));
    // Lamp top cap & bottom collar
    primary.push(makeCylinder(0.32, 0.2, 0.16, 0, h - 0.85, 0, 12));
    primary.push(makeCylinder(0.12, 0.42, 0.24, 0, h - 0.24, 0, 12));
    // Glowing warm lantern globe
    addAccent('glow_warm', makeCylinder(0.32, 0.26, 0.46, 0, h - 0.69, 0, 14));
  } else if (id === 'wheel_2x2') {
    // Top mudguard brick + big rubber tire underneath
    const topH = PLATE_HEIGHT;
    primary.push(makeBox(w, topH, d, 0, h - topH, 0));
    addTopStudsForFootprint(primary, def.sx, def.sz, h);
    // Axle housing
    primary.push(makeBox(w * 0.6, h - topH - 0.25, d * 0.45, 0, 0.35, 0));
    // Rubber tire centered horizontally along X
    const wheelR = (h - topH) * 0.62;
    const tire = new THREE.CylinderGeometry(wheelR, wheelR, w * 0.72, 20);
    tire.rotateZ(Math.PI / 2);
    tire.translate(0, wheelR, 0);
    addAccent('rubber', tire);
    const hub = new THREE.CylinderGeometry(wheelR * 0.52, wheelR * 0.52, w * 0.76, 14);
    hub.rotateZ(Math.PI / 2);
    hub.translate(0, wheelR, 0);
    addAccent('metal_silver', hub);
  } else if (id === 'wheel_axle_2x4') {
    // 4-wide chassis bar with 2 side tires (left & right along X!)
    const topH = PLATE_HEIGHT;
    primary.push(makeBox(w - 0.55, topH, d, 0, h - topH, 0));
    // Top studs on the middle 2x2 area (or all 4x2 so bricks stack right on top!)
    addTopStudsForFootprint(primary, def.sx, def.sz, h);
    // Axle beam
    primary.push(makeBox(w - 0.3, 0.34, 0.5, 0, 0.45, 0));
    const wheelR = 0.56;
    for (const side of [-1, 1]) {
      const wx = side * (w * 0.5 - 0.36);
      const tire = new THREE.CylinderGeometry(wheelR, wheelR, 0.62, 20);
      tire.rotateZ(Math.PI / 2);
      tire.translate(wx, wheelR, 0);
      addAccent('rubber', tire);
      const hub = new THREE.CylinderGeometry(wheelR * 0.52, wheelR * 0.52, 0.66, 14);
      hub.rotateZ(Math.PI / 2);
      hub.translate(wx, wheelR, 0);
      addAccent('metal_silver', hub);
    }
  } else if (id === 'windshield_2x4') {
    // Sleek angled car windshield (colorable base trim + tinted glass canopy)
    const baseH = 0.24;
    primary.push(makeBox(w, baseH, d, 0, 0, 0));
    // Glass sloped canopy
    const zMin = -d * 0.5 + 0.08;
    const zMax = d * 0.5 - 0.08;
    const canopy = makeExtrudedAlongX(
      [
        [zMin, baseH],
        [zMax, baseH],
        [zMax - 0.85, h],
        [zMin, h],
      ],
      w - 0.12
    );
    addAccent('glass', canopy);
    // Side pillars
    primary.push(makeBox(0.18, h - baseH, 0.22, -w * 0.5 + 0.12, baseH, zMin + 0.14));
    primary.push(makeBox(0.18, h - baseH, 0.22, w * 0.5 - 0.12, baseH, zMin + 0.14));
    // Top roof bar
    primary.push(makeBox(w, 0.14, 0.45, 0, h - 0.14, zMin + 0.24));
  } else if (id === 'wing_2x4') {
    // Tapered airplane wing (thick at -X root, tapered toward +X tip)
    const x0 = -w * 0.5, x1 = w * 0.5;
    const z0 = -d * 0.5, z1 = d * 0.5;
    const shape = new THREE.Shape();
    shape.moveTo(x0, z0);
    shape.lineTo(x1, z0 + 0.45);
    shape.lineTo(x1, z1 - 0.15);
    shape.lineTo(x0, z1);
    shape.closePath();
    const ext = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    ext.rotateX(Math.PI / 2);
    ext.translate(0, h, 0);
    primary.push(ext);
    // Studs on inner half
    primary.push(makeStud(-1.5, h, -0.5));
    primary.push(makeStud(-1.5, h, 0.5));
    primary.push(makeStud(-0.5, h, -0.5));
    primary.push(makeStud(-0.5, h, 0.5));
    primary.push(makeStud(0.5, h, 0.5));
  } else if (id === 'jet_1x2') {
    // Jet engine nacelle + glowing blue exhaust nozzle
    const r = 0.44;
    const body = new THREE.CylinderGeometry(r * 0.85, r, d * 0.78, 16);
    body.rotateX(Math.PI / 2);
    body.translate(0, h * 0.55, -0.1);
    primary.push(body);
    // Mounting bracket
    primary.push(makeBox(w * 0.75, 0.35, d * 0.65, 0, 0, -0.1));
    // Metallic nozzle & glowing flame
    const nozzle = new THREE.CylinderGeometry(r * 0.65, r * 0.82, 0.28, 14);
    nozzle.rotateX(Math.PI / 2);
    nozzle.translate(0, h * 0.55, d * 0.36);
    addAccent('metal_silver', nozzle);
    const flame = new THREE.ConeGeometry(r * 0.52, 0.42, 12);
    flame.rotateX(Math.PI / 2);
    flame.translate(0, h * 0.55, d * 0.52);
    addAccent('glow_cyan', flame);
  } else if (id === 'propeller_2x2') {
    // Rotor hub + 4 crossed blades
    primary.push(makeCylinder(0.32, 0.38, 0.36, 0, 0, 0, 14));
    addAccent('metal_silver', makeCylinder(0.24, 0.28, 0.28, 0, 0.36, 0, 14));
    primary.push(makeBox(w * 0.98, 0.1, 0.32, 0, 0.52, 0));
    primary.push(makeBox(0.32, 0.1, d * 0.98, 0, 0.52, 0));
  } else if (id === 'radar_2x2') {
    // Base + tilted satellite dish
    primary.push(makeBox(1.1, 0.26, 1.1, 0, 0, 0));
    primary.push(makeCylinder(0.18, 0.22, 0.45, 0, 0.26, 0, 12));
    const dish = new THREE.CylinderGeometry(0.88, 0.22, 0.28, 18);
    dish.rotateX(Math.PI * 0.26);
    dish.translate(0, 0.78, 0.08);
    primary.push(dish);
    const pin = new THREE.CylinderGeometry(0.06, 0.08, 0.42, 8);
    pin.rotateX(Math.PI * 0.26);
    pin.translate(0, 0.95, 0.25);
    addAccent('metal_silver', pin);
  } else if (id === 'flower_1x1') {
    // Green stem + 2 tiny leaves + colorful 5-petal blossom + yellow center
    addAccent('plant_stem', makeCylinder(0.1, 0.13, 0.54, 0, 0, 0, 10));
    addAccent('plant_stem', makeBox(0.55, 0.1, 0.22, 0, 0.12, 0));
    const petalCount = 5;
    for (let i = 0; i < petalCount; i++) {
      const ang = (i / petalCount) * Math.PI * 2;
      const px = Math.cos(ang) * 0.23;
      const pz = Math.sin(ang) * 0.23;
      primary.push(makeCylinder(0.17, 0.15, 0.18, px, 0.5, pz, 10));
    }
    addAccent('flower_center', makeCylinder(0.15, 0.15, 0.21, 0, 0.52, 0, 12));
  } else if (id === 'bush_2x2') {
    // Layered blocky leafy bush puffs
    primary.push(makeBox(1.4, 0.35, 1.4, 0, 0, 0));
    primary.push(makeCylinder(0.58, 0.68, 0.55, -0.32, 0.25, -0.25, 10));
    primary.push(makeCylinder(0.56, 0.66, 0.52, 0.34, 0.25, 0.22, 10));
    primary.push(makeCylinder(0.54, 0.62, 0.48, -0.25, 0.28, 0.35, 10));
    primary.push(makeCylinder(0.58, 0.64, 0.52, 0.26, 0.28, -0.32, 10));
    primary.push(makeCylinder(0.55, 0.65, 0.45, 0, 0.68, 0, 12));
  } else if (id === 'tree_2x2') {
    // Brown trunk + 3 tiered pine/leaf crowns (primary colored -> green, pink sakura, orange autumn!)
    addAccent('wood_trunk', makeCylinder(0.36, 0.46, 1.45, 0, 0, 0, 12));
    addAccent('wood_trunk', makeBox(1.1, 0.22, 1.1, 0, 0, 0));
    // Layered leafy tiers
    primary.push(makeCylinder(0.68, 0.96, 0.85, 0, 1.35, 0, 10));
    primary.push(makeCylinder(0.52, 0.84, 0.82, 0, 2.05, 0, 10));
    primary.push(makeCylinder(0.18, 0.64, 0.8, 0, 2.74, 0, 10));
  } else if (id === 'rock_2x2') {
    // Faceted blocky boulder
    primary.push(makeBox(1.82, 0.35, 1.78, 0, 0, 0));
    primary.push(makeCylinder(0.75, 0.96, 0.55, -0.1, 0.3, 0.05, 6));
    primary.push(makeCylinder(0.45, 0.72, 0.42, 0.14, 0.75, -0.08, 6));
  } else if (id === 'flag_1x2') {
    // Pole at z = -0.5 + wavy flag extending toward +Z
    addAccent('metal_silver', makeCylinder(0.28, 0.34, 0.22, 0, 0, -0.5, 12));
    addAccent('metal_silver', makeCylinder(0.09, 0.1, h - 0.18, 0, 0.18, -0.5, 10));
    addAccent('metal_gold', makeCylinder(0.14, 0.14, 0.16, 0, h - 0.12, -0.5, 12));
    // Wavy pennant flag
    primary.push(makeBox(0.14, 0.85, 0.75, 0, h - 1.05, -0.05));
    primary.push(makeBox(0.14, 0.72, 0.65, 0.05, h - 1.0, 0.6));
  } else if (id === 'chest_2x2') {
    // Treasure chest body + domed lid + golden bands & lock
    primary.push(makeBox(1.84, 0.74, 1.36, 0, 0, 0));
    const lid = new THREE.CylinderGeometry(0.68, 0.68, 1.84, 14, 1, false, 0, Math.PI);
    lid.rotateZ(Math.PI / 2);
    lid.translate(0, 0.74, 0);
    primary.push(lid);
    // Gold straps & clasp
    addAccent('metal_gold', makeBox(0.16, 0.78, 1.42, -0.62, 0, 0));
    addAccent('metal_gold', makeBox(0.16, 0.78, 1.42, 0.62, 0, 0));
    addAccent('metal_gold', makeBox(0.34, 0.3, 0.12, 0, 0.56, 0.7));
  } else if (id === 'figure') {
    // Original cute cube-headed block buddy! (2 wide x 1 deep x 6 plates = 2.4 tall)
    // Shoes & legs
    addAccent('pom_white', makeBox(0.42, 0.2, 0.56, -0.26, 0, 0.03));
    addAccent('pom_white', makeBox(0.42, 0.2, 0.56, 0.26, 0, 0.03));
    primary.push(makeBox(0.4, 0.64, 0.48, -0.26, 0.2, 0));
    primary.push(makeBox(0.4, 0.64, 0.48, 0.26, 0.2, 0));
    // Rounded-block tunic torso
    primary.push(makeBox(0.92, 0.82, 0.52, 0, 0.84, 0));
    addAccent('pom_white', makeBox(0.28, 0.26, 0.06, 0, 1.24, 0.27));
    // Cute blocky arms + mitten-cube hands
    primary.push(makeBox(0.24, 0.54, 0.28, -0.6, 1.08, 0));
    primary.push(makeBox(0.24, 0.54, 0.28, 0.6, 1.08, 0));
    addAccent('figure_skin', makeBox(0.22, 0.2, 0.24, -0.6, 0.88, 0.02));
    addAccent('figure_skin', makeBox(0.22, 0.2, 0.24, 0.6, 0.88, 0.02));
    // Original cute square-cube head (warm peach-cream skin!)
    addAccent('figure_skin', makeBox(0.66, 0.54, 0.58, 0, 1.66, 0));
    // Eyes, smiling mouth & rosy pink cheeks (+Z front)
    addAccent('dark_ink', makeBox(0.09, 0.11, 0.05, -0.14, 1.94, 0.3));
    addAccent('dark_ink', makeBox(0.09, 0.11, 0.05, 0.14, 1.94, 0.3));
    addAccent('dark_ink', makeBox(0.18, 0.05, 0.05, 0, 1.79, 0.3));
    addAccent('blush_pink', makeBox(0.11, 0.07, 0.05, -0.23, 1.83, 0.3));
    addAccent('blush_pink', makeBox(0.11, 0.07, 0.05, 0.23, 1.83, 0.3));
    // Cute knit beanie hat + white pom-pom on top!
    primary.push(makeBox(0.72, 0.16, 0.64, 0, 2.12, 0));
    primary.push(makeBox(0.58, 0.14, 0.52, 0, 2.26, 0));
    addAccent('pom_white', makeBox(0.22, 0.18, 0.22, 0, 2.38, 0));
  } else if (id === 'pet_dog') {
    // Cute blocky pet dog facing +Z
    // 4 legs
    primary.push(makeBox(0.24, 0.38, 0.28, -0.22, 0, -0.46));
    primary.push(makeBox(0.24, 0.38, 0.28, 0.22, 0, -0.46));
    primary.push(makeBox(0.24, 0.38, 0.28, -0.22, 0, 0.36));
    primary.push(makeBox(0.24, 0.38, 0.28, 0.22, 0, 0.36));
    // Body
    primary.push(makeBox(0.68, 0.42, 1.18, 0, 0.36, -0.06));
    // Wagging tail
    primary.push(makeBox(0.16, 0.34, 0.18, 0, 0.68, -0.68));
    // Head & snout
    primary.push(makeBox(0.56, 0.46, 0.52, 0, 0.68, 0.46));
    primary.push(makeBox(0.34, 0.24, 0.26, 0, 0.7, 0.76));
    // Cute ears
    primary.push(makeBox(0.14, 0.32, 0.22, -0.32, 0.8, 0.38));
    primary.push(makeBox(0.14, 0.32, 0.22, 0.32, 0.8, 0.38));
    // Eyes & nose
    addAccent('dark_ink', makeBox(0.09, 0.09, 0.06, -0.14, 0.96, 0.72));
    addAccent('dark_ink', makeBox(0.09, 0.09, 0.06, 0.14, 0.96, 0.72));
    addAccent('dark_ink', makeBox(0.14, 0.1, 0.08, 0, 0.84, 0.89));
  } else if (id === 'robot_head') {
    // Cool 2x2 blocky robot head with glowing cyan visor eyes + side ears + studs
    primary.push(...makeBrickBox(w, h, d, 0, 0, 0));
    addTopStudsForFootprint(primary, def.sx, def.sz, h);
    // Dark faceplate recess + glowing eyes on +Z
    addAccent('dark_ink', makeBox(1.52, 0.42, 0.12, 0, 0.54, d * 0.5 + 0.01));
    addAccent('glow_cyan', makeBox(0.42, 0.24, 0.14, -0.38, 0.63, d * 0.5 + 0.03));
    addAccent('glow_cyan', makeBox(0.42, 0.24, 0.14, 0.38, 0.63, d * 0.5 + 0.03));
    // Mouth grill
    addAccent('metal_silver', makeBox(0.86, 0.16, 0.1, 0, 0.2, d * 0.5 + 0.02));
    // Side ear sensors
    addAccent('metal_silver', makeBox(0.14, 0.46, 0.46, -w * 0.5 - 0.05, 0.42, 0));
    addAccent('metal_silver', makeBox(0.14, 0.46, 0.46, w * 0.5 + 0.05, 0.42, 0));
  } else {
    // Fallback standard brick
    primary.push(...makeBrickBox(w, h, d, 0, 0, 0));
    if (def.hasTopStuds) {
      addTopStudsForFootprint(primary, def.sx, def.sz, h);
    }
  }

  const mergedPrimary = mergeList(primary);
  const accents: Partial<Record<FixedMaterialBucket, THREE.BufferGeometry>> = {};
  const allForGhost: THREE.BufferGeometry[] = [];
  if (mergedPrimary) allForGhost.push(mergedPrimary);

  for (const [bucket, list] of Object.entries(accentLists) as Array<
    [FixedMaterialBucket, THREE.BufferGeometry[]]
  >) {
    const m = mergeList(list);
    if (m) {
      accents[bucket] = m;
      allForGhost.push(m);
    }
  }

  const ghost = mergeList(allForGhost) ?? makeBox(w, h, d, 0, 0, 0);

  return {
    partId: def.id,
    primary: mergedPrimary,
    accents,
    ghost,
  };
}

let cachedLibrary: Map<string, PartGeometryBundle> | null = null;

export function getPartGeometryLibrary(): Map<string, PartGeometryBundle> {
  if (!cachedLibrary) {
    cachedLibrary = new Map();
    for (const def of PARTS) {
      cachedLibrary.set(def.id, buildPart(def));
    }
  }
  return cachedLibrary;
}

export function getPartGeometry(partId: string): PartGeometryBundle {
  const lib = getPartGeometryLibrary();
  return lib.get(partId) ?? lib.get('brick_2x4')!;
}
