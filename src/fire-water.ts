import * as T from "three";
import { centerX, heightAt, type Level } from "./levels";

import { WATER_TRAVEL_TIME, WATER_GATE } from "./water-timing";

/** 第五关独立特效：左侧山泉、阀门引流、分层火苗与灭火后的少量水渍。 */
export function createFireWater(scene: T.Scene, level: Level) {
  const root = new T.Group();
  scene.add(root);
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  function material(color: string, opacity = 1) {
    const m = new T.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    materials.add(m);
    return m;
  }
  function add(g: T.BufferGeometry, m: T.Material, p: T.Vector3) {
    geometries.add(g);
    const mesh = new T.Mesh(g, m);
    mesh.position.copy(p);
    root.add(mesh);
    return mesh;
  }
  const at = (s: number, lane: number, lift = 0) =>
    new T.Vector3(centerX(s) + lane, heightAt(level, s) + lift, -s);
  const flameGeometry = new T.LatheGeometry(
    [
      [0, -0.85],
      [0.65, -0.65],
      [1, -0.25],
      [0.72, 0.25],
      [0.28, 0.8],
      [0, 1.4],
    ].map(([x, y]) => new T.Vector2(x, y)),
    8,
  );
  // 多层发光火舌各自摆动，底部始终贴地，避免缩放时悬空。
  const flames = Array.from({ length: 42 }, (_, i) => {
    const p = at(46 + Math.sin(i * 7) * 0.45, ((i % 21) / 20 - 0.5) * 7);
    const inner = i >= 21;
    const a = add(
      flameGeometry,
      material(inner ? "#fff1a0" : i % 2 ? "#ff9c24" : "#ef451b", 0.85),
      p,
    );
    return {
      a,
      p,
      height: (inner ? 0.7 : 1.2) + (Math.sin(i * 13) + 1) * 0.55,
      inner,
    };
  });
  const sparkGeometry = new T.SphereGeometry(0.045, 4, 4);
  const sparks = Array.from({ length: 28 }, (_, i) =>
    add(sparkGeometry, material("#ffbd53"), at(46, (i / 28 - 0.5) * 7)),
  );
  const waterMaterial = material("#a6e9f5", 0.72);
  const dropGeometry = new T.SphereGeometry(0.07, 5, 5);
  const drops = Array.from({ length: 100 }, () =>
    add(dropGeometry, waterMaterial, at(WATER_GATE.s, WATER_GATE.lane)),
  );
  const puddles = Array.from({ length: 5 }, (_, i) => {
    const a = add(
      new T.CircleGeometry(0.18 + i * 0.035, 12),
      material("#73acb3", 0.38),
      at(45.4 + i * 0.3, Math.sin(i * 9) * 2, 0.025),
    );
    a.rotation.x = -Math.PI / 2;
    a.scale.y = 0.55;
    return a;
  });
  const valve = add(
    new T.TorusGeometry(0.36, 0.07, 6, 16),
    material("#cf9a54"),
    at(WATER_GATE.s, WATER_GATE.lane, 0.65),
  );
  let openedAt: number | undefined;
  return {
    /** 使用模拟时间，暂停时水流、火苗与灭火过程一并停止；重生自动复位。 */
    update(time: number, water: boolean, fireOut: boolean) {
      if (!water) openedAt = undefined;
      else openedAt ??= time;
      const elapsed = openedAt === undefined ? 0 : time - openedAt;
      const fade = fireOut
        ? 0
        : water
          ? Math.max(0, 1 - elapsed / WATER_TRAVEL_TIME)
          : 1;
      flames.forEach(({ a, p, height, inner }, i) => {
        a.visible = fade > 0;
        const h = height * (0.85 + Math.sin(time * 9 + i * 2.7) * 0.15) * fade;
        a.scale.set((inner ? 0.17 : 0.3) * fade, h, 0.22 * fade);
        a.position.set(
          p.x + Math.sin(time * 5 + i) * h * 0.12,
          p.y + h * 0.85,
          p.z,
        );
        a.rotation.z = Math.sin(time * 6 + i) * 0.16;
      });
      sparks.forEach((a, i) => {
        const life = (time * 0.65 + i / sparks.length) % 1;
        a.visible = fade > 0;
        a.position.copy(
          at(
            46,
            (i / sparks.length - 0.5) * 7 + Math.sin(time + i) * life,
            0.3 + life * 4,
          ),
        );
        a.scale.setScalar((1 - life) * fade);
      });
      drops.forEach((a, i) => {
        const incoming = i < 35;
        a.visible = incoming || (water && !fireOut);
        const progress = (time * (incoming ? 0.7 : 0.45) + i * 0.618) % 1;
        if (incoming)
          a.position.copy(
            at(
              WATER_GATE.s,
              WATER_GATE.lane - (1 - progress) * 7,
              0.25 + (1 - progress) * 2 + Math.sin(i * 3) * 0.12,
            ),
          );
        else {
          const reach = Math.min(1, elapsed / WATER_TRAVEL_TIME);
          const s = WATER_GATE.s + progress * 6;
          a.visible &&= progress <= reach;
          a.position.copy(
            at(
              s,
              WATER_GATE.lane * (1 - progress) +
                Math.sin(i * 5) * progress * 2.8,
              0.15 + Math.sin(progress * Math.PI) * 1.2,
            ),
          );
        }
        a.scale.set(incoming ? 2.8 : 1, 1, incoming ? 1 : 1.6);
        a.rotation.z = incoming ? -0.28 : 0;
      });
      valve.rotation.z = water ? -Math.PI / 2 : 0;
      puddles.forEach((a) => (a.visible = fireOut));
    },
    /** 关卡切换时释放本模块拥有的 GPU 资源。 */
    dispose() {
      root.removeFromParent();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
