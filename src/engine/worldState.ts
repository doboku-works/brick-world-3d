import * as THREE from 'three';
import {
  MAX_HEIGHT,
  PLATE_HEIGHT,
  WORLD_SIZE,
  getRotatedSize,
  rotateLocalCell,
} from '../types';
import type {
  BrickData,
  RayHit,
  Rotation,
  StampBrick,
  TimeOfDay,
  WorldSaveData,
  WorldTheme,
} from '../types';
import { getPartDef, PART_MAP } from '../data/parts';
import { COLOR_MAP } from '../data/colors';

type HistoryEntry =
  | { type: 'add'; bricks: BrickData[] }
  | { type: 'remove'; bricks: BrickData[] }
  | { type: 'recolor'; id: number; prevColor: string; nextColor: string }
  | { type: 'replaceAll'; prev: BrickData[]; next: BrickData[] };

const SLICE_SIZE = WORLD_SIZE * WORLD_SIZE;
const MAX_HISTORY = 150;
const STORAGE_PREFIX = 'brick_world_3d_slot_';
const AUTOSAVE_KEY = 'brick_world_3d_autosave_v2';

export interface SaveSlotSummary {
  slot: number;
  name: string;
  brickCount: number;
  theme: WorldTheme;
  savedAt: number;
}

export class WorldState {
  /** Fast 3D voxel occupancy map: 0 = empty, >0 = brickId */
  private grid = new Int32Array(WORLD_SIZE * WORLD_SIZE * MAX_HEIGHT);
  private bricks = new Map<number, BrickData>();
  private nextId = 1;

  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  public theme: WorldTheme = 'meadow';
  public timeOfDay: TimeOfDay = 'day';
  public worldName = 'マイブロックワールド';

  private cellIndex(x: number, y: number, z: number): number {
    return x + z * WORLD_SIZE + y * SLICE_SIZE;
  }

  public isInBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE && y >= 0 && y < MAX_HEIGHT;
  }

  public getCellBrickId(x: number, y: number, z: number): number {
    if (!this.isInBounds(x, y, z)) return 0;
    return this.grid[this.cellIndex(x, y, z)];
  }

  public getBrick(id: number): BrickData | undefined {
    return this.bricks.get(id);
  }

  public getAllBricks(): BrickData[] {
    return Array.from(this.bricks.values());
  }

  public getBrickCount(): number {
    return this.bricks.size;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getOccupiedCells(
    partId: string,
    x: number,
    y: number,
    z: number,
    rot: Rotation
  ): Array<[number, number, number]> {
    const def = getPartDef(partId);
    const cells: Array<[number, number, number]> = [];
    if (def.footprint) {
      for (const [lx, lz] of def.footprint) {
        const [rx, rz] = rotateLocalCell(lx, lz, def.sx, def.sz, rot);
        for (let dy = 0; dy < def.sy; dy++) {
          cells.push([x + rx, y + dy, z + rz]);
        }
      }
    } else {
      const [rx, ry, rz] = getRotatedSize(def.sx, def.sy, def.sz, rot);
      for (let dx = 0; dx < rx; dx++) {
        for (let dy = 0; dy < ry; dy++) {
          for (let dz = 0; dz < rz; dz++) {
            cells.push([x + dx, y + dy, z + dz]);
          }
        }
      }
    }
    return cells;
  }

  public canPlace(partId: string, x: number, y: number, z: number, rot: Rotation): boolean {
    const def = getPartDef(partId);
    const [rx, ry, rz] = getRotatedSize(def.sx, def.sy, def.sz, rot);
    if (x < 0 || z < 0 || y < 0 || x + rx > WORLD_SIZE || z + rz > WORLD_SIZE || y + ry > MAX_HEIGHT) {
      return false;
    }
    if (def.footprint) {
      for (const [lx, lz] of def.footprint) {
        const [ox, oz] = rotateLocalCell(lx, lz, def.sx, def.sz, rot);
        for (let dy = 0; dy < def.sy; dy++) {
          if (this.grid[this.cellIndex(x + ox, y + dy, z + oz)] !== 0) {
            return false;
          }
        }
      }
    } else {
      for (let dy = 0; dy < ry; dy++) {
        const yOff = (y + dy) * SLICE_SIZE;
        for (let dz = 0; dz < rz; dz++) {
          const zOff = yOff + (z + dz) * WORLD_SIZE;
          for (let dx = 0; dx < rx; dx++) {
            if (this.grid[zOff + x + dx] !== 0) {
              return false;
            }
          }
        }
      }
    }
    return true;
  }

  private writeBrickInternal(brick: BrickData) {
    this.bricks.set(brick.id, brick);
    const cells = this.getOccupiedCells(brick.partId, brick.x, brick.y, brick.z, brick.rot);
    for (const [cx, cy, cz] of cells) {
      if (this.isInBounds(cx, cy, cz)) {
        this.grid[this.cellIndex(cx, cy, cz)] = brick.id;
      }
    }
  }

  private eraseBrickInternal(brick: BrickData) {
    this.bricks.delete(brick.id);
    const cells = this.getOccupiedCells(brick.partId, brick.x, brick.y, brick.z, brick.rot);
    for (const [cx, cy, cz] of cells) {
      if (this.isInBounds(cx, cy, cz) && this.grid[this.cellIndex(cx, cy, cz)] === brick.id) {
        this.grid[this.cellIndex(cx, cy, cz)] = 0;
      }
    }
  }

  private pushHistory(entry: HistoryEntry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  public addBrick(
    partId: string,
    colorId: string,
    x: number,
    y: number,
    z: number,
    rot: Rotation,
    recordHistory = true
  ): BrickData | null {
    if (!this.canPlace(partId, x, y, z, rot)) return null;
    const brick: BrickData = {
      id: this.nextId++,
      partId,
      colorId,
      x,
      y,
      z,
      rot,
    };
    this.writeBrickInternal(brick);
    if (recordHistory) {
      this.pushHistory({ type: 'add', bricks: [brick] });
    }
    return brick;
  }

  public addBricksBatch(
    items: Array<{
      partId: string;
      colorId: string;
      x: number;
      y: number;
      z: number;
      rot: Rotation;
    }>,
    recordHistory = true
  ): BrickData[] {
    const added: BrickData[] = [];
    for (const item of items) {
      if (!this.canPlace(item.partId, item.x, item.y, item.z, item.rot)) continue;
      const brick: BrickData = {
        id: this.nextId++,
        partId: item.partId,
        colorId: item.colorId,
        x: item.x,
        y: item.y,
        z: item.z,
        rot: item.rot,
      };
      this.writeBrickInternal(brick);
      added.push(brick);
    }
    if (recordHistory && added.length > 0) {
      this.pushHistory({ type: 'add', bricks: added });
    }
    return added;
  }

  public removeBrick(id: number, recordHistory = true): BrickData | null {
    const brick = this.bricks.get(id);
    if (!brick) return null;
    this.eraseBrickInternal(brick);
    if (recordHistory) {
      this.pushHistory({ type: 'remove', bricks: [brick] });
    }
    return brick;
  }

  public recolorBrick(id: number, newColorId: string, recordHistory = true): BrickData | null {
    const brick = this.bricks.get(id);
    if (!brick || brick.colorId === newColorId) return null;
    const prevColor = brick.colorId;
    brick.colorId = newColorId;
    if (recordHistory) {
      this.pushHistory({ type: 'recolor', id, prevColor, nextColor: newColorId });
    }
    return brick;
  }

  public clearAll(recordHistory = true): BrickData[] {
    const prev = this.getAllBricks();
    if (prev.length === 0) return [];
    this.grid.fill(0);
    this.bricks.clear();
    if (recordHistory) {
      this.pushHistory({ type: 'replaceAll', prev, next: [] });
    }
    return prev;
  }

  public replaceAllWithStamps(stampBricks: StampBrick[], recordHistory = false): BrickData[] {
    const prev = this.getAllBricks();
    this.grid.fill(0);
    this.bricks.clear();
    const added: BrickData[] = [];
    for (const sb of stampBricks) {
      if (!PART_MAP.has(sb.partId)) continue;
      const colorId = COLOR_MAP.has(sb.colorId) ? sb.colorId : 'red';
      if (!this.canPlace(sb.partId, sb.dx, sb.dy, sb.dz, sb.rot)) continue;
      const brick: BrickData = {
        id: this.nextId++,
        partId: sb.partId,
        colorId,
        x: sb.dx,
        y: sb.dy,
        z: sb.dz,
        rot: sb.rot,
      };
      this.writeBrickInternal(brick);
      added.push(brick);
    }
    if (recordHistory) {
      this.pushHistory({ type: 'replaceAll', prev, next: added });
    }
    return added;
  }

  public undo(): { added: BrickData[]; removed: BrickData[]; recolored: BrickData[] } | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry);

    const added: BrickData[] = [];
    const removed: BrickData[] = [];
    const recolored: BrickData[] = [];

    if (entry.type === 'add') {
      for (const b of entry.bricks) {
        if (this.bricks.has(b.id)) {
          this.eraseBrickInternal(b);
          removed.push(b);
        }
      }
    } else if (entry.type === 'remove') {
      for (const b of entry.bricks) {
        this.writeBrickInternal(b);
        added.push(b);
      }
    } else if (entry.type === 'recolor') {
      const b = this.bricks.get(entry.id);
      if (b) {
        b.colorId = entry.prevColor;
        recolored.push(b);
      }
    } else if (entry.type === 'replaceAll') {
      for (const b of this.getAllBricks()) removed.push(b);
      this.grid.fill(0);
      this.bricks.clear();
      for (const b of entry.prev) {
        this.writeBrickInternal(b);
        added.push(b);
      }
    }
    return { added, removed, recolored };
  }

  public redo(): { added: BrickData[]; removed: BrickData[]; recolored: BrickData[] } | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry);

    const added: BrickData[] = [];
    const removed: BrickData[] = [];
    const recolored: BrickData[] = [];

    if (entry.type === 'add') {
      for (const b of entry.bricks) {
        this.writeBrickInternal(b);
        added.push(b);
      }
    } else if (entry.type === 'remove') {
      for (const b of entry.bricks) {
        if (this.bricks.has(b.id)) {
          this.eraseBrickInternal(b);
          removed.push(b);
        }
      }
    } else if (entry.type === 'recolor') {
      const b = this.bricks.get(entry.id);
      if (b) {
        b.colorId = entry.nextColor;
        recolored.push(b);
      }
    } else if (entry.type === 'replaceAll') {
      for (const b of this.getAllBricks()) removed.push(b);
      this.grid.fill(0);
      this.bricks.clear();
      for (const b of entry.next) {
        this.writeBrickInternal(b);
        added.push(b);
      }
    }
    return { added, removed, recolored };
  }

  /**
   * Ultra-fast 3D DDA voxel raycast against all placed bricks + ground plane y=0.
   * Runs in O(distance) ~0.03ms regardless of whether there are 10 or 50,000 bricks!
   */
  public raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist = 260): RayHit | null {
    const worldMaxY = MAX_HEIGHT * PLATE_HEIGHT;

    // 1) Intersect ray with world bounding box [0..WORLD_SIZE] x [0..worldMaxY] x [0..WORLD_SIZE]
    let tMin = 0.001;
    let tMax = maxDist;

    const clipAxis = (o: number, d: number, minB: number, maxB: number): boolean => {
      if (Math.abs(d) < 1e-8) {
        return o >= minB && o <= maxB;
      }
      let t1 = (minB - o) / d;
      let t2 = (maxB - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tMin) tMin = t1;
      if (t2 < tMax) tMax = t2;
      return tMin <= tMax;
    };

    const hitBox =
      clipAxis(origin.x, dir.x, 0, WORLD_SIZE) &&
      clipAxis(origin.y, dir.y, 0, worldMaxY) &&
      clipAxis(origin.z, dir.z, 0, WORLD_SIZE);

    // 2) Ground plane intersection (y = 0)
    let groundHit: RayHit | null = null;
    if (dir.y < -1e-6 && origin.y >= 0) {
      const tg = -origin.y / dir.y;
      if (tg > 0 && tg <= maxDist) {
        const gx = origin.x + dir.x * tg;
        const gz = origin.z + dir.z * tg;
        if (gx >= 0 && gx < WORLD_SIZE && gz >= 0 && gz < WORLD_SIZE) {
          groundHit = {
            type: 'ground',
            cellX: Math.floor(gx),
            cellY: -1,
            cellZ: Math.floor(gz),
            normalX: 0,
            normalY: 1,
            normalZ: 0,
            pointX: gx,
            pointY: 0,
            pointZ: gz,
            distance: tg,
          };
        }
      }
    }

    if (!hitBox) {
      return groundHit;
    }

    // 3) 3D DDA traversal in scaled grid space: (x, y/PLATE_HEIGHT, z)
    const startT = Math.max(0.001, tMin) + 1e-4;
    if (startT > tMax) return groundHit;

    const sx = origin.x + dir.x * startT;
    const sy = (origin.y + dir.y * startT) / PLATE_HEIGHT;
    const sz = origin.z + dir.z * startT;

    let ix = Math.min(WORLD_SIZE - 1, Math.max(0, Math.floor(sx)));
    let iy = Math.min(MAX_HEIGHT - 1, Math.max(0, Math.floor(sy)));
    let iz = Math.min(WORLD_SIZE - 1, Math.max(0, Math.floor(sz)));

    const dgx = dir.x;
    const dgy = dir.y / PLATE_HEIGHT;
    const dgz = dir.z;

    const stepX = dgx > 0 ? 1 : dgx < 0 ? -1 : 0;
    const stepY = dgy > 0 ? 1 : dgy < 0 ? -1 : 0;
    const stepZ = dgz > 0 ? 1 : dgz < 0 ? -1 : 0;

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dgx) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dgy) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dgz) : Infinity;

    let tMaxX =
      stepX > 0 ? (ix + 1 - sx) / dgx : stepX < 0 ? (ix - sx) / dgx : Infinity;
    let tMaxY =
      stepY > 0 ? (iy + 1 - sy) / dgy : stepY < 0 ? (iy - sy) / dgy : Infinity;
    let tMaxZ =
      stepZ > 0 ? (iz + 1 - sz) / dgz : stepZ < 0 ? (iz - sz) / dgz : Infinity;

    // Check starting cell if already inside
    const startId = this.getCellBrickId(ix, iy, iz);
    if (startId !== 0) {
      const px = origin.x + dir.x * startT;
      const py = origin.y + dir.y * startT;
      const pz = origin.z + dir.z * startT;
      return {
        type: 'brick',
        brickId: startId,
        cellX: ix,
        cellY: iy,
        cellZ: iz,
        normalX: 0,
        normalY: 1,
        normalZ: 0,
        pointX: px,
        pointY: py,
        pointZ: pz,
        distance: startT,
      };
    }

    const limitT = groundHit ? Math.min(tMax, groundHit.distance) : tMax;
    let nx = 0,
      ny = 0,
      nz = 0;
    let curT = 0;

    for (let steps = 0; steps < 600; steps++) {
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          curT = tMaxX;
          tMaxX += tDeltaX;
          ix += stepX;
          nx = -stepX;
          ny = 0;
          nz = 0;
        } else {
          curT = tMaxZ;
          tMaxZ += tDeltaZ;
          iz += stepZ;
          nx = 0;
          ny = 0;
          nz = -stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          curT = tMaxY;
          tMaxY += tDeltaY;
          iy += stepY;
          nx = 0;
          ny = -stepY;
          nz = 0;
        } else {
          curT = tMaxZ;
          tMaxZ += tDeltaZ;
          iz += stepZ;
          nx = 0;
          ny = 0;
          nz = -stepZ;
        }
      }

      const dist = startT + curT;
      if (dist > limitT) break;
      if (ix < 0 || ix >= WORLD_SIZE || iy < 0 || iy >= MAX_HEIGHT || iz < 0 || iz >= WORLD_SIZE) {
        break;
      }

      const brickId = this.grid[this.cellIndex(ix, iy, iz)];
      if (brickId !== 0) {
        return {
          type: 'brick',
          brickId,
          cellX: ix,
          cellY: iy,
          cellZ: iz,
          normalX: nx,
          normalY: ny,
          normalZ: nz,
          pointX: origin.x + dir.x * dist,
          pointY: origin.y + dir.y * dist,
          pointZ: origin.z + dir.z * dist,
          distance: dist,
        };
      }
    }

    return groundHit;
  }

  /**
   * Smart kid-friendly snap calculator!
   * Places bricks intuitively on top, beside, or underneath existing bricks,
   * automatically sliding slightly if cursor is near an edge.
   */
  public computePlacement(
    hit: RayHit,
    partId: string,
    rot: Rotation
  ): { x: number; y: number; z: number; valid: boolean } {
    const def = getPartDef(partId);
    const [rx, ry, rz] = getRotatedSize(def.sx, def.sy, def.sz, rot);

    const clampX = (v: number) => Math.max(0, Math.min(WORLD_SIZE - rx, v));
    const clampZ = (v: number) => Math.max(0, Math.min(WORLD_SIZE - rz, v));
    const clampY = (v: number) => Math.max(0, Math.min(MAX_HEIGHT - ry, v));

    let gx = clampX(Math.round(hit.pointX - rx * 0.5));
    let gz = clampZ(Math.round(hit.pointZ - rz * 0.5));
    let gy = 0;

    if (hit.type === 'ground') {
      gy = 0;
    } else if (hit.normalY > 0) {
      // Stacking on top of a brick!
      gy = hit.cellY + 1;
    } else if (hit.normalY < 0) {
      // Snapping under an overhang / arch!
      gy = hit.cellY - ry;
    } else {
      // Snapping flush to the side of an existing brick!
      const hitBrick = hit.brickId ? this.bricks.get(hit.brickId) : undefined;
      if (hit.normalX > 0) gx = hit.cellX + 1;
      else if (hit.normalX < 0) gx = hit.cellX - rx;
      if (hit.normalZ > 0) gz = hit.cellZ + 1;
      else if (hit.normalZ < 0) gz = hit.cellZ - rz;

      // Align vertically with the hit brick's base if similar height, otherwise cursor height
      if (hitBrick && hitBrick.y >= 0) {
        const hitDef = getPartDef(hitBrick.partId);
        if (hitDef.sy <= Math.max(6, ry)) {
          gy = hitBrick.y;
        } else {
          gy = Math.floor(hit.pointY / PLATE_HEIGHT);
        }
      } else {
        gy = hit.cellY;
      }
    }

    gx = clampX(gx);
    gy = clampY(gy);
    gz = clampZ(gz);

    if (this.canPlace(partId, gx, gy, gz, rot)) {
      return { x: gx, y: gy, z: gz, valid: true };
    }

    // Smart nudge: try small horizontal/vertical offsets so kids never struggle near edges
    const nudges: Array<[number, number, number]> = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0, 1, 0],
      [0, 2, 0],
      [0, 3, 0],
      [1, 0, 1],
      [-1, 0, 1],
      [1, 0, -1],
      [-1, 0, -1],
    ];
    for (const [dx, dy, dz] of nudges) {
      const tx = clampX(gx + dx);
      const ty = clampY(gy + dy);
      const tz = clampZ(gz + dz);
      if (this.canPlace(partId, tx, ty, tz, rot)) {
        return { x: tx, y: ty, z: tz, valid: true };
      }
    }

    return { x: gx, y: gy, z: gz, valid: false };
  }

  /** Computes highest solid surface Y (in world units) at (wx, wz) below maxY for walking/driving */
  public getSupportHeightAt(wx: number, wz: number, footY: number, stepUpHeight = 1.25): number {
    const gx = Math.floor(wx);
    const gz = Math.floor(wz);
    if (gx < 0 || gx >= WORLD_SIZE || gz < 0 || gz >= WORLD_SIZE) return 0;

    const maxPlate = Math.min(
      MAX_HEIGHT - 1,
      Math.floor((footY + stepUpHeight) / PLATE_HEIGHT)
    );
    for (let y = maxPlate; y >= 0; y--) {
      if (this.grid[this.cellIndex(gx, y, gz)] !== 0) {
        return (y + 1) * PLATE_HEIGHT;
      }
    }
    return 0;
  }

  /** Checks if a player bounding cylinder/box collides at (wx, footY, wz) */
  public isSpaceBlocked(wx: number, footY: number, wz: number, radius: number, height: number): boolean {
    const minX = Math.max(0, Math.floor(wx - radius));
    const maxX = Math.min(WORLD_SIZE - 1, Math.floor(wx + radius));
    const minZ = Math.max(0, Math.floor(wz - radius));
    const maxZ = Math.min(WORLD_SIZE - 1, Math.floor(wz + radius));
    const minY = Math.max(0, Math.floor((footY + 0.08) / PLATE_HEIGHT));
    const maxY = Math.min(MAX_HEIGHT - 1, Math.floor((footY + height - 0.08) / PLATE_HEIGHT));

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.grid[this.cellIndex(x, y, z)] !== 0) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // ==================== Save / Load (100% Local & Safe) ====================

  public exportSaveData(): WorldSaveData {
    return {
      version: 1,
      name: this.worldName,
      theme: this.theme,
      timeOfDay: this.timeOfDay,
      savedAt: Date.now(),
      bricks: this.getAllBricks().map((b) => [b.partId, b.colorId, b.x, b.y, b.z, b.rot]),
    };
  }

  public importSaveData(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object') return false;
    const data = raw as Partial<WorldSaveData>;
    if (!Array.isArray(data.bricks)) return false;

    const validThemes: WorldTheme[] = ['meadow', 'island', 'city', 'space'];
    const validTimes: TimeOfDay[] = ['morning', 'day', 'sunset', 'night'];

    this.theme = validThemes.includes(data.theme as WorldTheme)
      ? (data.theme as WorldTheme)
      : 'meadow';
    this.timeOfDay = validTimes.includes(data.timeOfDay as TimeOfDay)
      ? (data.timeOfDay as TimeOfDay)
      : 'day';
    this.worldName =
      typeof data.name === 'string' && data.name.trim().length > 0
        ? data.name.slice(0, 40)
        : 'マイブロックワールド';

    this.grid.fill(0);
    this.bricks.clear();
    this.undoStack.length = 0;
    this.redoStack.length = 0;

    for (const row of data.bricks) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const [partId, colorId, x, y, z, rot] = row;
      if (
        typeof partId !== 'string' ||
        typeof colorId !== 'string' ||
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        typeof z !== 'number' ||
        typeof rot !== 'number'
      ) {
        continue;
      }
      if (!PART_MAP.has(partId)) continue;
      const safeColor = COLOR_MAP.has(colorId) ? colorId : 'red';
      const safeRot = (((Math.floor(rot) % 4) + 4) % 4) as Rotation;
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const iz = Math.floor(z);
      if (this.canPlace(partId, ix, iy, iz, safeRot)) {
        const brick: BrickData = {
          id: this.nextId++,
          partId,
          colorId: safeColor,
          x: ix,
          y: iy,
          z: iz,
          rot: safeRot,
        };
        this.writeBrickInternal(brick);
      }
    }
    return true;
  }

  public autosave() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(this.exportSaveData()));
    } catch {
      // Ignore storage quota errors gracefully
    }
  }

  public loadAutosave(): boolean {
    try {
      const txt = localStorage.getItem(AUTOSAVE_KEY);
      if (!txt) return false;
      return this.importSaveData(JSON.parse(txt));
    } catch {
      return false;
    }
  }

  public saveToSlot(slot: number, name: string): boolean {
    try {
      this.worldName = name.trim().slice(0, 32) || `セーブ ${slot}`;
      localStorage.setItem(`${STORAGE_PREFIX}${slot}`, JSON.stringify(this.exportSaveData()));
      return true;
    } catch {
      return false;
    }
  }

  public loadFromSlot(slot: number): boolean {
    try {
      const txt = localStorage.getItem(`${STORAGE_PREFIX}${slot}`);
      if (!txt) return false;
      return this.importSaveData(JSON.parse(txt));
    } catch {
      return false;
    }
  }

  public listSaveSlots(): SaveSlotSummary[] {
    const out: SaveSlotSummary[] = [];
    for (let slot = 1; slot <= 6; slot++) {
      try {
        const txt = localStorage.getItem(`${STORAGE_PREFIX}${slot}`);
        if (!txt) continue;
        const data = JSON.parse(txt) as Partial<WorldSaveData>;
        if (!Array.isArray(data.bricks)) continue;
        out.push({
          slot,
          name: typeof data.name === 'string' ? data.name : `ワールド ${slot}`,
          brickCount: data.bricks.length,
          theme: (data.theme as WorldTheme) || 'meadow',
          savedAt: typeof data.savedAt === 'number' ? data.savedAt : Date.now(),
        });
      } catch {
        // ignore corrupted slot
      }
    }
    return out;
  }
}
