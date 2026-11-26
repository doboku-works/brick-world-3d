import type { PartCategory, PartDef } from '../types';

export interface CategoryInfo {
  id: PartCategory;
  name: string;
  icon: string;
}

export const PART_CATEGORIES: CategoryInfo[] = [
  { id: 'basic', name: 'きほん', icon: '🧱' },
  { id: 'plate', name: 'いた・タイル', icon: '⬜' },
  { id: 'slope', name: 'やね・かど', icon: '🏠' },
  { id: 'round', name: 'まる・はしら', icon: '⚪' },
  { id: 'house', name: 'いえ・まち', icon: '🚪' },
  { id: 'vehicle', name: 'のりもの', icon: '🚗' },
  { id: 'nature', name: 'しぜん', icon: '🌲' },
  { id: 'character', name: 'キャラ', icon: '🙂' },
];

export const PARTS: PartDef[] = [
  // Basic bricks (height = 3 plates)
  { id: 'brick_1x1', name: '1×1 ブロック', category: 'basic', sx: 1, sy: 3, sz: 1, hasTopStuds: true, previewColorId: 'red' },
  { id: 'brick_1x2', name: '1×2 ブロック', category: 'basic', sx: 1, sy: 3, sz: 2, hasTopStuds: true, previewColorId: 'blue' },
  { id: 'brick_1x3', name: '1×3 ブロック', category: 'basic', sx: 1, sy: 3, sz: 3, hasTopStuds: true, previewColorId: 'yellow' },
  { id: 'brick_1x4', name: '1×4 ブロック', category: 'basic', sx: 1, sy: 3, sz: 4, hasTopStuds: true, previewColorId: 'green' },
  { id: 'brick_1x6', name: '1×6 ブロック', category: 'basic', sx: 1, sy: 3, sz: 6, hasTopStuds: true, previewColorId: 'orange' },
  { id: 'brick_2x2', name: '2×2 ブロック', category: 'basic', sx: 2, sy: 3, sz: 2, hasTopStuds: true, previewColorId: 'red' },
  { id: 'brick_2x3', name: '2×3 ブロック', category: 'basic', sx: 2, sy: 3, sz: 3, hasTopStuds: true, previewColorId: 'sky' },
  { id: 'brick_2x4', name: '2×4 ブロック', category: 'basic', sx: 2, sy: 3, sz: 4, hasTopStuds: true, previewColorId: 'red' },
  { id: 'brick_2x6', name: '2×6 ブロック', category: 'basic', sx: 2, sy: 3, sz: 6, hasTopStuds: true, previewColorId: 'blue' },
  { id: 'brick_2x8', name: '2×8 ながい', category: 'basic', sx: 2, sy: 3, sz: 8, hasTopStuds: true, previewColorId: 'yellow' },
  {
    id: 'brick_corner',
    name: 'Lじブロック',
    category: 'basic',
    sx: 2,
    sy: 3,
    sz: 2,
    footprint: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    hasTopStuds: true,
    previewColorId: 'purple',
  },

  // Plates & Tiles (height = 1 plate)
  { id: 'plate_1x1', name: '1×1 プレート', category: 'plate', sx: 1, sy: 1, sz: 1, hasTopStuds: true, previewColorId: 'lime' },
  { id: 'plate_1x2', name: '1×2 プレート', category: 'plate', sx: 1, sy: 1, sz: 2, hasTopStuds: true, previewColorId: 'sky' },
  { id: 'plate_2x2', name: '2×2 プレート', category: 'plate', sx: 2, sy: 1, sz: 2, hasTopStuds: true, previewColorId: 'yellow' },
  { id: 'plate_2x4', name: '2×4 プレート', category: 'plate', sx: 2, sy: 1, sz: 4, hasTopStuds: true, previewColorId: 'green' },
  { id: 'plate_4x4', name: '4×4 プレート', category: 'plate', sx: 4, sy: 1, sz: 4, hasTopStuds: true, previewColorId: 'tan' },
  { id: 'tile_1x1', name: '1×1 タイル', category: 'plate', sx: 1, sy: 1, sz: 1, hasTopStuds: false, previewColorId: 'white' },
  { id: 'tile_1x2', name: '1×2 タイル', category: 'plate', sx: 1, sy: 1, sz: 2, hasTopStuds: false, previewColorId: 'pink' },
  { id: 'tile_2x2', name: '2×2 タイル', category: 'plate', sx: 2, sy: 1, sz: 2, hasTopStuds: false, previewColorId: 'light_gray' },
  { id: 'tile_2x4', name: '2×4 タイル', category: 'plate', sx: 2, sy: 1, sz: 4, hasTopStuds: false, previewColorId: 'dark_gray' },

  // Slopes, roofs & arches
  { id: 'slope_1x2', name: '1×2 やね', category: 'slope', sx: 1, sy: 3, sz: 2, hasTopStuds: false, previewColorId: 'red' },
  { id: 'slope_2x2', name: '2×2 やね', category: 'slope', sx: 2, sy: 3, sz: 2, hasTopStuds: false, previewColorId: 'red' },
  { id: 'slope_2x3', name: '2×3 ゆるやね', category: 'slope', sx: 2, sy: 3, sz: 3, hasTopStuds: false, previewColorId: 'orange' },
  { id: 'slope_2x4', name: '2×4 おおやね', category: 'slope', sx: 2, sy: 3, sz: 4, hasTopStuds: false, previewColorId: 'red' },
  { id: 'slope_corner', name: '2×2 かどやね', category: 'slope', sx: 2, sy: 3, sz: 2, hasTopStuds: false, previewColorId: 'red' },
  { id: 'slope_inv_1x2', name: 'さかさななめ', category: 'slope', sx: 1, sy: 3, sz: 2, hasTopStuds: true, previewColorId: 'light_gray' },
  { id: 'curve_1x2', name: '1×2 まるみ', category: 'slope', sx: 1, sy: 2, sz: 2, hasTopStuds: false, previewColorId: 'sky' },
  { id: 'curve_2x2', name: '2×2 まるやね', category: 'slope', sx: 2, sy: 3, sz: 2, hasTopStuds: false, previewColorId: 'blue' },
  { id: 'arch_1x4', name: '1×4 アーチ', category: 'slope', sx: 1, sy: 4, sz: 4, hasTopStuds: true, previewColorId: 'tan' },
  { id: 'arch_1x6', name: '1×6 おおアーチ', category: 'slope', sx: 1, sy: 5, sz: 6, hasTopStuds: true, previewColorId: 'light_gray' },
  { id: 'pyramid_2x2', name: '2×2 とんがり', category: 'slope', sx: 2, sy: 3, sz: 2, hasTopStuds: false, previewColorId: 'gold' },

  // Round & Pillars
  { id: 'cyl_1x1', name: '1×1 まる', category: 'round', sx: 1, sy: 3, sz: 1, hasTopStuds: true, previewColorId: 'yellow' },
  { id: 'cyl_1x1_plate', name: 'まるボタン', category: 'round', sx: 1, sy: 1, sz: 1, hasTopStuds: true, previewColorId: 'trans_yellow' },
  { id: 'cyl_2x2', name: '2×2 はしら', category: 'round', sx: 2, sy: 3, sz: 2, hasTopStuds: true, previewColorId: 'white' },
  { id: 'cone_1x1', name: '1×1 コーン', category: 'round', sx: 1, sy: 3, sz: 1, hasTopStuds: false, previewColorId: 'orange' },
  { id: 'cone_2x2', name: 'ロケットさき', category: 'round', sx: 2, sy: 4, sz: 2, hasTopStuds: false, previewColorId: 'red' },
  { id: 'dome_2x2', name: '2×2 ドーム', category: 'round', sx: 2, sy: 3, sz: 2, hasTopStuds: false, previewColorId: 'sky' },

  // House & City
  { id: 'window_1x2', name: 'ちいさなまど', category: 'house', sx: 1, sy: 3, sz: 2, hasTopStuds: true, previewColorId: 'white' },
  { id: 'window_1x4', name: 'おおきなまど', category: 'house', sx: 1, sy: 6, sz: 4, hasTopStuds: true, previewColorId: 'white' },
  { id: 'door_1x3', name: 'ドア', category: 'house', sx: 1, sy: 6, sz: 3, hasTopStuds: true, previewColorId: 'brown' },
  { id: 'fence_1x4', name: 'さく・フェンス', category: 'house', sx: 1, sy: 3, sz: 4, hasTopStuds: true, previewColorId: 'white' },
  { id: 'stairs_2x4', name: 'かいだん', category: 'house', sx: 2, sy: 3, sz: 4, hasTopStuds: false, previewColorId: 'tan' },
  { id: 'lamp_1x1', name: 'ひかるライト', category: 'house', sx: 1, sy: 3, sz: 1, hasTopStuds: true, alwaysGlow: true, previewColorId: 'glow_yellow' },
  { id: 'lamp_2x2', name: 'ひかるブロック', category: 'house', sx: 2, sy: 3, sz: 2, hasTopStuds: true, alwaysGlow: true, previewColorId: 'glow_cyan' },
  { id: 'streetlight', name: 'がいとう', category: 'house', sx: 1, sy: 9, sz: 1, hasTopStuds: false, alwaysGlow: true, previewColorId: 'dark_gray' },

  // Vehicles & Mecha
  { id: 'wheel_2x2', name: 'タイヤ', category: 'vehicle', sx: 2, sy: 3, sz: 2, hasTopStuds: true, previewColorId: 'red' },
  { id: 'wheel_axle_2x4', name: 'しゃりんセット', category: 'vehicle', sx: 4, sy: 3, sz: 2, hasTopStuds: true, previewColorId: 'light_gray' },
  { id: 'windshield_2x4', name: 'くるまガラス', category: 'vehicle', sx: 4, sy: 3, sz: 2, hasTopStuds: false, previewColorId: 'trans_blue' },
  { id: 'wing_2x4', name: 'つばさ', category: 'vehicle', sx: 4, sy: 1, sz: 2, hasTopStuds: true, previewColorId: 'white' },
  { id: 'jet_1x2', name: 'ジェット', category: 'vehicle', sx: 1, sy: 3, sz: 2, hasTopStuds: false, previewColorId: 'dark_gray' },
  { id: 'propeller_2x2', name: 'プロペラ', category: 'vehicle', sx: 2, sy: 2, sz: 2, hasTopStuds: false, previewColorId: 'yellow' },
  { id: 'radar_2x2', name: 'レーダー', category: 'vehicle', sx: 2, sy: 3, sz: 2, hasTopStuds: false, previewColorId: 'light_gray' },

  // Nature & Decoration
  { id: 'flower_1x1', name: 'おはな', category: 'nature', sx: 1, sy: 2, sz: 1, hasTopStuds: false, previewColorId: 'pink' },
  { id: 'bush_2x2', name: 'くさむら', category: 'nature', sx: 2, sy: 3, sz: 2, hasTopStuds: false, previewColorId: 'green' },
  { id: 'tree_2x2', name: 'き', category: 'nature', sx: 2, sy: 9, sz: 2, hasTopStuds: false, previewColorId: 'green' },
  { id: 'rock_2x2', name: 'いわ', category: 'nature', sx: 2, sy: 3, sz: 2, hasTopStuds: false, previewColorId: 'dark_gray' },
  { id: 'flag_1x2', name: 'はた', category: 'nature', sx: 1, sy: 6, sz: 2, hasTopStuds: false, previewColorId: 'red' },
  { id: 'chest_2x2', name: 'たからばこ', category: 'nature', sx: 2, sy: 3, sz: 2, hasTopStuds: false, previewColorId: 'brown' },

  // Characters & Friends
  { id: 'figure', name: 'にんぎょう', category: 'character', sx: 2, sy: 6, sz: 1, hasTopStuds: false, previewColorId: 'blue' },
  { id: 'pet_dog', name: 'ブロックいぬ', category: 'character', sx: 1, sy: 3, sz: 2, hasTopStuds: false, previewColorId: 'tan' },
  { id: 'robot_head', name: 'ロボのかお', category: 'character', sx: 2, sy: 3, sz: 2, hasTopStuds: true, previewColorId: 'silver' },
];

export const PART_MAP = new Map<string, PartDef>(PARTS.map((p) => [p.id, p]));

export function getPartDef(id: string): PartDef {
  return PART_MAP.get(id) ?? PARTS[0];
}
