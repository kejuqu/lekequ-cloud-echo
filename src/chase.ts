export const CHASE_DURATION = 30;
export const CHASE_SPEED = 10;
export const CHASE_SPRINT_SPEED = 14;
export const CHASE_MAX_DISTANCE = CHASE_DURATION * CHASE_SPRINT_SPEED;
const pattern = [-1, 1, 1, -1] as const;
export const CHASE_TURNS = Array.from(
  { length: Math.ceil(CHASE_MAX_DISTANCE / 40) - 1 },
  (_, i) => ({
    at: (i + 1) * 40,
    direction: pattern[i % pattern.length] as -1 | 1,
  }),
);
export const CHASE_OBSTACLES = Array.from(
  { length: Math.ceil(CHASE_MAX_DISTANCE / 80) },
  (_, i) => 62 + i * 80,
);
export function chasePoint(distance: number) {
  if (distance < 0) return { x: 220, y: 46, z: -128 - distance, heading: 0 };
  let x = 220,
    z = -128,
    heading = 0,
    remaining = Math.max(0, distance);
  for (let i = 0; remaining > 0; i++) {
    const step = Math.min(40, remaining);
    x += Math.sin(heading) * step;
    z -= Math.cos(heading) * step;
    remaining -= step;
    if (step === 40 && i < CHASE_TURNS.length)
      heading += (CHASE_TURNS[i].direction * Math.PI) / 2;
  }
  return { x, y: 46, z, heading };
}
export type ChaseState = {
  active: boolean;
  completed: boolean;
  elapsed: number;
  remaining: number;
  countdown: number;
  distance: number;
  gap: number;
  direction: -1 | 0 | 1;
  turnIn: number;
  turnReady: boolean;
  obstacleIn: number;
  jumpHeight: number;
  turns: number;
  stamina: number;
  sprinting: boolean;
  speed: number;
};
export class Chase {
  active = false;
  completed = false;
  elapsed = 0;
  countdown = 3;
  gap = 12;
  jumpHeight = 0;
  stamina = 100;
  sprinting = false;
  private travelled = 0;
  private exhausted = false;
  private vy = 0;
  private turnIndex = 0;
  private hitObstacles = new Set<number>();
  get distance() {
    return this.travelled;
  }
  get speed() {
    return this.sprinting ? CHASE_SPRINT_SPEED : CHASE_SPEED;
  }
  get snapshot(): ChaseState {
    const next = CHASE_TURNS[this.turnIndex];
    const delta = next ? next.at - this.distance : Infinity;
    const obstacle = CHASE_OBSTACLES.find((d) => d > this.distance + 0.7);
    return {
      active: this.active,
      completed: this.completed,
      elapsed: this.elapsed,
      remaining: Math.max(0, CHASE_DURATION - this.elapsed),
      countdown: this.countdown,
      distance: this.distance,
      gap: this.gap,
      direction: delta <= 24 ? next.direction : 0,
      turnIn: Math.max(0, delta / this.speed),
      turnReady: delta <= 11 && delta >= -1,
      obstacleIn:
        obstacle === undefined
          ? Infinity
          : (obstacle - this.distance) / this.speed,
      jumpHeight: this.jumpHeight,
      turns: this.turnIndex,
      stamina: this.stamina,
      sprinting: this.sprinting,
      speed: this.speed,
    };
  }
  start() {
    this.reset();
    this.active = true;
  }
  reset() {
    this.active = false;
    this.completed = false;
    this.elapsed = 0;
    this.countdown = 3;
    this.gap = 12;
    this.jumpHeight = 0;
    this.vy = 0;
    this.travelled = 0;
    this.stamina = 100;
    this.sprinting = false;
    this.exhausted = false;
    this.turnIndex = 0;
    this.hitObstacles.clear();
  }
  jump() {
    if (this.active && this.countdown <= 0 && this.jumpHeight <= 0.02)
      this.vy = 7.3;
  }
  turn(direction: -1 | 1): string | null {
    if (!this.active || this.countdown > 0) return null;
    const next = CHASE_TURNS[this.turnIndex];
    if (!next || next.at - this.distance > 11) return null;
    if (next.direction !== direction)
      return "急转方向错误，冲出山道，被幽灵抓住";
    this.turnIndex++;
    return null;
  }
  update(dt: number, sprint = false): string | null {
    if (!this.active) return null;
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - dt);
      return null;
    }
    // 冲刺增加实际路程与追逐间距，30 秒生存计时独立运行。
    if (this.stamina >= 25) this.exhausted = false;
    this.sprinting = sprint && !this.exhausted && this.stamina > 0;
    this.stamina = Math.max(
      0,
      Math.min(100, this.stamina + dt * (this.sprinting ? -22 : 14)),
    );
    if (this.stamina === 0) this.exhausted = true;
    const runTime = Math.min(dt, CHASE_DURATION - this.elapsed);
    this.travelled += runTime * this.speed;
    this.elapsed = Math.min(CHASE_DURATION, this.elapsed + dt);
    // 野兽始终紧跟：普通奔跑完全同速（间距不变），冲刺时它也跟着加速，仅略慢于人物。
    this.gap = Math.min(18, this.gap + dt * (this.sprinting ? 0.6 : 0));
    this.vy -= 20 * dt;
    this.jumpHeight = Math.max(0, this.jumpHeight + this.vy * dt);
    if (this.jumpHeight === 0) this.vy = 0;
    const next = CHASE_TURNS[this.turnIndex];
    if (next && this.distance > next.at + 1)
      return "没有及时急转弯，冲出山道，被幽灵抓住";
    for (const obstacle of CHASE_OBSTACLES)
      if (
        Math.abs(this.distance - obstacle) < 0.7 &&
        !this.hitObstacles.has(obstacle)
      ) {
        this.hitObstacles.add(obstacle);
        if (this.jumpHeight < 0.9) this.gap -= 5;
      }
    if (this.gap <= 0) return "撞上障碍后失速，被持叉幽灵追上";
    if (this.elapsed >= CHASE_DURATION) {
      this.active = false;
      this.completed = true;
    }
    return null;
  }
}
