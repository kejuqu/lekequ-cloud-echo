import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, groundAt, heightAt, centerX } from "../src/levels.ts";
import {
  emptySave,
  parseSave,
  canOpenBag,
  canWin,
  pitWindow,
  bossPhase,
} from "../src/rules.ts";
import { Simulation } from "../src/simulation.ts";
const make = (id = 1) => new Simulation(LEVELS[id - 1], emptySave(), () => {});
const moveTo = (sim, s, lane = 0, lift = 0) => {
  sim.body.position.set(
    centerX(s) + lane,
    heightAt(sim.level, s) + 0.45 + lift,
    -s,
  );
  sim.body.velocity.setZero();
  sim.s = s;
  sim.lane = lane;
};
const frames = (sim, n) => {
  for (let i = 0; i < n; i++) sim.update(1 / 60);
};
test("updated scope has five seasons and all final phrase characters", () => {
  assert.equal(LEVELS.length, 5);
  assert.equal(LEVELS[4].collect, "天行健君子以自强不息");
  for (const l of LEVELS) assert.equal(l.words.length, l.collect.length);
});
test("missing even one character blocks bag and summit", () => {
  for (const l of LEVELS) {
    const all = l.words.map((_, i) => i);
    assert.equal(canOpenBag(l, all.slice(1)), false);
    assert.equal(canWin(l, l.idiom, all.slice(1)), false);
    assert.equal(canWin(l, "错误成语", all), false);
    assert.equal(canWin(l, l.idiom, all), true);
  }
  assert.equal(
    canOpenBag(
      LEVELS[4],
      LEVELS[4].words.map((_, i) => i),
      true,
    ),
    false,
  );
});
test("corrupt saves and invalid settings are normalized", () => {
  assert.deepEqual(parseSave("{bad"), emptySave());
  const s = parseSave(
    JSON.stringify({
      completed: [1, 1, 6, "2"],
      lastLevel: 99,
      settings: { opacity: 999, buttonScale: -8, vibration: "false" },
      collected: { 1: [0, 0, 8, -1, 2] },
    }),
  );
  assert.deepEqual(s.completed, [1]);
  assert.deepEqual(s.collected[1], [0, 2]);
  assert.equal(s.settings.opacity, 1);
  assert.equal(s.settings.buttonScale, 0.7);
  assert.equal(s.settings.vibration, true);
});
test("winter charge window is shorter and boss transitions at thirds", () => {
  assert.ok(pitWindow(1, 0.4));
  assert.equal(pitWindow(4, 0.4), false);
  assert.equal(pitWindow(4, 0.95), false);
  assert.ok(pitWindow(3, 0.95));
  assert.deepEqual(
    [bossPhase(36, 36), bossPhase(24, 36), bossPhase(12, 36)],
    [1, 2, 3],
  );
});
test("physical movement collects Chinese word and saves immediately", () => {
  const sim = make();
  moveTo(sim, 12);
  frames(sim, 2);
  assert.ok(sim.state.collected.includes(0));
  assert.deepEqual(sim.save.collected[1], [0]);
});
test("walking outside the terrain falls instead of clamping", () => {
  const sim = make();
  moveTo(sim, 12, 6);
  assert.equal(groundAt(sim.level, 12, 6), undefined);
  frames(sim, 100);
  assert.equal(sim.state.deaths, 1);
  assert.ok(sim.state.collected.includes(0) === false);
});
test("death preserves words but resets all enemies, bag, energy and mechanisms", () => {
  const sim = make(5);
  sim.state.collected = [0, 2, 4];
  sim.state.bag = sim.level.idiom;
  sim.state.energy = 100;
  sim.state.fireOut = true;
  sim.enemies[0].alive = false;
  sim.fail("test");
  frames(sim, 65);
  assert.deepEqual(sim.state.collected, [0, 2, 4]);
  assert.equal(sim.state.bag, "");
  assert.equal(sim.state.energy, 0);
  assert.equal(sim.state.fireOut, false);
  assert.equal(sim.enemies[0].alive, true);
  assert.ok(sim.s < 1);
});
test("each bow rack is tracked individually so later racks stay visible", () => {
  const sim = make(2);
  assert.equal(sim.state.bowRack, -1);
  moveTo(sim, 3, -2);
  frames(sim, 1);
  assert.equal(sim.state.bow, true);
  assert.equal(sim.state.bowRack, 0);
  // 已持弓箭时经过第二个架子不重复发放，记录的架子序号不变，
  // 渲染层据此只隐藏已拾取的架子，其余架子模型保持可见。
  moveTo(sim, 103, 2.5);
  frames(sim, 1);
  assert.equal(sim.state.bow, true);
  assert.equal(sim.state.bowRack, 0);
  // 死亡重生后重置，可在任一架子重新拾取
  sim.fail("test");
  frames(sim, 185);
  assert.equal(sim.state.dead, false);
  assert.equal(sim.state.bow, false);
  assert.equal(sim.state.bowRack, -1);
  moveTo(sim, 103, 2.5);
  frames(sim, 1);
  assert.equal(sim.state.bow, true);
  assert.equal(sim.state.bowRack, 1);
});
test("normal jump cannot clear ledge, perfectly charged pit can", () => {
  const sim = make();
  moveTo(sim, 25);
  frames(sim, 30);
  assert.equal(sim.state.inPit, true);
  assert.ok(pitWindow(1, sim.state.charge));
  sim.jump();
  assert.ok(sim.body.velocity.y > 12);
  sim.input.y = 1;
  let reached = false;
  for (let i = 0; i < 90; i++) {
    sim.update(1 / 60);
    if (sim.s > 29 && sim.pos.y >= heightAt(sim.level, 29) - 0.1)
      reached = true;
  }
  assert.ok(reached, "pit jump must reach the upper platform");
  const small = make();
  moveTo(small, 26);
  frames(small, 2);
  small.jump();
  assert.ok(small.body.velocity.y < 7);
});
test("pit timeout slips and teaching checkpoint is used", () => {
  const sim = make();
  moveTo(sim, 25);
  frames(sim, 85);
  assert.equal(sim.state.deaths, 1);
  frames(sim, 200);
  assert.ok(sim.s > 19 && sim.s < 23);
});
test("sprint drains stamina; standing on reverse belt drains it too", () => {
  const sim = make(2);
  sim.state.stamina = 100;
  sim.input = { x: 0, y: 1, sprint: true, shoot: false };
  frames(sim, 30);
  assert.ok(sim.state.stamina < 95);
  moveTo(sim, 35);
  sim.input = { x: 0, y: 0, sprint: false, shoot: false };
  frames(sim, 15);
  assert.ok(sim.state.stamina < 90);
});
test("weapon pickups, finite ammo and nonlethal ultimate obey rules", () => {
  const sim = make(5);
  moveTo(sim, 3);
  frames(sim, 1);
  assert.equal(sim.state.bow, true);
  moveTo(sim, sim.level.gates[0] + 4);
  frames(sim, 1);
  assert.equal(sim.state.ammo, 36);
  sim.shoot();
  assert.equal(sim.state.ammo, 35);
  sim.state.energy = 100;
  moveTo(sim, 142);
  sim.burst();
  const boss = sim.enemies.find((e) => e.kind === "boss");
  assert.equal(boss.hp, boss.max);
  assert.ok(boss.stun > 0);
  assert.equal(sim.state.cooldown, 25);
  assert.equal(sim.state.energy, 0);
});
test("final water, rope, guardian and blocked boss summit are interactive", () => {
  const sim = make(5);
  moveTo(sim, 40, -3.15);
  sim.interact();
  assert.equal(sim.state.water, true);
  assert.equal(sim.state.fireOut, false);
  for (let i = 0; i < 150; i++) sim.update(1 / 60);
  assert.equal(sim.state.fireOut, true);
  moveTo(sim, 59, -2);
  sim.interact();
  assert.equal(sim.state.rope, true);
  assert.ok(sim.state.collected.includes(4));
  sim.interact();
  assert.equal(sim.state.rope, false);
  moveTo(sim, 137, -3);
  sim.interact();
  assert.deepEqual(sim.state.guardians, [0]);
  moveTo(sim, 184);
  sim.state.collected = sim.level.words.map((_, i) => i);
  sim.state.bag = sim.level.idiom;
  sim.interact();
  assert.equal(sim.state.won, false);
});
test("summit validates idiom and persists completion", () => {
  const sim = make();
  sim.state.collected = [0, 1, 2, 3];
  moveTo(sim, 108, -1.5);
  sim.update(1 / 60);
  assert.equal(sim.state.bag, "春暖花开");
  moveTo(sim, 112);
  sim.interact();
  assert.equal(sim.state.won, true);
  assert.deepEqual(sim.save.completed, [1]);
});
test("every seasonal pit launches onto its matching upper ledge", () => {
  for (const level of LEVELS)
    for (let j = 0; j < level.pits.length; j++) {
      const sim = make(level.id),
        pit = level.pits[j];
      moveTo(sim, pit);
      frames(sim, 32);
      sim.jump();
      sim.input.y = 1;
      let reached = false;
      for (let i = 0; i < 100; i++) {
        sim.update(1 / 60);
        if (
          sim.s > level.gates[j] + 0.6 &&
          sim.state.grounded &&
          sim.pos.y >= heightAt(level, sim.s) - 0.25
        )
          reached = true;
      }
      assert.ok(reached, `${level.name}: pit ${pit} must be traversable`);
    }
});
test("shots damage visible beasts, terrain blocks shots and boss does not die to a burst", () => {
  const sim = make(2);
  moveTo(sim, 3);
  frames(sim, 1);
  moveTo(sim, 20);
  sim.shoot(0);
  assert.equal(sim.enemies[0].hp, 1);
  sim.clock += 1;
  sim.shoot(0);
  assert.equal(sim.enemies[0].alive, false);
  assert.equal(sim.state.energy, 24);
  const autumn = make(3);
  moveTo(autumn, 3);
  frames(autumn, 1);
  moveTo(autumn, 29);
  const hp = autumn.enemies[1].hp;
  autumn.shoot(1);
  assert.equal(autumn.enemies[1].hp, hp, "high ledge must block arrow");
});
test("touching bombs fails immediately and resets finite weapons", () => {
  const sim = make(5);
  sim.state.pistol = true;
  sim.state.ammo = 11;
  moveTo(sim, 67, -2);
  frames(sim, 1);
  assert.equal(sim.state.deaths, 1);
  assert.equal(sim.state.ammo, 0);
  assert.equal(sim.state.pistol, false);
});
test("final boss phases and victory open the summit only after combat", () => {
  const sim = make(5);
  moveTo(sim, 3);
  frames(sim, 1);
  moveTo(sim, sim.level.gates[0] + 4);
  frames(sim, 1);
  sim.state.collected = sim.level.words.map((_, i) => i);
  for (const [i, s] of [137, 143, 149].entries()) {
    moveTo(sim, s, i % 2 === 0 ? -3 : 3);
    sim.interact();
  }
  moveTo(sim, 140);
  const phases = new Set();
  for (let i = 0; i < 20 && sim.bossAlive; i++) {
    sim.clock += 1;
    sim.shoot(3);
    phases.add(sim.state.phase);
  }
  assert.equal(sim.bossAlive, false);
  assert.ok(phases.has(2));
  assert.ok(phases.has(3));
  assert.equal(sim.bagVisible, false, "chase must also be completed");
  sim.chase.completed = true;
  assert.ok(sim.bagVisible);
  moveTo(sim, 179);
  sim.update(1 / 60);
  moveTo(sim, 184);
  sim.interact();
  assert.equal(sim.state.won, true);
  assert.deepEqual(sim.save.completed, [5]);
});
