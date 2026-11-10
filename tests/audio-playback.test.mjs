import test from "node:test";
import assert from "node:assert/strict";
import { Sound } from "../src/audio.ts";
import { MUSIC_GAIN } from "../src/music.ts";

const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(t) {
  const requests = new Map();
  t.mock.method(
    globalThis,
    "fetch",
    (url) =>
      new Promise((resolve, reject) => {
        requests.set(url, {
          resolve: () => resolve({ ok: true, arrayBuffer: async () => url }),
          reject,
        });
      }),
  );
  const sources = [];
  const context = {
    currentTime: 10,
    state: "suspended",
    decodeAudioData: async (data) => ({ data }),
    createBufferSource: () => {
      const source = {
        connect() {},
        disconnect() {},
        start() {
          this.started = true;
        },
        stop(at) {
          this.stoppedAt = at ?? 0;
        },
      };
      sources.push(source);
      return source;
    },
    createGain: () => ({
      connect() {},
      disconnect() {},
      gain: {
        value: 0,
        cancelScheduledValues() {},
        setValueAtTime(value) {
          this.value = value;
        },
        setTargetAtTime(value) {
          this.value = value;
        },
      },
    }),
    async suspend() {
      this.state = "suspended";
    },
    async close() {
      this.state = "closed";
    },
  };
  const sound = new Sound();
  sound.ctx = context;
  sound.setActive(true);
  t.after(() => sound.dispose());
  return { sound, requests, sources, context };
}
test("rapid scene changes only start the latest request, including A-B-A before loading", async (t) => {
  const { sound, requests, sources } = fixture(t);
  sound.update(0, 1, 0);
  sound.update(0, 2, 0);
  sound.update(0, 1, 0);
  requests.get("/music/spring.mp3").resolve();
  requests.get("/music/summer.mp3").resolve();
  await flush();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].buffer.data, "/music/spring.mp3");
  assert.equal(sources[0].loop, true);
  sound.update(0, 2, 0);
  await flush();
  assert.equal(sources.length, 2);
  assert.equal(sources[0].stoppedAt, 11);
  assert.equal(sources[1].buffer.data, "/music/summer.mp3");
  // Both the fading old track and the new track must be muted.
  sound.setMuted(true);
  for (const gain of sound.musicSources.values())
    assert.equal(gain.gain.value, 0);
  sound.setMuted(false);
  assert.equal(sound.musicGain.gain.value, MUSIC_GAIN.summer);
  sound.setActive(false);
  assert.equal(sound.ctx.state, "suspended");
  sound.dispose();
  assert.equal(sound.ctx.state, "closed");
  assert.equal(sound.musicSources.size, 0);
});
test("disposing during loading cannot start a late audio source", async (t) => {
  const { sound, requests, sources } = fixture(t);
  sound.update(0, 1, 0);
  sound.dispose();
  requests.get("/music/spring.mp3").resolve();
  await flush();
  assert.equal(sources.length, 0);
});
test("a failed track falls back without retrying on every animation frame", async (t) => {
  const { sound, requests } = fixture(t);
  t.mock.method(console, "warn", () => {});
  sound.update(0, 1, 0);
  requests.get("/music/spring.mp3").reject(new Error("offline"));
  await flush();
  for (let i = 0; i < 60; i++) sound.update(1 / 60, 1, 0);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
  assert.equal(sound.musicSource, undefined);
  assert.equal(sound.musicKey, "");
});

test("all seven soundtracks leave weapon headroom and duck across track transitions", async (t) => {
  const { sound, requests, context } = fixture(t);
  sound.tone = () => {};
  sound.noise = () => {};
  context.state = "running";
  const cases = [
    [1, 0, false, "spring"],
    [2, 0, false, "summer"],
    [3, 0, false, "autumn"],
    [4, 0, false, "winter"],
    [5, 0, false, "summit"],
    [5, 0, true, "chase"],
    [5, 1, false, "boss"],
  ];
  for (const [level, phase, chase, key] of cases) {
    sound.update(0, level, phase, chase);
    requests.get(`/music/${key}.mp3`).resolve();
    await flush();
    assert.ok(
      sound.musicGain.gain.value > 0 && sound.musicGain.gain.value <= 0.23,
    );
    for (const weapon of [0, 1]) {
      sound.effect("shot", weapon);
      assert.equal(sound.musicBus.gain.value, 0.28);
      context.currentTime += 0.1;
      sound.effect("shot", weapon);
      context.currentTime += 0.1;
      sound.update(0, level, phase, chase);
      assert.equal(
        sound.musicBus.gain.value,
        0.28,
        "held fire must keep music ducked",
      );
      context.currentTime += 0.5;
      sound.update(0, level, phase, chase);
      assert.equal(
        sound.musicBus.gain.value,
        1,
        "music recovers after the last shot",
      );
    }
    sound.effect("shot", 1);
    sound.setMuted(true);
    for (const gain of sound.musicSources.values())
      assert.equal(gain.gain.value, 0);
    sound.setMuted(false);
    assert.equal(
      sound.musicBus.gain.value,
      0.28,
      "unmuting cannot erase an active duck",
    );
  }
});
