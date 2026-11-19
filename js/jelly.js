// ---------------------------------------------------------------------------
// Jelly people: one continuous, glossy, single-colour body (head, neck, torso,
// sausage limbs and mitten fists all melted together), built procedurally:
//   1. describe the body as a smooth-blended signed distance field (SDF)
//   2. mesh it once with marching cubes
//   3. skin it to a little bone rig so it can waddle, flail and sit
// The mesh is generated once and shared by every character.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---- the body, in metres, standing at the origin, facing -z ----------------
// Proportions follow the reference: head ~1/3 of the height, pear belly,
// short thick legs on flat oval feet, thick arms angled out with mitten hands.
const HIP_Y = 0.55, NECK_Y = 1.12, LEG_Y = 0.4, SHOULDER = { x: 0.24, y: 1.0 }, HIP_X = 0.2;
const HEAD = { y: 1.38, rx: 0.33, ry: 0.27, rz: 0.29 };
const HAND = { x: 0.5, y: 0.45 };
const ANKLE = { x: 0.21, y: 0.13 };   // foot bone pivot (feet are their own bones so they can stay planted)

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function seg(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const t = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  const dx = pax - bax * t, dy = pay - bay * t, dz = paz - baz * t;
  return Math.hypot(dx, dy, dz) - (ra + (rb - ra) * t);
}
// approximate ellipsoid distance (good enough for blending)
function ellip(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  return (Math.hypot(x, y, z) - 1) * Math.min(rx, ry, rz);
}

// Each named part maps to a bone. Returns distances per part (for skinning).
const PARTS = ['spine', 'head', 'armL', 'armR', 'legL', 'legR', 'footL', 'footR'];
function parts(x, y, z) {
  const zf = z / 0.86; // slightly flatter front-to-back
  const torso = smin(
    seg(x, y, zf, 0, 0.56, 0.02, 0, 0.98, 0, 0.305, 0.22) * 0.86,
    ellip(x, y, z, 0, 0.6, -0.03, 0.31, 0.3, 0.27), 0.08);               // round tummy
  const head = smin(
    ellip(x, y, z, 0, HEAD.y, 0, HEAD.rx, HEAD.ry, HEAD.rz),
    ellip(x, y, z, 0, HEAD.y + 0.09, 0.01, HEAD.rx * 0.93, HEAD.ry * 0.72, HEAD.rz * 0.95), 0.06); // flatter, wider dome
  const arm = (s) => smin(
    seg(x, y, z, s * SHOULDER.x, SHOULDER.y, 0.01, s * (HAND.x - 0.02), HAND.y + 0.1, -0.01, 0.088, 0.095),
    smin(ellip(x, y, z, s * HAND.x, HAND.y, -0.015, 0.1, 0.125, 0.1),
         ellip(x, y, z, s * (HAND.x - 0.075), HAND.y + 0.02, -0.06, 0.04, 0.06, 0.04), 0.03), 0.05);  // mitten + thumb
  const leg = (s) => seg(x, y, z, s * HIP_X, LEG_Y + 0.05, 0, s * ANKLE.x, 0.15, 0, 0.125, 0.115);
  const foot = (s) => ellip(x, y, z, s * (HIP_X + 0.015), 0.07, -0.05, 0.15, 0.075, 0.2);           // big flat foot
  return { spine: torso, head, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1), footL: foot(-1), footR: foot(1) };
}
function bodySDF(x, y, z) {
  const p = parts(x, y, z);
  let d = smin(p.spine, p.head, 0.07);          // soft neck crease
  d = smin(d, p.armL, 0.045); d = smin(d, p.armR, 0.045);
  d = smin(d, smin(p.legL, p.footL, 0.05), 0.07); d = smin(d, smin(p.legR, p.footR, 0.05), 0.07);
  return d;
}

// ---- mesh + skin weights (built once) ---------------------------------------
let BASE = null;
const HIT_GEO = new THREE.CapsuleGeometry(0.36, 0.95, 2, 8);
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
HIT_GEO.userData.shared = true; HIT_MAT.userData.shared = true;
function buildBase() {
  const RES = 64, H = 0.86, CY = 0.8;             // grid covers x,z ±0.86 and y -0.06..1.66
  const mc = new MarchingCubes(RES, new THREE.MeshBasicMaterial(), false, false, 120000);
  const f = mc.field;
  for (let k = 0; k < RES; k++) for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
    const x = ((i - RES / 2) / (RES / 2)) * H, y = ((j - RES / 2) / (RES / 2)) * H + CY, z = ((k - RES / 2) / (RES / 2)) * H;
    f[k * RES * RES + j * RES + i] = mc.isolation - bodySDF(x, y, z) * 900;
  }
  mc.update();
  const n = mc.count;
  const src = mc.geometry.getAttribute('position').array, srcN = mc.geometry.getAttribute('normal').array;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    pos[v * 3] = src[v * 3] * H; pos[v * 3 + 1] = src[v * 3 + 1] * H + CY; pos[v * 3 + 2] = src[v * 3 + 2] * H;
    const nx = srcN[v * 3], ny = srcN[v * 3 + 1], nz = srcN[v * 3 + 2], l = Math.hypot(nx, ny, nz) || 1;
    nor[v * 3] = nx / l; nor[v * 3 + 1] = ny / l; nor[v * 3 + 2] = nz / l;
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  mc.geometry.dispose();

  // skin weights: a vertex belongs to the part whose surface it sits on,
  // blending smoothly where parts melt together.
  const P = geo.getAttribute('position');
  const count = P.count;
  const skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4);
  const SIG = 0.03;
  for (let v = 0; v < count; v++) {
    const d = parts(P.getX(v), P.getY(v), P.getZ(v));
    const w = PARTS.map((name, i) => [i + 1, Math.exp(-Math.max(0, d[name]) / SIG)]).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = w.reduce((a, x) => a + x[1], 0) || 1;
    for (let k = 0; k < 4; k++) { skinIndex[v * 4 + k] = w[k][0]; skinWeight[v * 4 + k] = w[k][1] / sum; }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geo.computeBoundingSphere();
  return geo;
}

// ---- a character --------------------------------------------------------------
const clay = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0 });
const flat = (color) => new THREE.MeshLambertMaterial({ color });
function ball(parent, r, mat, x, y, z, sx = 1, sy = 1, sz = 1, seg = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
}
function cap(parent, r, len, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}

export function jellyPerson({ color, hat = null, kind = 'customer', role = null, scale = 1 }) {
  if (!BASE) BASE = buildBase();
  const g = new THREE.Group();

  // bones (positions relative to parent)
  const bone = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); parent?.add(b); return b; };
  const root = bone(null, 0, 0, 0);
  const spine = bone(root, 0, HIP_Y, 0);
  const head = bone(spine, 0, NECK_Y - HIP_Y, 0);
  const armL = bone(spine, -SHOULDER.x, SHOULDER.y - HIP_Y, 0);
  const armR = bone(spine, SHOULDER.x, SHOULDER.y - HIP_Y, 0);
  const legL = bone(root, -HIP_X, LEG_Y, 0);
  const legR = bone(root, HIP_X, LEG_Y, 0);
  const footL = bone(root, -ANKLE.x, ANKLE.y, 0);
  const footR = bone(root, ANKLE.x, ANKLE.y, 0);

  const mat = clay(color);
  const body = new THREE.SkinnedMesh(BASE, mat);
  body.add(root);
  body.bind(new THREE.Skeleton([root, spine, head, armL, armR, legL, legR, footL, footR]));
  body.frustumCulled = false;
  body.raycast = () => {};            // CPU-skinning every vertex for hover tests is far too slow
  g.add(body);
  // cheap invisible stand-in for hover/click picking
  const hit = new THREE.Mesh(HIT_GEO, HIT_MAT);
  hit.position.y = 0.85; g.add(hit);

  // face: small black oval eyes; mouth and brows only appear with emotions
  const hy = HEAD.y - NECK_Y;                 // head centre relative to the head bone
  const black = new THREE.MeshStandardMaterial({ color: 0x2A2A2E, roughness: 0.25 });
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Group(); e.position.set(s * 0.125, hy + 0.01, -0.262); e.rotation.y = s * 0.42; head.add(e);
    ball(e, 0.03, black, 0, 0, 0, 0.8, 1.35, 0.5, 12);
    return e;
  });
  const mouth = ball(head, 0.05, flat(0x3A0E12), 0, hy - 0.12, -0.24, 1.1, 0.55, 0.45, 12);
  mouth.visible = false;
  const brows = [-1, 1].map((s) => { const b = cap(head, 0.013, 0.07, black, s * 0.125, hy + 0.085, -0.262); b.rotation.z = Math.PI / 2; b.visible = false; return b; });

  // outfits, stuck to the bones (spine bone sits at belly height)
  const top = hy + HEAD.ry;
  const white = flat(0xFFFFFF);
  if (role === 'cook') {
    ball(spine, 1, white, 0, 0.08, -0.17, 0.26, 0.34, 0.12, 20);                       // apron
    ball(head, 1, white, 0, top - 0.01, 0, 0.27, 0.07, 0.25, 18);                       // hat band
    [[0, 0.12, 0], [-0.13, 0.08, 0.05], [0.13, 0.08, -0.05], [0.05, 0.08, 0.12], [-0.06, 0.09, -0.12]].forEach(([x, y, z]) => ball(head, 0.14, white, x, top + y, z, 1, 1, 1, 12));
  } else if (role === 'server') {
    ball(spine, 1, flat(0xF5EBD3), 0, -0.04, -0.19, 0.27, 0.22, 0.11, 20);               // apron
    const h = cap(head, 0.08, 0.42, white, 0, top - 0.01, 0.0); h.rotation.z = Math.PI / 2;
    const band = cap(head, 0.03, 0.44, flat(0xC8262B), 0, top - 0.045, -0.06); band.rotation.z = Math.PI / 2;
  } else if (kind === 'inspector') {
    ball(spine, 1, white, 0, 0.36, -0.15, 0.1, 0.17, 0.07, 12);                         // shirt front
    const tie = cap(spine, 0.03, 0.2, flat(0xC8262B), 0, 0.33, -0.205); tie.rotation.x = 0.2;
    ball(head, 1, flat(hat), 0, top - 0.05, 0, 0.46, 0.03, 0.42, 22);                   // brim
    ball(head, 1, flat(hat), 0, top + 0.02, 0, 0.26, 0.15, 0.24, 18);                   // crown
    ball(head, 1, flat(0xC8262B), 0, top - 0.025, 0, 0.265, 0.035, 0.245, 18);          // band
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.025), flat(0x8B5A2B));
    clip.position.set(0.16, -0.52, -0.14); clip.rotation.x = 0.4; armR.add(clip);
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.006), white);
    paper.position.set(0, 0.01, -0.016); clip.add(paper);
  } else if (hat != null) {
    if (Math.random() < 0.5) {     // beanie + pom-pom
      ball(head, 1, flat(hat), 0, hy + 0.11, 0.0, HEAD.rx * 1.04, HEAD.ry * 0.68, HEAD.rz * 1.05, 20);
      ball(head, 0.07, white, 0, top + 0.07, 0, 1, 1, 1, 10);
    } else {                        // cap with a bill
      ball(head, 1, flat(hat), 0, hy + 0.12, 0.0, HEAD.rx * 1.04, HEAD.ry * 0.6, HEAD.rz * 1.05, 20);
      ball(head, 1, flat(hat), 0, hy + 0.13, -0.27, 0.2, 0.025, 0.14, 14);
    }
  }

  g.scale.setScalar(scale);
  const seed = Math.random();
  g.userData.jelly = {
    root, spine, head, armL, armR, legL, legR, footL, footR, mat, base: new THREE.Color(color), eyes, mouth, brows, seed: seed * 10,
    // personality: how they walk
    stride: 0.85 + Math.random() * 0.35, bouncy: 0.7 + Math.random() * 0.7, waddle: 0.6 + Math.random() * 0.9, wide: 0.9 + Math.random() * 0.25,
    m: null, g: null,
  };
  return g;
}


// ===========================================================================
// Animation: springy motion + procedural gait.
// Feet are planted in world space and only move by taking a step (lift in an
// arc, land flat). Legs aim at the feet and stretch/squash like jelly, so feet
// never slide or sink into the floor. Arms and head are springs that lag and
// overshoot. Call updateJelly every frame with where the character *should* be.
// ===========================================================================
const REST_HIP = [new THREE.Vector3(-HIP_X, LEG_Y, 0), new THREE.Vector3(HIP_X, LEG_Y, 0)];
const REST_ANK = [new THREE.Vector3(-ANKLE.x, ANKLE.y, 0), new THREE.Vector3(ANKLE.x, ANKLE.y, 0)];
const REST_DIR = REST_ANK.map((a, i) => a.clone().sub(REST_HIP[i]));
const REST_LEN = REST_DIR[0].length();
REST_DIR.forEach((d) => d.normalize());
const SEAT_Q = [new THREE.Quaternion().setFromEuler(new THREE.Euler(1.45, 0, -0.06)), new THREE.Quaternion().setFromEuler(new THREE.Euler(1.45, 0, 0.06))];

const TAU = Math.PI * 2;
const S = (x = 0) => ({ x, v: 0 });
const spring = (s, target, k, damp, dt) => { s.v += ((target - s.x) * k - s.v * damp) * dt; s.x += s.v * dt; return s.x; };
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Color(), _tint = new THREE.Color();

// o = { x, z, y, yaw, pose: idle|sit|eat|sick|carry, mood: ok|impatient|angry|furious, tint, slip (0..1 or 0) }
export function updateJelly(obj, dt, time, o) {
  const J = obj.userData.jelly;
  dt = Math.min(dt, 0.05);
  const seated = o.pose === 'sit' || o.pose === 'eat';
  const y0 = o.y || 0;

  // ---------------- body motion (spring with velocity feed-forward) ----------------
  let m = J.m;
  if (!m || Math.hypot(o.x - m.px, o.z - m.pz) > 2.5) {
    m = J.m = {
      px: o.x, pz: o.z, py: y0, vx: 0, vz: 0, tx: o.x, tz: o.z, tvx: 0, tvz: 0, ax: 0, az: 0,
      yaw: o.yaw, yawV: 0, lean: S(), roll: S(), squash: S(1), headX: S(), headY: S(), headZ: S(),
      aLx: S(), aLz: S(-0.05), aRx: S(), aRz: S(0.05), look: 0, nextLook: 0, jump: 0,
    };
    J.g = null;
  }
  // target velocity estimate (smoothed so 15 Hz network updates still look continuous)
  const rvx = (o.x - m.tx) / Math.max(dt, 1e-3), rvz = (o.z - m.tz) / Math.max(dt, 1e-3);
  m.tx = o.x; m.tz = o.z;
  const kf = Math.min(1, dt * 8);
  m.tvx += (clamp(rvx, -4, 4) - m.tvx) * kf; m.tvz += (clamp(rvz, -4, 4) - m.tvz) * kf;
  const K = seated ? 60 : 30, D = seated ? 15 : 11;
  const ovx = m.vx, ovz = m.vz;
  m.vx += ((o.x - m.px) * K + (m.tvx - m.vx) * D) * dt;
  m.vz += ((o.z - m.pz) * K + (m.tvz - m.vz) * D) * dt;
  m.px += m.vx * dt; m.pz += m.vz * dt;
  m.py += (y0 - m.py) * Math.min(1, dt * 8);
  m.ax += ((m.vx - ovx) / dt - m.ax) * Math.min(1, dt * 10);
  m.az += ((m.vz - ovz) / dt - m.az) * Math.min(1, dt * 10);
  const speed = Math.hypot(m.vx, m.vz);
  const moving = speed > 0.18 && !seated;

  // facing: follow the direction of travel, otherwise the requested yaw; a little overshoot
  const wantYaw = moving && speed > 0.3 ? Math.atan2(-m.vx, -m.vz) : o.yaw;
  m.yawV += (angDiff(m.yaw, wantYaw) * 75 - m.yawV * 10.5) * dt;
  m.yaw += m.yawV * dt;
  obj.position.set(m.px, m.py, m.pz);
  obj.rotation.y = m.yaw;
  const fx = -Math.sin(m.yaw), fz = -Math.cos(m.yaw);
  const aFwd = m.ax * fx + m.az * fz;

  // ---------------- gait ----------------
  obj.updateMatrixWorld(true);
  const slip = o.slip || 0;
  const furious = o.mood === 'furious', angry = o.mood === 'angry', impatient = o.mood === 'impatient';
  let rootX = 0, rootY = 0, swing = 0;
  const footLocal = [0, 0];

  if (seated) {
    J.g = null;
    for (let i = 0; i < 2; i++) {
      const leg = i ? J.legR : J.legL, foot = i ? J.footR : J.footL;
      leg.quaternion.copy(SEAT_Q[i]); leg.scale.set(1, 1, 1);
      _a.copy(REST_DIR[i]).multiplyScalar(REST_LEN).applyQuaternion(SEAT_Q[i]).add(REST_HIP[i]);
      foot.position.copy(_a);
      foot.rotation.set(1.25 + (furious ? Math.sin(time * 14 + i * 3) * 0.25 : Math.sin(time * 2 + i) * 0.08), 0, 0, 'YXZ');
    }
  } else {
    let g = J.g;
    const home = (i) => { _a.set((i ? 1 : -1) * ANKLE.x * J.wide, 0, 0).applyMatrix4(obj.matrixWorld); _a.x += m.vx * 0.13 * J.stride; _a.z += m.vz * 0.13 * J.stride; _a.y = 0; return _a; };
    if (!g) {
      g = J.g = { feet: [0, 1].map((i) => { const h = home(i); return { x: h.x, z: h.z, yaw: m.yaw, lift: 0, step: false, t: 1, fx: 0, fz: 0, fyaw: 0, dur: 0.25, h: 0.08, tapPh: Math.random() * 6 }; }), last: 1, nextStomp: 0, swingPh: 0 };
    }
    // advance stepping feet
    let active = null;
    for (let i = 0; i < 2; i++) {
      const f = g.feet[i];
      if (!f.step) continue;
      f.t += dt / f.dur;
      const t = Math.min(1, f.t), e = smooth(t);
      const h = home(i);
      const tx = f.inPlace ? f.fx : h.x + m.vx * f.dur * 0.35, tz = f.inPlace ? f.fz : h.z + m.vz * f.dur * 0.35;
      f.x = f.fx + (tx - f.fx) * e; f.z = f.fz + (tz - f.fz) * e;
      f.lift = Math.sin(Math.PI * t) * f.h;
      f.yaw = f.fyaw + angDiff(f.fyaw, m.yaw) * e;
      if (f.t >= 1) {
        f.step = false; f.lift = 0; f.inPlace = false;
        m.squash.v -= (0.5 + Math.min(1, speed / 1.5)) * 0.9 * J.bouncy * (f.stomp ? 2.2 : 1);   // squish on landing
        f.stomp = false;
      } else active = { i, t };
    }
    // pick the next foot to move
    const canStart = !active || (speed > 1.1 && active.t > 0.62);
    if (canStart) {
      let best = -1, bestErr = 0;
      for (let i = 0; i < 2; i++) {
        const f = g.feet[i];
        if (f.step) continue;
        const h = home(i);
        const err = Math.hypot(f.x - h.x, f.z - h.z) + Math.abs(angDiff(f.yaw, m.yaw)) * 0.22;
        const thr = moving ? 0.085 * J.stride : 0.07;
        const score = err - thr + (i === g.last ? -0.02 : 0.02);   // prefer alternating feet
        if (err > thr && score > bestErr) { bestErr = score; best = i; }
        if (err > 0.65) { f.x = h.x; f.z = h.z; f.yaw = m.yaw; }   // teleport safety
      }
      if (best >= 0) {
        const f = g.feet[best];
        Object.assign(f, { step: true, t: 0, fx: f.x, fz: f.z, fyaw: f.yaw, dur: clamp(0.3 - speed * 0.06, 0.15, 0.3), h: (0.055 + Math.min(speed, 2) * 0.035) * J.bouncy });
        g.last = best;
      } else if (!active && angry && !moving && time > g.nextStomp) {
        // angry: stomp in place, alternating feet
        const i = 1 - g.last, f = g.feet[i];
        Object.assign(f, { step: true, t: 0, fx: f.x, fz: f.z, fyaw: f.yaw, dur: 0.2, h: 0.17, inPlace: true, stomp: true });
        g.last = i; g.nextStomp = time + 0.42 + Math.random() * 0.15;
      }
    }
    // body bob + weight shift over the planted foot
    if (active) {
      const s = Math.sin(Math.PI * active.t);
      rootY += s * 0.035 * J.bouncy;
      rootX += (active.i ? -1 : 1) * s * 0.035 * J.waddle;
    }
    m.jump = furious && !moving ? Math.abs(Math.sin(time * 7.5 + J.seed)) * 0.2 : m.jump * Math.max(0, 1 - dt * 10);
    rootY += m.jump;

    // place feet + aim legs at them
    for (let i = 0; i < 2; i++) {
      const f = g.feet[i];
      const leg = i ? J.legR : J.legL, foot = i ? J.footR : J.footL;
      let lift = f.lift + m.jump;
      let px = f.x, pz = f.z;
      if (impatient && !moving && !f.step && i === 1) lift += Math.max(0, Math.sin(time * 9 + f.tapPh)) * 0.035;       // foot tapping
      if (slip > 0 && i === (J.seed > 5 ? 1 : 0)) { const s = Math.sin(Math.PI * slip); px += fx * 0.35 * s; pz += fz * 0.35 * s; lift += 0.28 * s; }  // kick a leg up
      _a.set(px, lift, pz);
      obj.worldToLocal(_a);
      footLocal[i] = _a.z;
      _a.y += ANKLE.y + 0.005; _a.x -= rootX; _a.y -= rootY;
      foot.position.copy(_a);
      foot.rotation.set(f.step ? Math.sin(Math.PI * Math.min(1, f.t)) * 0.22 : slip > 0 ? Math.sin(Math.PI * slip) * 0.4 : 0, angDiff(m.yaw, f.yaw), 0, 'YXZ');
      _b.copy(_a).sub(REST_HIP[i]);
      const len = _b.length() || 1e-3;
      _q.setFromUnitVectors(REST_DIR[i], _b.multiplyScalar(1 / len));
      leg.quaternion.copy(_q);
      const st = clamp(len / REST_LEN, 0.65, 1.5);
      leg.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
    }
    swing = clamp((footLocal[0] - footLocal[1]) * 3.2, -1, 1);   // +: right foot ahead
  }
  J.root.position.set(rootX, rootY, 0);

  // ---------------- spine: lean, roll, squash ----------------
  const breathe = Math.sin(time * 2.2 + J.seed) * 0.02;
  spring(m.squash, 1, 220, 11, dt);
  const sq = clamp(m.squash.x, 0.75, 1.25) + breathe + (furious ? Math.abs(Math.sin(time * 16)) * 0.05 : 0);
  J.spine.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  const leanT = (moving ? 0.1 + speed * 0.05 : 0) + clamp(aFwd * 0.035, -0.25, 0.25) - (slip > 0 ? Math.sin(Math.PI * slip) * 0.6 : 0) + (seated ? -0.04 : 0);
  spring(m.lean, leanT, 90, 9, dt);
  const rollT = clamp(-m.yawV * speed * 0.07, -0.35, 0.35) - rootX * 3 + (o.pose === 'eat' ? Math.sin(time * 5) * 0.07 : 0);
  spring(m.roll, rollT, 90, 8, dt);
  J.spine.rotation.set(m.lean.x, 0, m.roll.x + (furious ? Math.sin(time * 38) * 0.035 : 0));

  // ---------------- arms (springy, they lag and overshoot) ----------------
  let lx, lz, rx, rz;
  const loose = Math.sin(time * 3 + J.seed) * 0.06;
  if (slip > 0) { lx = 2.7 + Math.sin(time * 22) * 0.4; rx = 2.7 + Math.sin(time * 22 + 2) * 0.4; lz = -0.9; rz = 0.9; }
  else if (furious && seated) { lx = 1.0 + Math.abs(Math.sin(time * 10)) * 0.9; rx = 1.0 + Math.abs(Math.sin(time * 10 + 1.6)) * 0.9; lz = -0.05; rz = 0.05; }   // pounding the table
  else if (furious) { lx = 2.3 + Math.sin(time * 13) * 0.8; rx = 2.3 + Math.sin(time * 13 + 2) * 0.8; lz = -0.6; rz = 0.6; }
  else if (o.pose === 'eat') { rx = 1.2 + Math.abs(Math.sin(time * 6)) * 0.8; rz = 0.1; lx = 0.95; lz = -0.05; }
  else if (o.pose === 'sit') { lx = 0.95 + loose; rx = 0.95 - loose; lz = -0.05; rz = 0.05; }
  else if (o.pose === 'sick') { lx = 0.95; rx = 0.95; lz = 0.5; rz = -0.5; }
  else if (o.pose === 'carry') { lx = 1.35 + swing * 0.1; rx = 1.35 - swing * 0.1; lz = 0.15; rz = -0.15; }
  else if (angry && !moving) { lx = 0.25 + Math.abs(Math.sin(time * 6)) * 0.35; rx = 0.25 + Math.abs(Math.sin(time * 6 + 1)) * 0.35; lz = -0.4; rz = 0.4; }
  else if (impatient && !moving) { lx = 1.3; lz = 0.8; rx = 1.45; rz = -0.8; }   // arms crossed
  else { lx = swing * 0.75 + loose; rx = -swing * 0.75 - loose; lz = -0.06 - (moving ? 0.1 : 0); rz = 0.06 + (moving ? 0.1 : 0); }
  const ak = 150, ad = 8.5;
  J.armL.rotation.set(spring(m.aLx, lx, ak, ad, dt), 0, spring(m.aLz, lz, ak, ad, dt));
  J.armR.rotation.set(spring(m.aRx, rx, ak, ad, dt), 0, spring(m.aRz, rz, ak, ad, dt));

  // ---------------- head (wobbles a beat behind the body) ----------------
  if (time > m.nextLook) { m.look = (!moving && o.pose === 'idle' && !furious && Math.random() < 0.7) ? (Math.random() - 0.5) * 1.3 : 0; m.nextLook = time + 1.2 + Math.random() * 3.2; }
  const hy = moving ? clamp(m.yawV * 0.12, -0.5, 0.5) : m.look;
  const hx = clamp(-aFwd * 0.05, -0.3, 0.3) + (seated ? 0.08 : 0) - (slip > 0 ? 0.4 * Math.sin(Math.PI * slip) : 0) + (o.pose === 'eat' ? Math.abs(Math.sin(time * 6)) * 0.15 : 0);
  const hz = -m.roll.x * 0.7 + Math.sin(time * 1.3 + J.seed) * 0.04;
  J.head.rotation.set(spring(m.headX, hx, 110, 7, dt), spring(m.headY, hy, 40, 9, dt), spring(m.headZ, hz, 110, 6, dt));

  // ---------------- face + tint ----------------
  const mad = angry || furious;
  J.eyes.forEach((e, i) => {
    const blink = (time + J.seed * 3) % 4.2 < 0.12 ? 0.1 : 1;
    e.scale.set(1, (mad ? 0.62 : o.pose === 'sick' ? 0.5 : impatient ? 0.78 : slip > 0 ? 1.35 : 1) * blink, 1);
    e.rotation.z = mad ? (i ? 1 : -1) * 0.35 : 0;
  });
  J.brows.forEach((b, i) => { b.visible = mad; b.rotation.z = Math.PI / 2 + (i ? -0.5 : 0.5); });
  J.mouth.visible = furious || slip > 0 || o.pose === 'sick' || (o.pose === 'eat' && Math.sin(time * 6) > 0);
  J.mouth.scale.set(furious ? 1.5 : 1.1, furious ? 1.3 + Math.abs(Math.sin(time * 12)) * 0.5 : slip > 0 ? 1.4 : 0.55, 0.45);
  _c.copy(J.base);
  if (o.tint) _c.lerp(_tint.set(o.tint.color), o.tint.amount);
  J.mat.color.copy(_c);
}
