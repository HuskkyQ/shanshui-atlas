import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DACI_LAYOUT, cliffFaceZ, cliffFootY } from './layout.js';

export function createDaciArchitecture() {
  const group = new THREE.Group();
  group.name = 'daci-architecture';
  const material = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const m = {
    red: material('#a84130'), darkRed: material('#6d2923'), wood: material('#643f2c'),
    roof: material('#46504a'), edge: material('#72776b'), stone: material('#c6c0a9'), window: material('#35372b'), white: material('#d8d2c2'),
  };
  m.roof.side = THREE.DoubleSide;
  const parts = {};
  for (const id of ['main-hall', 'gallery', 'terrace', 'stair', 'gate']) {
    const part = new THREE.Group(); part.name = `building-${id}`; group.add(part); parts[id] = part;
  }
  function mesh(parent, name, geometry, mat) {
    const object = new THREE.Mesh(geometry, mat);
    object.name = name; object.castShadow = true; object.receiveShadow = true;
    parent.add(object); return object;
  }
  function box(parent, name, x, y, z, w, h, d, mat) {
    const object = mesh(parent, name, new THREE.BoxGeometry(w, h, d), mat);
    object.position.set(x, y, z); return object;
  }
  function beam(parent, name, a, b, width, mat) {
    const vector = new THREE.Vector3().subVectors(b, a);
    const object = box(parent, name, 0, 0, 0, width, vector.length(), width, mat);
    object.position.copy(a).add(b).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
    return object;
  }
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  function surfaceMax(x0, x1, y0, y1) {
    let maximum = -Infinity;
    for (let x = x0; x <= x1 + .01; x += .35) for (let y = y0; y <= y1 + .01; y += .4) maximum = Math.max(maximum, cliffFaceZ(x, y));
    return maximum;
  }
  function support(parent, name, x, floorY, z, columnMaterial = m.wood, width = .4) {
    const foot = cliffFootY(x, z, floorY - .3);
    if (foot !== null && floorY - foot < 13.5) {
      beam(parent, name, v(x, foot - .4, z), v(x, floorY - .1, z), width, columnMaterial);
    } else {
      const rockY = floorY - 2.6;
      beam(parent, name, v(x, rockY, cliffFaceZ(x, rockY) - .5), v(x, floorY - .1, z), width * .7, columnMaterial);
    }
  }
  function roof(parent, name, x, y, z, width, depth, rise = 1.2) {
    const root = new THREE.Group(); root.name = name; root.position.set(x, y, z); parent.add(root);
    const nx = Math.max(8, Math.ceil(width * 1.5)), nz = 10;
    const height = (u, t) => Math.min(rise * (1 - Math.abs(t)) ** 1.4, rise * (1 - Math.abs(u)) / .21)
      + .34 * Math.abs(u) ** 7 * Math.abs(t) ** 3;
    const positions = [], indices = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx * 2 - 1, t = j / nz * 2 - 1;
      positions.push(u * width / 2, height(u, t), t * depth / 2);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    mesh(root, `${name}-surface`, geometry, m.roof);
    // Fine raised tile courses and curved eaves remain readable at close range.
    for (let i = 1; i < nx; i++) {
      const u = i / nx * 2 - 1;
      for (let j = 0; j < nz; j++) {
        const t0 = j / nz * 2 - 1, t1 = (j + 1) / nz * 2 - 1;
        beam(root, `${name}-tile-${i}-${j}`, v(u * width / 2, height(u, t0) + .025, t0 * depth / 2), v(u * width / 2, height(u, t1) + .025, t1 * depth / 2), .035, m.edge);
      }
    }
    box(root, `${name}-ridge`, 0, rise + .1, 0, width * .62, .16, .18, m.edge);
    for (const side of [-1, 1]) for (let i = 0; i < nx; i++) {
      const u0 = i / nx * 2 - 1, u1 = (i + 1) / nx * 2 - 1;
      beam(root, `${name}-eave-${side}-${i}`, v(u0 * width / 2, height(u0, side), side * depth / 2), v(u1 * width / 2, height(u1, side), side * depth / 2), .12, m.edge);
    }
    const courses = root.children.filter((object) => object.name.includes('-tile-') || object.name.includes('-eave-'));
    const pieces = courses.map((object) => {
      object.updateMatrix(); return object.geometry.applyMatrix4(object.matrix);
    });
    mesh(root, `${name}-tile-courses`, mergeGeometries(pieces), m.edge);
    courses.forEach((object) => { root.remove(object); object.geometry.dispose(); });
    return root;
  }
  function rail(parent, name, x0, x1, y, z, mat = m.red) {
    for (const dy of [.25, .95]) box(parent, `${name}-horizontal-${dy}`, (x0 + x1) / 2, y + dy, z, x1 - x0, .1, .1, mat);
    const n = Math.ceil((x1 - x0) / .55);
    for (let i = 0; i <= n; i++) box(parent, `${name}-picket-${i}`, THREE.MathUtils.lerp(x0, x1, i / n), y + .58, z, .08, .85, .08, mat);
  }
  function balustrade(parent, name, a, b, mat = m.stone, height = 1.05) {
    const direction = b.clone().sub(a), length = direction.length();
    for (const h of [.3, height]) beam(parent, `${name}-horizontal-${h}`, a.clone().add(v(0, h, 0)), b.clone().add(v(0, h, 0)), .13, mat);
    const count = Math.max(2, Math.ceil(length / 1.15));
    for (let i = 0; i <= count; i++) {
      const p = a.clone().lerp(b, i / count);
      box(parent, `${name}-post-${i}`, p.x, p.y + height / 2, p.z, .17, height, .17, mat);
    }
  }
  function lantern(parent, name, x, y, z) {
    box(parent, `${name}-cord`, x, y + .32, z, .035, .42, .035, m.wood);
    const body = mesh(parent, `${name}-body`, new THREE.CylinderGeometry(.16, .2, .46, 10), m.red);
    body.position.set(x, y, z);
    box(parent, `${name}-cap`, x, y + .27, z, .25, .07, .25, m.edge);
    box(parent, `${name}-tassel`, x, y - .35, z, .035, .25, .035, m.edge);
  }
  function frontRoof(parent, name, x, y, frontZ, width, depth, rise) {
    const root = new THREE.Group(); root.name = name;
    root.position.set(x, y, frontZ - depth / 2); parent.add(root);
    const nx = 16, nz = 8, positions = [], indices = [];
    const height = (u) => rise * (1 - Math.abs(u)) ** 1.25 + .24 * Math.abs(u) ** 6;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx * 2 - 1;
      positions.push(u * width / 2, height(u), (j / nz - .5) * depth);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, c = a + nx + 1;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    mesh(root, `${name}-surface`, geometry, m.roof);
    // This ridge points back into the cliff and intersects the larger rear roof.
    box(root, `${name}-ridge`, 0, rise + .08, 0, .18, .16, depth + .15, m.edge);
    for (const side of [-1, 1]) for (let i = 0; i < nx / 2; i++) {
      const u0 = side * i / (nx / 2), u1 = side * (i + 1) / (nx / 2);
      beam(root, `${name}-barge-${side}-${i}`, v(u0 * width / 2, height(u0), depth / 2), v(u1 * width / 2, height(u1), depth / 2), .13, m.edge);
    }
    for (let j = 0; j <= nz; j++) for (const side of [-1, 1]) {
      const z = (j / nz - .5) * depth;
      for (let i = 0; i < nx / 2; i++) {
        const u0 = side * i / (nx / 2), u1 = side * (i + 1) / (nx / 2);
        beam(root, `${name}-tile-${j}-${side}-${i}`, v(u0 * width / 2, height(u0) + .025, z), v(u1 * width / 2, height(u1) + .025, z), .025, m.edge);
      }
    }
    const courses = root.children.filter((object) => /-tile-|-barge-/.test(object.name));
    const pieces = courses.map((object) => { object.updateMatrix(); return object.geometry.applyMatrix4(object.matrix); });
    mesh(root, `${name}-tile-courses`, mergeGeometries(pieces), m.edge);
    courses.forEach((object) => { root.remove(object); object.geometry.dispose(); });
    return root;
  }
  function windows(parent, prefix, x, y, z, w, h, frame = m.red) {
    box(parent, `${prefix}-glass`, x, y + h / 2, z, w, h, .09, m.window);
    for (let i = 0; i <= 5; i++) box(parent, `${prefix}-vertical-${i}`, x - w / 2 + w * i / 5, y + h / 2, z + .07, .045, h + .1, .06, frame);
    for (let i = 0; i <= 3; i++) box(parent, `${prefix}-horizontal-${i}`, x, y + h * i / 3, z + .07, w + .08, .045, .06, frame);
  }
  function octagonalPavilion(parent, name, x, floorY, z, radius) {
    const root = new THREE.Group(); root.name = name; parent.add(root);
    const floor = mesh(root, `${name}-floor`, new THREE.CylinderGeometry(radius, radius, .3, 8), m.stone);
    floor.position.set(x, floorY - .15, z);
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI / 8 + i * Math.PI / 4;
      const px = x + Math.cos(angle) * (radius - .34), pz = z + Math.sin(angle) * (radius - .34);
      box(root, `${name}-post-${i}`, px, floorY + 1.35, pz, .22, 2.7, .22, m.wood);
      if (Math.sin(angle) > -.25) {
        const next = Math.PI / 8 + ((i + 1) % 8) * Math.PI / 4;
        balustrade(root, `${name}-rail-${i}`, v(px, floorY, pz), v(x + Math.cos(next) * (radius - .34), floorY, z + Math.sin(next) * (radius - .34)), m.wood, .85);
      }
    }
    const roofRadius = radius + .9;
    const roofProfile = [[.25, 4.36], [.58, 3.84], [.88, 2.52], [1, 2.7]];
    const positions = [x, floorY + 4.55, z], indices = [];
    for (const [scale, height] of roofProfile) for (let i = 0; i < 8; i++) {
      const angle = Math.PI / 8 + i * Math.PI / 4;
      positions.push(x + Math.cos(angle) * roofRadius * scale, floorY + height, z + Math.sin(angle) * roofRadius * scale);
    }
    for (let i = 0; i < 8; i++) indices.push(0, 1 + (i + 1) % 8, 1 + i);
    for (let ring = 0; ring < roofProfile.length - 1; ring++) for (let i = 0; i < 8; i++) {
      const a = 1 + ring * 8 + i, b = 1 + ring * 8 + (i + 1) % 8, c = a + 8, d = b + 8;
      indices.push(a, b, c, b, d, c);
    }
    const roofGeometry = new THREE.BufferGeometry();
    roofGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roofGeometry.setIndex(indices); roofGeometry.computeVertexNormals();
    mesh(root, `${name}-roof-surface`, roofGeometry, m.roof);
    const ridges = [];
    const ridgeProfile = [[.04, 4.5], [.38, 4.12], [.76, 2.9], [1.02, 2.76]];
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI / 8 + i * Math.PI / 4;
      for (let j = 0; j < ridgeProfile.length - 1; j++) {
        const [r0, h0] = ridgeProfile[j], [r1, h1] = ridgeProfile[j + 1];
        ridges.push(beam(root, `${name}-temporary-ridge-${i}-${j}`,
          v(x + Math.cos(angle) * roofRadius * r0, floorY + h0, z + Math.sin(angle) * roofRadius * r0),
          v(x + Math.cos(angle) * roofRadius * r1, floorY + h1, z + Math.sin(angle) * roofRadius * r1), .075, m.edge));
      }
    }
    const ridgePieces = ridges.map((object) => { object.updateMatrix(); return object.geometry.applyMatrix4(object.matrix); });
    mesh(root, `${name}-roof-ridges`, mergeGeometries(ridgePieces), m.edge);
    ridges.forEach((object) => { root.remove(object); object.geometry.dispose(); });
    const finial = mesh(root, `${name}-roof-finial`, new THREE.CylinderGeometry(.08, .13, .55, 8), m.edge);
    finial.position.set(x, floorY + 4.82, z);
    for (const [i, p] of [[0, [-.55, .55]], [1, [.55, .55]], [2, [-.55, -.55]], [3, [.55, -.55]]]) {
      support(root, `${name}-support-${i}`, x + p[0] * radius, floorY - .15, z + p[1] * radius);
    }
    return root;
  }
  function storey(parent, name, x, floorY, frontZ, width, depth, height) {
    const part = new THREE.Group(); part.name = name; parent.add(part);
    box(part, `${name}-floor`, x, floorY - .15, frontZ - depth / 2, width, .3, depth, m.stone);
    box(part, `${name}-back-wall`, x, floorY + height / 2, frontZ - depth + .12, width, height, .24, m.darkRed);
    for (const side of [-1, 1]) box(part, `${name}-side-wall-${side}`, x + side * (width / 2 - .12), floorY + height / 2, frontZ - depth / 2, .24, height, depth, m.red);
    const bays = Math.max(2, Math.round(width / 2.8));
    for (let i = 0; i <= bays; i++) {
      const bx = x - width / 2 + i * width / bays;
      box(part, `${name}-post-${i}`, bx, floorY + height / 2, frontZ, .22, height, .22, m.red);
      if (i < bays) windows(part, `${name}-window-${i}`, bx + width / bays / 2, floorY + .45, frontZ - .12, width / bays - .35, height - .65);
    }
    return part;
  }
  function gable(parent, name, x, y, z, width, height, depth, mat = m.red) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      x - width / 2, y, z, x + width / 2, y, z, x, y + height, z,
      x - width / 2, y, z + depth, x + width / 2, y, z + depth, x, y + height, z + depth,
    ], 3));
    geometry.setIndex([0, 1, 2, 5, 4, 3, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0]);
    geometry.computeVertexNormals();
    return mesh(parent, name, geometry, mat);
  }
  // The photographed central complex has one deep upper hall above one broader open gallery.
  const gs = DACI_LAYOUT.gallery;
  const galleryFront = surfaceMax(gs.fromX, gs.toX, gs.floorY, gs.floorY + 3) + 2.9;
  const galleryBack = Math.min(cliffFaceZ(-17, gs.floorY), cliffFaceZ(0, gs.floorY)) - .7;
  const galleryDepth = galleryFront - galleryBack;
  const gallery = parts.gallery;
  box(gallery, 'gallery-floor', -4.5, gs.floorY - .18, galleryBack + galleryDepth / 2, 25, .36, galleryDepth, m.darkRed);
  box(gallery, 'gallery-white-base', -4.5, gs.floorY - .42, galleryFront - .08, 25, .45, .3, m.white);
  const galleryBay = 25 / 9;
  for (let i = 0; i < 10; i++) {
    const x = -17 + i * galleryBay;
    box(gallery, `gallery-post-${i}`, x, gs.floorY + 1.55, galleryFront - .24, .3, 3.1, .3, m.red);
    if (i < 9) {
      const bayX = x + galleryBay / 2;
      if ([0, 1, 3, 4, 6, 7].includes(i)) {
        box(gallery, `gallery-open-door-${i}`, bayX, gs.floorY + 1.4, galleryFront - .52, galleryBay - .52, 2.55, .12, m.window);
        if ([1, 4, 7].includes(i)) lantern(gallery, `gallery-lantern-${i}`, bayX, gs.floorY + 2.35, galleryFront + .02);
      } else windows(gallery, `gallery-window-${i}`, bayX, gs.floorY + .72, galleryFront - .42, galleryBay - .48, 1.85);
    }
    if (i % 2 === 0) support(gallery, `gallery-support-${i}`, x, gs.floorY - .15, galleryFront - .38);
  }
  rail(gallery, 'gallery-front-rail', -17, 7.1, gs.floorY, galleryFront, m.red);
  roof(gallery, 'gallery-roof', -4.5, gs.floorY + 3.2, galleryFront - 2.15, 26.5, 5.9, 1.3);

  const hs = DACI_LAYOUT.mainHall, hall = parts['main-hall'];
  const hallFront = galleryFront - 2.8, hallBack = cliffFaceZ(hs.x, hs.floorY + 2) - 1.05;
  const hallDepth = hallFront - hallBack;
  box(hall, 'main-hall-floor', hs.x, hs.floorY - .18, (hallFront + hallBack) / 2, hs.width, .36, hallDepth, m.stone);
  box(hall, 'main-hall-white-base', hs.x, hs.floorY + .18, hallFront + .03, hs.width, .55, .3, m.white);
  box(hall, 'main-hall-back-wall', hs.x, hs.floorY + 1.75, hallBack + .15, hs.width, 3.5, .3, m.darkRed);
  for (let i = 0; i < 7; i++) {
    const x = hs.x - 9 + i * 3;
    box(hall, `main-hall-post-${i}`, x, hs.floorY + 1.75, hallFront - .08, .32, 3.5, .32, m.red);
    if (i < 6) windows(hall, `main-hall-window-${i}`, x + 1.5, hs.floorY + .58, hallFront - .23, 2.5, 2.65);
  }
  balustrade(hall, 'main-hall-white-balustrade', v(hs.x - 10, hs.floorY, hallFront + .42), v(hs.x + 10, hs.floorY, hallFront + .42), m.white, .85);
  const grandRoof = roof(hall, 'main-hall-grand-roof', hs.x, hs.floorY + 3.45, (hallFront + hallBack) / 2, 22.4, hallDepth + 2.5, 5.55);
  grandRoof.userData = { photographedRole: 'single-deep-main-roof' };
  const baxiaFront = hallFront + 1.45;
  frontRoof(hall, 'main-hall-front-baxia-roof', hs.x, hs.floorY + 3.62, baxiaFront, 9.4, 5.2, 1.75);
  gable(hall, 'main-hall-front-baxia-gable', hs.x, hs.floorY + 3.77, baxiaFront + .02, 8.3, 1.35, .18, m.darkRed);
  hall.userData = { approximation: true, landmark: '崖中主殿' };

  // Each route includes horizontal solid treads, landings, guard rails and mounting braces.
  function flight(parent, name, a, b, width, covered = false) {
    const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
    const count = Math.max(1, Math.ceil(Math.max(Math.abs(b.y - a.y) / .27, horizontal / .5)));
    const dx = (b.x - a.x) / count, dy = (b.y - a.y) / count, dz = (b.z - a.z) / count;
    const sample = (t) => a.clone().lerp(b, t);
    for (let i = 0; i < count; i++) {
      const p = sample((i + .5) / count), topY = a.y + i * dy;
      const tread = box(parent, `${name}-tread-${i}`, p.x, topY - Math.abs(dy) / 2 - .11, p.z, Math.abs(dx) + .045, Math.abs(dy) + .22, width + Math.abs(dz), m.stone);
      tread.userData.walkingTop = topY;
      if (i % 4 === 0) {
        support(parent, `${name}-support-${i}`, p.x, topY - .05, p.z + width * .35);
        for (const side of [-1, 1]) {
          box(parent, `${name}-rail-post-${i}-${side}`, p.x, topY + .55, p.z + side * width / 2, .12, 1.1, .12, m.red);
          if (covered) box(parent, `${name}-roof-post-${i}-${side}`, p.x, topY + 1.4, p.z + side * (width / 2 - .12), .17, 2.8, .17, m.red);
        }
      }
    }
    for (const side of [-1, 1]) beam(parent, `${name}-handrail-${side}`, a.clone().add(v(0, 1.1, side * width / 2)), b.clone().add(v(0, 1.1, side * width / 2)), .12, m.red);
    if (covered) {
      const positions = [], indices = [], rows = Math.max(8, Math.ceil(a.distanceTo(b)));
      const section = [-1, -.55, 0, .55, 1];
      for (let row = 0; row <= rows; row++) {
        const p = sample(row / rows);
        for (const t of section) positions.push(p.x, p.y + 2.9 + .6 * (1 - Math.abs(t)) ** 1.3, p.z + t * (width / 2 + .4));
      }
      for (let row = 0; row < rows; row++) for (let j = 0; j < 4; j++) {
        const n = row * 5 + j;
        indices.push(n, n + 1, n + 5, n + 1, n + 6, n + 5);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
      mesh(parent, `${name}-continuous-cover`, geometry, m.roof);
      for (const side of [-1, 1]) beam(parent, `${name}-cover-eave-${side}`, a.clone().add(v(0, 2.9, side * (width / 2 + .4))), b.clone().add(v(0, 2.9, side * (width / 2 + .4))), .13, m.edge);
      beam(parent, `${name}-cover-ridge`, a.clone().add(v(0, 3.54, 0)), b.clone().add(v(0, 3.54, 0)), .13, m.edge);
      for (let row = 0; row <= rows; row++) {
        const p = sample(row / rows);
        for (let j = 0; j < 4; j++) {
          const t0 = section[j], t1 = section[j + 1];
          beam(parent, `${name}-cover-tile-${row}-${j}`, p.clone().add(v(0, 2.93 + .6 * (1 - Math.abs(t0)) ** 1.3, t0 * (width / 2 + .4))), p.clone().add(v(0, 2.93 + .6 * (1 - Math.abs(t1)) ** 1.3, t1 * (width / 2 + .4))), .035, m.edge);
        }
      }
    }
    // The landing overlaps both endpoint treads and the receiving floor.
    for (const [i, p] of [a, b].entries()) box(parent, `${name}-landing-${i}`, p.x, p.y - .16, p.z, .8, .32, width, m.stone);
  }
  // Sanctuary access turns in the side bay, clear of the front railing.
  flight(gallery, 'hall-access', v(6.9, gs.floorY, galleryFront - 1.5), v(3.6, hs.floorY, hallFront - .6), 1.4);
  const terrace = parts.terrace;
  const courtY = 31.8, rearFloorY = 34.3;
  const rearHallFront = Math.max(galleryFront - 1.3, surfaceMax(-36, -23, 34, 41) + 1.4);
  const terraceFront = Math.max(rearHallFront + 7.2, surfaceMax(-49, -17, 31, 35) + 2.1);
  const courtBack = rearHallFront - .45;
  const courtDepth = terraceFront - courtBack;
  box(terrace, 'terrace-platform-floor', -29, courtY - .22, courtBack + courtDepth / 2, 21, .44, courtDepth, m.stone);
  box(terrace, 'terrace-front-fascia', -29, courtY - .58, terraceFront - .12, 21, .72, .35, m.stone);
  for (const x of [-38, -33.5, -29, -24.5, -20]) support(terrace, `terrace-platform-support-${x}`, x, courtY - .2, terraceFront - .45, m.stone, .58);
  balustrade(terrace, 'terrace-front-balustrade', v(-39.5, courtY, terraceFront), v(-18.5, courtY, terraceFront));
  balustrade(terrace, 'terrace-left-balustrade', v(-39.5, courtY, terraceFront), v(-39.5, courtY, courtBack + .4));
  balustrade(terrace, 'terrace-right-balustrade', v(-18.5, courtY, terraceFront), v(-18.5, courtY, courtBack + .4));

  const compound = new THREE.Group(); compound.name = 'left-compound-hall'; terrace.add(compound);
  const compoundX = -30, compoundWidth = 11.8, compoundDepth = 4.6;
  box(compound, 'left-compound-floor', compoundX, rearFloorY - .15, rearHallFront - compoundDepth / 2, compoundWidth, .3, compoundDepth, m.stone);
  box(compound, 'left-compound-back-wall', compoundX, rearFloorY + 1.4, rearHallFront - compoundDepth + .12, compoundWidth, 2.8, .24, m.white);
  const lowerPosts = [-5.9, -3.3, -1.35, 1.35, 3.3, 5.9];
  lowerPosts.forEach((offset, i) => box(compound, `left-compound-post-${i}`, compoundX + offset, rearFloorY + 1.4, rearHallFront, .24, 2.8, .24, m.wood));
  for (const [i, [a, b]] of [[0, [-5.9, -3.3]], [1, [-3.3, -1.35]], [3, [1.35, 3.3]], [4, [3.3, 5.9]]]) {
    windows(compound, `left-compound-window-${i}`, compoundX + (a + b) / 2, rearFloorY + .55, rearHallFront - .1, b - a - .32, 1.9, m.wood);
  }
  for (const side of [-1, 1]) box(compound, `left-compound-door-post-${side}`, compoundX + side * 1.35, rearFloorY + 1.3, rearHallFront + .12, .22, 2.6, .22, m.wood);
  box(compound, 'left-compound-door-lintel', compoundX, rearFloorY + 2.58, rearHallFront + .12, 2.9, .22, .22, m.wood);
  box(compound, 'left-compound-white-side-wall', compoundX + compoundWidth / 2 - .14, rearFloorY + 1.4, rearHallFront - compoundDepth / 2, .28, 2.8, compoundDepth, m.white);
  box(compound, 'left-compound-white-side-wall-left', compoundX - compoundWidth / 2 + .14, rearFloorY + 1.4, rearHallFront - compoundDepth / 2, .28, 2.8, compoundDepth, m.white);
  roof(compound, 'left-compound-roof-lower', compoundX, rearFloorY + 2.9, rearHallFront - compoundDepth / 2, 13.2, 5.8, 1.15);
  const upperCompound = new THREE.Group(); upperCompound.name = 'left-compound-upper'; compound.add(upperCompound);
  const upperFront = rearHallFront - .35, upperWidth = 9.4, upperDepth = 3.9;
  box(upperCompound, 'left-compound-upper-white-wall', compoundX, rearFloorY + 4.05, upperFront - upperDepth + .12, upperWidth, 2.25, .24, m.white);
  for (const side of [-1, 1]) box(upperCompound, `left-compound-upper-white-side-wall${side < 0 ? '-left' : ''}`, compoundX + side * (upperWidth / 2 - .12), rearFloorY + 4.05, upperFront - upperDepth / 2, .24, 2.25, upperDepth, m.white);
  box(upperCompound, 'left-compound-upper-red-front', compoundX, rearFloorY + 4.05, upperFront, upperWidth, 2.25, .25, m.wood);
  for (let i = 0; i < 4; i++) windows(upperCompound, `left-compound-upper-window-${i}`, compoundX - 3.45 + i * 2.3, rearFloorY + 3.15, upperFront + .14, 1.85, 1.75, m.wood);
  roof(compound, 'left-compound-roof-upper', compoundX, rearFloorY + 5.22, upperFront - upperDepth / 2, 12.2, 6.2, 2.15);
  frontRoof(compound, 'left-compound-front-gable-roof', compoundX, rearFloorY + 5.34, upperFront + .75, 6.1, 3.5, 1.15);
  gable(upperCompound, 'left-compound-upper-gable', compoundX, rearFloorY + 5.4, upperFront + .78, 5.5, .9, .18, m.wood);

  // Three visible stone-rail layers: front court, stair sides, and upper landing.
  const stairBottom = v(compoundX, courtY, terraceFront - 1.25);
  const stairTop = v(compoundX, rearFloorY, rearHallFront + .35);
  const courtSteps = new THREE.Group(); courtSteps.name = 'left-court-central-stair'; terrace.add(courtSteps);
  const stepCount = 10, stepWidth = 4.25;
  for (let i = 0; i < stepCount; i++) {
    const t0 = i / stepCount, t1 = (i + 1) / stepCount;
    const p = stairBottom.clone().lerp(stairTop, (t0 + t1) / 2);
    const topY = THREE.MathUtils.lerp(stairBottom.y, stairTop.y, t1);
    const depth = Math.abs(stairTop.z - stairBottom.z) / stepCount + .12;
    const step = box(courtSteps, `left-court-step-${i}`, p.x, topY - .17, p.z, stepWidth, .34, depth, m.stone);
    step.userData.walkingTop = topY;
  }
  box(courtSteps, 'left-court-bottom-landing-floor', compoundX, courtY - .16, stairBottom.z + .35, stepWidth + .4, .32, 1.25, m.stone);
  box(courtSteps, 'left-court-upper-landing-floor', compoundX, rearFloorY - .16, rearHallFront + .05, 6.4, .32, 1.4, m.stone);
  balustrade(courtSteps, 'left-court-stair-rail-left', stairBottom.clone().add(v(-stepWidth / 2, 0, 0)), stairTop.clone().add(v(-stepWidth / 2, 0, 0)), m.stone);
  balustrade(courtSteps, 'left-court-stair-rail-right', stairBottom.clone().add(v(stepWidth / 2, 0, 0)), stairTop.clone().add(v(stepWidth / 2, 0, 0)), m.stone);
  balustrade(courtSteps, 'left-court-upper-rail-left', v(compoundX - 5.9, rearFloorY, rearHallFront + .55), v(compoundX - 2.25, rearFloorY, rearHallFront + .55), m.stone);
  balustrade(courtSteps, 'left-court-upper-rail-right', v(compoundX + 2.25, rearFloorY, rearHallFront + .55), v(compoundX + 5.9, rearFloorY, rearHallFront + .55), m.stone);

  // Low white-walled west gallery, an open polygonal pavilion, and the smaller east room.
  const longGallery = new THREE.Group(); longGallery.name = 'left-long-white-gallery'; terrace.add(longGallery);
  const longX = -43.1, longWidth = 10.6, longFront = terraceFront - .55;
  box(longGallery, 'left-long-gallery-floor', longX, courtY - .16, longFront - 1.7, longWidth, .32, 3.4, m.stone);
  box(longGallery, 'left-long-gallery-white-wall', longX, courtY + 1.35, longFront - 3.22, longWidth, 2.7, .25, m.white);
  for (const side of [-1, 1]) box(longGallery, `left-long-gallery-side-${side}`, longX + side * (longWidth / 2 - .12), courtY + 1.35, longFront - 1.7, .24, 2.7, 3.4, m.white);
  for (let i = 0; i < 5; i++) windows(longGallery, `left-long-gallery-window-${i}`, longX - 4.2 + i * 2.1, courtY + .65, longFront + .02, 1.72, 1.65, m.wood);
  rail(longGallery, 'left-long-gallery-front-rail', longX - longWidth / 2, longX + longWidth / 2, courtY, longFront + .18, m.wood);
  roof(longGallery, 'left-long-gallery-roof', longX, courtY + 2.78, longFront - 1.7, longWidth + 1.2, 4.5, 1.05);
  for (const x of [-47, -43.5, -40]) support(longGallery, `left-long-gallery-support-${x}`, x, courtY - .15, longFront - 1.55, m.stone);
  octagonalPavilion(terrace, 'left-front-pavilion', -38, courtY, terraceFront - 1.6, 3.15);

  const sideRoom = new THREE.Group(); sideRoom.name = 'left-east-side-room'; terrace.add(sideRoom);
  const sideX = -24.2, sideWidth = 4.8, sideFront = terraceFront - 1.0, sideDepth = 3.8;
  box(sideRoom, 'left-east-side-room-floor', sideX, courtY - .16, sideFront - sideDepth / 2, sideWidth, .32, sideDepth, m.stone);
  box(sideRoom, 'left-east-side-room-back-wall', sideX, courtY + 1.35, sideFront - sideDepth + .12, sideWidth, 2.7, .24, m.white);
  for (const side of [-1, 1]) box(sideRoom, `left-east-side-room-white-side-${side}`, sideX + side * (sideWidth / 2 - .12), courtY + 1.35, sideFront - sideDepth / 2, .24, 2.7, sideDepth, m.white);
  for (let i = 0; i < 2; i++) windows(sideRoom, `left-east-side-room-window-${i}`, sideX - 1.2 + i * 2.4, courtY + .55, sideFront + .03, 1.95, 1.85, m.wood);
  roof(sideRoom, 'left-east-side-room-roof', sideX, courtY + 2.82, sideFront - sideDepth / 2, 7, 4.8, 1.05);

  flight(terrace, 'terrace-access', v(-18.7, courtY, terraceFront - 1.1), v(-16.9, gs.floorY, galleryFront - 1.2), 1.6);
  octagonalPavilion(gallery, 'main-left-wing', -18.7, gs.floorY, galleryFront - 1.45, 2.7);
  const stair = parts.stair;
  const route = [
    { x: 8, y: 31.5 }, { x: 10.5, y: 30.8 }, { x: 12.5, y: 30.8 },
    { x: 14, y: 30 }, { x: 16.5, y: 30 }, { x: 18.5, y: 27.7 },
    { x: 20, y: 27.7 }, { x: 25, y: 20 },
  ];
  const stairNodes = route.map((p, i) => v(p.x, p.y, i === 0 ? galleryFront - 1.3 : surfaceMax(p.x - .5, p.x + .5, p.y, p.y + 3.3) + 3.2));
  for (let i = 0; i < stairNodes.length - 1; i++) flight(stair, `cliff-stair-${i}`, stairNodes[i], stairNodes[i + 1], 2.2, true);
  const turn = stairNodes[2]; roof(stair, 'stair-turn-roof', turn.x, turn.y + 3, turn.z, 3.6, 3.5, .7);
  box(stair, 'right-wing-landing', turn.x, turn.y - .18, turn.z, 2.2, .36, 2.6, m.stone);
  const secondTurn = stairNodes[4]; roof(stair, 'stair-second-turn-roof', secondTurn.x, secondTurn.y + 3, secondTurn.z, 3.4, 3.4, .7);
  box(stair, 'right-wing-platform', secondTurn.x, secondTurn.y - .18, secondTurn.z, 2.2, .36, 2.6, m.stone);
  const gate = parts.gate, gateZ = stairNodes.at(-1).z, gateY = DACI_LAYOUT.gate.floorY;
  box(gate, 'gate-floor', 25, gateY - .18, gateZ - .3, 5.2, .36, 4.6, m.stone);
  for (const side of [-1, 1]) {
    box(gate, `gate-post-${side}`, 25 + side * 2.15, gateY + 1.6, gateZ + 1.75, .3, 3.2, .3, m.red);
    support(gate, `gate-support-${side}`, 25 + side * 2.1, gateY - .15, gateZ + 1.5);
  }
  box(gate, 'gate-lintel', 25, gateY + 3.05, gateZ + 1.75, 5.1, .3, .3, m.red);
  roof(gate, 'gate-lower-canopy', 25, gateY + 3.2, gateZ - .3, 6.3, 5.5, 1);
  storey(gate, 'gate-upper-storey', 25, gateY + 3.55, gateZ + 1.15, 4.4, 3.7, 2.25);
  roof(gate, 'gate-upper-roof', 25, gateY + 5.9, gateZ - .7, 5.7, 4.9, 1.3);
  // Lower stair travels outwards from the open portal; continuous rails stay outside the clear passage.
  const gateExitTops = [];
  for (let i = 0; i < 8; i++) {
    const walkingY = gateY + .03 - i * .23, z = gateZ + 2.1 + i * .3;
    box(gate, `gate-exit-tread-${i}`, 25, walkingY - .18, z, 1.65, .36, .38, m.stone);
    gateExitTops.push(v(25, walkingY, z));
  }
  const gateExitBottom = gateExitTops.at(-1);
  box(gate, 'gate-exit-landing', 25.18, gateExitBottom.y - .16, gateExitBottom.z, 2.05, .32, 1.28, m.stone);
  for (const [label, sign] of [['left', -1], ['right', 1]]) {
    const posts = gateExitTops.map((point, i) => {
      const p = point.clone().add(v(sign * .82, 0, 0));
      box(gate, `gate-exit-rail-post-${label}-${i}`, p.x, p.y + .55, p.z, .14, 1.1, .14, m.stone);
      return p;
    });
    for (const height of [.55, 1.05]) beam(gate, `gate-exit-handrail-${label}${height === .55 ? '-lower' : ''}`,
      posts[0].clone().add(v(0, height, 0)), posts.at(-1).clone().add(v(0, height, 0)), .13, m.stone);
  }
  function stonePath(parent, name, points, width) {
    const path = new THREE.Group(); path.name = name; parent.add(path);
    points.forEach((a, i) => {
      if (i === points.length - 1) return;
      const b = points[i + 1], along = b.clone().sub(a).normalize();
      const side = v(-along.z, 0, along.x).normalize();
      const up = side.clone().cross(along).normalize();
      const deck = box(path, `${name === 'left-cliff-approach' ? 'approach-deck' : 'gate-side-segment'}-${i}`, 0, 0, 0, a.distanceTo(b) + .12, .28, width, m.stone);
      deck.position.copy(a).lerp(b, .5).add(v(0, -.14, 0));
      deck.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, up, side));
      for (const [label, sign] of [['left', -1], ['right', 1]]) {
        const offset = side.clone().multiplyScalar(sign * (width / 2 - .07));
        for (const height of [.55, 1.05]) beam(path, `${name === 'left-cliff-approach' ? 'approach' : 'gate-side'}-handrail-${i}-${label}${height === .55 ? '-lower' : ''}`, a.clone().add(offset).add(v(0, height, 0)), b.clone().add(offset).add(v(0, height, 0)), .1, m.stone);
        const count = Math.ceil(a.distanceTo(b) / .8);
        for (let j = 0; j <= count; j++) {
          const p = a.clone().lerp(b, j / count).add(offset);
          box(path, `${name === 'left-cliff-approach' ? 'approach' : 'gate-side'}-stone-post-${i}-${label}-${j}`, p.x, p.y + .55, p.z, .12, 1.1, .12, m.stone);
        }
      }
      const p = a.clone().lerp(b, .5);
      support(path, `${name}-support-${i}`, p.x, p.y - .03, p.z);
    });
    return path;
  }
  // Only the photographed valley curve is reconstructed; the upper end turns into the wooded rock shoulder.
  const approachCoordinates = [[-66, 31, 2], [-63, 28.3, 2], [-60, 25.7, 2], [-56.5, 23.2, 2], [-53, 22, 2], [-49, 21.8, 2], [-45.5, 22.7, 2], [-42, 24.5, 2.2], [-41.2, 25.6, 1.15]];
  stonePath(group, 'left-cliff-approach', approachCoordinates.map(([x, y, offset]) => v(x, y, cliffFaceZ(x, y) + offset)), 1.65);
  const sidePoints = [gateExitBottom, v(27, gateY - 1.85, gateZ + 4.2), v(30, gateY - 2.1, surfaceMax(28.5, 31, gateY - 2.2, gateY + 1) + 1.4), v(33, gateY - 1.5, surfaceMax(31, 34, gateY - 2, gateY + 1) + 1.8), v(36.2, gateY - 1, cliffFaceZ(36.2, gateY - 1) + 1.7)];
  stonePath(gate, 'gate-side-path', sidePoints, 1.2);
  const firstSideDirection = sidePoints[1].clone().sub(sidePoints[0]).normalize();
  const firstSideNormal = v(-firstSideDirection.z, 0, firstSideDirection.x).normalize();
  for (const [stairLabel, stairSign, pathSign] of [['left', -1, 1], ['right', 1, -1]]) {
    const stairEnd = gateExitBottom.clone().add(v(stairSign * .82, 0, 0));
    const pathEnd = sidePoints[0].clone().add(firstSideNormal.clone().multiplyScalar(pathSign * (.6 - .07)));
    for (const height of [.55, 1.05]) beam(gate, `gate-exit-corner-${stairLabel}${height === .55 ? '-lower' : ''}`,
      stairEnd.clone().add(v(0, height, 0)), pathEnd.clone().add(v(0, height, 0)), .13, m.stone);
  }
  const anchors = {
    'main-hall': v(-6, 38, hallFront + .5), gallery: v(-5, 33, galleryFront + .4),
    terrace: v(-30, 36, terraceFront + .4), stair: turn.clone().add(v(0, 1.5, 1.6)), gate: v(25, gateY + 3.8, gateZ + 2.5),
  };
  let disposed = false;
  return { group, anchors, dispose() {
    if (disposed) return; disposed = true;
    const geometries = new Set(); group.traverse((object) => { if (object.geometry) geometries.add(object.geometry); });
    geometries.forEach((geometry) => geometry.dispose()); Object.values(m).forEach((mat) => mat.dispose());
  } };
}
