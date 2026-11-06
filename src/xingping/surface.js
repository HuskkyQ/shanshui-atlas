import * as THREE from 'three';

export function createSurfaceDepthMaterial({ mask, bounds }) {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  material.onBeforeCompile = shader => {
    shader.uniforms.riverMask = { value: mask };
    shader.uniforms.riverGround = { value: new THREE.Vector4(bounds.minX, bounds.minZ, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 terrainPoint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nterrainPoint = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 terrainPoint;\nuniform sampler2D riverMask;\nuniform vec4 riverGround;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (texture2D(riverMask, (terrainPoint.xz - riverGround.xy) / riverGround.zw).r > .5) discard;');
  };
  return material;
}

// Color and fine surface grain are illustrative; the source vertices never move.
export function createSurfaceMaterial({ mask, bounds, cliffLines }) {
  const segments = cliffLines.flatMap(line => line.slice(1).map((p, i) => new THREE.Vector4(line[i].x, line[i].z, p.x, p.z)));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .98, flatShading: false });
  material.customProgramCacheKey = () => `xingping-surface-v2-${segments.length}`;
  material.onBeforeCompile = shader => {
    shader.uniforms.riverMask = { value: mask };
    shader.uniforms.riverGround = { value: new THREE.Vector4(bounds.minX, bounds.minZ, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) };
    shader.uniforms.cliffSegments = { value: segments.length ? segments : [new THREE.Vector4()] };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 terrainPoint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nterrainPoint = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 terrainPoint;
      uniform sampler2D riverMask;
      uniform vec4 riverGround;
      uniform vec4 cliffSegments[${Math.max(1, segments.length)}];
      float grainHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float surfaceNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(grainHash(i), grainHash(i + vec2(1., 0.)), f.x), mix(grainHash(i + vec2(0., 1.)), grainHash(i + vec2(1., 1.)), f.x), f.y);
      }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (texture2D(riverMask, (terrainPoint.xz - riverGround.xy) / riverGround.zw).r > .5) discard;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 groundNormal = inverseTransformDirection(normal, viewMatrix);
        float steep = 1.0 - smoothstep(.42, .85, abs(groundNormal.y));
        float cliffDistance = 10000.0;
        for (int i = 0; i < ${segments.length}; i++) {
          vec2 a = cliffSegments[i].xy, edge = cliffSegments[i].zw - a;
          float t = clamp(dot(terrainPoint.xz - a, edge) / max(dot(edge, edge), .00001), 0.0, 1.0);
          cliffDistance = min(cliffDistance, length(terrainPoint.xz - a - t * edge));
        }
        float knownCliff = 1.0 - smoothstep(.22, .85, cliffDistance);
        float rockAmount = clamp(steep * (.55 + knownCliff * .7), 0.0, .94);
        float u = terrainPoint.x * abs(groundNormal.z) + terrainPoint.z * abs(groundNormal.x);
        float grain = surfaceNoise(vec2(u, terrainPoint.y) * 46.0);
        float strata = sin(terrainPoint.y * 44.0 + surfaceNoise(terrainPoint.xz * 2.5) * 4.0);
        float fissure = smoothstep(.90, .99, abs(sin(u * 26.0 + surfaceNoise(vec2(u * 4.0, terrainPoint.y * 3.0)) * 3.0)));
        vec3 stone = mix(vec3(.27, .28, .23), vec3(.45, .42, .33), .35 + grain * .5);
        stone *= .96 + strata * .045 - fissure * .13;
        float moss = smoothstep(.55, .84, surfaceNoise(terrainPoint.xz * 3.0 + terrainPoint.y * .4));
        stone = mix(stone, vec3(.13, .23, .14), moss * .26);
        float canopyGrain = surfaceNoise(terrainPoint.xz * 21.0);
        float grainVisible = 1.0 - smoothstep(.025, .12, max(length(dFdx(terrainPoint.xz)), length(dFdy(terrainPoint.xz))));
        diffuseColor.rgb *= mix(1.0, .88 + canopyGrain * .22, grainVisible * (1.0 - rockAmount));
        diffuseColor.rgb = mix(diffuseColor.rgb, stone, rockAmount);`);
  };
  return material;
}
