import * as T from "three";
import { centerX, groundAt, heightAt, type Level } from "./levels";

/** 导航提示与雪地痕迹共用脚掌轮廓。 */
export function createFootGeometry() {
  const shape = new T.Shape();
  shape.moveTo(-0.075, -0.18);
  shape.lineTo(0.075, -0.18);
  shape.lineTo(0.105, 0.08);
  shape.quadraticCurveTo(0.11, 0.2, 0, 0.23);
  shape.quadraticCurveTo(-0.11, 0.2, -0.105, 0.08);
  shape.closePath();
  return new T.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

/** 只在脚落雪地且移动一定距离后交替留下脚印，固定容量避免长期游玩累积对象。 */
export function createSnowFootprints(
  scene: T.Scene,
  level: Level,
  geometry: T.BufferGeometry,
) {
  const material = new T.MeshBasicMaterial({
    color: "#6d8391",
    transparent: true,
    opacity: 0.65,
    side: T.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const capacity = 160;
  const marks = new T.InstancedMesh(geometry, material, capacity);
  marks.frustumCulled = false;
  scene.add(marks);
  const dummy = new T.Object3D();
  const times = Array<number>(capacity).fill(-Infinity);
  let index = 0,
    side = 1,
    last: T.Vector3 | undefined,
    deaths = -1;
  function clear() {
    times.fill(-Infinity);
    for (let i = 0; i < capacity; i++) {
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      marks.setMatrixAt(i, dummy.matrix);
    }
    marks.instanceMatrix.needsUpdate = true;
    last = undefined;
    index = 0;
  }
  clear();
  return {
    update(
      time: number,
      position: { x: number; y: number; z: number },
      grounded: boolean,
      active: boolean,
      deathCount: number,
    ) {
      if (deathCount !== deaths) {
        deaths = deathCount;
        clear();
      }
      marks.visible = active;
      for (let i = 0; i < capacity; i++) {
        if (
          times[i] !== -Infinity &&
          (time - times[i] > 50 || time < times[i])
        ) {
          times[i] = -Infinity;
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          marks.setMatrixAt(i, dummy.matrix);
          marks.instanceMatrix.needsUpdate = true;
        }
      }
      const s = -position.z;
      const snow = level.id === 4 || (level.id === 5 && s >= 108);
      if (!active || !grounded || !snow) {
        last = undefined;
        return;
      }
      const p = new T.Vector3(position.x, 0, position.z);
      if (!last || last.distanceTo(p) > 3) {
        last = p;
        return;
      }
      const distance = last.distanceTo(p);
      if (distance < 0.58) return;
      const dir = p.clone().sub(last).normalize();
      side *= -1;
      const x = p.x - dir.z * side * 0.18,
        z = p.z + dir.x * side * 0.18;
      const ground = groundAt(level, -z, x - centerX(-z));
      if (ground !== undefined) {
        dummy.position.set(x, ground + 0.035, z);
        const slope =
          (heightAt(level, -z + 0.05) - heightAt(level, -z - 0.05)) / 0.1;
        dummy.quaternion.setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          new T.Vector3(0, 1, slope).normalize(),
        );
        dummy.quaternion.multiply(
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 1, 0),
            Math.atan2(-dir.x, -dir.z) + side * 0.06,
          ),
        );
        dummy.scale.setScalar(1.5);
        dummy.updateMatrix();
        marks.setMatrixAt(index, dummy.matrix);
        times[index] = time;
        index = (index + 1) % capacity;
        marks.instanceMatrix.needsUpdate = true;
      }
      last.copy(p);
    },
    dispose() {
      marks.removeFromParent();
      marks.dispose();
      material.dispose();
    },
  };
}
