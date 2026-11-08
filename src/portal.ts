import * as T from "three";

/** 黑色旋涡门：极坐标螺旋围绕暗核旋转，统一维护动画和 GPU 资源。 */
export function createPortal(scene: T.Scene, position: T.Vector3) {
  const geometry = new T.PlaneGeometry(6.4, 6.4);
  const material = new T.ShaderMaterial({
    transparent: true,
    side: T.DoubleSide,
    uniforms: { time: { value: 0 }, completed: { value: 0 } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv;
      uniform float time;
      uniform float completed;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r > 1.0) discard;
        float angle = atan(p.y, p.x);
        float spiral = pow(0.5 + 0.5 * sin(angle * 5.0 + r * 23.0 - time * 3.5), 5.0);
        float rim = exp(-pow((r - 0.86) * 25.0, 2.0));
        float core = smoothstep(0.16, 0.65, r);
        vec3 glow = mix(vec3(0.32, 0.16, 0.54), vec3(0.16, 0.5, 0.48), completed);
        vec3 color = vec3(0.006, 0.004, 0.013) + glow * (spiral * 0.65 * core + rim);
        gl_FragColor = vec4(color, 1.0 - smoothstep(0.91, 1.0, r));
      }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.position.copy(position);
  scene.add(mesh);
  return {
    update(time: number, completed: boolean) {
      material.uniforms.time.value = time;
      material.uniforms.completed.value = Number(completed);
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
