// ---------------------------------------------------------------------------
// Bean people: short, stubby, soft. A smooth bean body with dot eyes, little
// paddle arms and two stubby feet. Same API the world used for the old
// characters: jellyPerson(opts) builds one, updateJelly(obj, dt, time, o) animates it.
//   o = { x, z, y?, yaw, pose: idle|carry|sit|eat|sick, mood?, tint?, slip? }
// The face looks toward -z at yaw 0.
// ---------------------------------------------------------------------------
import * as THREE from 'three';

const mat = (color, rough = 0.62) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
const INK = mat(0x2B1E1A, 0.4), BLUSH = new THREE.MeshStandardMaterial({ color: 0xFF8A8A, roughness: 0.8, transparent: true, opacity: 0.55 });
const WHITE = mat(0xFFFFFF, 0.7), RED = mat(0xE8433A, 0.6), GREY = mat(0x6E7378, 0.7);

// one shared bean body shape (lathe profile: wide soft bottom, rounded dome)
const BODY_GEO = (() => {
  const pts = [];
  const prof = [[0, 0], [0.18, 0.005], [0.27, 0.04], [0.32, 0.11], [0.345, 0.22], [0.35, 0.36], [0.34, 0.5], [0.315, 0.62], [0.27, 0.73], [0.2, 0.81], [0.11, 0.86], [0, 0.875]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const curve = new THREE.SplineCurve(pts);
  const g = new THREE.LatheGeometry(curve.getPoints(28), 36);
  g.computeVertexNormals();
  return g;
})();
const capsule = (r, len, m) => { const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), m); mesh.castShadow = true; return mesh; };
const ball = (r, m, sx = 1, sy = 1, sz = 1) => { const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), m); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; return mesh; };

export function jellyPerson({ color, hat = null, kind = 'customer', role = null, scale = 1 }) {
  const root = new THREE.Group();
  const rig = new THREE.Group(); root.add(rig);               // squash / tilt pivot at the feet
  const bodyMat = mat(kind === 'inspector' ? 0x9AA0A6 : color);
  const base = bodyMat.color.clone();
  const body = new THREE.Mesh(BODY_GEO, bodyMat); body.position.y = 0.13; body.castShadow = true; body.receiveShadow = true;
  rig.add(body);

  // face
  const face = new THREE.Group(); face.position.set(0, 0.13, 0); rig.add(face);
  for (const s of [-1, 1]) {
    const eye = ball(0.042, INK, 0.85, 1.15, 0.6); eye.position.set(s * 0.105, 0.6, -0.315); face.add(eye);
    const shine = ball(0.012, WHITE); shine.position.set(s * 0.105 + 0.012, 0.625, -0.338); face.add(shine);
    const blush = ball(0.04, BLUSH, 1.2, 0.6, 0.3); blush.position.set(s * 0.19, 0.5, -0.29); blush.castShadow = false; face.add(blush);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 14, Math.PI), INK); mouth.position.set(0, 0.5, -0.33); mouth.rotation.z = Math.PI; face.add(mouth);

  // arms: little paddles hinged at the shoulder
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.33, 0.13 + 0.5, 0); rig.add(pivot);
    const a = capsule(0.065, 0.16, bodyMat); a.position.set(s * 0.03, -0.12, 0); a.rotation.z = s * 0.25; pivot.add(a);
    return pivot;
  });
  // feet
  const legs = [-1, 1].map((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.13, 0.15, 0); root.add(pivot);
    const l = capsule(0.075, 0.07, bodyMat); l.position.y = -0.07; pivot.add(l);
    const f = ball(0.08, bodyMat, 1, 0.6, 1.25); f.position.set(0, -0.12, -0.03); pivot.add(f);
    return pivot;
  });

  // hats and uniforms
  const top = new THREE.Group(); top.position.y = 0.13 + 0.84; rig.add(top);
  if (role === 'cook') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.12, 24), WHITE); band.position.y = 0.0; top.add(band);
    for (let i = 0; i < 5; i++) { const p = ball(0.13, WHITE); p.position.set(Math.cos(i * 1.26) * 0.09, 0.17, Math.sin(i * 1.26) * 0.09); top.add(p); }
    const crown = ball(0.15, WHITE, 1, 0.8, 1); crown.position.y = 0.22; top.add(crown);
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(0.352, 0.356, 0.3, 30, 1, true, Math.PI * 0.62, Math.PI * 0.76), WHITE); apron.position.y = 0.13 + 0.2; rig.add(apron);
  } else if (role === 'server') {
    // a chunky folded soda-jerk cap (white with a red band and a little star), sitting a bit forward
    const cap = new THREE.Group(); cap.position.set(0, -0.03, -0.02); cap.rotation.x = -0.12; top.add(cap);
    const crown = ball(0.23, WHITE, 1, 0.55, 0.6); crown.position.y = 0.06; cap.add(crown);                        // soft folded paper dome
    const ridge = ball(0.2, WHITE, 1, 0.22, 0.12); ridge.position.y = 0.15; cap.add(ridge);                         // the fold along the top
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.05, 28), RED); band.scale.z = 0.62; band.position.y = 0.035; band.castShadow = true; cap.add(band);
    const star = ball(0.04, mat(0xFFC83D, 0.5), 1, 1, 0.4); star.position.set(0, 0.08, -0.14); cap.add(star);
    // small bow tie low on the chest, plus a red half-apron
    const bow = new THREE.Group(); bow.position.set(0, 0.13 + 0.3, -0.335); rig.add(bow);
    for (const s of [-1, 1]) { const w = ball(0.032, RED, 1.15, 0.8, 0.45); w.position.x = s * 0.036; bow.add(w); }
    bow.add(ball(0.016, RED));
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(0.352, 0.356, 0.24, 30, 1, true, Math.PI * 0.62, Math.PI * 0.76), RED); apron.position.y = 0.13 + 0.17; rig.add(apron);
  } else if (kind === 'inspector') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 26), GREY); top.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.15, 22), GREY); crown.position.y = 0.08; top.add(crown);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.02), mat(0x8A5A2A)); board.position.set(0.02, -0.2, -0.1); board.rotation.x = -0.6; arms[1].add(board);
  } else if (hat != null) {
    if (kind === 'artist') {   // a striped beanie with a pom-pom
      const b = ball(0.2, mat(hat), 1, 0.6, 1); b.position.y = -0.02; top.add(b);
      const pom = ball(0.06, WHITE); pom.position.y = 0.12; top.add(pom);
    } else if ((color + hat) % 2) {  // a little bowler
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 24), mat(hat)); top.add(brim);
      const dome = ball(0.15, mat(hat), 1, 0.8, 1); dome.position.y = 0.04; top.add(dome);
    } else {                          // a bow
      for (const s of [-1, 1]) { const w = ball(0.07, mat(hat), 1.2, 0.8, 0.6); w.position.set(0.12 + s * 0.07, -0.02, 0); top.add(w); }
    }
  }

  root.scale.setScalar(scale);
  root.userData.jelly = { rig, body, bodyMat, base, arms, legs, face, top, m: null };
  return root;
}

const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const tmpC = new THREE.Color();

export function updateJelly(obj, dt, time, o) {
  const J = obj.userData.jelly;
  dt = Math.min(dt, 0.05);
  let m = J.m;
  if (!m || Math.hypot(o.x - m.x, o.z - m.z) > 2.5) m = J.m = { x: o.x, z: o.z, y: o.y || 0, yaw: o.yaw, ph: Math.random() * 6, spd: 0, lx: o.x, lz: o.z };
  // smooth toward the (possibly 15 Hz) target
  const k = Math.min(1, dt * 14);
  m.x += (o.x - m.x) * k; m.z += (o.z - m.z) * k; m.y += ((o.y || 0) - m.y) * Math.min(1, dt * 8);
  const v = Math.hypot(m.x - m.lx, m.z - m.lz) / Math.max(dt, 1e-3); m.lx = m.x; m.lz = m.z;
  m.spd += (v - m.spd) * Math.min(1, dt * 10);
  m.yaw += angDiff(m.yaw, o.yaw) * Math.min(1, dt * 12);

  const seated = o.pose === 'sit' || o.pose === 'eat';
  const walking = !seated && m.spd > 0.25;
  m.ph += dt * (walking ? 6 + m.spd * 3.5 : 0);
  const sw = walking ? Math.sin(m.ph) : 0;

  obj.position.set(m.x, m.y + (seated ? 0.33 : 0), m.z);
  obj.rotation.y = m.yaw;

  // body: bounce + waddle while walking, gentle breathing otherwise
  const breathe = Math.sin(time * 2.2 + m.ph) * 0.015;
  const bounce = walking ? Math.abs(Math.sin(m.ph)) * 0.07 : 0;
  const furious = o.mood === 'furious';
  J.rig.position.y = bounce;
  J.rig.rotation.z = walking ? sw * 0.13 : furious ? Math.sin(time * 40) * 0.05 : o.pose === 'sick' ? Math.sin(time * 3) * 0.08 : 0;
  J.rig.rotation.x = (o.slip ? -Math.sin(Math.min(1, o.slip) * Math.PI) * 0.9 : 0) + (walking ? -0.08 : 0);
  J.rig.scale.set(1 - breathe * 0.5 + (walking ? Math.abs(sw) * 0.03 : 0), 1 + breathe - (walking ? Math.abs(sw) * 0.05 : 0), 1 - breathe * 0.5);

  // feet step; when sitting they stick straight out
  J.legs.forEach((l, i) => {
    l.rotation.x = seated ? -1.35 : walking ? (i ? -sw : sw) * 0.75 : 0;
    l.position.y = seated ? 0.12 : 0.15 + (walking ? Math.max(0, (i ? -sw : sw)) * 0.05 : 0);
  });
  // arms swing, carry, eat
  J.arms.forEach((a, i) => {
    const s = i ? 1 : -1;
    let rx = walking ? (i ? sw : -sw) * 0.55 : Math.sin(time * 1.6 + i) * 0.05, rz = s * 0.15;
    if (o.pose === 'carry') { rx = -1.35; rz = s * 0.05; }
    if (o.pose === 'eat' && i === 1) rx = -1.2 - Math.max(0, Math.sin(time * 4)) * 0.9;
    if (o.pose === 'sick') { rx = -0.4; }
    if (furious) { rx = -2.4 + Math.sin(time * 18 + i * 2) * 0.5; rz = s * 0.5; }
    a.rotation.x += (rx - a.rotation.x) * Math.min(1, dt * 12);
    a.rotation.z += (rz - a.rotation.z) * Math.min(1, dt * 12);
  });

  // colour: angry, sick
  if (o.tint) J.bodyMat.color.copy(J.base).lerp(tmpC.set(o.tint.color), o.tint.amount);
  else J.bodyMat.color.copy(J.base);
}
