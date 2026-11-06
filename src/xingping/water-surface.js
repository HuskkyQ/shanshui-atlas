import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const shader = {
  name: 'XingpingRiver',
  uniforms: {
    color: { value: new THREE.Color('#246856') },
    tDiffuse: { value: null },
    textureMatrix: { value: new THREE.Matrix4() },
    time: { value: 0 },
    reflectionStrength: { value: 0 },
  },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 mirrorUV; varying vec3 riverPoint;
    void main() { mirrorUV = textureMatrix * vec4(position, 1.0); vec4 world = modelMatrix * vec4(position, 1.0); riverPoint = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }`,
  fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; uniform float time; uniform float reflectionStrength;
    varying vec4 mirrorUV; varying vec3 riverPoint;
    void main() {
      float wave = sin(riverPoint.x * 5.1 + riverPoint.z * 3.2 + time * .4) * .6 + sin(riverPoint.z * 8.2 - time * .6) * .3;
      vec3 normal = normalize(vec3(wave * .012, 1.0, wave * .008));
      vec3 direction = normalize(cameraPosition - riverPoint);
      float fresnel = pow(1.0 - max(0.0, dot(normal, direction)), 3.0);
      vec2 uv = mirrorUV.xy / max(mirrorUV.w, .0001) + vec2(wave, -wave * .7) * .001;
      vec3 reflected = texture2D(tDiffuse, uv).rgb;
      vec3 base = mix(color, vec3(.13, .24, .19), fresnel * .42) * (1.0 + wave * .025);
      gl_FragColor = vec4(mix(base, reflected, reflectionStrength * (.18 + fresnel * .6)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function shouldRenderReflection(time, lastTime, interval = 1 / 15) {
  return time - lastTime >= interval;
}

export function createWaterSurface({ polygons, waterLevel, reflection = false }) {
  const positions = [],
    indices = [];
  const bounds = new THREE.Box3();
  for (const polygon of polygons) {
    const points = [polygon.outer, ...polygon.holes].flat(),
      offset = positions.length / 3;
    points.forEach((p) => {
      positions.push(p.x, -p.z, 0);
      bounds.expandByPoint(new THREE.Vector3(p.x, waterLevel, p.z));
    });
    const triangles = THREE.ShapeUtils.triangulateShape(
      polygon.outer.map((p) => new THREE.Vector2(p.x, -p.z)),
      polygon.holes.map((hole) => hole.map((p) => new THREE.Vector2(p.x, -p.z))),
    );
    for (const [a, b, c] of triangles) {
      const x = (i) => Math.fround(points[i].x),
        z = (i) => Math.fround(points[i].z);
      const cross = (x(b) - x(a)) * (z(c) - z(a)) - (z(b) - z(a)) * (x(c) - x(a));
      if (Math.abs(cross) < 1e-9) continue;
      indices.push(...(cross > 0 ? [a, c, b] : [a, b, c]).map((i) => i + offset));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = reflection
    ? new Reflector(geometry, {
        shader,
        color: '#246856',
        textureWidth: 512,
        textureHeight: 512,
        multisample: 0,
        clipBias: 0.001,
      })
    : new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
          ...shader,
          uniforms: THREE.UniformsUtils.clone(shader.uniforms),
        }),
      );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = waterLevel;
  mesh.name = 'xingping-water-surface';
  mesh.userData = {
    measuredBathymetry: false,
    waterLevelMeasured: false,
    polygonIds: polygons.map((p) => p.id),
    reflectionEnabled: false,
    reflectionTextureSize: reflection ? 512 : 0,
    reflectionFrameRate: reflection ? 15 : 0,
  };
  const reflect = mesh.onBeforeRender;
  const reflectionInterval = 1 / 15;
  let renderTime = 0;
  let lastReflectionRender = -Infinity;
  mesh.onBeforeRender = function (...args) {
    if (
      !this.userData.reflectionEnabled ||
      !shouldRenderReflection(renderTime, lastReflectionRender, reflectionInterval)
    )
      return;
    lastReflectionRender = renderTime;
    reflect.apply(this, args);
  };
  const group = new THREE.Group();
  group.name = 'xingping-water';
  group.add(mesh);
  const center = bounds.isEmpty()
    ? new THREE.Vector3(0, waterLevel, 0)
    : bounds.getCenter(new THREE.Vector3());
  let disposed = false;
  return {
    group,
    mesh,
    update(camera, time) {
      if (disposed) return false;
      renderTime = time;
      mesh.material.uniforms.time.value = time;
      const enabled = reflection && camera.position.distanceTo(center) < 75;
      const changed = enabled !== mesh.userData.reflectionEnabled;
      mesh.userData.reflectionEnabled = enabled;
      if (changed && enabled) lastReflectionRender = -Infinity;
      mesh.material.uniforms.reflectionStrength.value = enabled ? 1 : 0;
      return changed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      if (reflection) mesh.dispose();
      else mesh.material.dispose();
      group.clear();
    },
  };
}
