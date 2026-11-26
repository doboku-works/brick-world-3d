import type { ColorDef } from '../types';

export const COLORS: ColorDef[] = [
  // Classic vivid toy-brick palette
  { id: 'red', name: 'あか', hex: '#D92B2B', kind: 'solid' },
  { id: 'dark_red', name: 'こいあか', hex: '#8E1B20', kind: 'solid' },
  { id: 'orange', name: 'オレンジ', hex: '#F97316', kind: 'solid' },
  { id: 'bright_orange', name: 'やまぶき', hex: '#F59E0B', kind: 'solid' },
  { id: 'yellow', name: 'きいろ', hex: '#FACC15', kind: 'solid' },
  { id: 'lime', name: 'きみどり', hex: '#84CC16', kind: 'solid' },
  { id: 'green', name: 'みどり', hex: '#22A048', kind: 'solid' },
  { id: 'dark_green', name: 'ふかみどり', hex: '#146B3A', kind: 'solid' },
  { id: 'mint', name: 'ミント', hex: '#2DD4BF', kind: 'solid' },
  { id: 'sky', name: 'みずいろ', hex: '#38BDF8', kind: 'solid' },
  { id: 'blue', name: 'あお', hex: '#1D63DC', kind: 'solid' },
  { id: 'dark_blue', name: 'こんいろ', hex: '#1E3A8A', kind: 'solid' },
  { id: 'purple', name: 'むらさき', hex: '#7C3AED', kind: 'solid' },
  { id: 'lavender', name: 'ラベンダー', hex: '#C084FC', kind: 'solid' },
  { id: 'pink', name: 'ピンク', hex: '#F472B6', kind: 'solid' },
  { id: 'magenta', name: 'マゼンタ', hex: '#DB2777', kind: 'solid' },

  // Neutrals & earth tones
  { id: 'white', name: 'しろ', hex: '#F8FAFC', kind: 'solid' },
  { id: 'light_gray', name: 'あかるいグレー', hex: '#CBD5E1', kind: 'solid' },
  { id: 'dark_gray', name: 'くらいグレー', hex: '#64748B', kind: 'solid' },
  { id: 'black', name: 'くろ', hex: '#1E242B', kind: 'solid' },
  { id: 'tan', name: 'ベージュ', hex: '#E5CFA0', kind: 'solid' },
  { id: 'brown', name: 'ちゃいろ', hex: '#9A5B32', kind: 'solid' },
  { id: 'dark_brown', name: 'こげちゃ', hex: '#5C3317', kind: 'solid' },

  // Metallic
  { id: 'gold', name: 'ゴールド', hex: '#EAB308', kind: 'metallic' },
  { id: 'silver', name: 'シルバー', hex: '#B8C4D0', kind: 'metallic' },

  // Transparent (clear bricks!)
  { id: 'trans_clear', name: 'クリアしろ', hex: '#E0F2FE', kind: 'transparent' },
  { id: 'trans_blue', name: 'クリアあお', hex: '#38BDF8', kind: 'transparent' },
  { id: 'trans_red', name: 'クリアあか', hex: '#F43F5E', kind: 'transparent' },
  { id: 'trans_yellow', name: 'クリアきいろ', hex: '#FDE047', kind: 'transparent' },
  { id: 'trans_green', name: 'クリアみどり', hex: '#4ADE80', kind: 'transparent' },

  // Glowing neon colors!
  { id: 'glow_yellow', name: 'ひかるきいろ', hex: '#FEF08A', kind: 'glow', emissive: '#FACC15' },
  { id: 'glow_cyan', name: 'ひかるみずいろ', hex: '#67E8F9', kind: 'glow', emissive: '#06B6D4' },
  { id: 'glow_pink', name: 'ひかるピンク', hex: '#F9A8D4', kind: 'glow', emissive: '#EC4899' },
];

export const COLOR_MAP = new Map<string, ColorDef>(COLORS.map((c) => [c.id, c]));

export function getColorDef(id: string): ColorDef {
  return COLOR_MAP.get(id) ?? COLORS[0];
}
