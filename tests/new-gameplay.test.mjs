import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/simulation.ts";
import { LEVELS, bladePositions, centerX, heightAt } from "../src/levels.ts";
import { emptySave } from "../src/rules.ts";
import { Chase, CHASE_DURATION, CHASE_TURNS } from "../src/chase.ts";
const make = (id = 1) => new Simulation(LEVELS[id - 1], emptySave(), () => {});
function place(sim, s, lane = 0) {
  sim.body.position.set(centerX(s) + lane, heightAt(sim.level, s) + 0.46, -s);
  sim.body.velocity.setZero();
  sim.body.aabbNeedsUpdate = true;
  sim.s = s;
  sim.lane = lane;
}
function frames(sim, n) {
  for (let i = 0; i < n; i++) sim.update(1 / 60);
}
function playChase(chase, step) {
  for (let i = 0; i < 8000 && chase.active; i++) {
    const hud = chase.snapshot;
    if (hud.turnReady) chase.turn(hud.direction);
    if (hud.obstacleIn > 0.1 && hud.obstacleIn < 0.43 && hud.jumpHeight === 0)
      chase.jump();
    const error = step();
    assert.equal(error, null);
  }
  assert.equal(chase.completed, true);
}
test("golden pit: Space alone lands on every matching platform without W", () => {
  for (const level of LEVELS)
    for (let j = 0; j < level.pits.length; j++) {
      const sim = new Simulation(
        { ...level, enemies: [], bombs: [], rocks: [] },
        emptySave(),
        () => {},
      );
      place(sim, level.pits[j], 0.9);
      frames(sim, 33);
      assert.equal(sim.state.pitReady, true);
      sim.jump();
      assert.equal(sim.input.y, 0);
      let landed = false;
      for (let i = 0; i < 120; i++) {
        sim.update(1 / 60);
        if (sim.s > level.gates[j] + 1 && sim.state.grounded && !sim.state.dead)
          landed = true;
      }
      assert.ok(
        landed,
        `${level.name} pit ${j}: Space must land with no forward input`,
      );
    }
});
test("gold window retains a short input grace period for display latency", () => {
  const sim = make();
  place(sim, 25);
  frames(sim, 66);
  assert.equal(sim.state.pitReady, true);
  frames(sim, 6);
  assert.equal(sim.state.pitReady, true);
  sim.jump();
  assert.ok(sim.body.velocity.y > 12);
  frames(sim, 100);
  assert.ok(sim.s > 29);
});
test("weapon pickup needs no interaction and cannot farm pistol ammo", () => {
  const sim = make(4);
  place(sim, 3, -2);
  frames(sim, 1);
  assert.ok(sim.state.bow);
  place(sim, sim.level.gates[0] + 4, 2);
  frames(sim, 1);
  assert.ok(sim.state.pistol);
  assert.equal(sim.state.ammo, 36);
  sim.shoot();
  frames(sim, 15);
  assert.equal(sim.state.ammo, 35);
});
test("spitters exist in all requested levels and emit moving projectiles", () => {
  for (const id of [3, 4, 5]) {
    const sim = make(id),
      enemy = sim.enemies.find((e) => e.kind === "spitter");
    assert.ok(enemy);
    place(sim, enemy.s - 6);
    enemy.shotCooldown = 0.01;
    frames(sim, 1);
    assert.ok(sim.projectiles.length);
    const x = sim.projectiles[0].x,
      z = sim.projectiles[0].z;
    frames(sim, 1);
    assert.ok(sim.projectiles[0].x !== x || sim.projectiles[0].z !== z);
  }
});
test("a fast projectile uses swept collision, leaves a corpse for 3 seconds, then respawns", () => {
  const sim = make(3);
  place(sim, 12);
  sim.invincible = 0;
  const p = sim.pos;
  sim.projectiles.push({
    id: 999,
    x: p.x + 2,
    y: p.y + 0.9,
    z: p.z,
    vx: -120,
    vy: 0,
    vz: 0,
    life: 2,
  });
  frames(sim, 1);
  assert.equal(sim.state.dead, true);
  assert.match(sim.state.deathReason, /子弹/);
  assert.ok(sim.s > 10);
  frames(sim, 120);
  assert.equal(sim.state.dead, true);
  assert.ok(sim.state.deathRemaining < 1.1);
  frames(sim, 65);
  assert.equal(sim.state.dead, false);
  assert.ok(sim.s < 1);
});
test("bite death is shown on the road before respawn and retains collected words", () => {
  const sim = make(2);
  sim.state.collected = [0];
  place(sim, 24);
  sim.invincible = 0;
  const e = sim.enemies[0];
  e.stun = 0;
  e.lane = sim.lane;
  sim.clock = 0;
  sim.fail("被怪兽咬中");
  assert.ok(sim.state.dead);
  assert.ok(sim.s > 20);
  assert.deepEqual(sim.state.collected, [0]);
  frames(sim, 185);
  assert.ok(!sim.state.dead);
});
test("each new steep cliff requires attaching to a rope and sustained climbing", () => {
  for (const id of [3, 4, 5]) {
    const sim = make(id),
      climb = sim.level.climbs[0];
    place(sim, climb.start);
    frames(sim, 1);
    sim.interact();
    assert.equal(sim.state.climbing, true);
    const y = sim.pos.y;
    sim.input.y = 1;
    frames(sim, 60);
    assert.equal(sim.state.climbing, true);
    assert.ok(sim.pos.y > y + 1);
    frames(sim, 140);
    assert.equal(sim.state.climbing, false);
    assert.ok(sim.s > climb.end);
    assert.ok(sim.pos.y > heightAt(sim.level, climb.end) - 0.2);
  }
});
test("click destination moves to ground, rejects void, and manual input takes over", () => {
  const sim = make();
  assert.ok(sim.navigate(centerX(10), -10));
  frames(sim, 170);
  assert.ok(sim.s > 9);
  assert.equal(sim.state.destination, null);
  assert.equal(sim.navigate(100, -10), false);
  sim.navigate(centerX(15), -15);
  sim.input.x = 1;
  frames(sim, 1);
  assert.equal(sim.state.destination, null);
});
test("walking off the edge tumbles down the cliff before dying", () => {
  const sim = make();
  place(sim, 12, 0);
  frames(sim, 5);
  const road = heightAt(sim.level, 12);
  // Shove sideways off the road at road height: must fall first, not die on the road.
  sim.body.position.x = centerX(12) + 12;
  sim.body.velocity.setZero();
  frames(sim, 25);
  assert.equal(sim.state.dead, false, "no instant death at the boundary");
  assert.ok(sim.pos.y < road - 0.5, "player should be tumbling below the road");
  frames(sim, 90);
  assert.equal(sim.state.dead, true);
  assert.match(sim.state.deathReason, /坠入悬崖|山脚边界/);
  assert.ok(sim.pos.y < road - 6, "death only after a real drop");
  const yAtDeath = sim.pos.y;
  frames(sim, 30);
  assert.ok(
    sim.pos.y < yAtDeath - 10,
    "corpse keeps plummeting during the death window",
  );
});
test("all slain enemies revive at full health after respawn", () => {
  const sim = make(5);
  place(sim, 20);
  sim.invincible = 0;
  sim.enemies.find((e) => e.kind === "worm").alive = false;
  const boss = sim.enemies.find((e) => e.kind === "boss");
  boss.alive = false;
  boss.hp = 0;
  sim.fail("跌落试炼");
  frames(sim, 200);
  assert.ok(!sim.state.dead);
  assert.equal(
    sim.enemies.find((e) => e.kind === "worm").alive,
    true,
    "slain worm must revive",
  );
  const revived = sim.enemies.find((e) => e.kind === "boss");
  assert.equal(revived.alive, true, "boss must revive");
  assert.equal(revived.hp, revived.max);
  assert.ok(sim.enemies.every((e) => e.alive && e.hp === e.max));
});
test("manual restart restores every enemy for a fresh run", () => {
  const sim = make(5);
  sim.invincible = 0;
  for (const e of sim.enemies) {
    e.alive = false;
    e.hp = 0;
  }
  sim.restart();
  assert.ok(sim.enemies.every((e) => e.alive));
});
test("click navigation works again after respawn", () => {
  const sim = make();
  place(sim, 40);
  sim.invincible = 0;
  frames(sim, 1);
  sim.fail("跌落试炼");
  frames(sim, 200);
  assert.ok(!sim.state.dead);
  assert.ok(sim.deadTime <= 0);
  assert.ok(sim.navigate(centerX(10), -10));
  frames(sim, 170);
  assert.ok(sim.s > 9);
});
test("runner lasts a full 30 simulated seconds, requires all turns, and does not auto-win", () => {
  const chase = new Chase();
  chase.start();
  for (let i = 0; i < 180; i++) chase.update(1 / 60);
  assert.ok(chase.elapsed < 0.02);
  let missed = null;
  for (let i = 0; i < 300 && !missed; i++) missed = chase.update(1 / 60);
  assert.match(missed, /急转弯/);
  assert.equal(chase.completed, false);
  const good = new Chase();
  good.start();
  playChase(good, () => good.update(1 / 60));
  assert.equal(good.elapsed, CHASE_DURATION);
  assert.equal(
    good.snapshot.turns,
    CHASE_TURNS.filter((t) => t.at <= good.distance + 11).length,
  );
});
test("wrong direction and repeated obstacle hits allow the beast to catch the player", () => {
  const chase = new Chase();
  chase.start();
  while (!chase.snapshot.turnReady) chase.update(1 / 60);
  assert.match(chase.turn(1), /方向错误/);
  const collide = new Chase();
  collide.start();
  let error = null;
  for (let i = 0; i < 8000 && !error; i++) {
    if (collide.snapshot.turnReady) collide.turn(collide.snapshot.direction);
    error = collide.update(1 / 60);
  }
  assert.match(error, /失速/);
});
test("final mountain gate unlocks only after actual 30-second runner completion", () => {
  const sim = make(5);
  place(sim, 128);
  sim.interact();
  assert.equal(sim.chase.active, true);
  playChase(sim.chase, () => {
    sim.update(1 / 60);
    return sim.state.dead ? sim.state.deathReason : null;
  });
  assert.ok(sim.s > 133 && sim.s < 136);
  assert.equal(sim.state.chase.completed, true);
  assert.ok(sim.state.energy >= 35);
  assert.equal(sim.state.bow, true);
  assert.equal(sim.state.pistol, true);
  assert.equal(sim.state.weapon, "pistol");
  assert.ok(sim.state.ammo >= 48);
  // 胜利返回门后，允许直接使用奖励武器伤害恶龙。
  const boss = sim.enemies.find((e) => e.kind === "boss");
  place(sim, boss.s - 4, boss.lane);
  const hp = boss.hp;
  sim.shoot(boss.id);
  assert.ok(boss.hp < hp);
  assert.equal(sim.state.ammo, 47);
});
test("standing still on a normal upper platform does not slide off after landing", () => {
  const sim = make();
  place(sim, 30.7);
  frames(sim, 30);
  const at = sim.s;
  frames(sim, 1200);
  assert.ok(Math.abs(sim.s - at) < 0.15);
  assert.equal(sim.state.dead, false);
  assert.equal(sim.state.deaths, 0);
});

test("normal jumps move forward and land without holding W on every mountain", () => {
  for (const level of LEVELS) {
    const sim = new Simulation(
      { ...level, enemies: [], bombs: [], rocks: [] },
      emptySave(),
      () => {},
    );
    place(sim, 12);
    frames(sim, 2);
    sim.jump();
    assert.equal(sim.input.y, 0);
    frames(sim, 100);
    assert.ok(sim.s > 14.5, `${level.name}: jump must travel forward`);
    assert.equal(sim.state.grounded, true);
    assert.equal(sim.state.dead, false);
  }
});

test("fifth mountain jump crosses the broken step without forward input", () => {
  const sim = new Simulation(
    { ...LEVELS[4], enemies: [], bombs: [], rocks: [] },
    emptySave(),
    () => {},
  );
  place(sim, 98.2);
  frames(sim, 2);
  sim.jump();
  frames(sim, 120);
  assert.ok(sim.s > 102.2, `expected to cross gap, landed at ${sim.s}`);
  assert.equal(sim.state.grounded, true);
  assert.equal(sim.state.dead, false);
});

test("walking near the summit flag automatically wins and opens the success dialog", () => {
  const sim = make();
  sim.state.collected = sim.level.words.map((_, i) => i);
  sim.state.bag = sim.level.idiom;
  place(sim, sim.level.length, 2);
  frames(sim, 1);
  assert.equal(sim.state.won, true);
  assert.deepEqual(sim.save.completed, [1]);
});

test("walking near the summit flag without the bag does not bypass prerequisites", () => {
  const sim = make();
  sim.state.collected = sim.level.words.map((_, i) => i);
  place(sim, sim.level.length, 2);
  frames(sim, 1);
  assert.equal(sim.state.won, false);
});

test("click navigation emits walking guidance at the requested ground point", () => {
  const sim = make(),
    x = centerX(10),
    z = -10;
  assert.equal(sim.navigate(x, z), true);
  const guide = sim.events.find((event) => event.kind === "guide");
  assert.ok(guide, "valid click should create walking guidance");
  assert.equal(guide.x, x);
  assert.equal(guide.y, heightAt(sim.level, 10));
  assert.equal(guide.z, z);
  sim.events.length = 0;
  assert.equal(sim.navigate(100, -10), false);
  assert.equal(
    sim.events.some((event) => event.kind === "guide"),
    false,
    "invalid clicks should not create walking guidance",
  );
});

test("low blades in the first former belt kill on contact from level three onward", () => {
  for (const id of [3, 4, 5]) {
    const sim = make(id),
      at = sim.level.belts[0][0] + 0.8;
    place(sim, at);
    sim.clock = 0;
    frames(sim, 1);
    assert.equal(
      sim.state.dead,
      true,
      `${sim.level.name}: low blade must kill`,
    );
    assert.match(sim.state.deathReason, /大刀/);
  }
});

test("raised blades leave a safe window and remove the old reverse-belt drain", () => {
  for (const id of [3, 4, 5]) {
    const sim = make(id),
      at = sim.level.belts[0][0] + 0.8;
    place(sim, at);
    sim.clock = Math.PI / 2 / 2.8 - 1 / 60;
    frames(sim, 1);
    assert.equal(
      sim.state.dead,
      false,
      `${sim.level.name}: raised blade is safe`,
    );
    assert.equal(sim.state.stamina, 100, "old belt drain must be removed");
  }
});

test("blade gauntlets use wide readable gaps between adjacent blades", () => {
  for (const id of [3, 4, 5]) {
    const positions = bladePositions(LEVELS[id - 1]);
    for (let i = 1; i < positions.length; i++)
      assert.ok(
        positions[i] - positions[i - 1] >= 2.05,
        `${LEVELS[id - 1].name}: blades need wider spacing`,
      );
  }
});

test("click-to-walk automatically reaches a road target on every mountain", () => {
  for (const level of LEVELS) {
    const sim = new Simulation(
      { ...level, enemies: [], bombs: [], rocks: [] },
      emptySave(),
      () => {},
    );
    assert.equal(sim.navigate(centerX(10), -10), true);
    frames(sim, 200);
    assert.ok(sim.s > 9.2, `${level.name}: click must move player forward`);
    assert.equal(sim.state.destination, null);
  }
});

test("shot events distinguish bowstrings from pistol gunfire", () => {
  const bow = make(2);
  place(bow, 3, -2);
  frames(bow, 1);
  bow.shoot();
  assert.equal(bow.events.find((event) => event.kind === "shot")?.index, 0);
  const pistol = make(4);
  place(pistol, pistol.level.gates[0] + 4, 2);
  frames(pistol, 1);
  pistol.shoot();
  assert.equal(pistol.events.find((event) => event.kind === "shot")?.index, 1);
});

test("pistol ammunition supplies are on distant higher sections, not beside the gun", () => {
  for (const [id, ammoAt] of [
    [4, 64],
    [5, 75],
  ]) {
    const sim = make(id);
    place(sim, 10);
    assert.ok(!sim.nearby()?.kind.startsWith("supply"));
    place(sim, ammoAt);
    assert.equal(sim.nearby()?.kind, `supply${ammoAt}`);
  }
});

test("walking into the vortex teleports to the chase arena without interaction", () => {
  const sim = make(5);
  place(sim, 128);
  sim.update(1 / 60);
  assert.equal(sim.chase.active, true);
  assert.ok(sim.pos.x > 200);
  assert.equal(sim.state.destination, null);
});

test("passing beside the vortex does not start the chase", () => {
  const sim = make(5);
  place(sim, 128, 3.2);
  sim.update(1 / 60);
  assert.equal(sim.chase.active, false);
});

test("boss spells charge then launch from the dragon, with distinct phase attacks", () => {
  for (const [hp, spell, count] of [
    [36, "lightning", 1],
    [20, "breath", 3],
    [8, "lightning", 1],
  ]) {
    const sim = make(5);
    const boss = sim.enemies.find((e) => e.kind === "boss");
    sim.enemies.forEach((e) => {
      if (e !== boss) e.alive = false;
    });
    place(sim, 138);
    boss.hp = hp;
    boss.shotCooldown = 0.7;
    let charged = false;
    for (
      let i = 0;
      i < 90 && !sim.events.some((e) => e.kind === "boss-cast");
      i++
    ) {
      sim.update(1 / 60);
      charged ||= (boss.windup ?? 0) > 0.1;
    }
    assert.equal(charged, true);
    const cast = sim.events.find((e) => e.kind === "boss-cast");
    assert.ok(cast);
    assert.equal(cast.x, centerX(boss.s) + boss.lane);
    assert.equal(cast.y, boss.y + 0.55);
    assert.equal(cast.z, -boss.s + 2.5);
    const bolts = sim.projectiles.filter((p) => p.spell === spell);
    assert.equal(bolts.length, count);
    assert.ok(
      bolts.every(
        (p) =>
          p.source === boss.id &&
          Math.hypot(p.x - cast.x, p.y - cast.y, p.z - cast.z) < 0.4,
      ),
    );
  }
});

test("successful shots carry the enemy endpoint and hit coordinates", () => {
  const sim = make(5);
  const boss = sim.enemies.find((e) => e.kind === "boss");
  place(sim, boss.s - 4, boss.lane);
  sim.state.pistol = true;
  sim.state.weapon = "pistol";
  sim.state.ammo = 12;
  sim.shoot(boss.id);
  const shot = sim.events.find((e) => e.kind === "shot");
  const hit = sim.events.find((e) => e.kind === "hit");
  assert.equal(shot.targetId, boss.id);
  assert.deepEqual(shot.end, { x: hit.x, y: hit.y, z: hit.z });
  assert.equal(hit.y, boss.y);
  assert.equal(hit.z, -boss.s);
});

test("left-side water gate is reachable from the left edge and not from the right", () => {
  const sim = make(5);
  place(sim, 40, 3);
  assert.notEqual(sim.nearby()?.kind, "water");
  place(sim, 40, -3.15);
  assert.equal(sim.nearby()?.kind, "water");
  sim.interact();
  assert.equal(sim.state.water, true);
});

test("chase sprint increases distance and gap, drains stamina, and recovers on release", () => {
  const fast = new Chase(),
    normal = new Chase();
  fast.start();
  normal.start();
  fast.countdown = normal.countdown = 0;
  for (let i = 0; i < 60; i++) {
    fast.update(1 / 60, true);
    normal.update(1 / 60);
  }
  assert.ok(fast.distance > normal.distance * 1.3);
  assert.ok(fast.gap > normal.gap);
  assert.ok(fast.stamina < 80);
  const tired = fast.stamina;
  fast.update(0.1, false);
  assert.equal(fast.snapshot.sprinting, false);
  assert.ok(fast.stamina > tired);
  fast.reset();
  assert.equal(fast.distance, 0);
  assert.equal(fast.stamina, 100);
});

test("beast stays glued while running and mirrors sprint to keep pace", () => {
  const chase = new Chase();
  chase.start();
  chase.countdown = 0;
  for (let i = 0; i < 120; i++) chase.update(1 / 60);
  assert.ok(Math.abs(chase.gap - 12) < 1e-9, `gap drifted to ${chase.gap}`);
  for (let i = 0; i < 120; i++) chase.update(1 / 60, true);
  assert.ok(chase.gap > 12, `expected sprint to reopen gap, got ${chase.gap}`);
  assert.ok(chase.gap <= 12 + 2.1, `beast should keep close, got ${chase.gap}`);
});

test("sprinting chase still lasts 30 seconds and stays inside the extended course", () => {
  const chase = new Chase();
  chase.start();
  playChase(chase, () => chase.update(1 / 60, true));
  assert.equal(chase.elapsed, CHASE_DURATION);
  assert.ok(chase.distance > CHASE_DURATION * 10);
  assert.ok(chase.distance <= CHASE_DURATION * 14);
  assert.ok(chase.stamina >= 0 && chase.stamina <= 100);
});

test("dragon keeps away and cannot cast for 3.5 seconds after returning from chase", () => {
  const sim = make(5);
  sim.startChase();
  playChase(sim.chase, () => {
    sim.update(1 / 60);
    return sim.state.dead ? sim.state.deathReason : null;
  });
  const boss = sim.enemies.find((e) => e.kind === "boss");
  assert.ok(boss.s - sim.s >= 24);
  boss.shotCooldown = 0;
  sim.events = [];
  frames(sim, 209);
  assert.ok(boss.s - sim.s >= 24);
  assert.equal(boss.windup, 0);
  assert.ok(
    !sim.events.some((e) => e.kind === "boss-cast" || e.kind === "boss-summon"),
  );
  frames(sim, 3);
  assert.ok(sim.events.some((e) => e.kind === "boss-cast"));
  assert.ok(Math.abs(boss.s - sim.s - 20) < 0.01);
  place(sim, 143);
  boss.stun = 0.24;
  sim.update(1 / 60);
  assert.ok(Math.abs(boss.s - sim.s - 20) < 0.01);
});

test("shooting towards the dragon automatically locks it without a precise target", () => {
  const sim = make(5);
  const boss = sim.enemies.find((e) => e.kind === "boss");
  place(sim, 134);
  boss.s = 154;
  boss.y = heightAt(sim.level, boss.s) + 5;
  sim.state.pistol = true;
  sim.state.weapon = "pistol";
  sim.state.ammo = 48;
  const hp = boss.hp;
  sim.shoot();
  assert.equal(boss.hp, hp - 4);
  assert.equal(sim.events.find((e) => e.kind === "shot").targetId, boss.id);
});
