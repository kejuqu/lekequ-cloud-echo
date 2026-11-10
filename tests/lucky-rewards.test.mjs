import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { LEVELS, centerX, heightAt } from "../src/levels.ts";
import { Simulation } from "../src/simulation.ts";
import { emptySave } from "../src/rules.ts";
import { LUCKY_REWARDS } from "../src/lucky-rewards.ts";
import { createLuckyCelebration } from "../src/lucky-celebration.ts";

test("all levels award each lucky reward once and clear it on death", () => {
  const random = Math.random;
  try {
    for (const level of LEVELS)
      for (let index = 0; index < 4; index++) {
        const sim = new Simulation(level, emptySave(), () => {});
        sim.s = level.bag.s;
        sim.lane = level.bag.lane;
        sim.body.position.set(
          centerX(sim.s) + sim.lane,
          heightAt(level, sim.s) + 0.42,
          -sim.s,
        );
        sim.update(1 / 60);
        assert.equal(sim.state.reward, "", "missing letters block rewards");
        sim.state.collected = [...level.collect].map((_, i) => i);
        sim.enemies.forEach((enemy) => {
          enemy.alive = false;
        });
        sim.chase.completed = true;
        sim.body.position.z += 2;
        sim.update(1 / 60);
        assert.equal(sim.state.reward, "", "nearby without touching does not open the bag");
        assert.notEqual(sim.nearby()?.kind, "bag", "bag has no interaction prompt");
        sim.body.position.set(centerX(level.bag.s) + level.bag.lane, heightAt(level, level.bag.s) + 0.42, -level.bag.s);
        Math.random = () => (index + 0.5) / 4;
        sim.update(1 / 60);
        assert.equal(sim.state.reward, LUCKY_REWARDS[index]);
        assert.equal(sim.state.bag, level.idiom);
        assert.equal(
          sim.events.filter((event) => event.kind === "bag").length,
          1,
        );
        sim.update(1 / 60);
        assert.equal(
          sim.events.filter((event) => event.kind === "bag").length,
          1,
        );
        sim.fail("test");
        assert.equal(sim.state.reward, "");
      }
  } finally {
    Math.random = random;
  }
});

test("all four celebrations animate, expire and clean up when interrupted", () => {
  const scene = new T.Scene();
  const effect = createLuckyCelebration(scene);
  for (let index = 0; index < 4; index++) {
    effect.play(index, new T.Vector3(1, 2, 3));
    assert.equal(scene.children.length, 1);
    assert.ok(scene.children[0].children.length > 10);
    effect.update(1);
    effect.update(5);
    assert.equal(scene.children.length, 0);
    effect.play(index, new T.Vector3());
    effect.clear();
    assert.equal(scene.children.length, 0);
  }
});
