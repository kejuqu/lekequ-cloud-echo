import { LUCKY_REWARDS } from "./lucky-rewards.ts";
import { WATER_TRAVEL_TIME, WATER_GATE } from "./water-timing.ts";
import * as C from "cannon-es";
import { Chase, chasePoint, CHASE_DURATION, type ChaseState } from "./chase.ts";
import {
  weaponPickups,
  wordDecoys,
  bladeHeight,
  bladePositions,
  bladeSpan,
  centerX,
  groundAt,
  heightAt,
  widthAt,
  type Level,
} from "./levels.ts";
import {
  bossPhase,
  canOpenBag,
  canWin,
  pitWindow,
  weaponDamage,
  type Save,
} from "./rules.ts";
export type Enemy = {
  id: number;
  s: number;
  lane: number;
  y: number;
  hp: number;
  max: number;
  kind: "worm" | "dragon" | "boss" | "spitter";
  stun: number;
  alive: boolean;
  phase: number;
  shotCooldown?: number;
  windup?: number;
};
export type Projectile = {
  spell?: "lightning" | "breath";
  source?: number;
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
};
export type Bomb = {
  s: number;
  lane: number;
  timer: number;
  active: boolean;
  timed: boolean;
  chain: boolean;
};
export type Event = {
  kind: string;
  message?: string;
  x?: number;
  y?: number;
  z?: number;
  index?: number;
  end?: { x: number; y: number; z: number };
  targetId?: number;
};
export type Snapshot = {
  collected: number[];
  bag: string;
  reward: string;
  won: boolean;
  stamina: number;
  energy: number;
  cooldown: number;
  progress: number;
  prompt: string;
  message: string;
  weapon: "bow" | "pistol";
  bow: boolean;
  /** 本次生命拾取弓箭的架子序号，-1 表示未拾取，用于按架子隐藏模型。 */
  bowRack: number;
  pistol: boolean;
  ammo: number;
  charge: number;
  inPit: boolean;
  grounded: boolean;
  deaths: number;
  checkpoint: number;
  buffs: Record<string, number>;
  bossHp: number;
  bossMax: number;
  phase: number;
  guardians: number[];
  water: boolean;
  fireOut: boolean;
  rope: boolean;
  telescope: boolean;
  zoom: boolean;
  time: number;
  pitReady: boolean;
  dead: boolean;
  deathReason: string;
  deathInChase: boolean;
  deathRemaining: number;
  climbing: boolean;
  climbProgress: number;
  destination: { s: number; lane: number } | null;
  chase: ChaseState;
};
export type Input = { x: number; y: number; sprint: boolean; shoot: boolean };
export class Simulation {
  world = new C.World({ gravity: new C.Vec3(0, -18, 0) });
  body: C.Body;
  level: Level;
  state: Snapshot;
  enemies: Enemy[] = [];
  bombs: Bomb[] = [];
  events: Event[] = [];
  input: Input = { x: 0, y: 0, sprint: false, shoot: false };
  onSave: () => void;
  save: Save;
  s = 0;
  lane = 0;
  clock = 0;
  shotAt = -10;
  pitAt = -1;
  pitTime = 0;
  checkpoint = 0;
  invincible = 1.5;
  deadTime = 0;
  chase = new Chase();
  deathInChase = false;
  deathChaseDistance = 0;
  private deathFalls = false;
  projectiles: Projectile[] = [];
  private projectileId = 0;
  private goldPit = -1;
  private goldUntil = -1;
  private launch: {
    remaining: number;
    targetS: number;
    lane: number;
    vx: number;
    vz: number;
  } | null = null;
  private climbIndex = -1;
  private chaseStickArmed = true;
  private chaseWall?: C.Body;
  private accumulator = 0;
  private messageUntil = 0;
  private checkpointUsed = new Set<number>();
  private supplyTimers = new Map<string, number>();
  private speed = 0;
  private forwardJump = false;
  private waterStartedAt = 0;
  private fireWall?: C.Body;
  private bossWall?: C.Body;
  /** 返回追逐场地后，暂时禁止恶龙接近、施法和召唤。 */
  private bossApproachAt = 0;
  wordTrap: {
    index: number;
    remaining: number;
    text: string;
    correct: string;
  } | null = null;
  constructor(level: Level, save: Save, onSave: () => void) {
    this.level = level;
    this.save = save;
    this.onSave = onSave;
    this.world.broadphase = new C.SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = 0;
    this.world.defaultContactMaterial.restitution = 0;
    this.body = new C.Body({
      mass: 1,
      shape: new C.Sphere(0.42),
      fixedRotation: true,
      linearDamping: 0.02,
    });
    this.body.updateMassProperties();
    this.world.addBody(this.body);
    this.state = {
      collected: [...(save.collected[level.id] ?? [])],
      bag: "",
      reward: "",
      won: false,
      stamina: 100,
      energy: 0,
      cooldown: 0,
      progress: 0,
      prompt: "",
      message: "认准目标字 · 小心形近字",
      weapon: "bow",
      bow: false,
      bowRack: -1,
      pistol: false,
      ammo: 0,
      charge: 0,
      inPit: false,
      grounded: false,
      deaths: 0,
      checkpoint: 0,
      buffs: {},
      bossHp: 0,
      bossMax: 0,
      phase: 0,
      guardians: [],
      water: false,
      fireOut: false,
      rope: false,
      telescope: false,
      zoom: false,
      time: 0,
      pitReady: false,
      dead: false,
      deathReason: "",
      deathInChase: false,
      deathRemaining: 0,
      climbing: false,
      climbProgress: 0,
      destination: null,
      chase: this.chase.snapshot,
    };
    this.buildTerrain();
    this.populate();
    this.spawn(0);
    this.messageUntil = 7;
  }
  private addBox(
    x: number,
    y: number,
    z: number,
    hx: number,
    hy: number,
    hz: number,
    rx = 0,
    ry = 0,
  ) {
    const b = new C.Body({ mass: 0, shape: new C.Box(new C.Vec3(hx, hy, hz)) });
    b.position.set(x, y, z);
    const a = new C.Quaternion(),
      q = new C.Quaternion();
    a.setFromAxisAngle(new C.Vec3(0, 1, 0), ry);
    q.setFromAxisAngle(new C.Vec3(1, 0, 0), rx);
    a.mult(q, b.quaternion);
    b.aabbNeedsUpdate = true;
    this.world.addBody(b);
    return b;
  }
  /** 按道路采样生成实体地面；缺口、攀爬墙与机关屏障都参与真实碰撞。 */
  private buildTerrain() {
    const l = this.level;
    for (let a = -4; a < l.length + 4; a += 0.5) {
      const b = a + 0.5,
        s = (a + b) / 2,
        dx = centerX(b) - centerX(a),
        dy = heightAt(l, b - 0.001) - heightAt(l, a + 0.001),
        length = Math.hypot(dx, 0.5);
      const w = widthAt(l, s);
      let intervals: [number, number][] = [[-w, w]];
      const cut = (left: number, right: number) => {
        intervals = intervals.flatMap(([x, y]) =>
          right <= x || left >= y
            ? [[x, y] as [number, number]]
            : ([
                [x, Math.min(left, y)],
                [Math.max(right, x), y],
              ].filter(([u, v]) => v - u > 0.1) as [number, number][]),
        );
      };
      for (const [start, end, x] of l.gaps)
        if (s > start && s < end) cut(x - 1.15, x + 1.15);
      if (l.id === 4 && s > 40 && s < 68) cut(-0.85, 0.85);
      for (const [left, right] of intervals)
        this.addBox(
          centerX(s) + (left + right) / 2,
          heightAt(l, s) - 0.3,
          -s,
          (right - left) / 2,
          0.3,
          length / 2 + 0.025,
          Math.atan2(dy, length),
          Math.atan2(-dx, 0.5),
        );
    }
    for (const gate of l.gates)
      this.addBox(
        centerX(gate),
        heightAt(l, gate) - 1.95,
        -gate + 0.05,
        widthAt(l, gate),
        1.65,
        0.15,
      );
    for (const climb of l.climbs)
      this.addBox(
        centerX(climb.end),
        heightAt(l, climb.end) - climb.rise / 2,
        -climb.end,
        widthAt(l, climb.end),
        climb.rise / 2,
        0.2,
      );
    for (const b of l.bombs)
      if (b.timed)
        this.addBox(
          centerX(b.s + 1.8) - 2.4,
          heightAt(l, b.s + 1.8) + 0.75,
          -(b.s + 1.8),
          0.65,
          0.75,
          0.65,
        );
    // Actual collision barriers disappear when the corresponding mechanic is completed.
    if (l.id === 5) {
      this.chaseWall = this.addBox(
        centerX(134),
        heightAt(l, 134) + 3,
        -134,
        4,
        3,
        0.3,
      );
      this.fireWall = this.addBox(
        centerX(46),
        heightAt(l, 46) + 2,
        -46,
        3.9,
        2,
        0.4,
      );
      this.bossWall = this.addBox(
        centerX(159),
        heightAt(l, 159) + 3,
        -159,
        8,
        3,
        0.35,
      );
    }
  }
  /** 死亡或重开均将所有怪物恢复到初始位置、满血与初始技能状态。 */
  private populate() {
    this.enemies = this.level.enemies.map((e, id) => {
      return {
        id,
        ...e,
        y:
          heightAt(this.level, e.s) +
          (["worm", "spitter"].includes(e.kind) ? 0.8 : 3),
        hp:
          e.kind === "boss"
            ? 36
            : e.kind === "dragon"
              ? 8
              : e.kind === "spitter"
                ? 4
                : 2,
        max:
          e.kind === "boss"
            ? 36
            : e.kind === "dragon"
              ? 8
              : e.kind === "spitter"
                ? 4
                : 2,
        stun: 0,
        alive: true,
        phase: 1,
        shotCooldown: 1.2 + id * 0.13,
        windup: 0,
      };
    });
    this.bombs = this.level.bombs.map((b) => ({
      ...b,
      timer: -1,
      active: true,
      timed: !!b.timed,
      chain: !!b.chain,
    }));
    this.refreshBoss();
  }
  private refreshBoss() {
    const b = this.enemies.find((e) => e.kind === "boss");
    this.state.bossHp = b?.hp ?? 0;
    this.state.bossMax = b?.max ?? 0;
    this.state.phase = b?.alive ? bossPhase(b.hp, b.max) : 0;
  }
  isBuffAvailable(at: number) {
    return !this.supplyTimers.has("buff" + at);
  }
  get bossAlive() {
    return this.enemies.some((e) => e.kind === "boss" && e.alive);
  }
  get bagVisible() {
    return (
      !this.state.bag &&
      canOpenBag(this.level, this.state.collected, this.bossAlive) &&
      (this.level.id !== 5 || this.chase.completed)
    );
  }
  get pos() {
    return {
      x: this.body.position.x,
      y: this.body.position.y - 0.42,
      z: this.body.position.z,
    };
  }
  private emit(kind: string, message?: string, index?: number) {
    const p = this.pos;
    this.events.push({ kind, message, index, ...p });
    if (message) {
      this.state.message = message;
      this.messageUntil = this.clock + 5;
    }
  }
  notify(message: string) {
    this.emit("notice", message);
  }
  private spawn(s: number) {
    this.wordTrap = null;
    this.s = s;
    this.lane = 0;
    this.body.position.set(centerX(s), heightAt(this.level, s) + 0.5, -s);
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.body.aabbNeedsUpdate = true;
    this.input = { x: 0, y: 0, sprint: false, shoot: false };
    this.pitAt = -1;
    this.pitTime = 0;
    this.invincible = 2;
    this.state.dead = false;
    this.state.deathRemaining = 0;
    this.deathInChase = false;
    this.state.deathInChase = false;
    this.deathFalls = false;
    this.launch = null;
    this.forwardJump = false;
    this.goldPit = -1;
    this.goldUntil = -1;
    this.state.destination = null;
    this.state.climbing = false;
    this.climbIndex = -1;
    this.state.pitReady = false;
  }
  private energy(n: number) {
    this.state.energy = Math.min(100, this.state.energy + n);
  }
  private collect(i: number) {
    if (this.state.collected.includes(i)) return;
    this.state.collected.push(i);
    this.save.collected[this.level.id] = [...this.state.collected];
    this.onSave();
    this.emit(
      "word",
      `拾得「${this.level.collect[i]}」 · ${this.state.collected.length}/${this.level.collect.length}`,
      i,
    );
  }
  fail(reason: string, tutorial = false, falls = false) {
    if (this.deadTime > 0 || this.state.won) return;
    this.emit(
      "death",
      reason + (tutorial ? " · 返回教学检查点" : " · 跌落山脚，已收集字块保留"),
    );
    this.state.deaths++;
    this.deadTime = 3;
    this.state.dead = true;
    this.state.deathReason = reason;
    this.state.deathRemaining = 3;
    this.deathInChase = this.chase.active;
    this.state.deathInChase = this.deathInChase;
    this.deathFalls = falls;
    this.deathChaseDistance = this.chase.distance;
    // Fall deaths keep plummeting (no road snap); other deaths lie on the road.
    if (
      !falls &&
      !this.deathInChase &&
      groundAt(this.level, this.s, this.lane) !== undefined
    )
      this.body.position.y = heightAt(this.level, this.s) + 0.56;
    this.chase.reset();
    this.state.chase = this.chase.snapshot;
    this.launch = null;
    this.forwardJump = false;
    this.goldUntil = -1;
    this.projectiles = [];
    this.state.destination = null;
    this.state.climbing = false;
    this.climbIndex = -1;
    this.state.pitReady = false;
    if (falls) {
      // Keep vertical momentum so the corpse keeps plummeting; stop drifting.
      this.body.velocity.x = 0;
      this.body.velocity.z = 0;
    } else this.body.velocity.setZero();
    this.state.bag = "";
    this.state.reward = "";
    this.state.bow = false;
    this.state.bowRack = -1;
    this.state.pistol = false;
    this.state.ammo = 0;
    this.state.weapon = "bow";
    this.state.telescope = false;
    this.state.energy = 0;
    this.state.cooldown = 0;
    this.state.stamina = 100;
    this.state.buffs = {};
    this.state.charge = 0;
    this.state.inPit = false;
    this.state.rope = false;
    this.state.zoom = false;
    this.populate();
    this.bossApproachAt = 0;
    this.supplyTimers.clear();
    this.checkpointUsed.clear();
    this.state.guardians = [];
    this.state.water = false;
    this.state.fireOut = false;
    if (this.fireWall && !this.world.bodies.includes(this.fireWall))
      this.world.addBody(this.fireWall);
    if (this.bossWall && !this.world.bodies.includes(this.bossWall))
      this.world.addBody(this.bossWall);
    if (this.chaseWall && !this.world.bodies.includes(this.chaseWall))
      this.world.addBody(this.chaseWall);
    this.checkpoint = tutorial ? this.checkpoint : 0;
  }
  restart(clear = false) {
    if (clear) {
      this.state.collected = [];
      this.save.collected[this.level.id] = [];
      this.onSave();
    }
    this.state.won = false;
    this.deadTime = 0;
    this.fail("重新出发");
    this.deadTime = 0;
    this.populate();
    this.spawn(0);
    this.checkpoint = 0;
    this.state.time = 0;
  }
  jump() {
    if (this.deadTime || this.wordTrap || this.state.won || this.state.climbing)
      return;
    if (this.chase.active) {
      this.chase.jump();
      return;
    }
    const perfect =
      (this.state.inPit && pitWindow(this.level.id, this.pitTime)) ||
      this.clock <= this.goldUntil;
    if (!this.state.grounded && !perfect) return;
    this.forwardJump = false;
    if (perfect) {
      const pit = this.pitAt >= 0 ? this.pitAt : this.goldPit;
      if (pit < 0) return;
      const targetS = this.level.gates[pit] + 2.7,
        lane = Math.max(-1.8, Math.min(1.8, this.lane));
      const duration = 1.12,
        goalY = heightAt(this.level, targetS) + 0.5;
      this.body.velocity.y =
        (goalY - this.body.position.y + 9 * duration * duration) / duration;
      this.launch = {
        remaining: duration,
        targetS,
        lane,
        vx: (centerX(targetS) + lane - this.body.position.x) / duration,
        vz: (-targetS - this.body.position.z) / duration,
      };
      this.body.velocity.x = this.launch.vx;
      this.body.velocity.z = this.launch.vz;
      this.state.stamina = Math.max(0, this.state.stamina - 12);
      this.emit("jump", "完美蹬跳！自动借势跃上前方高台");
    } else {
      const highJump = !!this.state.buffs["高跳"];
      this.body.velocity.y = highJump || this.level.id === 5 ? 6.8 : 5.3;
      const forward = this.level.id === 5 ? 10.5 : 8.8,
        curve = (centerX(this.s + 0.2) - centerX(this.s)) / 0.2;
      this.body.velocity.x = curve * forward;
      this.body.velocity.z = -forward;
      this.forwardJump = true;
      this.emit(
        "jump",
        this.state.inPit ? "起跳过早，请在金光窗口再试" : undefined,
      );
    }
    this.state.destination = null;
    this.goldUntil = -1;
    this.pitAt = -1;
    this.pitTime = 0;
    this.state.grounded = false;
    this.state.inPit = false;
    this.state.pitReady = false;
  }
  navigate(x: number, z: number) {
    if (
      this.deadTime ||
      this.state.won ||
      this.chase.active ||
      this.state.climbing
    )
      return false;
    const s = -z,
      lane = x - centerX(s);
    if (groundAt(this.level, s, lane) === undefined) return false;
    this.state.destination = { s, lane };
    this.events.push({
      kind: "guide",
      x,
      y: heightAt(this.level, s),
      z,
    });
    return true;
  }
  cancelMove() {
    this.state.destination = null;
  }
  turn(direction: -1 | 1) {
    const error = this.chase.turn(direction);
    if (error) this.fail(error);
    this.state.chase = this.chase.snapshot;
  }
  startChase() {
    if (this.level.id !== 5 || this.chase.completed || this.deadTime) return;
    this.cancelMove();
    this.chase.start();
    const entry = chasePoint(0);
    this.body.position.set(entry.x, entry.y + 0.42, entry.z);
    this.projectiles = [];
    this.state.chase = this.chase.snapshot;
    this.body.velocity.setZero();
    this.emit(
      "notice",
      `已穿越旋涡门！坚持${CHASE_DURATION}秒，左右急转，空格跳障碍`,
    );
  }
  private autoPickups() {
    const near = (s: number, lane: number) =>
      Math.hypot(this.s - s, this.lane - lane) < 2.7 &&
      Math.abs(this.pos.y - heightAt(this.level, s)) < 2;
    const bag = this.level.bag;
    if (
      this.bagVisible &&
      Math.hypot(this.s - bag.s, this.lane - bag.lane) < 1.1 &&
      Math.abs(this.pos.y - heightAt(this.level, bag.s)) < 1.6 &&
      !(this.level.id === 3 && this.enemies.some((e) => e.id === 2 && e.alive))
    ) {
      this.state.bag = this.level.idiom;
      this.energy(35);
      const rewardIndex = Math.floor(Math.random() * LUCKY_REWARDS.length);
      this.state.reward = LUCKY_REWARDS[rewardIndex];
      this.emit("bag", `福袋已打开！获得${this.state.reward}`, rewardIndex);
    }
    const pickups = weaponPickups(this.level);
    if (!this.state.bow) {
      const rack = pickups.bows.findIndex((p) => near(p.s, p.lane));
      if (rack >= 0) {
        this.state.bow = true;
        this.state.bowRack = rack;
        this.state.weapon = "bow";
        this.emit("item", "弓箭 · 无限箭矢");
      }
    }
    if (
      pickups.gun &&
      !this.state.pistol &&
      near(pickups.gun.s, pickups.gun.lane)
    ) {
      this.state.pistol = true;
      this.state.weapon = "pistol";
      this.state.ammo = 36;
      this.emit("item", "机关枪 · 36 发");
    }
  }
  burst() {
    if (this.chase.active || this.deadTime) return;
    if (
      this.state.energy < 100 ||
      this.state.cooldown > 0 ||
      this.deadTime ||
      this.state.won
    ) {
      this.notify("冲击波需要满能量，且冷却结束");
      return;
    }
    this.state.energy = 0;
    this.state.cooldown = 25;
    for (const e of this.enemies)
      if (e.alive && Math.abs(e.s - this.s) < 22) {
        e.stun = 6;
        e.s = Math.min(this.level.length - 9, e.s + 5);
      }
    this.emit("burst", "冲击波释放 · 野兽被击退，恶龙受到压制");
  }
  selectWeapon(w: "bow" | "pistol") {
    if (
      (w === "bow" && this.state.bow) ||
      (w === "pistol" && this.state.pistol)
    )
      this.state.weapon = w;
    else this.notify("尚未拾取这件武器");
  }
  switchWeapon() {
    this.selectWeapon(this.state.weapon === "bow" ? "pistol" : "bow");
  }
  telescope() {
    if (!this.state.telescope) {
      this.notify("在冬峰狙击台拾取望远镜后可使用");
      return;
    }
    this.state.zoom = !this.state.zoom;
  }
  shoot(target?: number) {
    const s = this.state;
    if (
      this.chase.active ||
      this.clock - this.shotAt < (s.weapon === "bow" ? 0.42 : 0.1) ||
      this.deadTime ||
      s.won
    )
      return;
    if (!(s.weapon === "bow" ? s.bow : s.pistol)) {
      this.notify("寻找弓箭架");
      return;
    }
    if (s.weapon === "pistol" && s.ammo <= 0) {
      this.notify("弹药不足，寻找补给箱或切换弓箭");
      return;
    }
    this.shotAt = this.clock;
    if (s.weapon === "pistol") s.ammo--;
    // 没有精确点中模型中心时，战斗范围内仍自动锁定前方恶龙。
    const candidate =
      this.enemies.find((e) => e.id === target && e.alive) ??
      this.enemies.find(
        (e) =>
          e.kind === "boss" &&
          e.alive &&
          e.s >= this.s - 2 &&
          Math.abs(e.s - this.s) <= 36,
      );
    const e =
      candidate && Math.abs(candidate.s - this.s) <= 36 ? candidate : undefined;
    const from = new C.Vec3(
      this.pos.x + 0.3,
      this.pos.y + 1.4,
      this.pos.z - 0.4,
    );
    const to = e
      ? new C.Vec3(centerX(e.s) + e.lane, e.y, -e.s)
      : new C.Vec3(centerX(this.s + 30) + this.lane, from.y + 4, -this.s - 30);
    const result = new C.RaycastResult();
    // 弹道与伤害共用射线；碰到地形时，红色子弹也停在遮挡处。
    const blockers = this.world.bodies.filter(
      (b) =>
        b !== this.body &&
        b.type === C.Body.STATIC &&
        !(e?.kind === "boss" && b === this.bossWall),
    );
    const ray = new C.Ray(from, to);
    ray.mode = C.Ray.CLOSEST;
    ray.skipBackfaces = true;
    ray.intersectBodies(blockers, result);
    const blocked =
      result.hasHit && result.distance < from.distanceTo(to) - 0.8;
    const end = blocked ? result.hitPointWorld : to;
    this.events.push({
      kind: "shot",
      index: s.weapon === "pistol" ? 1 : 0,
      x: from.x,
      y: from.y,
      z: from.z,
      end: { x: end.x, y: end.y, z: end.z },
      targetId: e && !blocked ? e.id : undefined,
    });
    if (!e || blocked) return;
    const damage =
      weaponDamage(s.weapon) + (e.kind === "boss" ? s.guardians.length : 0);
    e.hp = Math.max(0, e.hp - damage);
    e.stun = Math.max(e.stun, 0.24);
    this.events.push({
      kind: "hit",
      x: to.x,
      y: to.y,
      z: to.z,
      targetId: e.id,
    });
    if (e.hp === 0) {
      e.alive = false;
      this.energy(e.kind === "worm" ? 24 : 40);
      this.emit(
        "kill",
        e.kind === "boss"
          ? "终焉恶龙已被击败，登顶通路开启"
          : "野兽已击败 · 大招能量增加",
      );
      if (e.kind === "boss" && this.bossWall)
        this.world.removeBody(this.bossWall);
    }
    this.refreshBoss();
  }
  nearby() {
    const l = this.level,
      s = this.s,
      near = (at: number, lane = 0, r = 3.8) =>
        Math.abs(s - at) < r && Math.abs(this.lane - lane) < 3;
    if (this.state.climbing)
      return {
        kind: "climb",
        label: "沿绳索攀爬：W / 上推前进，S 下滑，E 松手",
      };
    for (let i = 0; i < l.climbs.length; i++)
      if (near(l.climbs[i].start, l.climbs[i].lane, 2.5))
        return {
          kind: "climb" + i,
          label: "抓绳 · 上推攀爬",
        };
    if (l.id === 5 && !this.chase.completed && near(128, 0, 4))
      return {
        kind: "chase",
        label: `走入黑色旋涡门 · 开始${CHASE_DURATION}秒幽灵追逐挑战`,
      };
    if (s > l.length - 3) return { kind: "flag", label: "山顶红旗" };

    if (l.id === 5) {
      if (near(WATER_GATE.s, WATER_GATE.lane))
        return {
          kind: "water",
          label: this.state.fireOut ? "水渠已疏通" : "引山泉入渠，浇灭前方大火",
        };
      if (near(59, -2) && !this.state.rope)
        return { kind: "rope", label: "攀绳取字 · 再按 E 返回山道" };
      if (this.state.rope) return { kind: "rope", label: "沿绳索返回山道" };
      for (let i = 0; i < 3; i++)
        if (
          near(137 + i * 6, i % 2 === 0 ? -3 : 3) &&
          !this.state.guardians.includes(i)
        )
          return {
            kind: `guardian${i}`,
            label: `激活守护石碑 ${i + 1} · 削弱 BOSS`,
          };
    }
    if (l.id === 4 && near(64, 3) && !this.state.telescope)
      return { kind: "scope", label: "拾取瞭望台望远镜" };
    const supplies =
      l.id === 5
        ? [75, 134]
        : l.id === 4
          ? [64, 106]
          : l.id === 3
            ? [10, 56, 106]
            : l.id === 2
              ? [10, 75]
              : [];
    for (const at of supplies)
      if (
        near(at, 0, 2.5) &&
        this.clock - (this.supplyTimers.get("s" + at) ?? -100) > 15
      )
        return {
          kind: "supply" + at,
          label: "补充装备与体力",
        };
    if (
      l.id === 3 &&
      near(116, -2) &&
      this.enemies.some((e) => e.alive && e.s > 105 && e.s < 122)
    )
      return { kind: "vine", label: "藤蔓封洞：射杀洞口守卫后可进入" };
    return null;
  }
  private completeSummit() {
    const s = this.state,
      l = this.level;
    if (
      !canWin(l, s.bag, s.collected, this.bossAlive) ||
      (l.id === 5 && !this.chase.completed)
    )
      return false;
    s.won = true;
    if (!this.save.completed.includes(l.id)) this.save.completed.push(l.id);
    this.save.lastLevel = Math.min(5, l.id + 1);
    this.onSave();
    this.emit("win", "福袋与红旗文字一致 · 登顶成功！");
    return true;
  }
  interact() {
    if (this.deadTime || this.state.won || this.chase.active) return;
    const item = this.nearby();
    if (!item) {
      this.notify("附近没有可交互物品");
      return;
    }
    const s = this.state,
      l = this.level;
    if (item.kind === "flag") {
      if (!this.completeSummit())
        this.notify(
          s.collected.length < l.collect.length
            ? `还缺「${l.collect
                .split("")
                .filter((_, i) => !s.collected.includes(i))
                .join(" / ")}」，找齐字后福袋才会显形`
            : this.bossAlive
              ? "终焉恶龙尚未击败"
              : "请先回到标记平台拾取福袋",
        );
    } else if (item.kind === "chase") {
      this.startChase();
    } else if (item.kind.startsWith("climb")) {
      if (this.state.climbing) {
        const at = l.climbs[this.climbIndex].start;
        this.spawn(at);
      } else {
        this.climbIndex = Number(item.kind.slice(5));
        this.state.climbing = true;
        this.state.climbProgress = 0;
        this.cancelMove();
        this.body.velocity.setZero();
        this.notify("抓紧绳子！按 W 或上推摇杆攀爬，E 松手");
      }
    } else if (item.kind === "bow") {
      s.bow = true;
      s.weapon = "bow";
      this.emit("item", "获得弓箭 · 无限弹药，低伤害");
    } else if (item.kind === "pistol") {
      s.pistol = true;
      s.weapon = "pistol";
      s.ammo = 36;
      this.emit("item", "获得机关枪 · 高伤害，注意弹药");
    } else if (item.kind.startsWith("supply")) {
      s.bow = true;
      if (l.id >= 4) {
        s.pistol = true;
        s.ammo = 48;
      }
      s.stamina = 100;
      this.supplyTimers.set("s" + item.kind.slice(6), this.clock);
      this.emit("item", "补给完成，15 秒后可再次补给");
    } else if (item.kind === "water") {
      if (s.water) return;
      s.water = true;
      this.waterStartedAt = this.clock;
      this.emit("water", "阀门已开启，山泉正流向火墙");
    } else if (item.kind === "rope") {
      s.rope = !s.rope;
      if (s.rope) {
        this.body.position.set(centerX(62) - 4, heightAt(l, 62) + 4.5, -62);
        this.body.velocity.setZero();
        this.collect(4);
        this.notify("攀绳抵达悬崖字块，按 E 返回");
      } else this.spawn(59);
    } else if (item.kind === "scope") {
      s.telescope = true;
      this.notify("获得望远镜，按 F 切换远眺视角");
    } else if (item.kind.startsWith("guardian")) {
      const i = Number(item.kind.slice(-1));
      s.guardians.push(i);
      this.energy(20);
      for (const e of this.enemies) if (e.kind === "boss") e.stun = 5;
      this.emit("item", "石碑亮起 · BOSS 伤害抗性降低，俯冲速度减慢");
    } else this.notify(item.label);
  }
  /** 将外部帧间隔累计为固定物理步长，保持不同帧率下机关与移动一致。 */
  update(dt: number) {
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator >= 1 / 60) {
      this.step(1 / 60);
      this.accumulator -= 1 / 60;
    }
  }
  private step(dt: number) {
    if (this.state.won) return;
    this.clock += dt;
    this.state.time += dt;
    const st = this.state,
      l = this.level;
    if (this.deadTime > 0) {
      this.deadTime = Math.max(0, this.deadTime - dt);
      this.state.deathRemaining = this.deadTime;
      if (this.deathFalls) {
        // Cliff falls keep simulating so the body truly plummets during the
        // death window instead of freezing at the road surface.
        this.body.velocity.x *= 0.98;
        this.body.velocity.z *= 0.98;
        this.world.step(dt);
        this.s = -this.body.position.z;
        this.lane = this.body.position.x - centerX(this.s);
      }
      if (this.deadTime === 0) this.spawn(this.checkpoint);
      return;
    }
    if (this.wordTrap) {
      this.wordTrap.remaining -= dt;
      this.body.velocity.setZero();
      if (this.wordTrap.remaining <= 0) {
        const { text, correct } = this.wordTrap;
        this.emit("explosion");
        this.fail(`收集错误文字：「${text}」应为「${correct}」`);
      }
      return;
    }
    // 水抵达后才撤除碰撞墙，避免画面尚在燃烧时就能穿过。
    if (
      st.water &&
      !st.fireOut &&
      this.clock - this.waterStartedAt >= WATER_TRAVEL_TIME
    ) {
      st.fireOut = true;
      if (this.fireWall) this.world.removeBody(this.fireWall);
      this.emit("water", "大火已熄灭，地面只留下少量水渍");
    }
    if (this.chase.active) {
      if (Math.abs(this.input.x) < 0.3) this.chaseStickArmed = true;
      if (Math.abs(this.input.x) > 0.65 && this.chaseStickArmed) {
        this.turn(this.input.x > 0 ? 1 : -1);
        this.chaseStickArmed = false;
      }
      if (this.deadTime > 0) return;
      const error = this.chase.update(dt, this.input.sprint);
      if (error) {
        this.fail(error);
        return;
      }
      const p = chasePoint(this.chase.distance);
      this.body.position.set(p.x, p.y + this.chase.jumpHeight + 0.42, p.z);
      this.body.velocity.set(
        Math.sin(p.heading) * this.chase.speed,
        0,
        -Math.cos(p.heading) * this.chase.speed,
      );
      st.stamina = this.chase.stamina;
      this.state.chase = this.chase.snapshot;
      if (this.chase.completed) {
        if (this.chaseWall) this.world.removeBody(this.chaseWall);
        this.spawn(134);
        this.bossApproachAt = this.clock + 3.5;
        const boss = this.enemies.find((e) => e.kind === "boss" && e.alive);
        if (boss) this.holdBossBack(boss);
        this.projectiles = [];
        this.energy(35);
        // 胜利奖励不依赖此前是否拾取武器；弓箭提供无限弹药兜底。
        st.bow = true;
        st.pistol = true;
        st.weapon = "pistol";
        st.ammo = Math.max(st.ammo, 48);
        st.stamina = 100;
        this.emit("checkpoint", "逃脱成功！装备就绪，准备迎战");
      }
      return;
    }
    this.s = -this.body.position.z;
    this.lane = this.body.position.x - centerX(this.s);
    // 只在踏入门内时传送；路边经过、跳过门顶或胜利回程均不重复触发。
    if (
      l.id === 5 &&
      !this.chase.completed &&
      Math.abs(this.s - 128) < 1.1 &&
      Math.abs(this.lane) < 2.4 &&
      Math.abs(this.pos.y - heightAt(l, 128)) < 2
    ) {
      this.startChase();
      return;
    }
    this.autoPickups();
    const controls = { ...this.input };
    if (this.state.destination) {
      if (Math.hypot(this.input.x, this.input.y) > 0.08) this.cancelMove();
      else {
        const dest = this.state.destination,
          ds = dest.s - this.s,
          dl = dest.lane - this.lane;
        if (Math.hypot(ds, dl) < 0.55) this.cancelMove();
        else {
          controls.y = Math.max(-1, Math.min(1, ds));
          controls.x = Math.max(-1, Math.min(1, dl));
        }
      }
    }
    const ground = groundAt(l, this.s, this.lane),
      groundContact = this.world.contacts.some((c) =>
        c.bi === this.body
          ? c.ni.y < -0.45
          : c.bj === this.body && c.ni.y > 0.45,
      );
    st.grounded =
      this.body.velocity.y < 2.5 &&
      (groundContact ||
        (!this.forwardJump &&
          ground !== undefined &&
          Math.abs(this.pos.y - ground) < 0.25));
    if (st.grounded) this.forwardJump = false;
    this.invincible = Math.max(0, this.invincible - dt);
    st.cooldown = Math.max(0, st.cooldown - dt);
    for (const k of Object.keys(st.buffs)) {
      st.buffs[k] -= dt;
      if (st.buffs[k] <= 0) delete st.buffs[k];
    }
    const pit = l.pits.findIndex(
      (p) =>
        Math.abs(p - this.s) < 1.8 && Math.abs(this.lane) < 1.8 && st.grounded,
    );
    st.inPit = pit >= 0;
    if (pit >= 0) {
      if (this.pitAt !== pit) {
        this.pitAt = pit;
        this.pitTime = 0;
      }
      this.pitTime += dt;
      st.stamina = Math.max(0, st.stamina - dt * 13);
      if (this.pitTime > 1.25 && this.clock > this.goldUntil) {
        if (l.id === 1) {
          this.checkpoint = l.pits[pit] - 4;
          this.fail("蓄力过晚，滑出浅坑", true);
        } else {
          this.body.position.z += l.id === 4 ? 16 : 11;
          this.body.position.y += 1;
          this.notify("蓄力过晚！滑落长段，重新找准金色窗口");
          this.pitTime = 0;
          this.pitAt = -1;
        }
      }
    } else {
      this.pitAt = -1;
      this.pitTime = 0;
    }
    if (pit >= 0 && pitWindow(l.id, this.pitTime)) {
      this.goldPit = pit;
      this.goldUntil = this.clock + 0.18;
    }
    st.pitReady = pit >= 0 && this.clock <= this.goldUntil;
    st.charge = this.pitTime;
    if (st.climbing) {
      const climb = l.climbs[this.climbIndex];
      st.climbProgress = Math.max(
        0,
        Math.min(1, st.climbProgress + controls.y * dt * 0.34),
      );
      const t = st.climbProgress,
        at = climb.start + (climb.end - climb.start) * t;
      this.body.position.set(
        centerX(at) + climb.lane,
        heightAt(l, climb.start) +
          (heightAt(l, climb.end) + 0.7 - heightAt(l, climb.start)) * t +
          0.42,
        -at,
      );
      this.body.velocity.setZero();
      st.stamina = Math.max(0, st.stamina - Math.abs(controls.y) * dt * 8);
      if (t >= 1) {
        this.spawn(climb.end + 1.2);
        this.emit("checkpoint", "沿绳索登上陡坡");
      }
    } else if (this.launch) {
      const launch = this.launch;
      launch.remaining -= dt;
      this.body.velocity.x = launch.remaining > 0 ? launch.vx : 0;
      this.body.velocity.z = launch.remaining > 0 ? launch.vz : 0;
      this.world.step(dt);
      if (
        launch.remaining <= 0 &&
        this.pos.y <= heightAt(l, launch.targetS) + 0.45
      ) {
        this.body.position.set(
          centerX(launch.targetS) + launch.lane,
          heightAt(l, launch.targetS) + 0.5,
          -launch.targetS,
        );
        this.body.velocity.setZero();
        this.body.aabbNeedsUpdate = true;
        this.launch = null;
      } else if (launch.remaining < -0.9) this.launch = null;
    } else if (st.rope) {
      this.body.velocity.setZero();
      this.body.position.set(centerX(62) - 4, heightAt(l, 62) + 4.5, -62);
    } else {
      const mag = Math.min(1, Math.hypot(controls.x, controls.y)),
        fast = controls.sprint && st.stamina > 2 && mag > 0.1;
      const blades = bladeSpan(l);
      const belt =
        l.belts.some(
          ([a, b]) =>
            this.s > a &&
            this.s < b &&
            (!blades || a !== blades[0] || b !== blades[1]),
        ) && st.grounded;
      const downhill = l.gates.some((g) => this.s > g - 8 && this.s < g - 3);
      st.stamina = Math.max(
        0,
        Math.min(
          100,
          st.stamina + dt * (fast ? -22 : belt ? -24 : st.inPit ? 0 : 11),
        ),
      );
      const boost = !!st.buffs["加速"] || !!st.buffs["借势弹射"];
      this.speed = (fast ? 8.2 : 4.8) * (boost ? 1.4 : 1);
      let f = controls.y * this.speed,
        side = controls.x * this.speed * 0.82;
      if (belt) {
        f *= 0.45;
        if (mag > 0.1) f -= Math.sign(f) * 1.4;
      }
      if (downhill && mag > 0.1) f += 1.3;
      const desiredX =
        side + ((centerX(this.s + 0.2) - centerX(this.s)) / 0.2) * f;
      const ice =
        (l.id === 4 || (l.id === 5 && this.s > 94 && this.s < 125)) &&
        st.grounded;
      const inertia = ice ? 0.065 : st.grounded ? 0.7 : 0.12;
      if (mag > 0.05) this.forwardJump = false;
      if (!this.forwardJump || st.grounded) {
        this.body.velocity.x += (desiredX - this.body.velocity.x) * inertia;
        this.body.velocity.z += (-f - this.body.velocity.z) * inertia;
      }
      const anchor = mag < 0.05 && st.grounded && !ice && !belt;
      const oldX = this.body.position.x,
        oldZ = this.body.position.z;
      this.world.step(dt);
      if (anchor) {
        this.body.position.x = oldX;
        this.body.position.z = oldZ;
        this.body.velocity.x = 0;
        this.body.velocity.z = 0;
        this.body.aabbNeedsUpdate = true;
      }
    }
    this.s = -this.body.position.z;
    this.lane = this.body.position.x - centerX(this.s);
    if (st.grounded && this.s > l.length - 3 && this.completeSummit()) return;
    for (const [i, bladeS] of bladePositions(l).entries()) {
      const bladeY = bladeHeight(l, bladeS, i, this.clock),
        playerY = this.pos.y;
      if (
        Math.abs(this.s - bladeS) < 0.5 &&
        Math.abs(this.lane) < 3.55 &&
        bladeY - 0.55 < playerY + 1.95 &&
        bladeY + 0.55 > playerY
      ) {
        this.fail("被升降大刀砍中");
        return;
      }
    }
    // Off the road the body tumbles down first; death only fires after a real
    // drop, so walking off an edge never kills on the road surface.
    if (this.pos.y < heightAt(l, Math.max(0, this.s)) - 8 || this.pos.y < -12) {
      this.fail(
        this.s < -4 ? "离开了山脚边界" : "脚下失去山体，坠入悬崖",
        l.id === 1,
        true,
      );
      return;
    }
    for (const d of wordDecoys(l)) {
      if (
        Math.abs(this.s - d.s) < 0.85 &&
        Math.abs(this.lane - d.lane) < 0.7 &&
        Math.abs(this.pos.y - heightAt(l, d.s)) < 1.8
      ) {
        this.wordTrap = {
          index: d.index,
          remaining: 0.65,
          text: d.text,
          correct: d.correct,
        };
        st.destination = null;
        this.body.velocity.setZero();
        this.emit("notice", "错字变成了炸弹！");
        return;
      }
    }
    l.words.forEach((p, i) => {
      if (
        Math.abs(this.s - p.s) < 1.65 &&
        Math.abs(this.lane - p.lane) < 1.05 &&
        Math.abs(this.pos.y - (heightAt(l, p.s) + (p.lift ?? 0))) < 2.2
      )
        this.collect(i);
    });
    for (const cp of l.id === 1 ? [20, 69] : l.id === 3 ? [68] : [50, 100])
      if (this.s > cp && !this.checkpointUsed.has(cp)) {
        this.checkpointUsed.add(cp);
        st.checkpoint = cp;
        this.energy(20);
        if (l.id === 1) this.checkpoint = cp;
        this.emit("checkpoint", "抵达检查点 · 大招能量 +20");
      }
    if (l.id === 2) {
      for (const p of [43, 81])
        if (Math.abs(this.s - p) < 1.5 && !this.supplyTimers.has("buff" + p)) {
          this.supplyTimers.set("buff" + p, this.clock);
          st.buffs[p === 43 ? "加速" : "高跳"] = 12;
          this.emit(
            "item",
            p === 43
              ? "加速符文 · 12 秒"
              : "高跳光球 · 12 秒（改善普通跳跃，仍需踩坑越高台）",
          );
        }
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.kind === "boss" && this.clock < this.bossApproachAt) {
        this.holdBossBack(e);
        continue;
      }
      e.stun = Math.max(0, e.stun - dt);
      const base = l.enemies[e.id];
      const phase = e.kind === "boss" ? bossPhase(e.hp, e.max) : 1;
      e.phase = phase;
      if (e.kind === "boss" && this.chase.completed) {
        // 出门保护结束后改为远程交战，不再俯冲贴身；受击硬直也不会破坏间距。
        e.s = this.s + 20;
        e.lane = this.lane;
        e.y = heightAt(l, e.s) + 4.5 + Math.sin(this.clock * 1.5) * 0.5;
        continue;
      }
      if (e.stun <= 0) {
        const rate =
          e.kind === "worm" || e.kind === "spitter"
            ? 1.5
            : e.kind === "boss"
              ? 0.55 - st.guardians.length * 0.07
              : 0.8;
        e.lane =
          (base?.lane ?? 0) +
          Math.sin(this.clock * rate + e.id) *
            (e.kind === "worm" ? 1.7 : e.kind === "spitter" ? 0.7 : 3.4);
        if (e.kind === "worm" || e.kind === "spitter") {
          e.y =
            heightAt(l, e.s) + 0.55 + Math.sin(this.clock * 3 + e.id) * 0.35;
        } else {
          const wave = (Math.sin(this.clock * rate + e.id) + 1) / 2;
          e.s = (base?.s ?? 146) + (wave - 0.5) * (e.kind === "boss" ? 21 : 12);
          e.y = heightAt(l, e.s) + 1 + Math.pow(wave, 2) * 7;
        }
        if (
          this.invincible === 0 &&
          Math.abs(e.s - this.s) < 1.5 &&
          Math.abs(e.lane - this.lane) < 1.15 &&
          Math.abs(e.y - (this.pos.y + 0.8)) < 1.3
        ) {
          this.fail(
            e.kind === "worm" || e.kind === "spitter"
              ? "被怪兽咬中"
              : "被恶龙俯冲击中",
          );
          return;
        }
      }
    }
    const boss = this.enemies.find((e) => e.kind === "boss" && e.alive);
    if (
      boss &&
      this.clock >= this.bossApproachAt &&
      bossPhase(boss.hp, boss.max) === 3 &&
      this.enemies.length < 9 &&
      Math.floor(this.clock) % 4 === 0
    ) {
      const id = this.enemies.length;
      this.events.push({
        kind: "boss-summon",
        x: centerX(boss.s) + boss.lane,
        y: boss.y,
        z: -boss.s,
        end: {
          x: centerX(boss.s - 8) + ((id % 3) - 1) * 2,
          y: heightAt(l, boss.s - 8) + 0.5,
          z: -boss.s + 8,
        },
      });
      this.enemies.push({
        id,
        s: boss.s - 8,
        lane: ((id % 3) - 1) * 2,
        y: heightAt(l, boss.s - 8) + 0.5,
        hp: 2,
        max: 2,
        kind: "worm",
        stun: 0,
        alive: true,
        phase: 1,
      });
    }
    this.updateProjectiles(dt);
    if (this.deadTime > 0) return;
    for (const b of this.bombs) {
      if (!b.active) continue;
      const d = Math.hypot(b.s - this.s, b.lane - this.lane);
      if (b.timed && d < 4 && b.timer < 0) {
        b.timer = 3;
        this.emit("notice", "定时炸弹触发！3 秒内远离，巨石可遮挡冲击");
      }
      if (b.timer >= 0) b.timer -= dt;
      const touch = d < 0.8 && this.pos.y < heightAt(l, b.s) + 1.2,
        explodes = b.timer >= -dt && b.timer < 0;
      if (touch || explodes) {
        b.active = false;
        if (b.chain)
          for (const other of this.bombs)
            if (other.active && Math.abs(other.s - b.s) < 4) other.timer = 0.18;
        this.events.push({
          kind: "explosion",
          x: centerX(b.s) + b.lane,
          y: heightAt(l, b.s) + 0.8,
          z: -b.s,
        });
        const cover =
          this.s > b.s + 2.45 && this.s < b.s + 5 && this.lane < -1.75;
        if (touch || (d < 4 && !cover)) {
          this.fail(touch ? "触碰炸弹，立即爆炸" : "未躲开炸弹冲击波");
          return;
        }
      }
    }
    for (const r of l.rocks) {
      const phase = (this.clock + r) % 5,
        rockY = heightAt(l, r) + 7 - Math.max(0, phase - 3) * 6;
      if (
        phase > 2.8 &&
        Math.hypot(
          this.pos.x - (centerX(r) + Math.sin(this.clock) * 2),
          this.pos.y + 0.85 - rockY,
          this.s - r,
        ) < 1.15
      ) {
        this.fail("落石击中，注意投影预警");
        return;
      }
    }
    if (
      l.id === 5 &&
      !st.fireOut &&
      this.s > 44 &&
      this.s < 47 &&
      Math.abs(this.lane) < 3
    ) {
      this.notify("前方大火封路！回到水渠按 E 引水");
    }
    if (
      l.id === 3 &&
      Math.abs(this.s - 119) < 2 &&
      this.lane < -1 &&
      this.enemies.some((e) => e.alive && e.id === 2)
    )
      this.notify("洞口守卫未清除，藤蔓封住福袋入口");
    st.progress = Math.max(
      0,
      Math.min(100, Math.round((this.s / l.length) * 100)),
    );
    st.prompt =
      this.nearby()?.label ??
      (st.inPit
        ? st.pitReady
          ? "金色窗口！立刻按空格蹬跳"
          : "坑底蓄力中…等到金色再跳"
        : l.id === 4 && this.s > 36 && this.s < 70
          ? "左路虫多补给多 · 右路狙击台与望远镜"
          : "");
    if (this.clock > this.messageUntil) st.message = "";
    this.refreshBoss();
  }
  /** 出门缓冲期间保持至少 24 米距离，同时清除蓄力。 */
  private holdBossBack(boss: Enemy) {
    boss.s = Math.max(this.level.enemies[boss.id]?.s ?? 146, this.s + 24);
    boss.lane = 0;
    boss.y = heightAt(this.level, boss.s) + 5;
    boss.windup = 0;
  }
  /** 蓄力后才从龙口发射可躲避的法术，视觉弹体与碰撞使用相同数据。 */
  private updateBossSpell(dt: number) {
    const boss = this.enemies.find((e) => e.kind === "boss" && e.alive);
    if (!boss) return;
    if (
      this.clock < this.bossApproachAt ||
      Math.abs(boss.s - this.s) > 32 ||
      boss.stun > 0.3
    ) {
      boss.windup = 0;
      return;
    }
    boss.shotCooldown = (boss.shotCooldown ?? 2) - dt;
    boss.windup = Math.max(0, 1 - boss.shotCooldown);
    if (boss.shotCooldown > 0) return;
    const spell = bossPhase(boss.hp, boss.max) === 2 ? "breath" : "lightning";
    const x = centerX(boss.s) + boss.lane,
      y = boss.y + 0.55,
      z = -boss.s + 2.5;
    const dx = this.pos.x - x,
      dy = this.pos.y + 0.9 - y,
      dz = this.pos.z - z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const speed = spell === "lightning" ? 18 : 12;
    for (const spread of spell === "breath" ? [-0.18, 0, 0.18] : [0]) {
      this.projectiles.push({
        id: this.projectileId++,
        x,
        y,
        z,
        vx:
          ((dx / len) * Math.cos(spread) - (dz / len) * Math.sin(spread)) *
          speed,
        vy: (dy / len) * speed,
        vz:
          ((dz / len) * Math.cos(spread) + (dx / len) * Math.sin(spread)) *
          speed,
        life: 3,
        spell,
        source: boss.id,
      });
    }
    this.events.push({
      kind: "boss-cast",
      index: spell === "lightning" ? 1 : 2,
      x,
      y,
      z,
    });
    boss.shotCooldown = spell === "breath" ? 3.6 : 3;
    boss.windup = 0;
  }
  private updateProjectiles(dt: number) {
    this.updateBossSpell(dt);
    for (const e of this.enemies) {
      if (!e.alive || e.kind !== "spitter" || e.stun > 0) continue;
      e.shotCooldown = (e.shotCooldown ?? 1) - dt;
      if (Math.abs(e.s - this.s) > 25) {
        e.shotCooldown = Math.max(0.8, e.shotCooldown);
        e.windup = 0;
        continue;
      }
      if (e.shotCooldown < 0.65 && e.shotCooldown > 0)
        e.windup = 0.65 - e.shotCooldown;
      if (e.shotCooldown <= 0) {
        const x = centerX(e.s) + e.lane,
          y = e.y + 0.35,
          z = -e.s;
        const dx = this.pos.x - x,
          dy = this.pos.y + 0.9 - y,
          dz = this.pos.z - z,
          len = Math.hypot(dx, dy, dz) || 1;
        this.projectiles.push({
          id: this.projectileId++,
          x,
          y,
          z,
          vx: (dx / len) * 12,
          vy: (dy / len) * 12,
          vz: (dz / len) * 12,
          life: 4,
        });
        e.shotCooldown = 2.4;
        e.windup = 0;
        this.events.push({ kind: "spit", x, y, z });
      }
    }
    const blockers = this.world.bodies.filter(
      (b) => b !== this.body && b.type === C.Body.STATIC,
    );
    this.projectiles = this.projectiles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      const from = new C.Vec3(p.x, p.y, p.z);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const to = new C.Vec3(p.x, p.y, p.z),
        result = new C.RaycastResult(),
        ray = new C.Ray(from, to);
      ray.mode = C.Ray.CLOSEST;
      ray.intersectBodies(blockers, result);
      if (result.hasHit) return false;
      const px = this.pos.x,
        py = this.pos.y + 0.9,
        pz = this.pos.z,
        dx = p.x - from.x,
        dy = p.y - from.y,
        dz = p.z - from.z;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((px - from.x) * dx + (py - from.y) * dy + (pz - from.z) * dz) /
            (dx * dx + dy * dy + dz * dz || 1),
        ),
      );
      if (
        this.invincible <= 0 &&
        Math.hypot(
          from.x + dx * t - px,
          from.y + dy * t - py,
          from.z + dz * t - pz,
        ) < 0.7
      ) {
        this.fail(
          p.spell === "lightning"
            ? "被恶龙雷霆击中"
            : p.spell === "breath"
              ? "被恶龙龙息击中"
              : "被吐弹怪兽的子弹击中",
        );
        return false;
      }
      return true;
    });
    if (this.deadTime > 0) this.projectiles = [];
  }
}
