import { LEVELS, type Level } from "./levels.ts";
export type Settings = {
  muted: boolean;
  opacity: number;
  buttonScale: number;
  joystick: "bottom" | "left";
  sprintSwap: boolean;
  vibration: boolean;
  sensitivity: number;
  fixedCamera: boolean;
};
export const DEFAULT_SETTINGS: Settings = {
  muted: false,
  opacity: 0.75,
  buttonScale: 1,
  joystick: "bottom",
  sprintSwap: false,
  vibration: true,
  sensitivity: 1,
  fixedCamera: false,
};
export type Save = {
  completed: number[];
  collected: Record<string, number[]>;
  settings: Settings;
  lastLevel: number;
};
export const emptySave = (): Save => ({
  completed: [],
  collected: {},
  settings: { ...DEFAULT_SETTINGS },
  lastLevel: 1,
});
const clamp = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === "number" && Number.isFinite(n)
    ? Math.max(min, Math.min(max, n))
    : fallback;
export function parseSave(raw: string | null): Save {
  const result = emptySave();
  if (!raw) return result;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return result;
    result.completed = Array.isArray(data.completed)
      ? [
          ...new Set<number>(
            data.completed.filter(
              (n: unknown) =>
                Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 5,
            ),
          ),
        ]
      : [];
    for (const l of LEVELS) {
      const ids = data.collected?.[l.id];
      if (Array.isArray(ids))
        result.collected[l.id] = [
          ...new Set<number>(
            ids.filter(
              (n: unknown) =>
                Number.isInteger(n) &&
                Number(n) >= 0 &&
                Number(n) < l.collect.length,
            ),
          ),
        ];
    }
    const s = data.settings ?? {};
    for (const key of [
      "muted",
      "sprintSwap",
      "vibration",
      "fixedCamera",
    ] as const)
      if (typeof s[key] === "boolean") result.settings[key] = s[key];
    result.settings.opacity = clamp(s.opacity, 0.3, 1, 0.75);
    result.settings.buttonScale = clamp(s.buttonScale, 0.7, 1.4, 1);
    result.settings.sensitivity = clamp(s.sensitivity, 0.3, 2.5, 1);
    result.settings.joystick = s.joystick === "left" ? "left" : "bottom";
    result.lastLevel = clamp(data.lastLevel, 1, 5, 1) | 0;
  } catch {
    /* Corrupt or older saves must never prevent playing. */
  }
  return result;
}
export function canOpenBag(
  level: Level,
  collected: number[],
  bossAlive = false,
) {
  return (
    level.collect.split("").every((_, i) => collected.includes(i)) &&
    !(level.id === 5 && bossAlive)
  );
}
export function canWin(
  level: Level,
  bag: string,
  collected: number[],
  bossAlive = false,
) {
  return bag === level.idiom && canOpenBag(level, collected, bossAlive);
}
export function pitWindow(levelId: number, charge: number) {
  return (
    charge >= (levelId === 1 ? 0.35 : 0.45) &&
    charge <= (levelId === 4 ? 0.85 : 1.12)
  );
}
export function bossPhase(hp: number, max: number) {
  return hp > (max * 2) / 3 ? 1 : hp > max / 3 ? 2 : 3;
}
export function weaponDamage(weapon: "bow" | "pistol") {
  return weapon === "bow" ? 1 : 4;
}
export const SAVE_KEY = "mountaineer-v2";
