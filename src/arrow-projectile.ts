import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** 沿局部 +Y 飞行的箭矢；共享几何/材质，连射时不重复创建资源。 */
export function createArrowAssets() {
  const parts = [
    new T.CylinderGeometry(0.035, 0.035, 1.4, 6),
    new T.ConeGeometry(0.13, 0.28, 4).translate(0, 0.84, 0),
    new T.BoxGeometry(0.34, 0.26, 0.025).translate(0, -0.56, 0),
    new T.BoxGeometry(0.025, 0.26, 0.34).translate(0, -0.56, 0),
  ];
  const geometry = mergeGeometries(parts, true)!;
  parts.forEach((part) => part.dispose());
  const materials = ["#76512f", "#bcccd1", "#f4e3b8", "#f4e3b8"].map(
    (color) => new T.MeshBasicMaterial({ color }),
  );
  return { geometry, materials };
}
