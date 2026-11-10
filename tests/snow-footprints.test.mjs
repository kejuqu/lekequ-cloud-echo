import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, centerX, heightAt } from "../src/levels.ts";
import {
  createFootGeometry,
  createSnowFootprints,
} from "../src/snow-footprints.ts";

const level = LEVELS.find((l) => l.id === 4);
const straightWalk = (steps = 60, step = 0.2, start = 10) => {
  let mesh;
  const footprints = createSnowFootprints(
    { add: (m) => (mesh = m) },
    level,
    createFootGeometry(),
  );
  let time = 0;
  for (let i = 0; i < steps; i++) {
    time += 1 / 60;
    const s = start + i * step;
    footprints.update(time, { x: centerX(s), y: 0, z: -s }, true, true, 0);
  }
  const arr = mesh.instanceMatrix.array;
  const prints = [];
  for (let i = 0; i < mesh.count; i++) {
    // 有缩放的实例矩阵其平移列即脚印世界坐标。
    if (arr[i * 16 + 5] === 0 && arr[i * 16 + 10] === 0) continue;
    prints.push({
      x: arr[i * 16 + 12],
      z: arr[i * 16 + 14],
    });
  }
  prints.sort((a, b) => a.z - b.z);
  return prints;
};

test("footprints alternate on both sides with a clearly visible stride", () => {
  const prints = straightWalk();
  assert.ok(
    prints.length >= 8,
    `expected a trail of prints, got ${prints.length}`,
  );
  const lanes = prints.map((p) => p.x - centerX(-p.z));
  const sides = new Set(lanes.map((l) => Math.sign(l)));
  assert.deepEqual(
    [...sides].sort(),
    [-1, 1],
    "prints must appear on both sides",
  );
  for (let i = 1; i < lanes.length; i++) {
    assert.notStrictEqual(
      Math.sign(lanes[i]),
      Math.sign(lanes[i - 1]),
      "consecutive prints must alternate sides",
    );
    // 左右脚印中心距必须明显大于脚印宽度（0.32m），否则斜视角下两行会重叠成一条。
    assert.ok(
      Math.abs(lanes[i] - lanes[i - 1]) >= 0.5,
      `lateral stride ${Math.abs(lanes[i] - lanes[i - 1]).toFixed(2)} too small`,
    );
  }
});

test("footprints stay above the actual sloped road on both outer lanes", async () => {
  const T = await import("three");
  const { Simulation } = await import("../src/simulation.ts");
  const { emptySave } = await import("../src/rules.ts");
  const sim = new Simulation(level, emptySave(), () => {});
  const material = new T.MeshBasicMaterial();
  const road = sim.world.bodies.flatMap((body) => {
    const h = body.shapes[0]?.halfExtents;
    if (body.mass || !h || h.y > 0.4) return [];
    const mesh = new T.Mesh(
      new T.BoxGeometry(h.x * 2, h.y * 2, h.z * 2),
      material,
    );
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    mesh.updateMatrixWorld();
    return [mesh];
  });
  const ray = new T.Raycaster();
  for (const lane of [2.8, -2.8]) {
    const scene = new T.Scene();
    const geometry = createFootGeometry();
    const footprints = createSnowFootprints(scene, level, geometry, road);
    const marks = scene.children[0];
    for (let i = 0; i < 70; i++) {
      const s = 8 + i * 0.18;
      footprints.update(
        i / 60,
        { x: centerX(s) + lane, y: heightAt(level, s), z: -s },
        true,
        true,
        0,
      );
    }
    let count = 0;
    const matrix = new T.Matrix4(),
      position = new T.Vector3();
    for (let i = 0; i < marks.count; i++) {
      marks.getMatrixAt(i, matrix);
      if (matrix.elements[5] === 0) continue;
      count++;
      position.setFromMatrixPosition(matrix);
      ray.set(
        new T.Vector3(position.x, position.y + 5, position.z),
        new T.Vector3(0, -1, 0),
      );
      const hit = ray.intersectObjects(road, false)[0];
      assert.ok(hit);
      assert.ok(
        position.y >= hit.point.y + 0.01,
        `lane ${lane}: footprint ${position.y} buried below road ${hit.point.y}`,
      );
      const normal = new T.Vector3(0, 1, 0).transformDirection(matrix);
      const surfaceNormal = hit.face.normal
        .clone()
        .transformDirection(hit.object.matrixWorld);
      assert.ok(
        normal.dot(surfaceNormal) > 0.999,
        "footprint must follow the actual road slope",
      );
    }
    assert.ok(count > 10);
    footprints.dispose();
    geometry.dispose();
  }
  road.forEach((m) => m.geometry.dispose());
  material.dispose();
});
