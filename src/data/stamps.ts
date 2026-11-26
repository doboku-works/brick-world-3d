import { getPartDef } from './parts';
import { getRotatedSize, rotateLocalCell } from '../types';
import type { Rotation, StampBrick, StampDef } from '../types';

/**
 * Helper builder that guarantees zero overlapping bricks inside every stamp!
 */
class StampBuilder {
  private bricks: StampBrick[] = [];
  private occupied = new Set<string>();

  add(
    partId: string,
    colorId: string,
    dx: number,
    dy: number,
    dz: number,
    rot: Rotation = 0
  ): this {
    const def = getPartDef(partId);
    const cells: string[] = [];
    const fp = def.footprint;
    if (fp) {
      for (const [lx, lz] of fp) {
        const [rx, rz] = rotateLocalCell(lx, lz, def.sx, def.sz, rot);
        for (let y = 0; y < def.sy; y++) {
          cells.push(`${dx + rx},${dy + y},${dz + rz}`);
        }
      }
    } else {
      const [rx, ry, rz] = getRotatedSize(def.sx, def.sy, def.sz, rot);
      for (let x = 0; x < rx; x++) {
        for (let y = 0; y < ry; y++) {
          for (let z = 0; z < rz; z++) {
            cells.push(`${dx + x},${dy + y},${dz + z}`);
          }
        }
      }
    }
    for (const key of cells) {
      if (this.occupied.has(key)) {
        // Skip silently if overlapping so stamp is always 100% valid
        return this;
      }
    }
    for (const key of cells) this.occupied.add(key);
    this.bricks.push({ partId, colorId, dx, dy, dz, rot });
    return this;
  }

  build(): StampBrick[] {
    // Normalize so min dx=0, min dy=0, min dz=0
    if (this.bricks.length === 0) return [];
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    for (const b of this.bricks) {
      if (b.dx < minX) minX = b.dx;
      if (b.dy < minY) minY = b.dy;
      if (b.dz < minZ) minZ = b.dz;
    }
    return this.bricks.map((b) => ({
      ...b,
      dx: b.dx - minX,
      dy: b.dy - minY,
      dz: b.dz - minZ,
    }));
  }
}

function buildCuteHouse(): StampBrick[] {
  const b = new StampBuilder();
  // Base foundation plates 8 x 8
  b.add('plate_4x4', 'light_gray', 0, 0, 0, 0);
  b.add('plate_4x4', 'light_gray', 4, 0, 0, 0);
  b.add('plate_4x4', 'light_gray', 0, 0, 4, 0);
  b.add('plate_4x4', 'light_gray', 4, 0, 4, 0);

  // Walls: y=1..6 (2 standard bricks high = 6 plates)
  // Front wall (z=7): door in middle (x=3..5) - door_1x3 has sx=1, sz=3 -> rot=1 makes rx=3, rz=1!
  b.add('door_1x3', 'brown', 2, 1, 7, 1);
  b.add('brick_1x2', 'white', 0, 1, 7, 1);
  b.add('brick_1x2', 'white', 0, 4, 7, 1);
  b.add('window_1x2', 'sky', 5, 1, 7, 1); // rot=1 -> rx=2, rz=1
  b.add('brick_1x2', 'white', 5, 4, 7, 1);
  b.add('brick_1x1', 'white', 7, 1, 7, 0);
  b.add('brick_1x1', 'white', 7, 4, 7, 0);

  // Back wall (z=0): 8 wide
  b.add('brick_1x2', 'white', 0, 1, 0, 1);
  b.add('brick_1x2', 'white', 0, 4, 0, 1);
  b.add('window_1x4', 'white', 2, 1, 0, 1); // rot=1 -> rx=4, rz=1, sy=6
  b.add('brick_1x2', 'white', 6, 1, 0, 1);
  b.add('brick_1x2', 'white', 6, 4, 0, 1);

  // Left wall (x=0, z=1..6)
  b.add('brick_1x6', 'white', 0, 1, 1, 0);
  b.add('brick_1x2', 'white', 0, 4, 1, 0);
  b.add('window_1x2', 'white', 0, 4, 3, 0);
  b.add('brick_1x2', 'white', 0, 4, 5, 0);

  // Right wall (x=7, z=1..6)
  b.add('brick_1x6', 'white', 7, 1, 1, 0);
  b.add('brick_1x2', 'white', 7, 4, 1, 0);
  b.add('window_1x2', 'white', 7, 4, 3, 0);
  b.add('brick_1x2', 'white', 7, 4, 5, 0);

  // Interior warm lamp so house glows warmly at night!
  b.add('lamp_2x2', 'glow_yellow', 3, 1, 3, 0);

  // Gable roof layers (red slopes sloping toward +Z and -Z)
  // Layer 1 (y=7): z=0..1 slope facing -Z (rot=2), z=6..7 slope facing +Z (rot=0)
  for (let x = 0; x < 8; x += 2) {
    b.add('slope_2x2', 'red', x, 7, 0, 2);
    b.add('slope_2x2', 'red', x, 7, 6, 0);
  }
  // Fill gable ends at x=0 and x=7 (z=2..5)
  b.add('brick_1x4', 'tan', 0, 7, 2, 0);
  b.add('brick_1x4', 'tan', 7, 7, 2, 0);

  // Layer 2 (y=10): z=1..2 (rot=2), z=5..6 (rot=0)
  for (let x = 0; x < 8; x += 2) {
    b.add('slope_2x2', 'red', x, 10, 1, 2);
    b.add('slope_2x2', 'red', x, 10, 5, 0);
  }
  b.add('brick_1x2', 'tan', 0, 10, 3, 0);
  b.add('brick_1x2', 'tan', 7, 10, 3, 0);

  // Layer 3 (y=13): z=2..3 (rot=2), z=4..5 (rot=0)
  for (let x = 0; x < 8; x += 2) {
    b.add('slope_2x2', 'red', x, 13, 2, 2);
    b.add('slope_2x2', 'red', x, 13, 4, 0);
  }
  // Roof ridge tiles
  b.add('tile_2x4', 'dark_red', 0, 16, 3, 1);
  b.add('tile_2x4', 'dark_red', 4, 16, 3, 1);

  // Chimney
  b.add('brick_1x1', 'brown', 6, 13, 1, 0);
  b.add('brick_1x1', 'brown', 6, 16, 1, 0);

  // Cute front doorstep & grounded flowers by the front door!
  b.add('plate_1x2', 'tan', 3, 0, 8, 1);
  b.add('flower_1x1', 'pink', 1, 0, 8, 0);
  b.add('flower_1x1', 'yellow', 6, 0, 8, 0);

  return b.build();
}

function buildSportsCar(): StampBrick[] {
  const b = new StampBuilder();
  // Facing +Z (front at z=7, back at z=0), 4 studs wide (x=0..3) - zero overlaps!
  b.add('wheel_axle_2x4', 'dark_gray', 0, 0, 1, 0);
  b.add('wheel_axle_2x4', 'dark_gray', 0, 0, 5, 0);
  // Lower chassis bridge between wheels (y=1..2)
  b.add('plate_2x4', 'dark_gray', 0, 1, 3, 1);
  b.add('plate_2x4', 'red', 0, 2, 3, 1);
  // Front bumper & rear bumper at y=2
  b.add('plate_1x2', 'red', 1, 2, 7, 1);
  b.add('plate_1x2', 'red', 1, 2, 0, 1);
  // Headlights (front z=7) & taillights (rear z=0) at y=2
  b.add('cyl_1x1_plate', 'glow_yellow', 0, 2, 7, 0);
  b.add('cyl_1x1_plate', 'glow_yellow', 3, 2, 7, 0);
  b.add('cyl_1x1_plate', 'trans_red', 0, 2, 0, 0);
  b.add('cyl_1x1_plate', 'trans_red', 3, 2, 0, 0);
  // Full continuous body deck at y=3!
  b.add('plate_4x4', 'red', 0, 3, 0, 0);
  b.add('plate_4x4', 'red', 0, 3, 4, 0);
  // Sloped aerodynamic hood at front (z=6..7)
  b.add('slope_2x2', 'red', 0, 4, 6, 0);
  b.add('slope_2x2', 'red', 2, 4, 6, 0);
  // Windshield (z=4..5, faces +Z)
  b.add('windshield_2x4', 'red', 0, 4, 4, 0);
  // Cabin roof & back
  b.add('brick_2x4', 'red', 0, 4, 2, 1);
  b.add('tile_2x4', 'white', 0, 7, 2, 1);
  // Racing rear spoiler
  b.add('brick_1x1', 'black', 0, 4, 0, 0);
  b.add('brick_1x1', 'black', 3, 4, 0, 0);
  b.add('tile_1x2', 'red', 0, 7, 0, 1);
  b.add('tile_1x2', 'red', 2, 7, 0, 1);
  return b.build();
}

function buildPoliceCar(): StampBrick[] {
  const b = new StampBuilder();
  b.add('wheel_axle_2x4', 'black', 0, 0, 1, 0);
  b.add('wheel_axle_2x4', 'black', 0, 0, 5, 0);
  b.add('plate_2x4', 'black', 0, 1, 3, 1);
  b.add('plate_2x4', 'white', 0, 2, 3, 1);
  b.add('plate_1x2', 'black', 1, 2, 7, 1);
  b.add('plate_1x2', 'black', 1, 2, 0, 1);
  b.add('cyl_1x1_plate', 'glow_yellow', 0, 2, 7, 0);
  b.add('cyl_1x1_plate', 'glow_yellow', 3, 2, 7, 0);
  b.add('cyl_1x1_plate', 'trans_red', 0, 2, 0, 0);
  b.add('cyl_1x1_plate', 'trans_red', 3, 2, 0, 0);
  b.add('plate_4x4', 'black', 0, 3, 0, 0);
  b.add('plate_4x4', 'white', 0, 3, 4, 0);
  b.add('slope_2x2', 'white', 0, 4, 6, 0);
  b.add('slope_2x2', 'white', 2, 4, 6, 0);
  b.add('windshield_2x4', 'white', 0, 4, 4, 0);
  b.add('brick_2x4', 'white', 0, 4, 2, 1);
  b.add('brick_2x4', 'black', 0, 4, 0, 1);
  // Siren lights on roof!
  b.add('lamp_1x1', 'trans_red', 1, 7, 2, 0);
  b.add('lamp_1x1', 'glow_cyan', 2, 7, 2, 0);
  return b.build();
}

function buildTruck(): StampBrick[] {
  const b = new StampBuilder();
  // Big cargo truck 4 wide x 10 long
  b.add('wheel_axle_2x4', 'dark_gray', 0, 0, 1, 0);
  b.add('wheel_axle_2x4', 'dark_gray', 0, 0, 4, 0);
  b.add('wheel_axle_2x4', 'dark_gray', 0, 0, 8, 0);
  // Flatbed frame
  b.add('plate_4x4', 'dark_gray', 0, 3, 0, 0);
  b.add('plate_4x4', 'dark_gray', 0, 3, 4, 0);
  b.add('plate_2x4', 'dark_gray', 0, 3, 8, 1);
  // Cab at front (z=6..9)
  b.add('brick_2x4', 'orange', 0, 4, 6, 1);
  b.add('brick_2x4', 'orange', 0, 4, 8, 1);
  b.add('windshield_2x4', 'orange', 0, 7, 7, 0);
  b.add('brick_1x4', 'orange', 0, 7, 6, 1);
  b.add('tile_2x4', 'white', 0, 10, 6, 1);
  // Cargo bed side walls (z=0..5)
  b.add('brick_1x6', 'blue', 0, 4, 0, 0);
  b.add('brick_1x6', 'blue', 3, 4, 0, 0);
  b.add('brick_1x2', 'blue', 1, 4, 0, 1);
  // Colorful cargo blocks inside!
  b.add('brick_2x2', 'yellow', 1, 4, 1, 0);
  b.add('brick_2x2', 'green', 1, 4, 3, 0);
  b.add('chest_2x2', 'brown', 1, 7, 2, 0);
  return b.build();
}

function buildRocket(): StampBrick[] {
  const b = new StampBuilder();
  // 4-legged red thruster fins around central 2x2 core
  b.add('jet_1x2', 'dark_gray', 2, 0, 0, 2);
  b.add('jet_1x2', 'dark_gray', 2, 0, 4, 0);
  b.add('jet_1x2', 'dark_gray', 0, 0, 2, 1);
  b.add('jet_1x2', 'dark_gray', 4, 0, 2, 3);

  // Core rocket fuselage (x=2..3, z=2..3)
  b.add('cyl_2x2', 'dark_gray', 2, 0, 2, 0);
  b.add('cyl_2x2', 'red', 2, 3, 2, 0);
  b.add('cyl_2x2', 'white', 2, 6, 2, 0);
  b.add('cyl_2x2', 'white', 2, 9, 2, 0);
  b.add('cyl_2x2', 'blue', 2, 12, 2, 0);
  b.add('cyl_2x2', 'white', 2, 15, 2, 0);
  b.add('cone_2x2', 'red', 2, 18, 2, 0);
  b.add('cone_1x1', 'gold', 2, 22, 2, 0);

  // Side boosters
  b.add('slope_1x2', 'red', 2, 3, 0, 2);
  b.add('slope_1x2', 'red', 2, 3, 4, 0);
  b.add('slope_1x2', 'red', 0, 3, 2, 1);
  b.add('slope_1x2', 'red', 4, 3, 2, 3);
  return b.build();
}

function buildCastleTower(): StampBrick[] {
  const b = new StampBuilder();
  // 6x6 medieval castle gate tower!
  // Front & back arches (z=0 and z=5) -> arch_1x6 rot=1 => rx=6, rz=1, sy=5
  b.add('arch_1x6', 'light_gray', 0, 0, 5, 1);
  b.add('arch_1x6', 'light_gray', 0, 0, 0, 1);
  // Side walls (x=0 and x=5, z=1..4)
  b.add('brick_1x4', 'light_gray', 0, 0, 1, 0);
  b.add('brick_1x4', 'light_gray', 5, 0, 1, 0);
  b.add('brick_1x4', 'dark_gray', 0, 3, 1, 0);
  b.add('brick_1x4', 'dark_gray', 5, 3, 1, 0);

  // Upper level floor at y=5..6
  b.add('plate_1x2', 'dark_gray', 0, 5, 0, 1);
  b.add('plate_1x2', 'dark_gray', 2, 5, 0, 1);
  b.add('plate_1x2', 'dark_gray', 4, 5, 0, 1);
  b.add('plate_1x2', 'dark_gray', 0, 5, 5, 1);
  b.add('plate_1x2', 'dark_gray', 2, 5, 5, 1);
  b.add('plate_1x2', 'dark_gray', 4, 5, 5, 1);

  // Tower mid section (y=6..14)
  for (let y = 6; y <= 12; y += 3) {
    const col = y === 9 ? 'dark_gray' : 'light_gray';
    b.add('brick_1x6', col, 0, y, 0, 1);
    b.add('brick_1x6', col, 0, y, 5, 1);
    b.add('brick_1x4', col, 0, y, 1, 0);
    b.add('brick_1x4', col, 5, y, 1, 0);
  }
  // Floor deck at top (y=15)
  b.add('plate_4x4', 'dark_gray', 1, 15, 1, 0);

  // Battlements (crenellations) at y=15
  const crens: Array<[number, number]> = [
    [0, 0], [2, 0], [4, 0], [5, 0],
    [0, 2], [5, 2], [0, 4], [5, 4],
    [0, 5], [2, 5], [4, 5], [5, 5],
  ];
  for (const [cx, cz] of crens) {
    b.add('brick_1x1', 'light_gray', cx, 15, cz, 0);
  }
  // Royal spires & flags!
  b.add('cone_2x2', 'blue', 2, 16, 2, 0);
  b.add('flag_1x2', 'red', 0, 18, 0, 0);
  b.add('flag_1x2', 'yellow', 5, 18, 4, 0);
  // Grounded stone torch pillars flanking the castle gate!
  b.add('cyl_1x1', 'dark_gray', 0, 0, 6, 0);
  b.add('lamp_1x1', 'glow_yellow', 0, 3, 6, 0);
  b.add('cyl_1x1', 'dark_gray', 5, 0, 6, 0);
  b.add('lamp_1x1', 'glow_yellow', 5, 3, 6, 0);
  return b.build();
}

function buildGiantRobot(): StampBrick[] {
  const b = new StampBuilder();
  // Feet & legs (x=0..1 and x=4..5)
  b.add('brick_2x3', 'dark_gray', 0, 0, 0, 0);
  b.add('brick_2x3', 'dark_gray', 4, 0, 0, 0);
  b.add('brick_2x2', 'blue', 0, 3, 0, 0);
  b.add('brick_2x2', 'blue', 4, 3, 0, 0);
  b.add('brick_2x2', 'light_gray', 0, 6, 0, 0);
  b.add('brick_2x2', 'light_gray', 4, 6, 0, 0);
  // Pelvis
  b.add('brick_2x6', 'dark_gray', 0, 9, 0, 1);
  // Chest (4 wide)
  b.add('brick_2x4', 'red', 1, 12, 0, 1);
  b.add('brick_1x2', 'red', 1, 15, 0, 0);
  b.add('brick_1x2', 'red', 4, 15, 0, 0);
  b.add('lamp_2x2', 'glow_cyan', 2, 15, 0, 0); // Glowing energy core!
  b.add('brick_2x4', 'red', 1, 18, 0, 1);
  // Arms hanging from shoulders
  b.add('brick_1x2', 'yellow', 0, 18, 0, 0);
  b.add('brick_1x2', 'yellow', 5, 18, 0, 0);
  b.add('brick_1x2', 'light_gray', 0, 15, 0, 0);
  b.add('brick_1x2', 'light_gray', 5, 15, 0, 0);
  b.add('brick_1x2', 'dark_gray', 0, 12, 0, 0);
  b.add('brick_1x2', 'dark_gray', 5, 12, 0, 0);
  // Robot head & radar antenna!
  b.add('robot_head', 'silver', 2, 21, 0, 0);
  b.add('radar_2x2', 'yellow', 2, 24, 0, 0);
  return b.build();
}

function buildTrain(): StampBrick[] {
  const b = new StampBuilder();
  // Steam locomotive (4 wide x 10 long, facing +Z)
  b.add('wheel_axle_2x4', 'red', 0, 0, 1, 0);
  b.add('wheel_axle_2x4', 'red', 0, 0, 5, 0);
  b.add('wheel_axle_2x4', 'red', 0, 0, 8, 0);
  // Base deck
  b.add('plate_4x4', 'black', 0, 3, 0, 0);
  b.add('plate_4x4', 'black', 0, 3, 4, 0);
  b.add('plate_2x4', 'red', 0, 3, 8, 1);
  // Cowcatcher front slope
  b.add('slope_2x2', 'red', 0, 4, 8, 0);
  b.add('slope_2x2', 'red', 2, 4, 8, 0);
  // Boiler (cylinders / bricks z=4..7)
  b.add('brick_2x4', 'black', 1, 4, 4, 0);
  b.add('brick_2x4', 'black', 1, 7, 4, 0);
  b.add('cyl_2x2', 'black', 1, 10, 6, 0); // Smokestack
  b.add('lamp_1x1', 'glow_yellow', 1, 7, 8, 0); // Train headlamp
  // Driver cab (z=0..3)
  b.add('brick_1x4', 'green', 0, 4, 0, 0);
  b.add('brick_1x4', 'green', 3, 4, 0, 0);
  b.add('brick_1x2', 'green', 1, 4, 0, 1);
  b.add('window_1x2', 'yellow', 0, 7, 1, 0);
  b.add('window_1x2', 'yellow', 3, 7, 1, 0);
  b.add('brick_1x4', 'green', 0, 7, 3, 1);
  b.add('plate_4x4', 'red', 0, 10, 0, 0);
  return b.build();
}

function buildAirplane(): StampBrick[] {
  const b = new StampBuilder();
  // Cute propeller plane facing +Z with front & tail landing wheels!
  b.add('wheel_2x2', 'dark_gray', 4, 0, 6, 0);
  b.add('wheel_2x2', 'dark_gray', 4, 0, 1, 0);
  // Fuselage (x=4..5, z=1..8)
  b.add('brick_2x8', 'white', 4, 3, 1, 0);
  b.add('plate_2x4', 'blue', 4, 6, 1, 0);
  // Wings (left & right!)
  b.add('wing_2x4', 'white', 0, 5, 4, 2);
  b.add('wing_2x4', 'white', 6, 5, 4, 0);
  // Cockpit
  b.add('windshield_2x4', 'blue', 3, 6, 6, 0);
  // Tail fin
  b.add('slope_2x2', 'red', 4, 7, 1, 2);
  b.add('plate_2x4', 'red', 3, 6, 0, 1);
  // Top propeller on nose
  b.add('propeller_2x2', 'yellow', 4, 6, 8, 0);
  return b.build();
}

function buildArchBridge(): StampBrick[] {
  // Smooth walkable 4-wide bridge with gentle stepped approaches!
  const b = new StampBuilder();
  // Low approach stairs (y=0..2) -> mid stairs (y=3..5) -> deck (y=5)
  b.add('stairs_2x4', 'tan', 0, 0, 0, 2);
  b.add('stairs_2x4', 'tan', 2, 0, 0, 2);
  b.add('brick_2x2', 'light_gray', 0, 0, 4, 0);
  b.add('brick_2x2', 'light_gray', 2, 0, 4, 0);
  b.add('stairs_2x4', 'tan', 0, 3, 3, 2);
  b.add('stairs_2x4', 'tan', 2, 3, 3, 2);
  // Twin arches spanning z=6..11 (y=0..4)
  b.add('arch_1x6', 'light_gray', 0, 0, 6, 0);
  b.add('arch_1x6', 'light_gray', 3, 0, 6, 0);
  b.add('plate_4x4', 'dark_gray', 0, 5, 6, 0);
  b.add('plate_2x4', 'dark_gray', 0, 5, 10, 1);
  b.add('fence_1x4', 'white', 0, 6, 7, 0);
  b.add('fence_1x4', 'white', 3, 6, 7, 0);
  b.add('streetlight', 'dark_gray', 0, 6, 6, 0);
  b.add('streetlight', 'dark_gray', 3, 6, 11, 0);
  // Far side stairs descending cleanly!
  b.add('brick_2x2', 'light_gray', 0, 0, 12, 0);
  b.add('brick_2x2', 'light_gray', 2, 0, 12, 0);
  b.add('stairs_2x4', 'tan', 0, 3, 11, 0);
  b.add('stairs_2x4', 'tan', 2, 3, 11, 0);
  b.add('stairs_2x4', 'tan', 0, 0, 14, 0);
  b.add('stairs_2x4', 'tan', 2, 0, 14, 0);
  return b.build();
}

function buildLighthouse(): StampBrick[] {
  const b = new StampBuilder();
  // Rocky coastal base + red/white striped tower + bright glowing beacon!
  b.add('rock_2x2', 'dark_gray', 0, 0, 0, 0);
  b.add('rock_2x2', 'dark_gray', 2, 0, 0, 0);
  b.add('rock_2x2', 'dark_gray', 0, 0, 2, 0);
  b.add('rock_2x2', 'dark_gray', 2, 0, 2, 0);
  b.add('plate_4x4', 'light_gray', 0, 3, 0, 0);
  b.add('cyl_2x2', 'white', 1, 4, 1, 0);
  b.add('cyl_2x2', 'red', 1, 7, 1, 0);
  b.add('cyl_2x2', 'white', 1, 10, 1, 0);
  b.add('cyl_2x2', 'red', 1, 13, 1, 0);
  b.add('cyl_2x2', 'white', 1, 16, 1, 0);
  b.add('plate_4x4', 'dark_gray', 0, 19, 0, 0);
  b.add('lamp_2x2', 'glow_yellow', 1, 20, 1, 0);
  b.add('cone_2x2', 'red', 1, 23, 1, 0);
  return b.build();
}

function buildBigParkTree(): StampBrick[] {
  const b = new StampBuilder();
  b.add('cyl_2x2', 'brown', 2, 0, 2, 0);
  b.add('cyl_2x2', 'brown', 2, 3, 2, 0);
  b.add('plate_4x4', 'green', 1, 6, 1, 0);
  b.add('brick_2x4', 'green', 0, 7, 2, 0);
  b.add('brick_2x4', 'green', 4, 7, 2, 0);
  b.add('brick_2x4', 'green', 2, 7, 0, 1);
  b.add('brick_2x4', 'green', 2, 7, 4, 1);
  b.add('brick_2x2', 'dark_green', 2, 7, 2, 0);
  b.add('plate_4x4', 'lime', 1, 10, 1, 0);
  b.add('brick_2x2', 'lime', 2, 11, 2, 0);
  b.add('flower_1x1', 'red', 0, 0, 1, 0);
  b.add('flower_1x1', 'yellow', 5, 0, 4, 0);
  b.add('bush_2x2', 'dark_green', 4, 0, 0, 0);
  return b.build();
}

export const BUILTIN_STAMPS: StampDef[] = [
  {
    id: 'stamp_house',
    name: 'かわいいおうち',
    emoji: '🏠',
    category: 'building',
    description: 'あかいやねと ひかるおへやの おうち',
    bricks: buildCuteHouse(),
  },
  {
    id: 'stamp_castle',
    name: 'おしろのとう',
    emoji: '🏰',
    category: 'building',
    description: 'はたが はためく かっこいい おしろ！',
    bricks: buildCastleTower(),
  },
  {
    id: 'stamp_lighthouse',
    name: 'とうだい',
    emoji: '🗼',
    category: 'building',
    description: 'よるに ピカッとひかる うみの とうだい',
    bricks: buildLighthouse(),
  },
  {
    id: 'stamp_bridge',
    name: 'アーチばし',
    emoji: '🌉',
    category: 'building',
    description: 'がいとうつきの すてきな はし',
    bricks: buildArchBridge(),
  },
  {
    id: 'stamp_sportscar',
    name: 'スポーツカー',
    emoji: '🏎️',
    category: 'vehicle',
    description: 'あかくて はやい レーシングカー！',
    bricks: buildSportsCar(),
  },
  {
    id: 'stamp_police',
    name: 'パトカー',
    emoji: '🚓',
    category: 'vehicle',
    description: 'パトランプが ひかる パトカー！',
    bricks: buildPoliceCar(),
  },
  {
    id: 'stamp_truck',
    name: 'おおきなトラック',
    emoji: '🚚',
    category: 'vehicle',
    description: 'たからばこを つんだ トラック',
    bricks: buildTruck(),
  },
  {
    id: 'stamp_train',
    name: 'きかんしゃ',
    emoji: '🚂',
    category: 'vehicle',
    description: 'シュッシュッポッポ！くろい きかんしゃ',
    bricks: buildTrain(),
  },
  {
    id: 'stamp_airplane',
    name: 'ひこうき',
    emoji: '✈️',
    category: 'vehicle',
    description: 'プロペラの ついた そらとぶ ひこうき',
    bricks: buildAirplane(),
  },
  {
    id: 'stamp_rocket',
    name: 'うちゅうロケット',
    emoji: '🚀',
    category: 'fun',
    description: 'うちゅうへ とびだす おおきな ロケット！',
    bricks: buildRocket(),
  },
  {
    id: 'stamp_robot',
    name: 'きょだいロボ',
    emoji: '🤖',
    category: 'fun',
    description: 'むねが ひかる スーパーロボット！',
    bricks: buildGiantRobot(),
  },
  {
    id: 'stamp_bigtree',
    name: 'おおきなき',
    emoji: '🌳',
    category: 'nature',
    description: 'ブロックで できた もりのおおきなき',
    bricks: buildBigParkTree(),
  },
];

export function getStampById(id: string): StampDef | undefined {
  return BUILTIN_STAMPS.find((s) => s.id === id);
}

/**
 * Generates a welcoming starter plaza in the center of the 128x128 world
 * so kids immediately see a vibrant 3D block world with tons of open room to expand!
 */
export function buildStarterWorldBricks(): StampBrick[] {
  const b = new StampBuilder();
  const placeStamp = (stampId: string, ox: number, oy: number, oz: number) => {
    const st = getStampById(stampId);
    if (!st) return;
    for (const sb of st.bricks) {
      b.add(sb.partId, sb.colorId, ox + sb.dx, oy + sb.dy, oz + sb.dz, sb.rot);
    }
  };

  // Center around (64, 64) of the huge 128x128 baseplate
  placeStamp('stamp_house', 54, 0, 52);
  placeStamp('stamp_sportscar', 66, 0, 57);
  placeStamp('stamp_bigtree', 45, 0, 53);

  // Welcoming details around the house
  b.add('tree_2x2', 'green', 72, 0, 52, 0);
  b.add('tree_2x2', 'pink', 48, 0, 62, 0); // Cute cherry blossom tree!
  b.add('streetlight', 'dark_gray', 63, 0, 63, 0);
  b.add('figure', 'blue', 57, 0, 63, 0);
  b.add('figure', 'pink', 60, 0, 63, 0);
  b.add('pet_dog', 'tan', 59, 0, 65, 3);
  b.add('flower_1x1', 'red', 52, 0, 61, 0);
  b.add('flower_1x1', 'yellow', 53, 0, 62, 0);
  b.add('flower_1x1', 'purple', 65, 0, 54, 0);
  b.add('fence_1x4', 'white', 50, 0, 64, 1);
  b.add('fence_1x4', 'white', 66, 0, 66, 1);

  return b.build().map((sb) => ({
    ...sb,
    dx: sb.dx + 45,
    dz: sb.dz + 52,
  }));
}
