import * as T from "three";
import { centerX } from "./levels";
import type { Enemy, Projectile } from "./simulation";

/** 法术弹体、口部蓄力与锯齿拖尾共用模拟数据，避免技能只有伤害没有来源。 */
export function createBossEffects(scene: T.Scene) {
  const root = new T.Group();
  scene.add(root);
  const lightning = new T.MeshBasicMaterial({
    color: "#b9eaff",
    fog: false,
    toneMapped: false,
  });
  const fire = new T.MeshBasicMaterial({
    color: "#ff7134",
    fog: false,
    toneMapped: false,
  });
  const electricTrail = new T.LineBasicMaterial({
    color: "#6ccfff",
    fog: false,
    toneMapped: false,
  });
  const fireTrail = new T.LineBasicMaterial({
    color: "#ffad42",
    fog: false,
    toneMapped: false,
  });
  const sphere = new T.IcosahedronGeometry(0.3, 1);
  const segment = new T.CylinderGeometry(0.055, 0.055, 1, 5);
  const dummy = new T.Object3D();
  const up = new T.Vector3(0, 1, 0);
  const aura = new T.Mesh(
    new T.IcosahedronGeometry(0.7, 1),
    new T.MeshBasicMaterial({
      color: "#a2dfff",
      wireframe: true,
      fog: false,
      toneMapped: false,
    }),
  );
  root.add(aura);
  const bolts = new Map<
    number,
    {
      head: T.Mesh;
      trail: T.Line;
      geometry: T.BufferGeometry;
      segments: T.InstancedMesh;
    }
  >();
  function remove(id: number) {
    const bolt = bolts.get(id)!;
    root.remove(bolt.head, bolt.trail, bolt.segments);
    bolt.segments.dispose();
    bolt.geometry.dispose();
    bolts.delete(id);
  }
  return {
    update(
      time: number,
      boss: Enemy | undefined,
      projectiles: Projectile[],
      active: boolean,
    ) {
      root.visible = active;
      aura.visible = active && !!boss?.alive && (boss.windup ?? 0) > 0;
      if (boss) {
        aura.position.set(
          centerX(boss.s) + boss.lane,
          boss.y + 0.55,
          -boss.s + 2.5,
        );
        aura.scale.setScalar(0.6 + (boss.windup ?? 0) * 1.4);
        aura.rotation.set(time * 4, time * 3, 0);
        aura.material.color.set(boss.phase === 2 ? "#ff8b35" : "#a2dfff");
      }
      const live = new Set(projectiles.filter((p) => p.spell).map((p) => p.id));
      for (const id of bolts.keys()) if (!live.has(id)) remove(id);
      for (const p of projectiles) {
        if (!p.spell) continue;
        let bolt = bolts.get(p.id);
        if (!bolt) {
          const geometry = new T.BufferGeometry();
          geometry.setAttribute(
            "position",
            new T.Float32BufferAttribute(new Float32Array(39), 3),
          );
          const head = new T.Mesh(
            sphere,
            p.spell === "breath" ? fire : lightning,
          );
          const trail = new T.Line(
            geometry,
            p.spell === "breath" ? fireTrail : electricTrail,
          );
          const segments = new T.InstancedMesh(
            segment,
            p.spell === "breath" ? fire : lightning,
            12,
          );
          segments.frustumCulled = false;
          root.add(head, trail, segments);
          bolt = { head, trail, geometry, segments };
          bolts.set(p.id, bolt);
        }
        bolt.head.position.set(p.x, p.y, p.z);
        bolt.head.scale.setScalar(p.spell === "breath" ? 1.8 : 1.1);
        const origin = boss
          ? aura.position
          : new T.Vector3(p.x - p.vx * 0.2, p.y - p.vy * 0.2, p.z - p.vz * 0.2);
        const positions = bolt.geometry.getAttribute(
          "position",
        ) as T.BufferAttribute;
        for (let i = 0; i <= 12; i++) {
          const f = i / 12,
            jitter =
              Math.sin(f * Math.PI) * (p.spell === "lightning" ? 0.8 : 0.24);
          positions.setXYZ(
            i,
            T.MathUtils.lerp(origin.x, p.x, f) +
              Math.sin(time * 45 + i * 19) * jitter,
            T.MathUtils.lerp(origin.y, p.y, f) +
              Math.cos(time * 38 + i * 13) * jitter,
            T.MathUtils.lerp(origin.z, p.z, f),
          );
        }
        for (let i = 0; i < 12; i++) {
          const a = new T.Vector3().fromBufferAttribute(positions, i);
          const b = new T.Vector3().fromBufferAttribute(positions, i + 1);
          const direction = b.clone().sub(a);
          dummy.position.copy(a.add(b).multiplyScalar(0.5));
          dummy.quaternion.setFromUnitVectors(
            up,
            direction.clone().normalize(),
          );
          dummy.scale.set(1, direction.length(), 1);
          dummy.updateMatrix();
          bolt.segments.setMatrixAt(i, dummy.matrix);
        }
        bolt.segments.instanceMatrix.needsUpdate = true;
        positions.needsUpdate = true;
        bolt.geometry.computeBoundingSphere();
      }
    },
    dispose() {
      for (const id of bolts.keys()) remove(id);
      root.removeFromParent();
      sphere.dispose();
      segment.dispose();
      aura.geometry.dispose();
      aura.material.dispose();
      [lightning, fire, electricTrail, fireTrail].forEach((m) => m.dispose());
    },
  };
}
