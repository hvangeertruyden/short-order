// ---------------------------------------------------------------------------
// Swaps the hand-built furniture and kitchen units for detailed downloaded models
// (see README for credits). The procedural pieces stay in the scene but hidden:
// they keep working as cheap click targets, and they're the fallback if a model
// fails to load. Nothing here changes game rules - only what things look like.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { L, TABLES, tableSeats } from './data.js';
import { OVERRIDES } from './models.js';

const loader = new GLTFLoader();
const cache = new Map();
export function loadModel(name) {
  if (!cache.has(name)) cache.set(name, loader.loadAsync(`./models/${name}.glb`).then((g) => { g.scene.updateMatrixWorld(true); return g.scene; }));
  return cache.get(name);
}

const _b = new THREE.Box3(), _v = new THREE.Vector3(), _c = new THREE.Vector3();

// one sub-part of a pack, stood upright in its own frame (these packs are Z-up FBX exports
// whose parts are spun around the origin); the part's front ends up facing +z
function unit(root, name) {
  const src = root.getObjectByName(name);
  const c = src.clone(true);
  c.position.set(0, 0, 0); c.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); c.scale.set(1, 1, 1);
  return c;
}

// rotate, then scale/move so the model's footprint is centred on (0, 0) and it stands on y = 0.
// size: { w, h, d } in metres (x, y, z after rotation). uniform: one scale from the first given axis.
function fit(obj, { rotY = 0, w, h, d, uniform = true }) {
  const inner = new THREE.Group(); inner.add(obj); inner.rotation.y = rotY;
  const outer = new THREE.Group(); outer.add(inner);
  outer.updateMatrixWorld(true);
  _b.setFromObject(inner); _b.getSize(_v); _b.getCenter(_c);
  inner.position.set(-_c.x, -_b.min.y, -_c.z);
  const sx = w && w / _v.x, sy = h && h / _v.y, sz = d && d / _v.z;
  if (uniform) { const k = sy || sx || sz; outer.scale.setScalar(k); }
  else { const k = sy || sx || sz; outer.scale.set(sx || k, sy || k, sz || k); }
  outer.userData.size = new THREE.Vector3(_v.x * outer.scale.x, _v.y * outer.scale.y, _v.z * outer.scale.z);
  return outer;
}

// shadows on, every instance gets its own materials (hover highlighting tints materials),
// and no per-triangle raycasting: the hidden procedural piece underneath is the click target
function finish(obj, { hide = [], cloneMats = true, shadow = true } = {}) {
  const drop = [];
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const mats = [].concat(m.material);
    if (hide.some((h) => m.name.includes(h) || mats.some((x) => x.name === h))) { drop.push(m); return; }
    if (cloneMats) m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
    for (const x of [].concat(m.material)) { x.envMapIntensity = 0.8; }
    m.castShadow = shadow; m.receiveShadow = true;
    m.raycast = () => {};
  });
  for (const m of drop) m.parent.remove(m);
  return obj;
}

// height of the first surface straight down from (x, 3, z) in world space
const ray = new THREE.Raycaster();
function surfaceY(obj, x, z) {
  obj.updateMatrixWorld(true);
  const meshes = []; obj.traverse((m) => { if (m.isMesh) meshes.push(m); });
  ray.set(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObjects(meshes.map((m) => Object.assign(Object.create(m), { raycast: THREE.Mesh.prototype.raycast })), false);
  return hits.length ? hits[0].point.y : null;
}
const hideAll = (list) => list?.flat().forEach((m) => { if (m) m.visible = false; });

export async function furnish(world, colliders) {
  const V = world.vis, S = world.static, TOP = 0.92;
  const tasks = [];

  // ---- dining: booths for the four-tops, table-and-chairs sets for the two-tops ----
  tasks.push(Promise.all([loadModel('booth'), loadModel('tableset')]).then(([booth, set]) => {
    for (const t of TABLES) {
      const tv = V.tables[t.n];
      const base = Math.atan2(t.seat.x - t.x, t.seat.z - t.z);
      let m;
      if (t.shape === 'booth') {
        m = fit(finish(booth.clone(true), { hide: ['Cylinder020'] }), { rotY: Math.PI / 2, h: 1.12 });
        // bench backs block the player
        const ax = Math.sin(base), az = Math.cos(base);
        for (const sgn of [-1, 1]) {
          const cx = t.x + ax * sgn * 0.98, cz = t.z + az * sgn * 0.98, hx = Math.abs(az) * 0.85 + Math.abs(ax) * 0.3, hz = Math.abs(ax) * 0.85 + Math.abs(az) * 0.3;
          colliders.push({ x0: cx - hx, z0: cz - hz, x1: cx + hx, z1: cz + hz });
        }
      } else {
        m = fit(finish(set.clone(true)), { h: 1.0 });
        // the set comes with two chairs; four-tops get two more on the open sides
        m.updateMatrixWorld(true);
        const chair = m.getObjectByName('Cube005'), inv = m.matrixWorld.clone().invert();
        for (const ang of [Math.PI / 2, -Math.PI / 2]) {
          const pivot = new THREE.Group(); pivot.rotation.y = ang; m.add(pivot);
          const c = chair.clone(true);
          inv.clone().multiply(chair.matrixWorld).decompose(c.position, c.quaternion, c.scale);
          pivot.add(c);
        }
      }
      // the sets' white tabletops glare under the pendant lamps: soften them to a warm matte cream
      m.traverse((o) => { if (o.isMesh && /Cylinder00[35]/.test(o.name + o.parent?.name)) for (const x of [].concat(o.material)) { x.color.multiply(new THREE.Color(0xC9BFA8)); x.roughness = Math.max(x.roughness, 0.7); x.metalness = 0; } });
      m.rotation.y = base;
      tv.group.add(m);
      hideAll([tv.parts, tv.chairs]);
      const y = surfaceY(m, t.x, t.z);
      if (y) tv.anchor.position.y = y + 0.005;
    }
  }));

  // ---- the cook line: two flat-top griddle units and a fryer ----
  tasks.push(loadModel('kitchenprops').then((pack) => {
    const backZ = -7.0;
    const placeUnit = (name, x, w, hide = []) => {
      const m = fit(finish(unit(pack, name), { hide, shadow: false }), { w });
      m.position.set(x, 0, backZ + m.userData.size.z / 2);
      S.add(m);
      // stretch the height so the cooking surface lines up with the counter top the food sits on
      const y = surfaceY(m, x, backZ + m.userData.size.z / 2);
      if (y) m.scale.y *= (TOP + 0.04) / y;   // the food sits on a plate 4 cm above the counter line
      return m;
    };
    const gx = L.griddle.slotX, gw = 1.36;
    placeUnit('Griddle', (gx[0] + gx[1]) / 2, gw);
    placeUnit('Griddle', (gx[2] + gx[3]) / 2, gw);
    hideAll([V.griddle, V.griddleCab]);
    const fr = placeUnit('Fryer', L.fryer.x, 1.3, ['ComFryerBasket']);
    // drop the baskets right down into the oil wells of the real fryer
    const oil = surfaceY(fr, L.fryer.slotX[0], L.fryer.z);
    if (oil && oil < TOP) world.basketDown = oil - TOP - 0.015;
    // and fill the empty wells with hot oil (see-through, so you can watch the fries)
    if (oil && oil < TOP) for (const x of L.fryer.slotX) {
      const o = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.5), new THREE.MeshStandardMaterial({ color: 0xC98B2B, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.6, depthWrite: false }));
      o.rotation.x = -Math.PI / 2; o.position.set(x, oil + 0.075, L.fryer.z + 0.02); o.raycast = () => {}; S.add(o);
    }
    hideAll([V.fryer, V.fryerCab]);
    // walk-in style reach-in for the freezer: two cabinets side by side, doors swung shut
    const fz = new THREE.Group();
    for (const sx of [-0.375, 0.375]) {
      const raw = unit(pack, 'Fridge');
      closeDoor(raw);
      const m = fit(finish(raw, { shadow: false }), { w: 0.75, h: 2.1, uniform: false });
      m.position.x = sx; fz.add(m);
    }
    fz.position.set(0, 0, -0.03);
    V.freezerGroup.add(fz);
    hideAll([V.freezer]);
  }));

  // ---- a proper retro fridge (its maker's badge removed) ----
  tasks.push(loadModel('fridge').then((src) => {
    const m = fit(finish(src.clone(true), { hide: ['Text'], shadow: false }), { rotY: Math.PI / 2, h: 1.8 });
    m.position.x = -8.0 - L.fridge.x + m.userData.size.x / 2;   // back against the wall
    V.fridgeGroup.add(m);
    hideAll([V.fridge]);
  }));

  // ---- the little things: silverware at every place, napkins/condiments/coffee on the counter ----
  tasks.push(Promise.all([loadModel('silverware'), tasks[0]]).then(([sw]) => {
    const proto = fit(finish(sw.clone(true), { cloneMats: false, shadow: false }), { w: 0.19 });
    for (const t of TABLES) {
      const y = V.tables[t.n].anchor.position.y;
      for (const st of tableSeats(t)) {
        const dx = st.x - t.x, dz = st.z - t.z, len = Math.hypot(dx, dz);
        const m = proto.clone(); m.position.set(t.x + dx * (0.3 / len) * (t.shape === 'booth' ? 1 : 1), y, t.z + dz * (0.3 / len));
        if (t.shape === 'booth') { const base = Math.atan2(t.seat.x - t.x, t.seat.z - t.z); const along = dx * Math.sin(base) + dz * Math.cos(base); m.position.set(st.x - Math.sin(base) * (Math.abs(along) - 0.3) * Math.sign(along), y, st.z - Math.cos(base) * (Math.abs(along) - 0.3) * Math.sign(along)); }
        m.rotation.y = Math.atan2(-dz, dx);
        S.add(m);
      }
    }
  }));
  tasks.push(Promise.all([loadModel('napkins'), loadModel('condiments'), loadModel('coffeepot')]).then(([nap, con, pot]) => {
    const top = 1.04, cz = (L.counter.z0 + L.counter.z1) / 2;
    const napP = fit(finish(nap.clone(true), { cloneMats: false, shadow: false }), { h: 0.13 });
    const conP = fit(finish(con.clone(true), { cloneMats: false, shadow: false }), { h: 0.17 });
    for (const x of [-5.4, -1.55]) {
      const n = napP.clone(); n.position.set(x, top, cz + 0.05); S.add(n);
      const c = conP.clone(); c.position.set(x + 0.22, top, cz + 0.05); c.rotation.y = 0.2; S.add(c);
    }
    // a coffee pot keeping warm at the end of the counter
    const potP = fit(finish(pot.clone(true), { cloneMats: false, shadow: false }), { h: 0.24 });
    for (const [x, ry] of [[-7.0, 0.4]]) { const p = potP.clone(); p.position.set(x, top, cz - 0.12); p.rotation.y = ry; S.add(p); }
  }));
  // finished pancakes and lidded sodas use the detailed models
  tasks.push(loadModel('pancake').then((src) => {
    const proto = fit(finish(src.clone(true), { hide: ['Circle006'], cloneMats: false, shadow: false }), { w: 0.22 });
    OVERRIDES.pancakes = () => proto.clone();
  }));
  tasks.push(loadModel('sodacup').then((src) => {
    const proto = fit(finish(src.clone(true), { cloneMats: false, shadow: false }), { h: 0.24 });
    OVERRIDES.sodaCup = () => proto.clone();
  }));

  const results = await Promise.allSettled(tasks);
  // the sun only reaches the dining room: nothing in the kitchen needs to cast a shadow
  const v = new THREE.Vector3();
  S.updateMatrixWorld(true);
  S.traverse((o) => { if (o.isMesh && o.castShadow && o.getWorldPosition(v).z < L.wallZ - 0.3) o.castShadow = false; });
  results.forEach((r) => { if (r.status === 'rejected') console.warn('furnish:', r.reason); });
}

// the pack's fridge is posed with its door swung wide open: swing it back shut
function closeDoor(fridgeUnit) {
  const door = fridgeUnit.getObjectByName('ComFridgeDoor'), body = fridgeUnit.getObjectByName('ComFridge');
  if (!door || !body) return;
  fridgeUnit.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(body), db = new THREE.Box3().setFromObject(door);
  // try both swings about each front corner; keep the one that lands flat on the front face
  let best = null;
  const startQ = door.quaternion.clone(), startP = door.position.clone();
  for (const hx of [bb.min.x, bb.max.x]) for (let deg = -180; deg < 180; deg += 3) {
    const ang = deg * Math.PI / 180;
    door.quaternion.copy(startQ); door.position.copy(startP); door.updateMatrixWorld(true);
    const pivot = new THREE.Vector3(hx, 0, bb.max.z);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    const parentInv = door.parent.matrixWorld.clone().invert();
    const wp = door.getWorldPosition(new THREE.Vector3()).sub(pivot).applyQuaternion(q).add(pivot);
    const wq = door.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);
    door.position.copy(wp.applyMatrix4(parentInv));
    const pq = door.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    door.quaternion.copy(pq.multiply(wq));
    door.updateMatrixWorld(true);
    const nb = new THREE.Box3().setFromObject(door);
    const depth = nb.max.z - nb.min.z, overlap = Math.min(nb.max.x, bb.max.x) - Math.max(nb.min.x, bb.min.x);
    const score = overlap - depth * 3 - 2 * Math.abs(nb.min.z - bb.max.z) - (nb.max.z < bb.max.z ? 1e3 : 0);
    if (!best || score > best.score) best = { score, p: door.position.clone(), q: door.quaternion.clone() };
  }
  door.position.copy(best.p); door.quaternion.copy(best.q);
  void db;
}
