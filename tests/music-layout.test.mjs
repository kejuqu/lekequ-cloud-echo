import test from "node:test";
import assert from "node:assert/strict";
import {
  LEVELS,
  randomizeWords,
  wordDecoys,
  groundAt,
  centerX,
  heightAt,
} from "../src/levels.ts";
import { musicTrack } from "../src/music.ts";
import { Simulation } from "../src/simulation.ts";
import { emptySave } from "../src/rules.ts";

function rng(seed) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}
test("random layouts keep every character reachable, separated and save indices stable", () => {
  for (const base of LEVELS) {
    const original = structuredClone(base);
    for (let seed = 1; seed <= 200; seed++) {
      const level = randomizeWords(base, rng(seed));
      assert.equal(level.words.length, base.collect.length);
      const decoys = wordDecoys(level);
      assert.equal(decoys.length, base.words.filter((p) => !p.lift).length);
      assert.equal(wordDecoys(level), decoys);
      const all = [...level.words, ...decoys];
      for (const [i, p] of all.entries()) {
        if (!p.lift) assert.notEqual(groundAt(level, p.s, p.lane), undefined);
        else assert.deepEqual(p, base.words[i]);
        for (const q of all.slice(i + 1)) {
          assert.ok(Math.abs(p.s - q.s) >= 2.5);
          assert.ok(Math.hypot(p.s - q.s, p.lane - q.lane) >= 3.5);
        }
      }
      for (const d of decoys) assert.equal(d.correct, base.collect[d.index]);
    }
    assert.deepEqual(base, original);
    assert.notDeepEqual(
      randomizeWords(base, rng(1)).words,
      randomizeWords(base, rng(2)).words,
    );
  }
});
test("randomized physics collects correct words and triggers scattered decoys", () => {
  for (const base of LEVELS) {
    const level = randomizeWords(base, rng(42));
    for (const [index, p] of level.words.entries()) {
      if (p.lift) continue;
      const sim = new Simulation(level, emptySave(), () => {});
      sim.body.position.set(
        centerX(p.s) + p.lane,
        heightAt(level, p.s) + 0.46,
        -p.s,
      );
      sim.update(1 / 60);
      assert.ok(sim.state.collected.includes(index));
      assert.equal(sim.wordTrap, null);
    }
    for (const d of wordDecoys(level)) {
      const sim = new Simulation(level, emptySave(), () => {});
      sim.body.position.set(
        centerX(d.s) + d.lane,
        heightAt(level, d.s) + 0.46,
        -d.s,
      );
      sim.update(1 / 60);
      assert.equal(sim.wordTrap?.index, d.index);
    }
  }
});
test("all seasons have distinct tracks, chase and battle override exploration", () => {
  assert.equal(new Set(LEVELS.map((l) => musicTrack(l.id, 0, false))).size, 5);
  assert.equal(musicTrack(5, 3, true), "chase");
  assert.equal(musicTrack(5, 2, false), "boss");
  assert.equal(musicTrack(5, 0, false), "summit");
});
