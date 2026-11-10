/** Chase takes priority over boss combat; ordinary exploration follows the season. */
export function musicTrack(level: number, boss: number, chase: boolean) {
  if (chase) return "chase";
  if (boss > 0) return "boss";
  return (
    ["spring", "summer", "autumn", "winter", "summit"][level - 1] ?? "spring"
  );
}

export const MUSIC_TITLES: Record<string, string> = {
  spring: "春芽拾字",
  summer: "夏林跃兽",
  autumn: "秋坑借势",
  winter: "冬脊凌霜",
  summit: "云巅终章",
  chase: "幽径追影",
  boss: "云巅决战",
};

/** 留出武器瞬态的空间；密集的追逐和首领曲目再降低一档。 */
export const MUSIC_GAIN: Record<string, number> = {
  spring: 0.22,
  summer: 0.19,
  autumn: 0.2,
  winter: 0.23,
  summit: 0.2,
  chase: 0.17,
  boss: 0.16,
};
