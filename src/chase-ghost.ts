import * as T from "three";
import { chasePoint } from "./chase";

/** 黑袍幽灵与三齿恶鬼叉，独立维护漂浮动画和资源。 */
export function createChaseGhost(scene: T.Object3D) {
  const group = new T.Group();
  scene.add(group);
  const geometries = new Set<T.BufferGeometry>();
  const cloak = new T.MeshStandardMaterial({
    color: "#050508",
    emissive: "#151020",
    emissiveIntensity: 0.35,
    roughness: 1,
    side: T.DoubleSide,
  });
  const face = new T.MeshBasicMaterial({ color: "#000000" });
  const metal = new T.MeshStandardMaterial({
    color: "#5d536b",
    metalness: 0.7,
    roughness: 0.35,
    emissive: "#391623",
    emissiveIntensity: 0.4,
  });
  const red = new T.MeshBasicMaterial({
    color: "#fa283c",
    fog: false,
    toneMapped: false,
  });
  function add(
    geometry: T.BufferGeometry,
    material: T.Material,
    x: number,
    y: number,
    z: number,
    parent: T.Object3D = group,
  ) {
    geometries.add(geometry);
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  const robe = add(
    new T.ConeGeometry(1.05, 2.7, 12, 4, true),
    cloak,
    0,
    1.65,
    0,
  );
  const vertices = robe.geometry.getAttribute("position") as T.BufferAttribute;
  for (let i = 0; i < vertices.count; i++)
    if (vertices.getY(i) < -1.2)
      vertices.setY(
        i,
        vertices.getY(i) +
          Math.sin(Math.atan2(vertices.getZ(i), vertices.getX(i)) * 6) * 0.18,
      );
  robe.geometry.computeVertexNormals();
  add(new T.SphereGeometry(0.72, 12, 10), cloak, 0, 2.9, 0);
  const mask = add(new T.SphereGeometry(0.55, 12, 10), face, 0, 2.95, 0.3);
  mask.scale.set(0.8, 1, 0.65);
  for (const side of [-1, 1]) {
    const eye = add(
      new T.SphereGeometry(0.08, 6, 4),
      red,
      side * 0.19,
      3.02,
      0.66,
    );
    eye.scale.y = 0.5;
    const arm = add(
      new T.ConeGeometry(0.32, 1.45, 7),
      cloak,
      side * 0.82,
      2.1,
      0,
    );
    arm.rotation.z = side * 0.65;
  }
  const fork = new T.Group();
  group.add(fork);
  fork.position.set(1.22, 0.1, 0.25);
  fork.rotation.z = -0.12;
  add(new T.CylinderGeometry(0.055, 0.075, 3.8, 7), metal, 0, 2, 0, fork);
  add(new T.BoxGeometry(0.9, 0.12, 0.14), metal, 0, 3.75, 0, fork);
  for (const x of [-0.42, 0, 0.42]) {
    const h = x === 0 ? 0.85 : 0.65;
    add(
      new T.CylinderGeometry(0.045, 0.065, h, 6),
      metal,
      x,
      3.75 + h / 2,
      0,
      fork,
    );
    add(new T.ConeGeometry(0.12, 0.32, 5), red, x, 3.75 + h + 0.16, 0, fork);
  }
  group.visible = false;
  return {
    group,
    update(time: number, distance: number, gap: number, visible: boolean) {
      group.visible = visible;
      const p = chasePoint(distance - gap);
      group.position.set(p.x, p.y + 0.25 + Math.sin(time * 3.2) * 0.18, p.z);
      group.rotation.set(0, -p.heading, Math.sin(time * 2.5) * 0.045);
      robe.scale.x = 1 + Math.sin(time * 4) * 0.05;
      fork.rotation.x = Math.sin(time * 4) * 0.08;
    },
    dispose() {
      group.removeFromParent();
      geometries.forEach((g) => g.dispose());
      [cloak, face, metal, red].forEach((m) => m.dispose());
    },
  };
}
