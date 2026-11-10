import test from "node:test";
import assert from "node:assert/strict";
import {
  LEVELS,
  weaponPickups,
  wordDecoys,
  heightAt,
  centerX,
} from "../src/levels.ts";
import { Simulation } from "../src/simulation.ts";
import { emptySave } from "../src/rules.ts";
function place(sim, p) {
  sim.body.position.set(
    centerX(p.s) + p.lane,
    heightAt(sim.level, p.s) + 0.46,
    -p.s,
  );
  sim.body.velocity.setZero();
  sim.s = p.s;
  sim.lane = p.lane;
}
const step = (sim, n = 1) => {
  for (let i = 0; i < n; i++) sim.update(1 / 60);
};
test("wrong characters transform before explosion, preserve progress, and reset after death", () => {
  for (const level of LEVELS) {
    const save = emptySave();
    save.collected[level.id] = [0];
    const sim = new Simulation(level, save, () => {});
    const decoy = wordDecoys(level)[0];
    assert.notEqual(decoy.text, decoy.correct);
    place(sim, decoy);
    step(sim);
    assert.ok(sim.wordTrap);
    assert.equal(sim.state.dead, false);
    step(sim, 41);
    assert.equal(sim.state.dead, true);
    assert.match(sim.state.deathReason, /收集错误文字/);
    assert.ok(sim.state.deathReason.includes(decoy.text));
    assert.deepEqual(sim.state.collected, [0]);
    step(sim, 181);
    assert.equal(sim.wordTrap, null);
    assert.equal(sim.state.dead, false);
  }
});
test("correct word can be collected without touching a decoy", () => {
  for (const level of LEVELS) {
    const sim = new Simulation(level, emptySave(), () => {});
    place(sim, level.words[0]);
    step(sim);
    assert.ok(sim.state.collected.includes(0));
    assert.equal(sim.wordTrap, null);
  }
});
test("guns sit beyond the first ledge, summit bows are independently collectible", () => {
  for (const level of LEVELS.slice(1)) {
    const sim = new Simulation(level, emptySave(), () => {});
    const pickups = weaponPickups(level);
    if (pickups.gun) {
      place(sim, { s: 8, lane: 2 });
      step(sim);
      assert.equal(sim.state.pistol, false);
      assert.ok(pickups.gun.s > level.gates[0]);
    }
    const summit = pickups.bows.at(-1);
    assert.ok(summit.s > level.length * 0.7);
    place(sim, summit);
    step(sim);
    assert.equal(sim.state.bow, true);
  }
});
test("machine gun supports sustained rapid fire and never refills by standing on the pickup", () => {
  const sim = new Simulation(LEVELS[3], emptySave(), () => {});
  place(sim, weaponPickups(sim.level).gun);
  step(sim);
  sim.shoot();
  step(sim, 7);
  sim.shoot();
  step(sim, 7);
  sim.shoot();
  assert.equal(sim.state.ammo, 33);
  step(sim, 10);
  assert.equal(sim.state.ammo, 33);
});

test("boss soundtrack uses percussion and speeds up in the last phase", async () => {
  const { Sound } = await import("../src/audio.ts");
  function score(phase) {
    const sound = new Sound();
    let notes = 0,
      drums = 0;
    sound.tone = () => notes++;
    sound.noise = () => drums++;
    for (let i = 0; i < 120; i++) sound.update(1 / 60, 5, phase);
    return { notes, drums };
  }
  assert.ok(score(1).drums > 0);
  assert.ok(score(3).notes > score(1).notes);
  assert.equal(score(0).drums, 0);
});
