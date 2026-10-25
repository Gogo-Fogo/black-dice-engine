import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// 3D throw: dice are tossed onto an invisible table, bounce, tumble and come to rest with
// the rolled face up. Uses the GM's .glb models from ./dice/ when present (with a face
// calibration so the right number lands up), otherwise generated dice with printed numbers.
// Loaded lazily — this module pulls in three.js.

export type FaceInfo = { normal: THREE.Vector3; value: number };

export type DieModel = {
  object: THREE.Object3D;
  faces: FaceInfo[];
  vertices: THREE.Vector3[]; // local, for resting height
  radius: number; // bounding radius after normalisation
  source: "glb" | "generated";
  calibrated: boolean;
};

export const supportedSides = [4, 6, 8, 10, 12, 20];

const modelFiles: Record<number, string> = {
  4: "d4_low_003",
  6: "d6_low_003",
  8: "d8_low_003",
  10: "d10_low_003",
  12: "d12_low_003",
  20: "d20_low_003"
};

// --- Generated dice ----------------------------------------------------------------

type Poly = { points: THREE.Vector3[]; normal: THREE.Vector3; center: THREE.Vector3 };

/** Group a non-indexed geometry's triangles into flat faces by normal. */
function facesFromGeometry(geometry: THREE.BufferGeometry): Poly[] {
  const pos = geometry.getAttribute("position");
  const groups: Array<{ normal: THREE.Vector3; points: THREE.Vector3[] }> = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const n = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    let group = groups.find((g) => g.normal.dot(n) > 0.999);
    if (!group) groups.push((group = { normal: n, points: [] }));
    for (const p of [a, b, c]) if (!group.points.some((q) => q.distanceToSquared(p) < 1e-8)) group.points.push(p.clone());
  }
  return groups.map((g) => orderPoly(g.points, g.normal));
}

function orderPoly(points: THREE.Vector3[], normal: THREE.Vector3): Poly {
  const center = points.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(points.length);
  const u = new THREE.Vector3().subVectors(points[0], center).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u);
  const sorted = points
    .map((p) => {
      const d = new THREE.Vector3().subVectors(p, center);
      return { p, a: Math.atan2(d.dot(v), d.dot(u)) };
    })
    .sort((x, y) => x.a - y.a)
    .map((x) => x.p);
  return { points: sorted, normal: normal.clone(), center };
}

/** Pentagonal trapezohedron (a d10): two apexes and a zig-zag ring of ten vertices. */
function d10Polys(): Poly[] {
  const top = new THREE.Vector3(0, 1, 0);
  const bottom = new THREE.Vector3(0, -1, 0);
  const ring = Array.from({ length: 10 }, (_, i) => {
    const a = (i * Math.PI) / 5;
    return new THREE.Vector3(Math.cos(a) * 0.95, i % 2 === 0 ? 0.11 : -0.11, Math.sin(a) * 0.95);
  });
  const polys: Poly[] = [];
  for (let i = 0; i < 5; i++) {
    const up = [top, ring[(2 * i) % 10], ring[(2 * i + 1) % 10], ring[(2 * i + 2) % 10]];
    const down = [bottom, ring[(2 * i + 1) % 10], ring[(2 * i + 2) % 10], ring[(2 * i + 3) % 10]];
    for (const pts of [up, down]) {
      const center = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(4);
      const normal = new THREE.Vector3()
        .subVectors(pts[2], pts[0])
        .cross(new THREE.Vector3().subVectors(pts[3], pts[1]))
        .normalize();
      if (normal.dot(center) < 0) normal.negate();
      polys.push(orderPoly(pts.map((p) => p.clone()), normal));
    }
  }
  return polys;
}

function generatedPolys(sides: number): Poly[] {
  switch (sides) {
    case 4:
      return facesFromGeometry(new THREE.TetrahedronGeometry(1.15).toNonIndexed());
    case 6:
      return facesFromGeometry(new THREE.BoxGeometry(1.25, 1.25, 1.25).toNonIndexed());
    case 8:
      return facesFromGeometry(new THREE.OctahedronGeometry(1.1).toNonIndexed());
    case 10:
      return d10Polys();
    case 12:
      return facesFromGeometry(new THREE.DodecahedronGeometry(1).toNonIndexed());
    default:
      return facesFromGeometry(new THREE.IcosahedronGeometry(1).toNonIndexed());
  }
}

/** Number faces so opposite faces sum to sides + 1, like real dice. */
function assignValues(polys: Poly[], sides: number) {
  const values = new Array<number>(polys.length).fill(0);
  const paired = new Set<number>();
  let next = 1;
  for (let i = 0; i < polys.length; i++) {
    if (paired.has(i)) continue;
    paired.add(i);
    let best = -1;
    let bestDot = -0.5;
    for (let j = 0; j < polys.length; j++) {
      if (paired.has(j)) continue;
      const d = polys[i].normal.dot(polys[j].normal);
      if (d < bestDot) (bestDot = d), (best = j);
    }
    values[i] = next;
    if (best >= 0) {
      paired.add(best);
      values[best] = sides + 1 - next;
    }
    next++;
  }
  return values;
}

function buildGeneratedDie(sides: number): DieModel {
  const polys = generatedPolys(sides);
  const values = assignValues(polys, sides);
  // d4: the value is read at the top corner, so number the corners instead of the faces
  const corners: THREE.Vector3[] = [];
  if (sides === 4) for (const p of polys.flatMap((q) => q.points)) if (!corners.some((c) => c.distanceToSquared(p) < 1e-6)) corners.push(p);
  const cols = Math.ceil(Math.sqrt(polys.length));
  const size = 1024;
  const cell = size / cols;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#c79a4b";
  ctx.fillRect(0, 0, size, size);

  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];

  polys.forEach((poly, index) => {
    const cx = (index % cols) * cell + cell / 2;
    const cy = Math.floor(index / cols) * cell + cell / 2;
    const u = new THREE.Vector3().subVectors(poly.points[0], poly.center).normalize();
    const v = new THREE.Vector3().crossVectors(poly.normal, u);
    const flat = poly.points.map((p) => {
      const d = new THREE.Vector3().subVectors(p, poly.center);
      return [d.dot(u), d.dot(v)] as [number, number];
    });
    const extent = Math.max(...flat.map(([x, y]) => Math.hypot(x, y)));
    const scale = (cell * 0.46) / extent;
    const px = flat.map(([x, y]) => [cx + x * scale, cy - y * scale] as [number, number]);

    // face art: gold gradient, darker bevel edge, engraved number
    const grad = ctx.createLinearGradient(cx, cy - cell / 2, cx, cy + cell / 2);
    grad.addColorStop(0, "#f3d48c");
    grad.addColorStop(1, "#b07f33");
    ctx.beginPath();
    px.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = cell * 0.035;
    ctx.strokeStyle = "#5a3d14";
    ctx.stroke();

    if (sides === 4) {
      // a number near each corner, upright when that corner points up
      poly.points.forEach((p, k) => {
        const value = corners.findIndex((c) => c.distanceToSquared(p) < 1e-6) + 1;
        const [x, y] = px[k];
        const nx = cx + (x - cx) * 0.58;
        const ny = cy + (y - cy) * 0.58;
        ctx.save();
        ctx.translate(nx, ny);
        ctx.rotate(Math.atan2(y - cy, x - cx) + Math.PI / 2);
        ctx.fillStyle = "#24170a";
        ctx.font = `800 ${cell * 0.13}px Georgia, serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(value), 0, 0);
        ctx.restore();
      });
    }

    const label = String(values[index]);
    const fontSize = cell * (sides === 4 ? 0.2 : polys[0].points.length >= 4 ? 0.34 : 0.27) * (label.length > 1 ? 0.85 : 1);
    ctx.fillStyle = "#24170a";
    ctx.font = `800 ${fontSize}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // the centroid of a triangle sits low; nudge the number toward the visual middle
    const ty = cy + (poly.points.length === 3 ? fontSize * 0.12 : 0);
    if (sides !== 4) ctx.fillText(label, cx, ty);
    if (sides !== 4 && (label === "6" || label === "9")) ctx.fillRect(cx - fontSize * 0.22, ty + fontSize * 0.42, fontSize * 0.44, fontSize * 0.07);

    // fan-triangulate with matching UVs
    for (let i = 1; i < poly.points.length - 1; i++) {
      for (const k of [0, i, i + 1]) {
        const p = poly.points[k];
        positions.push(p.x, p.y, p.z);
        normals.push(poly.normal.x, poly.normal.y, poly.normal.z);
        uvs.push(px[k][0] / size, 1 - px[k][1] / size);
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.38, metalness: 0.35 });
  const mesh = new THREE.Mesh(geometry, material);

  const vertices = polys.flatMap((p) => p.points);
  const radius = Math.max(...vertices.map((p) => p.length()));
  return {
    object: mesh,
    // for a d4 the "face" to bring up is the corner direction
    faces: sides === 4 ? corners.map((c, i) => ({ normal: c.clone().normalize(), value: i + 1 })) : polys.map((p, i) => ({ normal: p.normal.clone(), value: values[i] })),
    vertices,
    radius,
    source: "generated",
    calibrated: true
  };
}

// --- .glb models ---------------------------------------------------------------------

export type FaceMap = { sides: number; faces: Array<{ normal: [number, number, number]; value: number }> };

const loader = new GLTFLoader();
const glbCache = new Map<number, Promise<THREE.Object3D | null>>();
const faceMapCache = new Map<number, Promise<FaceMap | null>>();

function loadGlb(sides: number): Promise<THREE.Object3D | null> {
  if (!modelFiles[sides]) return Promise.resolve(null);
  let promise = glbCache.get(sides);
  if (!promise) {
    promise = new Promise((resolve) => {
      loader.load(`./dice/${modelFiles[sides]}.glb`, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
    });
    glbCache.set(sides, promise);
  }
  return promise.then((scene) => (scene ? scene.clone(true) : null));
}

const localMapKey = (sides: number) => `bde-dice-facemap-d${sides}`;

/** A face calibration from ./dice/<model>.faces.json, or one saved on this phone. */
function loadFaceMap(sides: number): Promise<FaceMap | null> {
  try {
    const saved = window.localStorage.getItem(localMapKey(sides));
    if (saved) return Promise.resolve(JSON.parse(saved) as FaceMap);
  } catch {
    // ignore
  }
  let promise = faceMapCache.get(sides);
  if (!promise) {
    promise = fetch(`./dice/${modelFiles[sides]}.faces.json`)
      .then((r) => (r.ok ? (r.json() as Promise<FaceMap>) : null))
      .catch(() => null);
    faceMapCache.set(sides, promise);
  }
  return promise;
}

export async function hasFaceMap(sides: number) {
  const map = await loadFaceMap(sides);
  return !!map && map.faces.length >= sides;
}

export function saveFaceMap(map: FaceMap) {
  try {
    window.localStorage.setItem(localMapKey(map.sides), JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function modelFileName(sides: number) {
  return modelFiles[sides] ?? null;
}

/** Centre the model, scale it to radius ~1, and find its main flat faces (largest by area). */
function analyseGlb(scene: THREE.Object3D, sides: number) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  const tris: Array<{ n: THREE.Vector3; area: number }> = [];
  const vertices: THREE.Vector3[] = [];
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const pos = geometry.getAttribute("position");
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let i = 0; i + 2 < pos.count; i += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, i + k).applyMatrix4(mesh.matrixWorld).sub(center);
      const cross = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
      const area = cross.length() / 2;
      if (area > 0) tris.push({ n: cross.normalize(), area });
      vertices.push(v[0].clone(), v[1].clone(), v[2].clone());
    }
  });
  const radius = Math.max(1e-6, ...vertices.map((p) => p.length()));

  const clusters: Array<{ n: THREE.Vector3; area: number }> = [];
  for (const t of tris) {
    const c = clusters.find((k) => k.n.dot(t.n) > 0.97);
    if (c) {
      c.n.multiplyScalar(c.area).addScaledVector(t.n, t.area).normalize();
      c.area += t.area;
    } else clusters.push({ n: t.n.clone(), area: t.area });
  }
  clusters.sort((a, b) => b.area - a.area);
  const faceCount = sides === 100 ? 10 : sides;
  const normals = clusters.slice(0, faceCount).map((c) => c.n.clone());
  return { center, radius, normals, vertices: vertices.map((p) => p.divideScalar(radius)) };
}

export async function buildDie(sides: number): Promise<DieModel> {
  const scene = await loadGlb(sides);
  if (!scene) return buildGeneratedDie(sides);
  const info = analyseGlb(scene, sides);
  if (info.normals.length < sides) return buildGeneratedDie(sides);

  const holder = new THREE.Group();
  const pivot = new THREE.Group();
  scene.position.sub(info.center);
  pivot.add(scene);
  pivot.scale.setScalar(1 / info.radius);
  holder.add(pivot);

  const map = await loadFaceMap(sides);
  let calibrated = false;
  const faces = info.normals.map((normal, i) => {
    const match = map?.faces.find((f) => new THREE.Vector3(...f.normal).dot(normal) > 0.95);
    return { normal, value: match ? match.value : i + 1, matched: !!match };
  });
  calibrated = faces.every((f) => f.matched);
  return {
    object: holder,
    faces: faces.map(({ normal, value }) => ({ normal: sides === 4 ? normal.clone().negate() : normal, value })),
    vertices: info.vertices,
    radius: 1,
    source: "glb",
    calibrated
  };
}

// --- Scene and physics -----------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);

type Body = {
  die: DieModel;
  object: THREE.Object3D;
  shadow: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  spin: THREE.Vector3;
  target: number;
  settling: null | { start: number; fromQ: THREE.Quaternion; toQ: THREE.Quaternion; fromY: number; restY: number };
  done: boolean;
};

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function restHeight(die: DieModel, q: THREE.Quaternion) {
  let min = Infinity;
  const v = new THREE.Vector3();
  for (const p of die.vertices) min = Math.min(min, v.copy(p).applyQuaternion(q).y);
  return -min;
}

/** Orientation that puts `faceNormal` straight up, with the yaw closest to `current`. */
function landingQuaternion(faceNormal: THREE.Vector3, current: THREE.Quaternion) {
  const base = new THREE.Quaternion().setFromUnitVectors(faceNormal, UP);
  let best = base;
  let bestDot = -1;
  for (let i = 0; i < 16; i++) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, (i / 16) * Math.PI * 2).multiply(base);
    const d = Math.abs(q.dot(current));
    if (d > bestDot) (bestDot = d), (best = q);
  }
  return best;
}

export type ThrowHandle = {
  throwDice: () => void;
  dispose: () => void;
  /** The value whose face currently points most nearly straight up, per die. */
  topValues: () => number[];
  info: () => { source: "glb" | "generated"; calibrated: boolean };
};

export async function createThrowScene(
  container: HTMLElement,
  opts: { sides: number; values: number[]; onSettled: () => void; lowEnd?: boolean }
): Promise<ThrowHandle> {
  const width = () => Math.max(1, container.clientWidth);
  const height = () => Math.max(1, container.clientHeight);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !opts.lowEnd, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.lowEnd ? 1 : 1.75));
  renderer.setSize(width(), height(), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:block;";
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, width() / height(), 0.1, 100);
  // steep, ~17° from vertical, so the face that lands up is plainly the one you read;
  // closer on tall phone screens so the die isn't tiny
  function placeCamera() {
    const k = camera.aspect < 1 ? 0.72 : 1;
    camera.position.set(0, 11.5 * k, 3.6 * k);
    camera.lookAt(0, 0, 0.2);
  }
  placeCamera();
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x2a1d10, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 10, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb070, 1.1);
  rim.position.set(-6, 4, -6);
  scene.add(rim);

  // visible half-extents of the table at y = 0
  function bounds() {
    const dist = camera.position.length();
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * dist;
    return { x: halfH * camera.aspect * 0.86, z: halfH * 0.62 };
  }

  const count = Math.min(4, Math.max(1, opts.values.length));
  const scale = count > 2 ? 0.62 : count > 1 ? 0.75 : 0.95;
  const shadowTex = shadowTexture();
  const dice = await Promise.all(Array.from({ length: count }, () => buildDie(opts.sides)));

  const bodies: Body[] = dice.map((die, i) => {
    const object = die.object;
    object.scale.multiplyScalar(scale);
    scene.add(object);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6 * scale, 2.6 * scale),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);
    const wanted = opts.values[i];
    const targetIndex = Math.max(0, die.faces.findIndex((f) => f.value === wanted));
    return {
      die,
      object,
      shadow,
      pos: new THREE.Vector3((i - (count - 1) / 2) * 2.2 * scale, 1.6, 0.4),
      vel: new THREE.Vector3(),
      quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
      spin: new THREE.Vector3(0.4, 0.9, 0.2),
      target: targetIndex,
      settling: null,
      done: false
    };
  });

  let thrown = false;
  let throwAt = 0;
  let settledFired = false;
  let settledAt = 0;
  let frame = 0;
  let last = performance.now();
  const gravity = -38;

  function throwDice() {
    if (thrown) return;
    thrown = true;
    throwAt = performance.now();
    const b = bounds();
    bodies.forEach((body, i) => {
      body.pos.set((Math.random() - 0.5) * b.x + (i - (count - 1) / 2) * 1.2 * scale, 3.2 + Math.random(), b.z + 1.6);
      body.vel.set((Math.random() - 0.5) * 6, 4 + Math.random() * 3, -(9 + Math.random() * 5));
      body.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 30);
    });
  }

  function resize() {
    camera.aspect = width() / height();
    placeCamera();
    camera.updateProjectionMatrix();
    renderer.setSize(width(), height(), false);
  }
  window.addEventListener("resize", resize);

  const tmpQ = new THREE.Quaternion();
  function step(dt: number, now: number) {
    const b = bounds();
    for (const body of bodies) {
      if (!thrown) {
        // idle: hover and turn slowly so the player can see the die
        body.pos.y = 1.6 + Math.sin(now / 500) * 0.08;
        tmpQ.setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.1).normalize(), dt * 0.9);
        body.quat.premultiply(tmpQ);
        continue;
      }
      if (body.settling) {
        const t = Math.min(1, (now - body.settling.start) / 420);
        const e = 1 - Math.pow(1 - t, 3);
        body.quat.slerpQuaternions(body.settling.fromQ, body.settling.toQ, e);
        body.pos.y = body.settling.fromY + (body.settling.restY - body.settling.fromY) * e;
        body.vel.multiplyScalar(0.85);
        body.pos.x += body.vel.x * dt;
        body.pos.z += body.vel.z * dt;
        // drift toward the middle so the result isn't read in a corner
        const home = (bodies.indexOf(body) - (count - 1) / 2) * 2.1 * scale;
        body.pos.x += (home - body.pos.x) * Math.min(1, dt * 5);
        body.pos.z += (0.3 - body.pos.z) * Math.min(1, dt * 5);
        if (t >= 1) body.done = true;
        continue;
      }
      const r = body.die.radius * scale * 0.86;
      body.vel.y += gravity * dt;
      body.pos.addScaledVector(body.vel, dt);
      const w = body.spin.length();
      if (w > 1e-4) {
        tmpQ.setFromAxisAngle(body.spin.clone().divideScalar(w), w * dt);
        body.quat.premultiply(tmpQ);
      }
      if (body.pos.y < r) {
        body.pos.y = r;
        if (body.vel.y < 0) body.vel.y = -body.vel.y * 0.42;
        body.vel.x *= 0.78;
        body.vel.z *= 0.78;
        body.spin.multiplyScalar(0.72);
        // rolling: horizontal motion feeds spin around the perpendicular axis
        body.spin.x += -body.vel.z * 0.35;
        body.spin.z += body.vel.x * 0.35;
      }
      if (body.pos.x < -b.x + r) (body.pos.x = -b.x + r), (body.vel.x = Math.abs(body.vel.x) * 0.55);
      if (body.pos.x > b.x - r) (body.pos.x = b.x - r), (body.vel.x = -Math.abs(body.vel.x) * 0.55);
      if (body.pos.z < -b.z + r) (body.pos.z = -b.z + r), (body.vel.z = Math.abs(body.vel.z) * 0.55);
      if (body.pos.z > b.z - r && now - throwAt > 250) (body.pos.z = b.z - r), (body.vel.z = -Math.abs(body.vel.z) * 0.55);

      const slow = body.pos.y < r * 1.15 && body.vel.length() < 2.2;
      if ((slow && now - throwAt > 650) || now - throwAt > 1500) {
        const toQ = landingQuaternion(body.die.faces[body.target].normal, body.quat);
        body.settling = { start: now, fromQ: body.quat.clone(), toQ, fromY: body.pos.y, restY: restHeight(body.die, toQ) * scale };
      }
    }

    // keep dice apart
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i].pos;
        const c = bodies[j].pos;
        const dx = c.x - a.x;
        const dz = c.z - a.z;
        const d = Math.hypot(dx, dz) || 1;
        const min = 2 * scale * 0.95;
        if (d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          c.x += (dx / d) * push;
          c.z += (dz / d) * push;
        }
      }
    }
  }

  function render(now: number) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    const sub = 3;
    for (let s = 0; s < sub; s++) step(dt / sub, now);
    for (const body of bodies) {
      body.object.position.copy(body.pos);
      body.object.quaternion.copy(body.quat);
      body.shadow.position.set(body.pos.x, 0.01, body.pos.z);
      const lift = Math.max(0, body.pos.y - 1);
      (body.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 0.9 - lift * 0.25);
      body.shadow.scale.setScalar(1 + lift * 0.15);
    }
    renderer.render(scene, camera);

    if (thrown && !settledFired && bodies.every((b) => b.done)) {
      settledFired = true;
      settledAt = now;
      opts.onSettled();
    }
    if (settledFired && now - settledAt > 300) return; // nothing moves anymore
    frame = requestAnimationFrame(render);
  }
  frame = requestAnimationFrame(render);

  return {
    throwDice,
    topValues: () =>
      bodies.map((body) => {
        let best = body.die.faces[0];
        let bestDot = -2;
        for (const f of body.die.faces) {
          const d = f.normal.clone().applyQuaternion(body.quat).dot(UP);
          if (d > bestDot) (bestDot = d), (best = f);
        }
        return best.value;
      }),
    info: () => ({
      source: bodies[0]?.die.source ?? "generated",
      calibrated: bodies.every((b) => b.die.calibrated)
    }),
    dispose() {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            (m as THREE.MeshStandardMaterial).map?.dispose();
            m.dispose();
          });
        }
      });
      renderer.dispose();
      canvas.remove();
    }
  };
}

// --- Calibration view (Dice Lab) -------------------------------------------------------

export type CalibrationView = {
  found: boolean;
  faceCount: number;
  showFace: (index: number) => void;
  normalOf: (index: number) => [number, number, number];
  dispose: () => void;
};

/** Shows the .glb model with one detected face pointing at the camera at a time. */
export async function createCalibrationView(container: HTMLElement, sides: number): Promise<CalibrationView> {
  const scene3 = await loadGlb(sides);
  if (!scene3) return { found: false, faceCount: 0, showFace: () => {}, normalOf: () => [0, 1, 0], dispose: () => {} };
  const info = analyseGlb(scene3, sides);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:block;";
  container.appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.1, 50);
  camera.position.set(0, 0, 4.6);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(1, 2, 4);
  scene.add(light);
  const holder = new THREE.Group();
  const pivot = new THREE.Group();
  scene3.position.sub(info.center);
  pivot.add(scene3);
  pivot.scale.setScalar(1 / info.radius);
  holder.add(pivot);
  scene.add(holder);
  const toCamera = new THREE.Vector3(0, 0, 1);
  if (sides === 4) {
    camera.position.set(0, 2.2, 4);
    camera.lookAt(0, 0, 0);
  }
  function showFace(index: number) {
    const n = info.normals[index];
    if (!n) return;
    // a d4 is read at its top point while resting on a face; other dice face the camera
    holder.quaternion.setFromUnitVectors(n, sides === 4 ? new THREE.Vector3(0, -1, 0) : toCamera);
    renderer.render(scene, camera);
  }
  showFace(0);
  return {
    found: true,
    faceCount: info.normals.length,
    showFace,
    normalOf: (index) => {
      const n = info.normals[index];
      return [Number(n.x.toFixed(4)), Number(n.y.toFixed(4)), Number(n.z.toFixed(4))];
    },
    dispose() {
      renderer.dispose();
      canvas.remove();
    }
  };
}
