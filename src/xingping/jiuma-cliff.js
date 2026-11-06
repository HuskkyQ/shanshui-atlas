import * as THREE from 'three';

const smooth = (a, b, value) => {
  const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function contains(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function rockMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: '#c7c5b3', roughness: 0.96 });
  material.customProgramCacheKey = () => 'jiuma-photo-rock-v2';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 cliffUV;\nvarying float cliffHeight;\nvarying float cliffUp;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ncliffUV = uv; cliffHeight = position.y; cliffUp = abs(normal.y);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec2 cliffUV;
      varying float cliffHeight;
      varying float cliffUp;
      float cliffHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float cliffNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(cliffHash(i), cliffHash(i + vec2(1.,0.)), f.x), mix(cliffHash(i + vec2(0.,1.)), cliffHash(i + vec2(1.,1.)), f.x), f.y);
      }
      float cliffFbm(vec2 p) { return .57 * cliffNoise(p) + .28 * cliffNoise(p * 2.03) + .15 * cliffNoise(p * 4.07); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float u = cliffUV.x, v = cliffUV.y, h = cliffHeight;
        float broad = cliffFbm(vec2(u * 3.8 + sin(h * 4.0) * .13, h * 4.6));
        float streak = cliffFbm(vec2(u * 19.0 + sin(h * 5.0) * .22, h * 6.0));
        float grain = cliffFbm(vec2(u, h) * 75.0);
        float fissure = 1.0 - smoothstep(.12, .19, cliffNoise(vec2(u * 13.0 + sin(h * 2.3) * .2, h * 4.1)));
        float pale = smoothstep(.27, .67, broad + (streak - .5) * .28);
        vec3 stone = mix(vec3(.28,.29,.27), vec3(.72,.70,.62), pale);
        stone = mix(stone, vec3(.53,.39,.25), smoothstep(.60,.78, broad) * .38);
        stone *= .80 + grain * .34;
        stone *= 1.0 - fissure * .25;
        float foot = 1.0 - smoothstep(.10 + .07 * broad, .23 + .10 * broad, v);
        float crown = smoothstep(.87 - broad * .08, .99 - broad * .035, v) * mix(.25, 1.0, smoothstep(.15, .55, cliffUp));
        float gully = smoothstep(.64,.77, cliffFbm(vec2(u * 3.7 + sin(h * 4.0) * .3, h * 2.5)));
        float ledge = (1.0 - smoothstep(.012,.032, abs(v - (.43 + sin(u * 4.7) * .075)))) * smoothstep(.48,.68,broad);
        float foliage = clamp(max(max(foot, crown), max(gully * .8, ledge * .8)),0.,1.);
        vec3 leaves = mix(vec3(.025,.060,.030),vec3(.065,.120,.047),grain);
        diffuseColor.rgb = mix(stone, leaves, foliage * .94);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float relief = cliffFbm(vec2(u * 8.0, h * 12.0)) * .012 + cliffNoise(vec2(u, h) * 62.0) * .002;
        vec3 sigmaX = dFdx(-vViewPosition), sigmaY = dFdy(-vViewPosition);
        vec3 r1 = cross(sigmaY, normal), r2 = cross(normal, sigmaX);
        float det = dot(sigmaX, r1);
        normal = normalize(abs(det) * normal - sign(det) * (dFdx(relief) * r1 + dFdy(relief) * r2) * (1.0 - foliage * .85));`,
      );
  };
  return material;
}

/** Photo-informed display surface; its wall steepness is not surveyed geometry. */
export function createJiumaCliff({ line, terrainHeight, isWater, waterLevel, bounds }) {
  if (
    line.length < 2 ||
    line.every(
      (p) => p.x < bounds.minX || p.x > bounds.maxX || p.z < bounds.minZ || p.z > bounds.maxZ,
    )
  )
    return null;
  const lengths = [0];
  for (let i = 1; i < line.length; i++)
    lengths.push(lengths.at(-1) + line[i].distanceTo(line[i - 1]));
  const length = lengths.at(-1);
  const along = (distance) => {
    let i = 0;
    while (i < lengths.length - 2 && lengths[i + 1] < distance) i++;
    const t = THREE.MathUtils.clamp((distance - lengths[i]) / (lengths[i + 1] - lengths[i]), 0, 1);
    return line[i].clone().lerp(line[i + 1], t);
  };
  const stations = [];
  // Parallel cross sections cannot fold over one another at a bend in the mapped line.
  const direction = line.at(-1).clone().sub(line[0]).normalize();
  const landDirection = new THREE.Vector3(direction.z, 0, -direction.x);
  const count = Math.min(144, Math.ceil(length / 0.05));
  for (let i = 0; i <= count; i++) {
    const distance = (length * i) / count;
    const center = along(distance);
    const land = landDirection.clone();
    // The source cliff is directed north to south, with the high side on its left.
    const backDistance = 1.05;
    const back = center.clone().addScaledVector(land, backDistance);
    if (isWater(back.x, back.z)) continue;
    let low,
      high = backDistance;
    for (let d = backDistance - 0.04; d >= -4; d -= 0.04) {
      const p = center.clone().addScaledVector(land, d);
      if (isWater(p.x, p.z)) {
        low = d;
        break;
      }
      high = d;
    }
    if (low === undefined) continue;
    for (let step = 0; step < 22; step++) {
      const middle = (low + high) / 2;
      const p = center.clone().addScaledVector(land, middle);
      if (isWater(p.x, p.z)) low = middle;
      else high = middle;
    }
    const footDistance = high + 0.003;
    const foot = center.clone().addScaledVector(land, footDistance);
    foot.y = waterLevel - 0.009;
    back.y = terrainHeight(back.x, back.z);
    let support = back.y;
    for (let d = -0.1; d < backDistance; d += 0.15) {
      const p = center.clone().addScaledVector(land, d);
      support = Math.max(support, terrainHeight(p.x, p.z));
    }
    const shoulder =
      waterLevel + (support - waterLevel) * (0.83 + 0.045 * Math.sin(distance * 3.2));
    stations.push({ center, land, foot, back, footDistance, backDistance, shoulder, distance });
  }
  if (stations.length < 3) return null;
  const first = stations[0].distance,
    last = stations.at(-1).distance;
  const toeRows = 8,
    faceRows = 36,
    retreatRows = 12,
    rows = toeRows + faceRows + retreatRows;
  const section = (station, row) => {
    const endBlend =
      smooth(0, 0.13, (station.distance - first) / (last - first)) *
      smooth(0, 0.13, (last - station.distance) / (last - first));
    const faceStart = Math.max(
      station.footDistance + 0.04,
      -0.55 + 0.13 * Math.sin(station.distance * 3.8) + 0.08 * Math.sin(station.distance * 8.3),
    );
    const faceDepth =
      0.3 + 0.09 * Math.sin(station.distance * 7.7) + 0.045 * Math.sin(station.distance * 19.0);
    const toeHeight = waterLevel + 0.16 + 0.09 * (1 + Math.sin(station.distance * 4.0));
    let d, y, v;
    if (row <= toeRows) {
      const t = row / toeRows;
      d = THREE.MathUtils.lerp(station.footDistance, faceStart, t);
      y = THREE.MathUtils.lerp(waterLevel - 0.009, toeHeight, t);
      v = t * 0.15;
    } else if (row <= toeRows + faceRows) {
      const t = (row - toeRows) / faceRows;
      const fold =
        (0.055 * Math.sin(station.distance * 14.0 + Math.sin(t * 7.0)) +
          0.012 * Math.sin(station.distance * 53.0 + t * 29.0)) *
        Math.sin(t * Math.PI);
      d = faceStart + faceDepth * t + fold;
      y = THREE.MathUtils.lerp(toeHeight, station.shoulder, t);
      v = 0.15 + t * 0.85;
    } else {
      const t = (row - toeRows - faceRows) / retreatRows;
      d = THREE.MathUtils.lerp(faceStart + faceDepth, station.backDistance + 0.1, t);
      const p = station.center.clone().addScaledVector(station.land, d);
      y = Math.max(
        terrainHeight(p.x, p.z),
        THREE.MathUtils.lerp(station.shoulder, station.back.y, t),
      );
      y += Math.sin(t * Math.PI) * 0.045 * Math.sin(station.distance * 6.0);
      v = 1 + t * 0.1;
    }
    const point = station.center.clone().addScaledVector(station.land, d);
    const native = terrainHeight(point.x, point.z);
    y = THREE.MathUtils.lerp(native, y, endBlend);
    if (row === rows) y = native + 0.004;
    point.y = y;
    return { point, d, v };
  };
  const profiles = stations.map((station) =>
    Array.from({ length: rows + 1 }, (_, row) => section(station, row)),
  );
  const positions = [],
    uvs = [],
    indices = [];
  for (let i = 0; i < stations.length; i++)
    for (let row = 0; row <= rows; row++) {
      const { point, v } = profiles[i][row];
      positions.push(point.x, point.y, point.z);
      uvs.push(stations[i].distance, v);
    }
  for (let i = 0; i < stations.length - 1; i++)
    for (let row = 0; row < rows; row++) {
      const a = i * (rows + 1) + row,
        b = a + rows + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = rockMaterial();
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'jiuma-rock-face';
  mesh.castShadow = mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.name = 'jiuma-cliff';
  group.userData = {
    measuredGeometry: false,
    sourceWay: '1087179283',
    reconstruction: 'photo-informed local display surface; original DEM retained',
  };
  group.add(mesh);
  // Small clustered crowns sit on the toe and receding summit, leaving the rock face open.
  const crowns = [];
  let seed = 1974;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const profilePoint = (i, row) => {
    const sample = (index) =>
      profiles[index][Math.floor(row)].point
        .clone()
        .lerp(profiles[index][Math.ceil(row)].point, row % 1);
    return sample(Math.floor(i)).lerp(sample(Math.ceil(i)), i % 1);
  };
  for (let cluster = 0; cluster < 64; cluster++) {
    const center = 3 + random() * (stations.length - 7);
    const row = random() < 0.55 ? 1 + random() * 6 : toeRows + faceRows + 2 + random() * 8;
    for (let i = 0; i < 5; i++) {
      const p = profilePoint(
        THREE.MathUtils.clamp(center + (random() - 0.5) * 4, 1, stations.length - 2),
        THREE.MathUtils.clamp(row + (random() - 0.5) * 2, 1, rows - 1),
      );
      if (!isWater(p.x, p.z)) crowns.push({ p, size: 0.025 + random() * 0.038 });
    }
  }
  const crownGeometry = new THREE.IcosahedronGeometry(1, 0);
  const crownMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  const shrubs = new THREE.InstancedMesh(crownGeometry, crownMaterial, crowns.length);
  shrubs.name = 'jiuma-ledge-shrubs';
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  crowns.forEach(({ p, size }, i) => {
    transform.position.copy(p);
    transform.position.y += size * 0.6;
    transform.rotation.set(i * 0.7, i * 2.1, i * 0.4);
    transform.scale.set(size * 1.4, size, size * 1.2);
    transform.updateMatrix();
    shrubs.setMatrixAt(i, transform.matrix);
    tint.setHex(i % 3 === 0 ? 0x35583c : i % 3 === 1 ? 0x416847 : 0x3a5c37);
    shrubs.setColorAt(i, tint);
  });
  shrubs.receiveShadow = true;
  group.add(shrubs);
  const footprint = {
    outer: [
      ...stations.map((s) => s.foot.clone()),
      ...stations
        .slice()
        .reverse()
        .map((s) => s.back.clone()),
    ],
    holes: [],
  };
  const box = new THREE.Box3().setFromPoints(footprint.outer);
  const middle = stations[Math.floor(stations.length * 0.52)];
  const target = middle.center.clone().addScaledVector(middle.land, -0.2);
  target.y = waterLevel + (middle.shoulder - waterLevel) * 0.56;
  const position = target.clone().addScaledVector(middle.land, -Math.max(10.5, length * 1.8));
  position.y = waterLevel + Math.max(1.4, (middle.shoulder - waterLevel) * 0.62);
  let disposed = false;
  return {
    group,
    stations,
    footprint,
    view: { target, position },
    getBankHeight(x, z) {
      let nearest,
        squared = 0.12 ** 2;
      for (let i = 0; i < stations.length - 1; i++) {
        const a = stations[i].foot,
          b = stations[i + 1].foot;
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const t = THREE.MathUtils.clamp(
          ((x - a.x) * dx + (z - a.z) * dz) / Math.max(dx * dx + dz * dz, 1e-10),
          0,
          1,
        );
        const distance = (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
        if (distance < squared) {
          nearest = THREE.MathUtils.lerp(profiles[i][0].point.y, profiles[i + 1][0].point.y, t);
          squared = distance;
        }
      }
      return nearest ?? null;
    },
    getHeight(x, z) {
      if (
        x < box.min.x ||
        x > box.max.x ||
        z < box.min.z ||
        z > box.max.z ||
        !contains(x, z, footprint.outer)
      )
        return null;
      let best,
        squared = Infinity;
      for (let i = 0; i < stations.length; i++) {
        const station = stations[i];
        const dx = x - station.center.x,
          dz = z - station.center.z;
        const d = dx * station.land.x + dz * station.land.z;
        const across = (dx - d * station.land.x) ** 2 + (dz - d * station.land.z) ** 2;
        if (across < squared) {
          best = { profile: profiles[i], d };
          squared = across;
        }
      }
      let previous = best.profile[0];
      for (let row = 1; row <= rows; row++) {
        const next = best.profile[row];
        if (best.d <= next.d)
          return THREE.MathUtils.lerp(
            previous.point.y,
            next.point.y,
            THREE.MathUtils.clamp((best.d - previous.d) / (next.d - previous.d), 0, 1),
          );
        previous = next;
      }
      return terrainHeight(x, z);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      shrubs.dispose();
      crownGeometry.dispose();
      crownMaterial.dispose();
      group.clear();
    },
  };
}
