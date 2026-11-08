import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Simulation, type Snapshot } from "./simulation";
import {
  bladeHeight,
  bladePositions,
  bladeSpan,
  centerX,
  heightAt,
  type Level,
} from "./levels";
import type { Save, Settings } from "./rules";
import { Sound } from "./audio";
import {
  chasePoint,
  CHASE_OBSTACLES,
  CHASE_DURATION,
  CHASE_MAX_DISTANCE,
} from "./chase";
import { createChaseGhost } from "./chase-ghost";
import { createFootGeometry, createSnowFootprints } from "./snow-footprints";
import { WATER_GATE } from "./water-timing";
import { createBossEffects } from "./boss-effects";
import { createPortal } from "./portal";
import { createFireWater } from "./fire-water";
export type GameState = Snapshot;
/** 创建场景与输入桥接；规则由 Simulation 管理，dispose 负责完整清理。 */
export function createGame(
  el: HTMLDivElement,
  level: Level,
  save: Save,
  onState: (s: Snapshot) => void,
  onSave: () => void,
  onResetRequest: () => void,
) {
  const sim = new Simulation(level, save, onSave),
    scene = new T.Scene(),
    sound = new Sound();
  let settings = { ...save.settings },
    paused = true,
    disposed = false;
  scene.background = new T.Color(level.sky);
  scene.fog = new T.FogExp2(level.sky, level.id === 2 ? 0.014 : 0.009);
  const renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.domElement.setAttribute("aria-label", "可交互的三维山岳场景");
  el.appendChild(renderer.domElement);
  const camera = new T.PerspectiveCamera(53, 1, 0.1, 380);
  camera.position.set(0, 12, 17);
  scene.add(new T.HemisphereLight("#fff6dc", level.rock, 2.7));
  const sun = new T.DirectionalLight("#fff0cf", 3.3);
  sun.position.set(-22, 70, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -28,
    right: 28,
    top: 28,
    bottom: -28,
    far: 140,
  });
  scene.add(sun);
  scene.add(sun.target);
  const materials = new Map<string, T.MeshStandardMaterial>();
  const mat = (c: string) => {
    let m = materials.get(c);
    if (!m) {
      m = new T.MeshStandardMaterial({
        color: c,
        flatShading: true,
        roughness: 0.9,
      });
      materials.set(c, m);
    }
    return m;
  };
  const geometries = new Set<T.BufferGeometry>(),
    textures = new Set<T.Texture>(),
    extraMaterials = new Set<T.Material>();
  function mesh(
    g: T.BufferGeometry,
    m: T.Material,
    x = 0,
    y = 0,
    z = 0,
    parent: T.Object3D = scene,
  ) {
    geometries.add(g);
    extraMaterials.add(m);
    const a = new T.Mesh(g, m);
    a.position.set(x, y, z);
    a.castShadow = true;
    a.receiveShadow = true;
    parent.add(a);
    return a;
  }
  function box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: string,
    parent: T.Object3D = scene,
  ) {
    return mesh(new T.BoxGeometry(w, h, d), mat(c), x, y, z, parent);
  }
  function texture(
    text: string,
    bg = "transparent",
    fg = "#fff0b9",
    w = 512,
    h = 128,
  ) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${h * 0.48}px serif`;
    ctx.fillText(text, w / 2, h / 2, w * 0.96);
    const map = new T.CanvasTexture(c);
    map.colorSpace = T.SRGBColorSpace;
    textures.add(map);
    return map;
  }
  function label(
    text: string,
    x: number,
    y: number,
    z: number,
    w = 4,
    color = "#fff0b9",
  ) {
    const m = new T.SpriteMaterial({
      map: texture(text, "transparent", color),
      depthWrite: false,
    });
    extraMaterials.add(m);
    const a = new T.Sprite(m);
    a.position.set(x, y, z);
    a.scale.set(w, w / 4, 1);
    scene.add(a);
    return a;
  }
  function at(s: number, lane = 0, lift = 0) {
    return new T.Vector3(centerX(s) + lane, heightAt(level, s) + lift, -s);
  }
  function marker(s: number, lane: number, text: string, c = "#d9bc78") {
    const p = at(s, lane);
    mesh(
      new T.CylinderGeometry(0.09, 0.12, 2, 5),
      mat("#655b44"),
      p.x,
      p.y + 0.8,
      p.z,
    );
    label(text, p.x, p.y + 2.4, p.z, 4, c);
  }
  const walkableMeshes: T.Mesh[] = [];
  const terrainBatches = new Map<T.Material, T.BufferGeometry[]>();
  function batchTerrain(a: T.Mesh) {
    a.updateMatrixWorld();
    const geometry = a.geometry.toNonIndexed();
    geometry.applyMatrix4(a.matrixWorld);
    geometry.deleteAttribute("uv");
    const material = a.material as T.Material;
    const list = terrainBatches.get(material) ?? [];
    list.push(geometry);
    terrainBatches.set(material, list);
    scene.remove(a);
    a.geometry.dispose();
    geometries.delete(a.geometry);
  }
  // Draw the same platform boxes used by the physics world, so edges and gaps match exactly.
  for (const b of sim.world.bodies) {
    if (b.mass !== 0) continue;
    const shape = b.shapes[0];
    if (!("halfExtents" in shape)) continue;
    const h = (
      shape as unknown as { halfExtents: { x: number; y: number; z: number } }
    ).halfExtents;
    if (h.y > 1) continue;
    if (h.y > 0.4) {
      const cover = mesh(
        new T.DodecahedronGeometry(1),
        mat(level.rock),
        b.position.x,
        b.position.y,
        b.position.z,
      );
      cover.scale.set(0.85, 1, 0.85);
      continue;
    }
    const season =
      level.id === 5 ? Math.min(3, Math.floor(-b.position.z / 36)) : -1;
    const groundColor =
      season < 0
        ? level.ground
        : ["#a4b77c", "#668d60", "#c0a171", "#d4e0df"][season];
    const a = box(
      b.position.x,
      b.position.y,
      b.position.z,
      h.x * 2,
      h.y * 2,
      h.z * 2,
      groundColor,
    );
    a.quaternion.set(
      b.quaternion.x,
      b.quaternion.y,
      b.quaternion.z,
      b.quaternion.w,
    );
    const vertices: number[] = [];
    for (const [x, z] of [
      [-h.x, -h.z],
      [h.x, -h.z],
      [h.x, h.z],
      [-h.x, h.z],
    ]) {
      const v = new T.Vector3(x, -h.y, z)
        .applyQuaternion(a.quaternion)
        .add(a.position);
      vertices.push(v.x, v.y, v.z);
    }
    for (let i = 0; i < 4; i++)
      vertices.push(vertices[i * 3], -12, vertices[i * 3 + 2]);
    const cliff = new T.BufferGeometry();
    cliff.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    cliff.setIndex([
      0, 1, 4, 1, 5, 4, 1, 2, 5, 2, 6, 5, 2, 3, 6, 3, 7, 6, 3, 0, 7, 0, 4, 7,
    ]);
    cliff.computeVertexNormals();
    batchTerrain(mesh(cliff, mat(level.rock)));
    batchTerrain(a);
  }
  for (const [material, list] of terrainBatches) {
    const merged = mergeGeometries(list, false);
    if (merged) {
      const a = mesh(merged, material);
      if (material !== mat(level.rock)) walkableMeshes.push(a);
    }
    list.forEach((g) => g.dispose());
  }
  let seed = level.id * 1927;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  function tree(s: number, lane: number) {
    const p = at(s, lane, -1),
      scale = 0.6 + random() * 0.6;
    mesh(
      new T.CylinderGeometry(0.15, 0.25, 2 * scale, 5),
      mat("#625a44"),
      p.x,
      p.y + scale,
      p.z,
    );
    for (let i = 0; i < 3; i++)
      mesh(
        new T.ConeGeometry((1.5 - i * 0.25) * scale, 2.5 * scale, 5),
        mat(
          level.id === 5
            ? ["#73945c", "#315d43", "#b37d41", "#bfcfce"][
                Math.min(3, Math.floor(s / 36))
              ]
            : level.id === 4 && i === 2
              ? "#d8e2df"
              : level.foliage,
        ),
        p.x,
        p.y + (2 + i * 0.7) * scale,
        p.z,
      );
  }
  for (let s = 0; s < level.length; s += 3.7) {
    tree(s, (random() > 0.5 ? 1 : -1) * (5 + random() * 2.5));
    if (level.id === 1) {
      const p = at(s, (random() - 0.5) * 5, 0.2);
      mesh(
        new T.IcosahedronGeometry(0.14, 0),
        mat(random() > 0.5 ? "#e3b8ad" : "#f1df99"),
        p.x,
        p.y,
        p.z,
      );
    }
  }
  for (let i = 0; i < 26; i++) {
    const x = (random() - 0.5) * 260,
      z = -level.length - 30 - random() * 100;
    mesh(
      new T.ConeGeometry(20 + random() * 20, 55 + random() * 70, 5),
      mat(i % 2 ? level.rock : level.sky),
      x,
      12,
      z,
    );
  }
  for (let i = 0; i < 12; i++) {
    const a = mesh(
      new T.IcosahedronGeometry(10 + random() * 8, 1),
      new T.MeshStandardMaterial({
        color: "#ebeadc",
        transparent: true,
        opacity: 0.32,
        flatShading: true,
        depthWrite: false,
      }),
      (random() - 0.5) * 150,
      -3 + random() * 10,
      -random() * level.length,
    );
    a.scale.y = 0.22;
  }
  const pitRings: T.Mesh[] = [];
  level.pits.forEach((s, i) => {
    const p = at(s, 0, 0.06);
    const a = mesh(
      new T.TorusGeometry(1.55, 0.17, 6, 28),
      mat("#bb9559"),
      p.x,
      p.y,
      p.z,
    );
    a.rotation.x = -Math.PI / 2;
    pitRings.push(a);
    mesh(
      new T.CylinderGeometry(1.35, 1.2, 0.06, 24),
      mat("#4f6451"),
      p.x,
      p.y - 0.03,
      p.z,
    );
    label("凹坑 · 等金光蹬跳", p.x, p.y + 2, p.z, 4);
    marker(s - 3, -3, i === 0 ? "浅坑 / 金光时按空格" : "蹬跳 → 高岩点");
  });
  const bladeBelt = bladeSpan(level);
  for (const [a, b] of level.belts) {
    if (bladeBelt && a === bladeBelt[0] && b === bladeBelt[1]) continue;
    for (let s = a; s < b; s += 0.65) {
      const p = at(s, 0, 0.04);
      const stripe = box(
        p.x,
        p.y,
        p.z,
        7.3,
        0.06,
        0.38,
        Math.floor(s * 2) % 2 ? "#ce9144" : "#3e4238",
      );
      stripe.rotation.y = -0.1;
    }
  }
  const bladeViews = bladePositions(level).map((s, index) => {
    const group = new T.Group();
    scene.add(group);
    group.position.set(centerX(s), bladeHeight(level, s, index, 0), -s);
    box(0, 0, 0, 6.1, 0.9, 0.18, "#aebbb8", group);
    box(0, -0.48, -0.01, 6.2, 0.12, 0.22, "#eef0db", group);
    const tip = mesh(
      new T.ConeGeometry(0.64, 1.05, 4),
      mat("#aebbb8"),
      -3.5,
      0,
      0,
      group,
    );
    tip.rotation.z = Math.PI / 2;
    box(3.45, 0.16, 0, 0.85, 0.25, 0.26, "#6d5540", group);
    return { group, s, index };
  });
  if (bladeViews.length)
    marker(bladeBelt![0] - 1, -3, "升降刀阵 · 等刀刃升起再通过", "#efc48a");
  const checkpointMeshes: T.Mesh[] = [];
  for (const s of level.id === 1
    ? [20, 69]
    : level.id === 3
      ? [68]
      : [50, 100]) {
    const p = at(s, 0, 0.05);
    const a = mesh(
      new T.TorusGeometry(3, 0.04, 4, 32),
      mat("#87c4b5"),
      p.x,
      p.y,
      p.z,
    );
    a.rotation.x = -Math.PI / 2;
    checkpointMeshes.push(a);
  }
  const words = level.words.map((p, i) => {
    const pos = at(p.s, p.lane, 1.25 + (p.lift ?? 0));
    const a = label(level.collect[i], pos.x, pos.y, pos.z, 1.9);
    const singleTexture = texture(
      level.collect[i],
      "transparent",
      "#fff0b9",
      128,
      128,
    );
    const spriteMaterial = a.material as T.SpriteMaterial;
    if (spriteMaterial.map) {
      textures.delete(spriteMaterial.map);
      spriteMaterial.map.dispose();
    }
    spriteMaterial.map = singleTexture;
    a.scale.y = 1.9;
    const halo = mesh(
      new T.TorusGeometry(0.68, 0.025, 5, 30),
      mat("#ecd68a"),
      pos.x,
      pos.y,
      pos.z,
    );
    return { a, halo, y: pos.y };
  });
  const bagPos = at(level.bag.s, level.bag.lane, 1.2),
    bag = new T.Group();
  bag.position.copy(bagPos);
  scene.add(bag);
  const scrollMat = new T.MeshStandardMaterial({
    color: "#ffe0a3",
    emissive: "#c7a354",
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.8,
  });
  box(0, 0, 0, 1.3, 0.8, 0.12, "#e7d3a3", bag);
  for (const x of [-0.7, 0.7])
    mesh(new T.CylinderGeometry(0.12, 0.12, 1.05, 8), scrollMat, x, 0, 0, bag);
  const bagLabel = label(level.idiom, bagPos.x, bagPos.y + 1, bagPos.z, 3.5);
  const flagPos = at(level.length, 2);
  mesh(
    new T.CylinderGeometry(0.12, 0.17, 7, 7),
    mat("#665840"),
    flagPos.x,
    flagPos.y + 3,
    flagPos.z,
  );
  const flag = mesh(
    new T.PlaneGeometry(4, 1.8, 12, 2),
    new T.MeshStandardMaterial({
      map: texture(level.idiom, "#a73832", "#fff4d0"),
      side: T.DoubleSide,
    }),
    flagPos.x + 2,
    flagPos.y + 5,
    flagPos.z,
  );
  const baseFlag = Float32Array.from(flag.geometry.attributes.position.array);
  label("山顶红旗 · 抵达即成功", flagPos.x, flagPos.y + 7, flagPos.z, 5);
  // Persistent success tag: shown on the summit flag once this peak is conquered.
  const summitTag = label(
    "✓ 登顶成功",
    flagPos.x,
    flagPos.y + 8.3,
    flagPos.z,
    5.5,
    "#ffd977",
  );
  summitTag.visible = false;
  function bowModel() {
    const group = new T.Group();
    const arc = mesh(
      new T.TorusGeometry(0.48, 0.045, 6, 24, Math.PI),
      mat("#9b6c3f"),
      0,
      0,
      0,
      group,
    );
    arc.rotation.z = Math.PI / 2;
    mesh(
      new T.CylinderGeometry(0.012, 0.012, 0.96, 5),
      mat("#eee2bd"),
      0,
      0,
      0,
      group,
    );
    box(-0.48, 0, 0, 0.1, 0.24, 0.11, "#5f4632", group);
    const arrow = mesh(
      new T.CylinderGeometry(0.016, 0.016, 0.82, 6),
      mat("#d8c79a"),
      0,
      0,
      -0.18,
      group,
    );
    arrow.rotation.x = Math.PI / 2;
    const head = mesh(
      new T.ConeGeometry(0.065, 0.18, 4),
      mat("#bbc4ba"),
      0,
      0,
      -0.68,
      group,
    );
    head.rotation.x = -Math.PI / 2;
    return group;
  }
  function pistolModel() {
    const group = new T.Group();
    box(0, 0.08, -0.22, 0.2, 0.2, 0.72, "#69736f", group);
    box(0, 0.19, -0.18, 0.17, 0.055, 0.52, "#aab3aa", group);
    box(0, 0.08, -0.6, 0.13, 0.12, 0.08, "#303936", group);
    const grip = box(0, -0.22, 0.02, 0.18, 0.48, 0.22, "#51483c", group);
    grip.rotation.x = -0.18;
    box(0, -0.08, -0.17, 0.07, 0.16, 0.08, "#b08b4f", group);
    box(0, 0.24, -0.4, 0.055, 0.07, 0.07, "#3e4843", group);
    return group;
  }
  let bowPickup: T.Group | undefined, pistolPickup: T.Group | undefined;
  if (level.id > 1) {
    marker(3, -2, "走近自动拾取弓箭");
    const p = at(3, -2, 1),
      bow = bowModel();
    bow.position.copy(p);
    bow.scale.setScalar(1.25);
    bow.rotation.y = -0.35;
    scene.add(bow);
    bowPickup = bow;
  }
  if (level.id >= 4) {
    marker(8, 2, "走近自动拾取手枪");
    const p = at(8, 2, 1),
      pistol = pistolModel();
    pistol.position.copy(p);
    pistol.scale.setScalar(1.35);
    pistol.rotation.y = -0.55;
    scene.add(pistol);
    pistolPickup = pistol;
  }
  for (const climb of level.climbs) {
    const start = at(climb.start, climb.lane, 0.6),
      end = at(climb.end, climb.lane, 1.5),
      dir = end.clone().sub(start);
    const rope = mesh(
      new T.CylinderGeometry(0.09, 0.09, dir.length(), 8),
      mat("#e6c38b"),
    );
    rope.position.copy(start.clone().add(end).multiplyScalar(0.5));
    rope.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    marker(climb.start, -2, "陡坡必须抓绳 · E 抓绳，W 攀爬");
    box(end.x, end.y, end.z, 0.25, 1.2, 0.3, "#706448");
  }
  for (const s of level.id === 5
    ? [75, 134]
    : level.id === 4
      ? [64, 106]
      : level.id === 3
        ? [10, 56, 106]
        : level.id === 2
          ? [10, 75]
          : []) {
    const p = at(s, 2, 0);
    box(p.x, p.y + 0.45, p.z, 0.9, 0.8, 0.8, "#786949");
    box(p.x, p.y + 0.9, p.z, 1, 0.12, 0.9, "#a18a59");
    marker(s, 2, "补给 · 每15秒刷新");
  }
  const buffs =
    level.id === 2
      ? [43, 81].map((s, i) => {
          const p = at(s, 0, 1.2);
          return mesh(
            new T.OctahedronGeometry(0.45),
            mat(i ? "#bca9e5" : "#9ad9ad"),
            p.x,
            p.y,
            p.z,
          );
        })
      : [];
  const cave = new T.Group();
  if (level.id === 3) {
    const p = at(119, -2.5);
    cave.position.copy(p);
    scene.add(cave);
    for (const x of [-1.5, 1.5]) box(x, 1.5, 0, 1, 3, 2, level.rock, cave);
    box(0, 3, 0, 4, 1, 2, level.rock, cave);
    label("隐蔽山洞 · 清除守卫", p.x, p.y + 4, p.z, 5);
  }
  const vines: T.Mesh[] = [];
  if (level.id === 3)
    for (let x = -1; x <= 1; x += 0.35)
      vines.push(
        box(
          centerX(119) - 2.5 + x,
          heightAt(level, 119) + 1.4,
          -118.4,
          0.08,
          2.8,
          0.12,
          "#4e7148",
        ),
      );
  if (level.id === 4) {
    marker(39, -3, "← 虫群 / 补给");
    marker(39, 3, "狙击台 / 望远镜 →");
    marker(64, 3, "E 望远镜 · F 远眺");
    const p = at(64, 3, 1);
    mesh(
      new T.CylinderGeometry(0.3, 0.25, 1.5, 8),
      mat("#c4b894"),
      p.x,
      p.y,
      p.z,
    ).rotation.x = Math.PI / 3;
  }
  const fireWater = level.id === 5 ? createFireWater(scene, level) : undefined;
  const portal =
    level.id === 5 ? createPortal(scene, at(128, 0, 2.7)) : undefined;
  const guardians: T.Mesh[] = [];
  if (level.id === 5) {
    for (const [s, text] of [
      [5, "春 · 初醒"],
      [39, "夏 · 引水"],
      [77, "秋 · 借势"],
      [110, "冬 · 凌霜"],
    ] as [number, string][])
      marker(s, -3, text);
    const portalSign = at(125, -3, 2);
    label(
      "黑色旋涡门 · 走入追逐场地",
      portalSign.x,
      portalSign.y,
      portalSign.z,
      5,
    );
    marker(WATER_GATE.s, WATER_GATE.lane, "左侧水闸 · E 引水灭火");
    marker(59, -2, "E 绳索攀爬 → 悬崖取字");
    const p = at(62, -4, 2);
    mesh(
      new T.CylinderGeometry(0.045, 0.045, 6, 6),
      mat("#c2ad7c"),
      p.x,
      p.y,
      p.z,
    );
    box(p.x, heightAt(level, 62) + 3.8, p.z, 2.3, 0.3, 2, level.rock);
    for (let i = 0; i < 3; i++) {
      const s = 137 + i * 6,
        p = at(s, i % 2 === 0 ? -3 : 3, 1.1);
      const a = box(p.x, p.y, p.z, 0.8, 2.2, 0.6, "#7c8e86");
      guardians.push(a);
      label(`守护石碑 ${i + 1} · E`, p.x, p.y + 2, p.z, 3.7);
    }
  }
  const bombMeshes = sim.bombs.map((b) => {
    const p = at(b.s, b.lane, 0.5);
    const a = mesh(
      new T.SphereGeometry(0.44, 8, 6),
      mat("#383e38"),
      p.x,
      p.y,
      p.z,
    );
    mesh(
      new T.CylinderGeometry(0.05, 0.05, 0.3, 5),
      mat("#dd8264"),
      0,
      0.5,
      0,
      a,
    );
    return a;
  });
  const rockMeshes = level.rocks.map((s) => {
    const p = at(s, 0, 7);
    const a = mesh(
      new T.IcosahedronGeometry(0.7, 0),
      mat("#8a8070"),
      p.x,
      p.y,
      p.z,
    );
    const shadow = mesh(
      new T.CircleGeometry(1, 16),
      new T.MeshBasicMaterial({
        color: "#a64e36",
        transparent: true,
        opacity: 0.5,
        side: T.DoubleSide,
      }),
      p.x,
      heightAt(level, s) + 0.04,
      p.z,
    );
    shadow.rotation.x = -Math.PI / 2;
    return { a, shadow, s };
  });
  // Procedural articulated low-poly enemies. Wings, jaws and segments animate independently.
  const enemyViews = new Map<
    number,
    { group: T.Group; parts: T.Object3D[]; bar: T.Mesh }
  >();
  function enemyView(id: number, kind: string) {
    const g = new T.Group(),
      parts: T.Object3D[] = [];
    scene.add(g);
    if (kind === "spitter") {
      mesh(new T.IcosahedronGeometry(0.8, 1), mat("#756188"), 0, 0, 0, g);
      const mouth = mesh(
        new T.TorusGeometry(0.34, 0.13, 6, 12),
        mat("#bc896b"),
        0,
        0.15,
        -0.7,
        g,
      );
      parts.push(mouth);
      mesh(new T.SphereGeometry(0.28, 8, 6), mat("#f3a56d"), 0, 0.15, -0.7, g);
      for (const x of [-0.35, 0.35]) {
        mesh(
          new T.SphereGeometry(0.12, 6, 4),
          mat("#d8e59e"),
          x,
          0.55,
          -0.35,
          g,
        );
        box(x, -0.55, 0, 0.25, 0.5, 0.45, "#5b694e", g);
      }
    } else if (kind === "beast") {
      const body = mesh(
        new T.IcosahedronGeometry(1.25, 1),
        mat("#685447"),
        0,
        0.9,
        0,
        g,
      );
      body.scale.set(1, 1, 1.7);
      mesh(
        new T.ConeGeometry(0.65, 1.2, 5),
        mat("#8a6652"),
        0,
        1,
        -1.8,
        g,
      ).rotation.x = -Math.PI / 2;
      for (const x of [-0.7, 0.7])
        for (const z of [-0.9, 0.9])
          parts.push(box(x, 0, z, 0.35, 1.5, 0.4, "#534c3d", g));
      for (const x of [-0.32, 0.32])
        mesh(new T.ConeGeometry(0.12, 0.7, 4), mat("#e8d4a4"), x, 0.7, -2.1, g);
      g.scale.setScalar(1.3);
    } else if (kind === "worm") {
      for (let i = 0; i < 4; i++)
        parts.push(
          mesh(
            new T.SphereGeometry(0.5 - i * 0.065, 7, 5),
            mat(i % 2 ? "#577452" : "#7d935b"),
            0,
            0,
            i * 0.4,
            g,
          ),
        );
      box(0, 0.15, -0.44, 0.7, 0.3, 0.15, "#602f2b", g);
      for (let i = 0; i < 4; i++)
        mesh(
          new T.ConeGeometry(0.07, 0.25, 4),
          mat("#e6d4a4"),
          -0.27 + i * 0.18,
          0,
          -0.55,
          g,
        );
    } else {
      const scale = kind === "boss" ? 1.6 : 1;
      g.scale.setScalar(scale);
      mesh(
        new T.ConeGeometry(0.7, 2.4, 6),
        mat("#79554d"),
        0,
        0,
        0,
        g,
      ).rotation.x = Math.PI / 2;
      mesh(
        new T.ConeGeometry(0.45, 1.2, 5),
        mat("#9c6b59"),
        0,
        0.35,
        -1.2,
        g,
      ).rotation.x = -Math.PI / 2;
      for (const side of [-1, 1]) {
        const wing = new T.Group();
        wing.position.set(side * 0.5, 0.2, 0);
        const a = mesh(
          new T.ConeGeometry(1.5, 2.5, 3),
          mat("#985e54"),
          side * 1,
          0,
          0.2,
          wing,
        );
        a.rotation.z = (side * Math.PI) / 2;
        a.scale.y = 0.75;
        g.add(wing);
        parts.push(wing);
      }
      for (const x of [-0.25, 0.25])
        mesh(
          new T.SphereGeometry(0.08, 5, 4),
          mat("#ffcf79"),
          x,
          0.55,
          -1.55,
          g,
        );
    }
    const bar = box(
      0,
      kind === "worm" ? 1 : 2,
      0,
      1.3,
      0.08,
      0.08,
      "#d4a66e",
      g,
    );
    g.traverse((o) => {
      o.userData.enemyId = id;
    });
    enemyViews.set(id, { group: g, parts, bar });
    return enemyViews.get(id)!;
  }
  const player = new T.Group();
  scene.add(player);
  mesh(new T.CapsuleGeometry(0.3, 0.65, 4, 8), mat("#c6ad7b"), 0, 1, 0, player);
  mesh(new T.SphereGeometry(0.28, 8, 6), mat("#e5c6a0"), 0, 1.75, 0, player);
  mesh(new T.ConeGeometry(0.44, 0.25, 7), mat("#766b4c"), 0, 2.02, 0, player);
  box(0, 1.1, 0.34, 0.6, 0.75, 0.3, "#516c50", player);
  box(0, 1.5, 0, 0.65, 0.12, 0.45, "#b35f48", player);
  const legs = [
    box(-0.18, 0.35, 0, 0.2, 0.65, 0.23, "#655c49", player),
    box(0.18, 0.35, 0, 0.2, 0.65, 0.23, "#655c49", player),
  ];
  const arms = [
    box(-0.45, 1.1, 0, 0.18, 0.65, 0.2, "#c6ad7b", player),
    box(0.45, 1.1, 0, 0.18, 0.65, 0.2, "#c6ad7b", player),
  ];
  const heldWeapon = new T.Group();
  heldWeapon.position.set(0.5, 1.15, -0.12);
  player.add(heldWeapon);
  const heldBow = bowModel();
  heldBow.scale.setScalar(0.82);
  heldBow.rotation.y = -0.25;
  heldWeapon.add(heldBow);
  const heldPistol = pistolModel();
  heldPistol.scale.setScalar(0.92);
  heldPistol.rotation.y = -0.35;
  heldWeapon.add(heldPistol);
  const weatherG = new T.BufferGeometry(),
    weatherArray = new Float32Array(240 * 3);
  for (let i = 0; i < 240; i++) {
    weatherArray[i * 3] = (random() - 0.5) * 50;
    weatherArray[i * 3 + 1] = random() * 30;
    weatherArray[i * 3 + 2] = (random() - 0.5) * 55;
  }
  weatherG.setAttribute("position", new T.BufferAttribute(weatherArray, 3));
  geometries.add(weatherG);
  const weatherMat = new T.PointsMaterial({
    color: level.id === 4 ? "#ffffff" : "#ffdfb1",
    size: level.id === 4 ? 0.12 : 0.055,
    transparent: true,
    opacity: 0.65,
  });
  extraMaterials.add(weatherMat);
  const weather = new T.Points(weatherG, weatherMat);
  scene.add(weather);
  const chaseTrack = new T.Group();
  scene.add(chaseTrack);
  chaseTrack.visible = false;
  if (level.id === 5) {
    const geometry = new T.BoxGeometry(8, 0.5, 2.5);
    geometries.add(geometry);
    const count = Math.ceil((CHASE_MAX_DISTANCE + 20) / 2) + 1,
      road = new T.InstancedMesh(geometry, mat("#4d5260"), count),
      dummy = new T.Object3D();
    road.receiveShadow = true;
    chaseTrack.add(road);
    for (let i = 0; i < count; i++) {
      const p = chasePoint(i * 2 - 20);
      dummy.position.set(p.x, p.y - 0.25, p.z);
      dummy.rotation.set(0, -p.heading, 0);
      dummy.updateMatrix();
      road.setMatrixAt(i, dummy.matrix);
    }
    for (const d of CHASE_OBSTACLES) {
      const p = chasePoint(d);
      const obstacle = box(
        p.x,
        p.y + 0.55,
        p.z,
        7.5,
        1.1,
        0.5,
        "#79684c",
        chaseTrack,
      );
      obstacle.rotation.y = -p.heading;
    }
    for (let d = 40; d < CHASE_MAX_DISTANCE; d += 40) {
      const p = chasePoint(d);
      for (const side of [-1, 1])
        box(
          p.x + Math.cos(p.heading) * side * 3.9,
          p.y + 0.65,
          p.z + Math.sin(p.heading) * side * 3.9,
          0.18,
          1.3,
          0.18,
          "#d4b77d",
          chaseTrack,
        );
    }
  }
  // 山路和追逐场地分别显示，传送后不会再看到原关卡的路牌、地形和机关。
  const mountainScenery = new T.Group();
  for (const object of [...scene.children]) {
    if (
      object !== player &&
      object !== chaseTrack &&
      object !== weather &&
      object !== sun.target &&
      !(object instanceof T.Light)
    )
      mountainScenery.add(object);
  }
  scene.add(mountainScenery);
  let previousChasing = false;
  const chaseGhost = createChaseGhost(scene);
  const bossEffects = createBossEffects(scene);
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const waypoint = mesh(new T.ConeGeometry(0.24, 0.52, 4), mat("#f6d68b"));
  waypoint.rotation.x = Math.PI;
  waypoint.visible = false;
  const projectileViews = new Map<number, T.Mesh>(),
    bulletGeometry = new T.IcosahedronGeometry(0.19, 1);
  geometries.add(bulletGeometry);
  const bulletMaterial = new T.MeshStandardMaterial({
    color: "#ffc477",
    emissive: "#ff7d3d",
    emissiveIntensity: 1,
  });
  extraMaterials.add(bulletMaterial);
  const particles: {
    obj: T.Mesh;
    life: number;
    v: T.Vector3;
    straight?: boolean;
    targetId?: number;
    end?: T.Vector3;
  }[] = [];
  // 无光照红色曳光弹在浅色地形和浓雾中仍清晰可见，几何与材质跨发射复用。
  const shotGeometry = new T.CapsuleGeometry(0.12, 1.25, 3, 6);
  geometries.add(shotGeometry);
  const shotMaterial = new T.MeshBasicMaterial({
    color: "#ff182b",
    fog: false,
    toneMapped: false,
  });
  const flashMaterial = new T.MeshBasicMaterial({
    color: "#ffb38b",
    fog: false,
    toneMapped: false,
  });
  extraMaterials.add(shotMaterial);
  extraMaterials.add(flashMaterial);
  const particleGeometry = new T.IcosahedronGeometry(0.12, 0);
  geometries.add(particleGeometry);
  const guideSteps: T.Mesh[] = [];
  const footGeometry = createFootGeometry();
  geometries.add(footGeometry);
  const snowFootprints = createSnowFootprints(scene, level, footGeometry);
  const footMaterial = new T.MeshBasicMaterial({
    color: "#80653b",
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: T.DoubleSide,
  });
  extraMaterials.add(footMaterial);
  function clearGuide() {
    for (const step of guideSteps) scene.remove(step);
    guideSteps.length = 0;
  }
  function guide(x: number, z: number) {
    clearGuide();
    const startS = sim.s,
      startLane = sim.lane,
      endS = -z,
      endLane = x - centerX(endS),
      distance = Math.hypot(endS - startS, endLane - startLane),
      count = Math.min(14, Math.floor(distance / 0.72));
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1),
        s = startS + (endS - startS) * t,
        lane = startLane + (endLane - startLane) * t,
        nextT = Math.min(1, t + 0.015),
        nextS = startS + (endS - startS) * nextT,
        nextLane = startLane + (endLane - startLane) * nextT,
        px = centerX(s) + lane,
        pz = -s,
        dx = centerX(nextS) + nextLane - px,
        dz = -nextS - pz,
        length = Math.hypot(dx, dz) || 1,
        side = i % 2 === 0 ? -1 : 1,
        offsetX = (-dz / length) * side * 0.13,
        offsetZ = (dx / length) * side * 0.13;
      const step = mesh(
        footGeometry,
        footMaterial,
        px + offsetX,
        heightAt(level, s) + 0.09,
        pz + offsetZ,
      );
      step.rotation.y = Math.atan2(-dx, -dz) + side * 0.08;
      guideSteps.push(step);
    }
  }
  function effect(x: number, y: number, z: number, color: string, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = mesh(particleGeometry, mat(color), x, y, z);
      particles.push({
        obj: a,
        life: 0.7 + random() * 0.4,
        v: new T.Vector3(
          (random() - 0.5) * 6,
          random() * 5,
          (random() - 0.5) * 6,
        ),
      });
    }
  }
  let yaw = 0,
    pitch = 0,
    frame = 0,
    last = performance.now(),
    lastSend = 0,
    dragPointer: number | null = null,
    dragDistance = 0,
    px = 0,
    py = 0,
    downX = 0,
    downY = 0,
    pressedAt = 0,
    allowLook = true,
    pressedButton = 0;
  const keys = new Set<string>();
  let joystick = { x: 0, y: 0 },
    sprinting = false,
    shooting = false,
    mouseHeld = false;
  const cursor = new T.Vector2(0, 0),
    raycaster = new T.Raycaster();
  function clear() {
    keys.clear();
    joystick = { x: 0, y: 0 };
    sprinting = false;
    shooting = false;
    mouseHeld = false;
    dragPointer = null;
    sim.input = { x: 0, y: 0, sprint: false, shoot: false };
    sim.cancelMove();
  }
  function action(f: () => void) {
    if (!paused && !disposed && !sim.state.won && !sim.state.dead) {
      sound.unlock();
      f();
    }
  }
  function target() {
    const objects = [...enemyViews.values()]
      .filter((v) => v.group.visible)
      .map((v) => v.group);
    raycaster.setFromCamera(mouseHeld ? cursor : new T.Vector2(), camera);
    const hit = raycaster.intersectObjects(objects, true)[0];
    if (hit) return hit.object.userData.enemyId as number;
    // Small forward aim assistance makes touch aiming practical, while terrain still blocks shots.
    const dir = camera.getWorldDirection(new T.Vector3());
    let chosen: number | undefined,
      best = 0.972;
    for (const e of sim.enemies) {
      if (!e.alive) continue;
      const p = new T.Vector3(centerX(e.s) + e.lane, e.y, -e.s),
        v = p.sub(camera.position);
      if (v.length() > 45) continue;
      const dot = v.normalize().dot(dir);
      if (dot > best) {
        best = dot;
        chosen = e.id;
      }
    }
    return chosen;
  }
  const keydown = (e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement
    )
      return;
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        e.code,
      )
    )
      e.preventDefault();
    if (paused) return;
    keys.add(e.code);
    if (e.repeat) return;
    action(() => {
      if (sim.chase.active && (e.code === "KeyA" || e.code === "ArrowLeft"))
        sim.turn(-1);
      if (sim.chase.active && (e.code === "KeyD" || e.code === "ArrowRight"))
        sim.turn(1);
      if (e.code === "Space") sim.jump();
      if (e.code === "KeyE") sim.interact();
      if (e.code === "Digit1") sim.selectWeapon("bow");
      if (e.code === "Digit2") sim.selectWeapon("pistol");
      if (e.code === "KeyF") sim.telescope();
      if (e.code === "KeyQ") sim.burst();
      if (e.code === "KeyR") onResetRequest();
    });
  };
  const keyup = (e: KeyboardEvent) => keys.delete(e.code);
  const down = (e: PointerEvent) => {
    if (paused) return;
    if (sim.state.dead) return;
    dragPointer = e.pointerId;
    px = e.clientX;
    py = e.clientY;
    dragDistance = 0;
    downX = e.clientX;
    downY = e.clientY;
    pressedAt = performance.now();
    pressedButton = e.button;
    allowLook = e.pointerType !== "touch" || e.clientX > el.clientWidth * 0.45;
    mouseHeld = e.pointerType === "mouse" && e.button === 2;
    renderer.domElement.setPointerCapture(e.pointerId);
    const r = renderer.domElement.getBoundingClientRect();
    cursor.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    sound.unlock();
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== dragPointer) return;
    const dx = e.clientX - px,
      dy = e.clientY - py;
    dragDistance += Math.abs(dx) + Math.abs(dy);
    if (!settings.fixedCamera && allowLook && !sim.chase.active) {
      yaw -= dx * 0.005 * settings.sensitivity;
      pitch = T.MathUtils.clamp(
        pitch + dy * 0.003 * settings.sensitivity,
        -0.3,
        0.6,
      );
    }
    if (dragDistance > 6) {
      mouseHeld = false;
      sim.cancelMove();
    }
    px = e.clientX;
    py = e.clientY;
  };
  function clickGround() {
    raycaster.setFromCamera(cursor, camera);
    const enemyHit = raycaster.intersectObjects(
      [...enemyViews.values()]
        .filter((v) => v.group.visible)
        .map((v) => v.group),
      true,
    )[0];
    if (enemyHit) {
      sim.shoot(enemyHit.object.userData.enemyId);
      return;
    }
    const hits = raycaster.intersectObjects(walkableMeshes, false);
    const hit = hits.find((h) => h.face && h.face.normal.y > 0.5);
    if (hit) sim.navigate(hit.point.x, hit.point.z);
  }
  const up = (e: PointerEvent) => {
    if (e.pointerId !== dragPointer) return;
    action(() => {
      if (sim.chase.active) {
        const dx = e.clientX - downX,
          dy = e.clientY - downY;
        if (dy < -35 && Math.abs(dy) > Math.abs(dx)) sim.jump();
        else if (Math.abs(dx) > 35) sim.turn(dx > 0 ? 1 : -1);
        else if (dragDistance < 6)
          sim.turn(e.clientX < el.clientWidth / 2 ? -1 : 1);
      } else if (
        dragDistance < 6 &&
        pressedButton === 0 &&
        performance.now() - pressedAt < 240
      )
        clickGround();
    });
    dragPointer = null;
    mouseHeld = false;
  };
  const contextMenu = (e: Event) => e.preventDefault();
  renderer.domElement.addEventListener("contextmenu", contextMenu);
  const visibility = () => {
    if (document.hidden) clear();
    last = performance.now();
  };
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", visibility);
  renderer.domElement.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", clear);
  const resize = () => {
    renderer.setSize(el.clientWidth, el.clientHeight);
    camera.aspect = el.clientWidth / el.clientHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();
  function tick(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.06);
    last = now;
    if (!paused && !document.hidden) {
      if (
        dragPointer !== null &&
        dragDistance < 6 &&
        performance.now() - pressedAt > 240 &&
        !sim.chase.active
      )
        mouseHeld = true;
      sim.input = {
        x: T.MathUtils.clamp(
          (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
            (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) +
            joystick.x,
          -1,
          1,
        ),
        y: T.MathUtils.clamp(
          (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
            (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
            joystick.y,
          -1,
          1,
        ),
        sprint: sprinting || keys.has("ShiftLeft") || keys.has("ShiftRight"),
        shoot: shooting || mouseHeld || keys.has("KeyJ"),
      };
      sim.update(dt);
      if (sim.input.shoot) sim.shoot(target());
      sound.update(
        dt,
        level.id,
        sim.state.phase,
        sim.chase.active || sim.deathInChase,
        sim.chase.gap,
      );
    }
    const t = sim.clock,
      p = sim.pos;
    const chasing = sim.chase.active || sim.deathInChase;
    const chaseDistance = sim.deathInChase
      ? sim.deathChaseDistance
      : sim.chase.distance;
    const chasePose = chasePoint(chaseDistance);
    chaseTrack.visible = chasing;
    mountainScenery.visible = !chasing;
    snowFootprints.update(
      sim.state.time,
      p,
      sim.state.grounded && !sim.state.climbing,
      !chasing && !sim.state.dead,
      sim.state.deaths,
    );
    portal?.update(t, sim.chase.completed);
    scene.background = new T.Color(chasing ? "#15131f" : level.sky);
    if (scene.fog instanceof T.FogExp2) {
      scene.fog.color.set(chasing ? "#15131f" : level.sky);
      scene.fog.density = chasing ? 0.018 : level.id === 2 ? 0.014 : 0.009;
    }
    player.position.set(p.x, p.y + (sim.state.dead ? 0.14 : 0), p.z);
    player.visible = true;
    player.rotation.z = T.MathUtils.lerp(
      player.rotation.z,
      sim.state.dead ? -Math.PI / 2 : 0,
      1 - Math.exp(-dt * 12),
    );
    if (!sim.state.dead) {
      player.rotation.y = chasing
        ? -chasePose.heading
        : Math.atan2(-sim.body.velocity.x, -sim.body.velocity.z);
      if (
        !chasing &&
        Math.hypot(sim.body.velocity.x, sim.body.velocity.z) < 0.1
      )
        player.rotation.y = 0;
    }
    legs.forEach(
      (leg, i) =>
        (leg.rotation.x = sim.state.dead
          ? 0
          : Math.sin(t * 10 + i * Math.PI) *
            Math.min(
              0.5,
              Math.hypot(sim.body.velocity.x, sim.body.velocity.z) * 0.08,
            )),
    );
    arms.forEach(
      (arm, i) =>
        (arm.rotation.x = sim.state.climbing
          ? -2.4 + Math.sin(t * 7 + i * Math.PI) * 0.4
          : sim.state.dead
            ? -0.4
            : i === 1 && heldWeapon.visible
              ? -0.85
              : 0),
    );
    heldWeapon.visible = !sim.state.dead && (sim.state.bow || sim.state.pistol);
    heldBow.visible = sim.state.weapon === "bow" && sim.state.bow;
    heldPistol.visible = sim.state.weapon === "pistol" && sim.state.pistol;
    if (bowPickup) bowPickup.visible = !sim.state.bow;
    if (pistolPickup) pistolPickup.visible = !sim.state.pistol;
    waypoint.visible = !!sim.state.destination && !sim.state.dead;
    if (sim.state.destination) {
      const d = sim.state.destination;
      waypoint.position.set(
        centerX(d.s) + d.lane,
        heightAt(level, d.s) +
          0.82 +
          (reducedMotion ? 0 : Math.sin(t * 4) * 0.08),
        -d.s,
      );
    } else clearGuide();
    const camYaw = settings.fixedCamera ? 0 : yaw,
      distance = sim.state.zoom ? 8 : 16;
    const cameraTarget = chasing
      ? new T.Vector3(
          p.x - Math.sin(chasePose.heading) * 23,
          p.y + 13,
          p.z + Math.cos(chasePose.heading) * 23,
        )
      : new T.Vector3(
          p.x + Math.sin(camYaw) * distance,
          p.y + 9 + pitch * 12,
          p.z + Math.cos(camYaw) * distance,
        );
    if (chasing !== previousChasing) {
      camera.position.copy(cameraTarget);
      previousChasing = chasing;
    }
    camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * 7));
    if (chasing)
      camera.lookAt(
        p.x - Math.sin(chasePose.heading) * 3,
        p.y + 1.5,
        p.z + Math.cos(chasePose.heading) * 3,
      );
    else camera.lookAt(p.x, p.y + 1.8, p.z - 5);
    camera.fov = sim.state.zoom ? 25 : 53;
    camera.updateProjectionMatrix();
    sun.position.set(p.x - 22, p.y + 50, p.z + 28);
    sun.target.position.set(p.x, p.y, p.z - 10);
    words.forEach((w, i) => {
      w.a.visible = w.halo.visible = !sim.state.collected.includes(i);
      w.a.position.y = w.y + Math.sin(t * 2 + i) * 0.14;
      w.halo.position.y = w.a.position.y;
      w.halo.quaternion.copy(camera.quaternion);
    });
    bag.visible = bagLabel.visible = sim.bagVisible;
    bag.rotation.y = t;
    bag.position.y = bagPos.y + Math.sin(t * 2) * 0.15;
    const arr = flag.geometry.attributes.position;
    for (let i = 0; i < arr.count; i++)
      arr.setZ(
        i,
        (Math.sin(t * 3 + baseFlag[i * 3] * 2) * 0.14 * (baseFlag[i * 3] + 2)) /
          4,
      );
    arr.needsUpdate = true;
    summitTag.visible = sim.state.won || save.completed.includes(level.id);
    summitTag.position.y = flagPos.y + 8.3 + Math.sin(t * 2.2) * 0.2;
    pitRings.forEach(
      (a, i) =>
        (a.material = mat(
          sim.state.inPit && Math.abs(sim.s - level.pits[i]) < 2
            ? sim.state.pitReady
              ? "#ffe7a3"
              : "#ca8052"
            : "#bb9559",
        )),
    );
    buffs.forEach((a, i) => (a.visible = sim.isBuffAvailable(i ? 81 : 43)));
    vines.forEach(
      (a) => (a.visible = sim.enemies.some((e) => e.id === 2 && e.alive)),
    );
    fireWater?.update(sim.state.time, sim.state.water, sim.state.fireOut);
    guardians.forEach(
      (a, i) =>
        (a.material = mat(
          sim.state.guardians.includes(i) ? "#eed6a0" : "#7c8e86",
        )),
    );
    enemyViews.forEach((v) => (v.group.visible = false));
    for (const e of sim.enemies) {
      const v = enemyViews.get(e.id) ?? enemyView(e.id, e.kind);
      v.group.visible =
        !chasing &&
        (e.alive ||
          particles.some((a) => a.targetId === e.id) ||
          sim.events.some(
            (event) => event.kind === "shot" && event.targetId === e.id,
          ));
      v.group.position.set(centerX(e.s) + e.lane, e.y, -e.s);
      v.group.rotation.y =
        e.kind === "spitter"
          ? Math.atan2(-(p.x - v.group.position.x), -(p.z - v.group.position.z))
          : Math.PI;
      v.bar.scale.x = e.hp / e.max;
      v.parts.forEach((a, i) => {
        if (e.kind === "spitter") {
          a.scale.setScalar(1 + (e.windup ?? 0) * 0.6);
          return;
        }
        if (e.kind === "worm") a.position.y = Math.sin(t * 5 + i) * 0.08;
        else a.rotation.z = Math.sin(t * 5) * (i === 0 ? -1 : 1) * 0.5;
      });
    }
    chaseGhost.update(t, chaseDistance, sim.chase.gap, chasing);
    bossEffects.update(
      t,
      sim.enemies.find((e) => e.kind === "boss"),
      sim.projectiles,
      !chasing && !sim.state.dead,
    );
    const liveBullets = new Set(
      sim.projectiles.filter((b) => !b.spell).map((b) => b.id),
    );
    for (const [id, a] of projectileViews)
      if (!liveBullets.has(id)) {
        scene.remove(a);
        projectileViews.delete(id);
      }
    for (const b of sim.projectiles) {
      if (b.spell) continue;
      let a = projectileViews.get(b.id);
      if (!a) {
        a = mesh(bulletGeometry, bulletMaterial);
        projectileViews.set(b.id, a);
      }
      a.position.set(b.x, b.y, b.z);
    }
    bombMeshes.forEach((a, i) => {
      const b = sim.bombs[i];
      a.visible = b.active;
      a.material = mat(
        b.timer >= 0 && Math.floor(t * 9) % 2 === 0 ? "#ed6650" : "#383e38",
      );
      a.scale.setScalar(b.timer >= 0 ? 1 + Math.sin(t * 10) * 0.1 : 1);
    });
    for (const blade of bladeViews)
      blade.group.position.y = bladeHeight(level, blade.s, blade.index, t);
    rockMeshes.forEach(({ a, shadow, s }) => {
      const phase = (t + s) % 5,
        p = at(s, Math.sin(t) * 2, 7);
      a.visible = phase > 2.8;
      shadow.visible = phase > 2.8;
      a.position.set(p.x, p.y - Math.max(0, phase - 3) * 6, p.z);
      shadow.position.x = p.x;
      a.rotation.x = t;
    });
    weather.position.set(p.x, p.y, p.z);
    const wa = weatherG.attributes.position;
    for (let i = 0; i < wa.count; i++) {
      let y = wa.getY(i) - dt * (level.id === 4 ? 1.7 : 0.4);
      if (y < 0) y = 30;
      wa.setY(i, y);
    }
    wa.needsUpdate = true;
    for (const e of sim.events.splice(0)) {
      if (e.kind !== "guide" && e.kind !== "hit") sound.effect(e.kind, e.index);
      if (e.kind === "guide") guide(e.x ?? p.x, e.z ?? p.z);
      if (e.kind === "death" || e.kind === "explosion" || e.kind === "burst") {
        effect(
          e.x ?? p.x,
          e.y ?? p.y,
          e.z ?? p.z,
          e.kind === "burst" ? "#d2e5b5" : "#ee995b",
          24,
        );
        if (settings.vibration)
          navigator.vibrate?.(e.kind === "burst" ? [60, 40, 90] : 120);
      } else if (["word", "bag", "kill", "water", "win"].includes(e.kind))
        effect(e.x ?? p.x, (e.y ?? p.y) + 1, e.z ?? p.z, "#ead394");
      if (e.kind === "boss-summon" && e.end) {
        const from = new T.Vector3(e.x, e.y, e.z);
        const to = new T.Vector3(e.end.x, e.end.y, e.end.z);
        const a = mesh(shotGeometry, flashMaterial);
        a.position.copy(from);
        const dir = to.clone().sub(from);
        a.quaternion.setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          dir.clone().normalize(),
        );
        particles.push({
          obj: a,
          life: 0.5,
          v: dir.multiplyScalar(2),
          straight: true,
        });
      }
      if (e.kind === "shot") {
        const origin = new T.Vector3(e.x ?? p.x, e.y ?? p.y + 1.4, e.z ?? p.z);
        const end = e.end
          ? new T.Vector3(e.end.x, e.end.y, e.end.z)
          : origin.clone().add(new T.Vector3(0, 0, -30));
        const direction = end.clone().sub(origin),
          distance = direction.length();
        direction.normalize();
        const a = mesh(shotGeometry, shotMaterial);
        a.position.copy(origin);
        a.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction);
        a.castShadow = false;
        particles.push({
          obj: a,
          life: e.targetId !== undefined ? 2 : distance / 48,
          targetId: e.targetId,
          end,
          v: direction.multiplyScalar(48),
          straight: true,
        });
        const flash = mesh(particleGeometry, flashMaterial);
        flash.position.copy(origin);
        flash.scale.setScalar(2.6);
        flash.castShadow = false;
        particles.push({
          obj: flash,
          life: 0.08,
          v: new T.Vector3(),
          straight: true,
        });
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const a = particles[i];
      a.life -= dt;
      // 已命中的射线对应可见弹体追踪移动目标；抵达龙身再爆出火花并播放命中声。
      if (a.end) {
        const enemy = sim.enemies.find((e) => e.id === a.targetId);
        if (enemy) a.end.set(centerX(enemy.s) + enemy.lane, enemy.y, -enemy.s);
        const direction = a.end.clone().sub(a.obj.position);
        if (direction.length() <= 48 * dt || a.life <= 0) {
          a.obj.position.copy(a.end);
          a.life = 0;
          for (let n = 0; n < 10; n++) {
            const spark = mesh(
              particleGeometry,
              n % 2 ? flashMaterial : shotMaterial,
            );
            spark.position.copy(a.end);
            spark.scale.setScalar(n === 0 ? 4 : 1.5);
            particles.push({
              obj: spark,
              life: 0.22,
              v: new T.Vector3(
                Math.sin(n * 7) * 6,
                Math.cos(n * 3) * 5,
                Math.cos(n * 7) * 6,
              ),
            });
          }
          if (a.targetId !== undefined) sound.effect("hit");
        } else {
          a.v.copy(direction.normalize().multiplyScalar(48));
          a.obj.quaternion.setFromUnitVectors(
            new T.Vector3(0, 1, 0),
            direction,
          );
        }
      }
      if (a.life > 0) a.obj.position.addScaledVector(a.v, dt);
      if (!a.straight) a.v.y -= dt * 4;
      if (a.life <= 0) {
        scene.remove(a.obj);
        if (
          a.obj.geometry !== particleGeometry &&
          a.obj.geometry !== shotGeometry
        ) {
          a.obj.geometry.dispose();
          geometries.delete(a.obj.geometry);
        }
        particles.splice(i, 1);
      }
    }
    renderer.render(scene, camera);
    if (now - lastSend > 90) {
      onState({
        ...sim.state,
        collected: [...sim.state.collected],
        guardians: [...sim.state.guardians],
        buffs: { ...sim.state.buffs },
      });
      lastSend = now;
    }
  }
  Object.assign(window, { __mountaineerQA: { sim, camera, renderer } }); // TEMPORARY_QA
  sound.setMuted(settings.muted);
  frame = requestAnimationFrame(tick);
  return {
    pause(v: boolean) {
      paused = v;
      sound.setActive(!v);
      clear();
      if (!v) sound.unlock();
    },
    settings(v: Settings) {
      settings = { ...v };
      sound.setMuted(v.muted);
    },
    move(x: number, y: number) {
      joystick = { x, y };
    },
    sprint(v: boolean) {
      sprinting = v;
    },
    shoot(v: boolean) {
      if (v) action(() => sound.unlock());
      shooting = v;
    },
    jump() {
      action(() => sim.jump());
    },
    interact() {
      action(() => sim.interact());
    },
    burst() {
      action(() => sim.burst());
    },
    switchWeapon() {
      action(() => sim.switchWeapon());
    },
    turn(direction: -1 | 1) {
      action(() => sim.turn(direction));
    },
    telescope() {
      action(() => sim.telescope());
    },
    reset(clearWords = false) {
      sim.restart(clearWords);
      clear();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      clear();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", clear);
      window.removeEventListener("resize", resize);
      geometries.forEach((g) => g.dispose());
      textures.forEach((t) => t.dispose());
      extraMaterials.forEach((m) => m.dispose());
      materials.forEach((m) => m.dispose());
      renderer.domElement.removeEventListener("contextmenu", contextMenu);
      renderer.dispose();
      renderer.domElement.remove();
      sound.dispose();
      fireWater?.dispose();
      portal?.dispose();
      bossEffects.dispose();
      snowFootprints.dispose();
      chaseGhost.dispose();
    },
  };
}
