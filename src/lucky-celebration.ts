import * as T from "three";

/** Short-lived rewards own their resources, including early reset and level exit. */
export function createLuckyCelebration(scene: T.Scene) {
  const root = new T.Group();
  const bits: { object: T.Object3D; velocity: T.Vector3; spin: number }[] = [];
  let life = 0;
  function clear() {
    root.traverse((object) => {
      if (object instanceof T.Mesh) {
        object.geometry.dispose();
        (object.material as T.Material).dispose();
      }
    });
    root.clear();
    root.removeFromParent();
    bits.length = 0;
    life = 0;
  }
  function piece(
    geometry: T.BufferGeometry,
    color: string,
    parent: T.Object3D = root,
  ) {
    const object = new T.Mesh(
      geometry,
      new T.MeshBasicMaterial({
        color,
        transparent: true,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    parent.add(object);
    return object;
  }
  const colors = [
    "#ff595e",
    "#ffad42",
    "#ffdf63",
    "#78d78a",
    "#62c8fa",
    "#8380ee",
    "#dc87e7",
  ];
  function play(index: number, origin: T.Vector3) {
    clear();
    scene.add(root);
    root.position.copy(origin);
    life = 5;
    if (index === 0) {
      colors.forEach((color, i) => {
        const arc = piece(
          new T.TorusGeometry(3.5 - i * 0.19, 0.105, 6, 64, Math.PI),
          color,
        );
        arc.position.y = 0.8;
      });
    }
    if (index === 2) {
      const bottle = new T.Group();
      root.add(bottle);
      piece(new T.CylinderGeometry(0.22, 0.24, 0.85, 12), "#287b49", bottle);
      const neck = piece(
        new T.CylinderGeometry(0.09, 0.16, 0.5, 10),
        "#edc76a",
        bottle,
      );
      neck.position.y = 0.62;
      const band = piece(
        new T.CylinderGeometry(0.245, 0.245, 0.3, 12),
        "#fff0bd",
        bottle,
      );
      band.position.y = -0.06;
      bottle.rotation.z = -0.25;
    }
    for (let i = 0; i < (index === 3 ? 18 : 75); i++) {
      let object: T.Object3D;
      if (index === 3) {
        const ingot = new T.Group();
        root.add(ingot);
        const hull = piece(new T.SphereGeometry(0.25, 8, 6), "#ffc947", ingot);
        hull.scale.set(1.8, 0.65, 1);
        const center = piece(
          new T.SphereGeometry(0.18, 8, 6),
          "#ffe69a",
          ingot,
        );
        center.position.y = 0.1;
        for (const x of [-0.34, 0.34]) {
          const tip = piece(new T.ConeGeometry(0.16, 0.3, 5), "#ffd45c", ingot);
          tip.position.set(x, 0.12, 0);
        }
        object = ingot;
      } else {
        object = piece(
          index === 2
            ? new T.SphereGeometry(0.065, 6, 4)
            : new T.PlaneGeometry(0.12, 0.23),
          index === 2 ? "#fff2c9" : colors[i % colors.length],
        );
      }
      object.position.set(
        (Math.random() - 0.5) * 1.2,
        index === 2 ? 0.9 : 0.5,
        (Math.random() - 0.5) * 0.8,
      );
      bits.push({
        object,
        velocity: new T.Vector3(
          (Math.random() - 0.5) * 5,
          3 + Math.random() * 4,
          (Math.random() - 0.5) * 3,
        ),
        spin: Math.random() * 5 - 2.5,
      });
    }
  }
  function update(dt: number) {
    if (life <= 0) return;
    life -= dt;
    if (life <= 0) return clear();
    for (const bit of bits) {
      bit.object.position.addScaledVector(bit.velocity, dt);
      bit.velocity.y -= dt * 2.5;
      bit.object.rotation.x += dt * bit.spin;
      bit.object.rotation.z += dt * bit.spin * 0.6;
    }
    root.traverse((object) => {
      if (object instanceof T.Mesh)
        (object.material as T.Material).opacity = Math.min(1, life);
    });
  }
  return { play, update, clear };
}
