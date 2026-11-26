import type { MissionDef } from '../types';

export const MISSIONS: MissionDef[] = [
  {
    id: 'first_10',
    title: 'はじめてのけんちく',
    description: 'ブロックを ぜんぶで 50こ いじょう ならべよう！',
    icon: '🧱',
    check: (ctx) => ctx.bricks.length >= 50,
  },
  {
    id: 'tall_tower',
    title: 'そらまで とどく タワー',
    description: 'たかさ 24プレート（8だん）いじょうの たかいところに ブロックを おこう！',
    icon: '🗼',
    check: (ctx) => ctx.bricks.some((b) => b.y >= 24),
  },
  {
    id: 'colorful_world',
    title: 'にじいろ クリエイター',
    description: '8しゅるい いじょうの いろを つかって つくろう！',
    icon: '🌈',
    check: (ctx) => new Set(ctx.bricks.map((b) => b.colorId)).size >= 8,
  },
  {
    id: 'night_lights',
    title: 'よるの イルミネーション',
    description: 'じかんを「よる」にして ひかるライトか がいとうを おこう！',
    icon: '✨',
    check: (ctx) =>
      ctx.timeOfDay === 'night' &&
      ctx.bricks.some(
        (b) =>
          b.partId === 'lamp_1x1' ||
          b.partId === 'lamp_2x2' ||
          b.partId === 'streetlight' ||
          b.colorId.startsWith('glow_')
      ),
  },
  {
    id: 'stamp_master',
    title: 'はんこマスター',
    description: '「はんこ」をつかって たてものや のりものを おいてみよう！',
    icon: '🏗️',
    check: (ctx) => ctx.usedStamp,
  },
  {
    id: 'explorer',
    title: 'せかいを たんけんしよう',
    description: '「あそぶ」モードで にんぎょうに なって あるいてみよう！',
    icon: '🚶',
    check: (ctx) => ctx.usedExplore,
  },
  {
    id: 'driver',
    title: 'くるまで ドライブ！',
    description: '「あそぶ」モードで くるまに のって はしってみよう！',
    icon: '🏎️',
    check: (ctx) => ctx.usedCar,
  },
  {
    id: 'mega_builder',
    title: 'だいけんちくか！',
    description: 'ブロックを 200こ いじょう あつめて おおきなまちを つくろう！',
    icon: '👑',
    check: (ctx) => ctx.bricks.length >= 200,
  },
];
