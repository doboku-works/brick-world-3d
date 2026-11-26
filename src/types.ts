export const WORLD_SIZE = 128; // 128 x 128 studs (4x4 giant baseplates!)
export const MAX_HEIGHT = 96; // 96 plates = 32 standard bricks high
export const STUD_SIZE = 1.0;
export const PLATE_HEIGHT = 0.4; // Classic 2:5 plate-to-stud proportion
export const BRICK_HEIGHT = 3; // 3 plates = 1 standard brick

export type Rotation = 0 | 1 | 2 | 3;

export type PartCategory =
  | 'basic'
  | 'plate'
  | 'slope'
  | 'round'
  | 'house'
  | 'vehicle'
  | 'nature'
  | 'character';

export type MaterialKind = 'solid' | 'transparent' | 'metallic' | 'glow';

export type ToolMode =
  | 'build'
  | 'delete'
  | 'paint'
  | 'eyedropper'
  | 'stamp'
  | 'dynamite'
  | 'play';

export type PlayVehicleMode = 'walk' | 'car';
export type PlayCameraMode = 'third' | 'first';

export type WorldTheme = 'meadow' | 'island' | 'city' | 'space';
export type TimeOfDay = 'morning' | 'day' | 'sunset' | 'night';

export interface ColorDef {
  id: string;
  name: string;
  hex: string;
  kind: MaterialKind;
  emissive?: string;
}

export interface PartDef {
  id: string;
  name: string;
  category: PartCategory;
  /** Size in studs (X), plates (Y), studs (Z) before rotation */
  sx: number;
  sy: number;
  sz: number;
  /** Optional custom footprint cells (lx, lz) for non-rectangular shapes like L-corner */
  footprint?: ReadonlyArray<readonly [number, number]>;
  /** Whether studs exist on top (used for stacking visuals) */
  hasTopStuds: boolean;
  /** Whether this part always glows (e.g., lamp / street light) */
  alwaysGlow?: boolean;
  /** Default preview color id */
  previewColorId?: string;
}

export interface BrickData {
  id: number;
  partId: string;
  colorId: string;
  x: number; // grid X (0..WORLD_SIZE-1)
  y: number; // grid Y in plates (0..MAX_HEIGHT-1)
  z: number; // grid Z (0..WORLD_SIZE-1)
  rot: Rotation;
}

export interface StampBrick {
  partId: string;
  colorId: string;
  dx: number;
  dy: number;
  dz: number;
  rot: Rotation;
}

export interface StampDef {
  id: string;
  name: string;
  emoji: string;
  category: 'building' | 'vehicle' | 'nature' | 'fun' | 'custom';
  description: string;
  bricks: StampBrick[];
}

export interface WorldSaveData {
  version: number;
  name: string;
  theme: WorldTheme;
  timeOfDay: TimeOfDay;
  savedAt: number;
  bricks: Array<[string, string, number, number, number, Rotation]>;
}

export interface RayHit {
  type: 'brick' | 'ground';
  brickId?: number;
  cellX: number;
  cellY: number;
  cellZ: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  pointX: number;
  pointY: number;
  pointZ: number;
  distance: number;
}

export interface MissionDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  check: (ctx: MissionContext) => boolean;
}

export interface MissionContext {
  bricks: BrickData[];
  timeOfDay: TimeOfDay;
  usedExplore: boolean;
  usedCar: boolean;
  usedDynamite: boolean;
  usedStamp: boolean;
}

export function getRotatedSize(
  sx: number,
  sy: number,
  sz: number,
  rot: Rotation
): [number, number, number] {
  return rot % 2 === 0 ? [sx, sy, sz] : [sz, sy, sx];
}

/**
 * Rotates a local cell (lx in 0..sx-1, lz in 0..sz-1) clockwise by rot * 90 deg
 * around Y axis matching Three.js rotation.y = -rot * Math.PI / 2.
 */
export function rotateLocalCell(
  lx: number,
  lz: number,
  sx: number,
  sz: number,
  rot: Rotation
): [number, number] {
  // Verify mapping with Three.js rotation.y = -rot * PI/2:
  // x' = x*cos(a) + z*sin(a), z' = -x*sin(a) + z*cos(a)
  // For a = -PI/2 (rot=1): cos=0, sin=-1 => x' = -z, z' = x
  // Local centered coords: cx = lx + 0.5 - sx/2, cz = lz + 0.5 - sz/2
  // New box size: rx = sz, rz = sx
  // cx' = -cz = -(lz + 0.5 - sz/2) = (sz - 1 - lz) + 0.5 - sz/2  => nx = sz - 1 - lz
  // cz' = cx = lx + 0.5 - sx/2 => nz = lx
  switch (rot) {
    case 0:
      return [lx, lz];
    case 1:
      return [sz - 1 - lz, lx];
    case 2:
      return [sx - 1 - lx, sz - 1 - lz];
    case 3:
      return [lz, sx - 1 - lx];
  }
}
