export type Point = { s: number; lane: number; lift?: number };
export type Level = {
  id: number;
  season: string;
  name: string;
  idiom: string;
  collect: string;
  subtitle: string;
  music: string;
  difficulty: number;
  sky: string;
  rock: string;
  ground: string;
  foliage: string;
  length: number;
  bag: Point;
  words: Point[];
  decoys?: (Point & { text: string; correct: string; index: number })[];
  pits: number[];
  gates: number[];
  belts: [number, number][];
  gaps: [number, number, number][];
  enemies: {
    s: number;
    lane: number;
    kind: "worm" | "dragon" | "boss" | "spitter";
  }[];
  bombs: { s: number; lane: number; timed?: boolean; chain?: boolean }[];
  rocks: number[];
  climbs: { start: number; end: number; lane: number; rise: number }[];
};
export const LEVELS: Level[] = [
  {
    id: 1,
    season: "春",
    name: "成长",
    idiom: "春暖花开",
    collect: "春暖花开",
    subtitle: "踏春拾字，听见成长的声音",
    music: "春芽拾字",
    difficulty: 1,
    sky: "#b6d2c3",
    rock: "#6f8067",
    ground: "#a4b77c",
    foliage: "#73945c",
    length: 112,
    bag: { s: 108, lane: -1.5 },
    words: [
      { s: 12, lane: 0 },
      { s: 35, lane: 1 },
      { s: 58, lane: -1 },
      { s: 91, lane: 0 },
    ],
    pits: [25, 73],
    gates: [28, 76],
    belts: [],
    gaps: [],
    enemies: [],
    bombs: [],
    rocks: [],
    climbs: [],
  },
  {
    id: 2,
    season: "夏",
    name: "勇气",
    idiom: "绿树成荫",
    collect: "绿树成荫",
    subtitle: "穿越夏林，在疾行中寻找勇气",
    music: "夏林跃兽",
    difficulty: 2,
    sky: "#91b6ad",
    rock: "#4e6a59",
    ground: "#668d60",
    foliage: "#315d43",
    length: 125,
    bag: { s: 70, lane: 2.3 },
    words: [
      { s: 16, lane: -1 },
      { s: 30, lane: 1 },
      { s: 45, lane: -1 },
      { s: 63, lane: 1 },
    ],
    pits: [48, 89],
    gates: [51, 92],
    belts: [
      [33, 40],
      [78, 84],
    ],
    gaps: [[107, 109, -1]],
    enemies: [
      { s: 24, lane: 0, kind: "worm" },
      { s: 58, lane: -1, kind: "worm" },
      { s: 84, lane: 1, kind: "worm" },
      { s: 112, lane: 0, kind: "worm" },
    ],
    bombs: [],
    rocks: [],
    climbs: [],
  },
  {
    id: 3,
    season: "秋",
    name: "坚持",
    idiom: "秋高气爽",
    collect: "秋高气爽",
    subtitle: "下坡蓄势，借秋风越过高岩",
    music: "秋坑借势",
    difficulty: 4,
    sky: "#c9bea0",
    rock: "#8c7760",
    ground: "#c0a171",
    foliage: "#b37d41",
    length: 145,
    bag: { s: 119, lane: -2.5 },
    words: [
      { s: 15, lane: 0 },
      { s: 49, lane: 1 },
      { s: 88, lane: -1 },
      { s: 115, lane: -2 },
    ],
    pits: [32, 72, 101],
    gates: [35, 75, 104],
    belts: [
      [22, 29],
      [61, 68],
      [91, 98],
    ],
    gaps: [],
    enemies: [
      { s: 20, lane: 1, kind: "worm" },
      { s: 56, lane: -1, kind: "worm" },
      { s: 111, lane: -2, kind: "worm" },
      { s: 131, lane: 1, kind: "worm" },
      { s: 43, lane: 2, kind: "spitter" },
    ],
    bombs: [
      { s: 52, lane: 2, timed: true },
      { s: 83, lane: 0, timed: true },
      { s: 126, lane: -1, timed: true },
      { s: 136, lane: 2, timed: true },
    ],
    rocks: [34, 74, 103],
    climbs: [{ start: 60, end: 65, lane: 0, rise: 5 }],
  },
  {
    id: 4,
    season: "冬",
    name: "无畏",
    idiom: "傲雪凌霜",
    collect: "傲雪凌霜",
    subtitle: "踏冰凌霜，选择你的登山之路",
    music: "冬脊凌霜",
    difficulty: 5,
    sky: "#bacbd5",
    rock: "#7e919e",
    ground: "#d4e0df",
    foliage: "#587575",
    length: 150,
    bag: { s: 144, lane: 2 },
    words: [
      { s: 18, lane: 0 },
      { s: 49, lane: -2 },
      { s: 94, lane: 2 },
      { s: 131, lane: 0 },
    ],
    pits: [30, 80, 112],
    gates: [33, 83, 115],
    belts: [
      [22, 27],
      [70, 77],
    ],
    gaps: [
      [57, 60, 0],
      [101, 104, -1],
      [125, 128, 1],
    ],
    enemies: [
      { s: 43, lane: -2, kind: "worm" },
      { s: 57, lane: -2, kind: "worm" },
      { s: 64, lane: 2, kind: "dragon" },
      { s: 100, lane: 0, kind: "dragon" },
      { s: 135, lane: -1, kind: "worm" },
      { s: 72, lane: -1.5, kind: "spitter" },
    ],
    bombs: [],
    rocks: [],
    climbs: [{ start: 105, end: 109, lane: 0, rise: 6 }],
  },
  {
    id: 5,
    season: "终",
    name: "登极",
    idiom: "登峰造极",
    collect: "天行健君子以自强不息",
    subtitle: "引水破焰，踏四季回响，决战云巅",
    music: "云巅终章",
    difficulty: 5,
    sky: "#d5cfb9",
    rock: "#928c75",
    ground: "#c4bc94",
    foliage: "#7d9569",
    length: 184,
    bag: { s: 179, lane: 0 },
    words: [
      { s: 12, lane: 0 },
      { s: 24, lane: -1 },
      { s: 38, lane: 1 },
      { s: 51, lane: 0 },
      { s: 62, lane: -4, lift: 4 },
      { s: 78, lane: 0 },
      { s: 96, lane: 1 },
      { s: 111, lane: -1 },
      { s: 125, lane: 0 },
      { s: 133, lane: 1 },
    ],
    pits: [29, 82, 116],
    gates: [32, 85, 119],
    belts: [
      [20, 26],
      [72, 79],
      [106, 113],
    ],
    gaps: [[99, 102, 0]],
    enemies: [
      { s: 19, lane: 1, kind: "worm" },
      { s: 57, lane: 1, kind: "worm" },
      { s: 94, lane: -2, kind: "worm" },
      { s: 146, lane: 0, kind: "boss" },
      { s: 76, lane: 2, kind: "spitter" },
    ],
    bombs: [
      { s: 67, lane: -2, chain: true },
      { s: 69, lane: -2, chain: true },
      { s: 71, lane: -2, chain: true },
      { s: 104, lane: 2, timed: true },
      { s: 130, lane: -2, chain: true },
      { s: 132, lane: -2, chain: true },
    ],
    rocks: [84, 118],
    climbs: [{ start: 53, end: 58, lane: 0, rise: 5 }],
  },
];
/** 计算道路纵向高度；渲染、碰撞与机关统一使用，台阶处保留垂直落差。 */
export function heightAt(level: Level, s: number): number {
  // A deliberate descent before each pit, followed by a vertical ledge. No ramp bypasses the ledge.
  let h = 10 + s * 0.24;
  for (let i = 0; i < level.gates.length; i++) {
    const gate = level.gates[i];
    if (s >= gate) h += 3.2;
    const d = s - (gate - 9);
    if (d > 0 && d < 9) h -= Math.sin((d / 9) * Math.PI) * 1.25;
  }
  for (const pit of level.pits) {
    const d = Math.abs(s - pit);
    if (d < 2) h -= (0.35 * (1 + Math.cos((d / 2) * Math.PI))) / 2;
  }
  for (const climb of level.climbs) if (s >= climb.end) h += climb.rise;
  return h;
}
/** 将沿山路的距离 s 映射到世界横坐标；lane 表示相对道路中心的偏移。 */
export function centerX(s: number) {
  return Math.sin(s * 0.042) * 8;
}
/** 返回当前路段的半宽，支持冬峰分岔与终章战斗平台。 */
export function widthAt(level: Level, s: number) {
  if (level.id === 4 && s > 39 && s < 70) return 5.3;
  if (level.id === 5 && s > 136 && s < 160) return 7;
  return s > level.length - 8 ? 5 : 3.8;
}
/** 判断局部缺口，供地面探测与行走目标校验复用。 */
export function isGap(level: Level, s: number, lane: number) {
  return level.gaps.some(
    ([a, b, x]) => s > a && s < b && Math.abs(lane - x) < 1.15,
  );
}
/** 第三关起将第一段减速带替换为升降刀阵。 */
export function bladeSpan(level: Level): [number, number] | undefined {
  return level.id >= 3 ? level.belts[0] : undefined;
}
/** 按固定安全间距布置刀刃，避免相邻刀阵无法通过。 */
export function bladePositions(level: Level) {
  const span = bladeSpan(level);
  if (!span) return [];
  const [a, b] = span,
    count = Math.max(1, Math.floor((b - a - 0.8) / 5) + 1);
  return Array.from({ length: count }, (_, i) => a + 0.8 + i * 5);
}
/** 以模拟时间计算交错升降高度，保持画面与伤害判定一致。 */
export function bladeHeight(
  level: Level,
  s: number,
  index: number,
  clock: number,
) {
  const wave = (Math.sin(clock * 2.8 + index * Math.PI) + 1) / 2;
  return heightAt(level, s) + 0.57 + wave * 2.1;
}
/** 返回可站立的地面高度；边界、缺口与分岔深渊返回 undefined。 */
export function groundAt(level: Level, s: number, lane: number) {
  if (
    s < -4 ||
    s > level.length + 4 ||
    Math.abs(lane) > widthAt(level, s) ||
    isGap(level, s, lane)
  )
    return undefined;
  if (level.id === 4 && s > 40 && s < 68 && Math.abs(lane) < 0.85)
    return undefined; // genuine fork with a chasm between its branches
  return heightAt(level, s);
}

/** Shared pickup positions keep physics and visible equipment on the same terrace. */
export function weaponPickups(level: Level) {
  return {
    bows:
      level.id > 1
        ? [
            { s: 3, lane: -2 },
            ...(level.enemies.some((e) => e.s > level.length * 0.7)
              ? [
                  {
                    s: level.id === 5 ? 138 : level.length - 22,
                    lane: level.id === 5 ? -4.5 : 2.5,
                  },
                ]
              : []),
          ]
        : [],
    gun: level.id >= 4 ? { s: level.gates[0] + 4, lane: 2 } : undefined,
  };
}
const SIMILAR: Record<string, string> = {
  春: "奉",
  暖: "缓",
  花: "芲",
  开: "井",
  绿: "缘",
  树: "村",
  成: "戊",
  荫: "阴",
  秋: "伙",
  高: "亭",
  气: "乞",
  爽: "夷",
  傲: "敖",
  雪: "雷",
  凌: "淩",
  霜: "箱",
  天: "夫",
  行: "衍",
  健: "建",
  君: "尹",
  子: "孑",
  以: "似",
  自: "白",
  强: "疆",
  不: "木",
  息: "思",
};
/** A narrow collision radius and an opposite lane make each choice deliberate. */
export function wordDecoys(level: Level) {
  return (
    level.decoys ??
    level.words.flatMap((p, i) =>
      p.lift
        ? []
        : [
            {
              ...p,
              lane: p.lane > 0 ? -2.4 : 2.4,
              text: SIMILAR[level.collect[i]],
              correct: level.collect[i],
              index: i,
            },
          ],
    )
  );
}

/** One layout per game instance: render and physics share it; respawns keep it stable. */
export function randomizeWords(level: Level, random = Math.random): Level {
  const occupied: Point[] = level.words
    .filter((p) => p.lift)
    .map((p) => ({ ...p }));
  const safe = (p: Point) => {
    for (const ds of [-1.2, 0, 1.2])
      for (const dx of [-0.8, 0, 0.8])
        if (groundAt(level, p.s + ds, p.lane + dx) === undefined) return false;
    if (level.pits.some((s) => Math.abs(p.s - s) < 3)) return false;
    if (level.gates.some((s) => Math.abs(p.s - s) < 3)) return false;
    if (level.climbs.some((c) => p.s > c.start - 2 && p.s < c.end + 3))
      return false;
    if (bladePositions(level).some((s) => Math.abs(p.s - s) < 3)) return false;
    if (level.bombs.some((b) => Math.hypot(p.s - b.s, p.lane - b.lane) < 3))
      return false;
    if (level.enemies.some((e) => Math.hypot(p.s - e.s, p.lane - e.lane) < 3))
      return false;
    if (level.id === 5 && Math.abs(p.s - 46) < 3) return false;
    return true;
  };
  const candidates: Point[] = [];
  const end = Math.min(
    level.bag.s - 4,
    Math.max(...level.words.map((p) => p.s)) + 4,
  );
  for (let s = 7; s <= end; s += 0.75)
    for (const lane of [-2.6, -1.3, 0, 1.3, 2.6]) {
      const p = { s, lane };
      if (safe(p)) candidates.push(p);
    }
  // Shuffle coordinates, not character indices: existing collection saves stay valid.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const free = (p: Point) =>
    occupied.every(
      (q) =>
        Math.abs(p.s - q.s) >= 2.5 &&
        Math.hypot(p.s - q.s, p.lane - q.lane) >= 3.5,
    );
  const take = (near?: Point) => {
    const point =
      candidates.find(
        (p) => free(p) && (!near || Math.abs(p.s - near.s) < 5),
      ) ?? candidates.find(free);
    if (!point) throw new Error(`关卡 ${level.id} 缺少安全的字块位置`);
    const result = { ...point };
    occupied.push(result);
    return result;
  };
  const words = level.words.map((p) => (p.lift ? { ...p } : take(p)));
  const decoys = level.words.flatMap((p, index) =>
    p.lift
      ? []
      : [
          {
            ...take(),
            text: SIMILAR[level.collect[index]],
            correct: level.collect[index],
            index,
          },
        ],
  );
  return { ...level, words, decoys };
}
