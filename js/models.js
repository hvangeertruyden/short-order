// ---------------------------------------------------------------------------
// Models: materials, every food stage, containers and detailed appliances.
// Everything is procedural (no model files). Origins: appliances sit on the
// counter top / floor at y=0 of their group; food sits on y=0.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE as C, MENU } from './data.js';
import { recipe } from './kitchen.js';

// ---- materials ---------------------------------------------------------------
const cache = new Map();
function shared(m) { m.userData.shared = true; return m; }
export function paint(color, rough = 0.55, extra = {}) {
  const k = `p${color}|${rough}|${JSON.stringify(extra)}`;
  if (!cache.has(k)) cache.set(k, shared(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra })));
  return cache.get(k);
}
export const M = {
  chrome: shared(new THREE.MeshStandardMaterial({ color: 0xE8EDF0, metalness: 1, roughness: 0.16 })),
  steel: shared(new THREE.MeshStandardMaterial({ color: 0xD2D8DC, metalness: 0.6, roughness: 0.42 })),
  panel: shared(new THREE.MeshStandardMaterial({ color: 0xC2C9CE, metalness: 0.45, roughness: 0.5 })),
  darkSteel: shared(new THREE.MeshStandardMaterial({ color: 0x6E7378, metalness: 0.6, roughness: 0.45 })),
  griddleTop: shared(new THREE.MeshStandardMaterial({ color: 0x2C2C2E, metalness: 0.7, roughness: 0.35 })),
  black: shared(new THREE.MeshStandardMaterial({ color: 0x1C1C1E, roughness: 0.5 })),
  rubber: shared(new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })),
  ceramic: shared(new THREE.MeshStandardMaterial({ color: 0xE6E1D6, roughness: 0.32 })),
  glass: shared(new THREE.MeshPhysicalMaterial({ color: 0xDDEEF2, roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.32, metalness: 0 })),
  frost: shared(new THREE.MeshStandardMaterial({ color: 0xE8F4F8, roughness: 0.3, transparent: true, opacity: 0.55 })),
  wood: shared(new THREE.MeshStandardMaterial({ color: 0xB9844E, roughness: 0.6 })),
  butcher: shared(new THREE.MeshStandardMaterial({ color: 0xB57D45, roughness: 0.62 })),
  oil: shared(new THREE.MeshStandardMaterial({ color: 0xD9A030, roughness: 0.05, metalness: 0.1, emissive: 0x4A3000, emissiveIntensity: 0.35, transparent: true, opacity: 0.55 })),
  water: shared(new THREE.MeshStandardMaterial({ color: 0x8FC4D8, roughness: 0.05, transparent: true, opacity: 0.7 })),
  paper: shared(new THREE.MeshStandardMaterial({ color: 0xF7F3EA, roughness: 0.85 })),
  cream: paint(C.cream), cherry: paint(C.cherry, 0.35), teal: paint(C.teal, 0.4), mustard: paint(C.mustard, 0.4),
};
export const emissive = (color, intensity = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });

// ---- geometry helpers (all return the mesh) ------------------------------------
const toMat = (m) => (m instanceof THREE.Material ? m : paint(m));
export function rbox(parent, w, h, d, m, x = 0, y = 0, z = 0, r = null) {
  // softer edges everywhere (r = 0 keeps a box crisp, e.g. walls)
  const soft = Math.min(0.05, Math.min(w, h, d) * 0.28);
  const rad = r === 0 ? 0 : Math.max(r ?? 0, soft);
  const geo = rad > 0.002 ? new RoundedBoxGeometry(w, h, d, rad > 0.025 ? 4 : 2, rad) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, toMat(m));
  mesh.position.set(x, y + h / 2, z); mesh.castShadow = mesh.receiveShadow = true;
  parent?.add(mesh); return mesh;
}
export function cyl(parent, rt, rb, h, m, x = 0, y = 0, z = 0, seg = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), toMat(m));
  mesh.position.set(x, y + h / 2, z); mesh.castShadow = mesh.receiveShadow = true;
  parent?.add(mesh); return mesh;
}
export function sph(parent, r, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 16) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))), toMat(m));
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true;
  parent?.add(mesh); return mesh;
}
export function torus(parent, r, tube, m, x = 0, y = 0, z = 0, arc = Math.PI * 2) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 24, arc), toMat(m));
  mesh.position.set(x, y, z); mesh.castShadow = true; parent?.add(mesh); return mesh;
}
export function tube(parent, pts, r, m, seg = 24) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 8, false), toMat(m));
  mesh.castShadow = true; parent?.add(mesh); return mesh;
}
export function lathe(parent, profile, m, x = 0, y = 0, z = 0, seg = 28) {
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([a, b]) => new THREE.Vector2(a, b)), seg), toMat(m));
  mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent?.add(mesh); return mesh;
}
export const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent?.add(g); return g; };
export function knob(parent, x, y, z, m = M.black) { const k = cyl(parent, 0.028, 0.032, 0.03, m, x, y, z, 14); k.rotation.x = Math.PI / 2; cyl(k, 0.005, 0.005, 0.032, M.chrome, 0.018, 0.0, 0, 6); return k; }

export function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { tex, cv, ctx, redraw(fn) { fn(ctx, w, h); tex.needsUpdate = true; } };
}
export function decal(parent, w, h, draw, x, y, z, ry = 0, cw = 256, ch = 128) {
  const t = canvasTex(cw, ch, draw);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t.tex, roughness: 0.5, transparent: true }));
  m.position.set(x, y, z); m.rotation.y = ry; parent?.add(m); return m;
}
function label(ctx, w, h, text, bg, fg, font = 'Bungee') {
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.fillStyle = fg; ctx.font = `bold ${Math.floor(h * 0.55)}px ${font}, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 2);
}

// ---- food ------------------------------------------------------------------------
const BURNT = 0x2E2420;
const lerpC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t))).getHex();
const fm = (c, rough = 0.55) => paint(c, rough);

// how cooked an item looks (0 raw .. 1 done), from its recipe progress
function doneness(item) {
  const r = recipe(item);
  if (!r) return 0;
  const cooks = r.steps.map((s, i) => [s, i]).filter(([s]) => s.cook);
  if (!cooks.length) return 1;
  let d = 0;
  for (const [, i] of cooks) d += i < item.step ? 1 : i === item.step ? Math.min(1, item.p) : 0;
  return d / cooks.length;
}
const prepDone = (item, verb) => { const r = recipe(item); const i = r.steps.findIndex((s) => s.verb === verb); return i >= 0 && item.step > i; };

// detailed downloaded models for a few finished items (filled in by furnish.js once loaded)
export const OVERRIDES = {};
export function itemModel(item) {
  const g = new THREE.Group();
  const d = doneness(item);
  const burnt = item.q?.burnt;
  const col = (raw, done) => (burnt ? BURNT : lerpC(raw, done, d));
  const untouched = item.step === 0 && item.p === 0;
  switch (item.kind) {
    case 'pancakes': {
      if (OVERRIDES.pancakes && !burnt && item.step >= 3 && prepDone(item, 'Add butter & syrup')) { g.add(OVERRIDES.pancakes()); break; }
      if (untouched) { // batter pitcher
        lathe(g, [[0, 0], [0.06, 0], [0.065, 0.02], [0.058, 0.12], [0.065, 0.14], [0.06, 0.145]], M.ceramic);
        cyl(g, 0.056, 0.056, 0.005, fm(0xF2E3BE, 0.2), 0, 0.125);
        torus(g, 0.035, 0.008, M.ceramic, 0.07, 0.08, 0).rotation.y = 0;
        break;
      }
      const n = item.step >= 3 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const pc = lathe(g, [[0, 0], [0.085, 0], [0.092, 0.008], [0.088, 0.02], [0, 0.022]], fm(col(0xF6E7C4, 0xD69A4D), 0.7), 0, i * 0.021);
        pc.rotation.y = i;
      }
      if (n === 1 && item.step === 0 && item.p > 0.5) for (let i = 0; i < 9; i++) sph(g, 0.007, fm(0xE8D2A0), Math.cos(i * 2.4) * 0.05 * ((i % 3) / 3 + 0.4), 0.022, Math.sin(i * 2.4) * 0.05 * ((i % 3) / 3 + 0.4), 1, 0.4, 1, 6);
      if (prepDone(item, 'Add butter & syrup')) {
        rbox(g, 0.035, 0.018, 0.035, fm(0xFFF1A6, 0.3), 0, n * 0.021, 0, 0.005);
        const syr = cyl(g, 0.07, 0.075, 0.004, paint(0x7A3A12, 0.05), 0, n * 0.021 - 0.001); syr.scale.set(1, 1, 0.85);
        for (let i = 0; i < 4; i++) tube(g, [[Math.cos(i * 1.6) * 0.07, n * 0.021, Math.sin(i * 1.6) * 0.06], [Math.cos(i * 1.6) * 0.085, n * 0.021 - 0.02, Math.sin(i * 1.6) * 0.075]], 0.006, paint(0x7A3A12, 0.05), 4);
      }
      break;
    }
    case 'eggs': {
      if (untouched) { // two eggs in a little bowl
        lathe(g, [[0, 0], [0.05, 0], [0.075, 0.04], [0.078, 0.045]], M.ceramic);
        sph(g, 0.03, fm(0xF6EEDF, 0.4), -0.02, 0.05, 0, 0.85, 1.15, 0.85); sph(g, 0.03, fm(0xEBDDC4, 0.4), 0.025, 0.048, 0.01, 0.85, 1.15, 0.85);
        break;
      }
      if (item.style === 'scrambled') {
        for (let i = 0; i < 9; i++) sph(g, 0.03, fm(burnt ? BURNT : lerpC(0xFFE27A, 0xF5C842, d), 0.6), Math.cos(i * 2.2) * 0.045 * (i % 3) / 2, 0.012, Math.sin(i * 2.2) * 0.045 * (i % 3) / 2, 1.2, 0.6, 1, 8);
      } else {
        const white = cyl(g, 0.085, 0.09, 0.01, fm(burnt ? BURNT : lerpC(0xF2F2E8, 0xFFFFFF, d), 0.4), 0, 0, 0, 18); white.scale.set(1, 1, 0.85);
        const yolkC = item.style === 'over easy' ? 0xF8E0A0 : 0xFFB81C;
        sph(g, 0.03, fm(burnt ? 0x4A3010 : yolkC, 0.15), 0.01, 0.012, 0, 1, 0.7, 1, 12);
        if (item.style !== 'over easy') sph(g, 0.024, fm(burnt ? 0x4A3010 : yolkC, 0.15), -0.04, 0.012, 0.03, 1, 0.65, 1, 10);
      }
      if (prepDone(item, 'Season')) for (let i = 0; i < 12; i++) sph(g, 0.002, i % 2 ? M.black : M.ceramic, Math.cos(i) * 0.05, 0.03, Math.sin(i * 1.7) * 0.04, 1, 1, 1, 4);
      break;
    }
    case 'bacon': {
      const c = col(0xF1A0A0, 0xA3412A);
      for (let i = 0; i < 3; i++) {
        const s = grp(g, 0, 0, -0.04 + i * 0.04);
        for (let j = 0; j < 4; j++) { const seg = rbox(s, 0.045, 0.006, 0.03, fm(j % 2 ? c : lerpC(c, 0xFFF0E0, 0.35), 0.45), -0.068 + j * 0.045, Math.sin(j * 1.7 + i) * 0.006 * d, 0, 0.002); seg.rotation.z = Math.sin(j * 2 + i) * 0.15 * d; }
        s.rotation.y = (i - 1) * 0.12;
      }
      if (prepDone(item, 'Drain on paper towel') && item.step < 99) { /* drained: less shiny */ }
      break;
    }
    case 'bread': case 'toast': {
      const c = col(0xF3E3BE, 0xC9873A);
      const slice = (y, rot) => { const s = grp(g, 0, y, 0); rbox(s, 0.1, 0.022, 0.1, fm(c, 0.8), 0, 0, 0, 0.008); rbox(s, 0.108, 0.02, 0.012, fm(burnt ? BURNT : lerpC(0xB98545, 0x7A4A1E, d)), 0, 0.001, -0.052, 0.005); sph(s, 0.05, fm(c, 0.8), 0, 0.012, -0.045, 1, 0.22, 0.25, 10); s.rotation.y = rot; return s; };
      slice(0, 0); slice(0.022, 0.25);
      if (prepDone(item, 'Butter')) rbox(g, 0.028, 0.012, 0.028, fm(0xFFF1A6, 0.25), 0.01, 0.044, 0.005, 0.004);
      break;
    }
    case 'cheese': rbox(g, 0.1, 0.006, 0.1, fm(0xFFC93C, 0.35), 0, 0, 0, 0.002).rotation.y = 0.3; break;
    case 'patty': {
      const p = cyl(g, 0.075, 0.08, 0.026, fm(col(0xC9606A, 0x5A3320), 0.65), 0, 0, 0, 18);
      if (d > 0.4 && !burnt) for (let i = 0; i < 3; i++) rbox(p, 0.13, 0.002, 0.008, fm(0x2A1A10), 0, 0.012, -0.03 + i * 0.03, 0.001).rotation.y = 0.5;
      if (item.cheese) { const ch = rbox(g, 0.13, 0.006, 0.13, fm(burnt ? 0x3A3010 : 0xFFC93C, 0.25), 0, 0.026, 0, 0.002); ch.rotation.y = 0.6; for (let i = 0; i < 4; i++) sph(g, 0.018, fm(0xFFC93C, 0.25), Math.cos(i * 1.57 + 0.6) * 0.08, 0.02, Math.sin(i * 1.57 + 0.6) * 0.08, 1, 0.6, 1, 8); }
      break;
    }
    case 'bun': {
      const c = col(0xF0C27A, 0xC07A30);
      cyl(g, 0.078, 0.075, 0.025, fm(c, 0.6), 0.09, 0, 0, 18);
      const top = sph(g, 0.08, fm(lerpC(0xE7A858, 0xC07A30, d * 0.6), 0.5), -0.09, 0, 0, 1, 0.6, 1, 18);
      for (let i = 0; i < 10; i++) sph(top, 0.006, fm(0xFFF6DC), Math.cos(i * 2.4) * 0.05, 0.065 - (i % 3) * 0.01, Math.sin(i * 2.4) * 0.05, 1, 0.5, 1, 4);
      break;
    }
    case 'cheeseburger': {
      cyl(g, 0.08, 0.077, 0.025, fm(0xD08A3E, 0.6), 0, 0, 0, 18);
      cyl(g, 0.083, 0.085, 0.028, fm(burnt ? BURNT : 0x5A3320, 0.65), 0, 0.025, 0, 18);
      if (!item.q.plain) { const ch = rbox(g, 0.13, 0.006, 0.13, fm(0xFFC93C, 0.25), 0, 0.05, 0, 0.002); ch.rotation.y = 0.6; }
      let y = 0.057;
      if (item.toppings.includes('lettuce')) { const l = cyl(g, 0.095, 0.09, 0.012, fm(0x7CC44E, 0.5), 0, y, 0, 9); l.rotation.y = 0.3; y += 0.01; }
      if (item.toppings.includes('tomato')) { for (let i = 0; i < 2; i++) cyl(g, 0.045, 0.045, 0.01, fm(0xE5372A, 0.3), -0.03 + i * 0.06, y, 0, 14); y += 0.01; }
      if (item.toppings.includes('onion')) { for (let i = 0; i < 2; i++) { const o = torus(g, 0.038, 0.006, fm(0xF4EEF8, 0.4), -0.025 + i * 0.05, y + 0.004, 0); o.rotation.x = Math.PI / 2; } y += 0.008; }
      if (item.toppings.includes('pickles')) { for (let i = 0; i < 3; i++) cyl(g, 0.022, 0.022, 0.006, fm(0x6E9A3A, 0.4), Math.cos(i * 2.1) * 0.04, y, Math.sin(i * 2.1) * 0.04, 12); y += 0.006; }
      if (isDoneItem(item)) {
        const top = sph(g, 0.085, fm(0xD8963E, 0.5), 0, y, 0, 1, 0.62, 1, 18);
        for (let i = 0; i < 12; i++) sph(top, 0.006, fm(0xFFF6DC), Math.cos(i * 2.4) * 0.055, 0.07 - (i % 3) * 0.012, Math.sin(i * 2.4) * 0.055, 1, 0.5, 1, 4);
      }
      break;
    }
    case 'fries': {
      if (untouched) { // frozen bag
        const b = rbox(g, 0.14, 0.2, 0.06, paint(0xEAF2F6, 0.3), 0, 0, 0, 0.02);
        decal(g, 0.12, 0.08, (c, w, h) => label(c, w, h, 'FRIES', '#2F6FBF', '#FFFFFF'), 0, 0.12, 0.032, 0);
        for (let i = 0; i < 5; i++) sph(g, 0.012, paint(0xF2D27A, 0.6), -0.04 + i * 0.02, 0.05, 0.031, 1, 1, 0.3, 6);
        void b; break;
      }
      const inBasket = item.step <= 4;
      if (!inBasket) { // paper carton
        const carton = lathe(g, [[0, 0], [0.04, 0], [0.055, 0.08], [0.056, 0.08]], M.cherry, 0, 0, 0, 4);
        carton.rotation.y = Math.PI / 4; carton.scale.set(1.2, 1, 0.8);
      }
      const c = col(0xF7EFC8, 0xF0B83A);
      for (let i = 0; i < 14; i++) { const f = rbox(g, 0.011, 0.085, 0.011, fm(c, 0.6), -0.035 + (i % 5) * 0.017, inBasket ? 0.0 : 0.035, -0.012 + Math.floor(i / 5) * 0.015, 0.003); f.rotation.set((i % 3 - 1) * 0.25, 0, (i % 4 - 1.5) * 0.18); if (inBasket) f.rotation.z += 1.3; }
      if (prepDone(item, 'Salt')) for (let i = 0; i < 10; i++) sph(g, 0.002, M.ceramic, Math.cos(i * 2) * 0.03, 0.12, Math.sin(i * 3) * 0.02, 1, 1, 1, 4);
      break;
    }
    case 'grilledcheese': {
      const c = col(0xF3E3BE, 0xD99A3E);
      const cut = prepDone(item, 'Cut in half');
      const assembled = item.step >= 1;
      const half = (x, rot, shape) => {
        const h = grp(g, x, 0, 0); h.rotation.y = rot;
        const geo = shape ? new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 }) : null;
        if (geo) { geo.rotateX(-Math.PI / 2); const b = new THREE.Mesh(geo, fm(c, 0.75)); h.add(b); const t = b.clone(); t.position.y = 0.03; h.add(t); const ch = new THREE.Mesh(geo, fm(0xFFC93C, 0.25)); ch.scale.set(1.04, 0.5, 1.04); ch.position.y = 0.02; h.add(ch); }
        return h;
      };
      if (cut) {
        const tri = new THREE.Shape(); tri.moveTo(-0.05, -0.05); tri.lineTo(0.05, -0.05); tri.lineTo(-0.05, 0.05); tri.closePath();
        half(-0.015, 0, tri); half(0.02, Math.PI, tri);
      } else if (assembled) {
        const sq = new THREE.Shape(); sq.moveTo(-0.05, -0.05); sq.lineTo(0.05, -0.05); sq.lineTo(0.05, 0.05); sq.lineTo(-0.05, 0.05); sq.closePath();
        half(0, 0, sq);
      } else { // bread + cheese stacked, not yet buttered
        rbox(g, 0.1, 0.02, 0.1, fm(0xF3E3BE, 0.8), 0, 0, 0, 0.008);
        rbox(g, 0.1, 0.006, 0.1, fm(0xFFC93C, 0.3), 0.004, 0.02, 0.004, 0.002).rotation.y = 0.2;
        rbox(g, 0.1, 0.02, 0.1, fm(0xF3E3BE, 0.8), 0, 0.026, 0, 0.008);
      }
      break;
    }
    case 'milkshake': {
      if (untouched) { // pint of ice cream with a scoop
        cyl(g, 0.05, 0.045, 0.1, paint(0xF4A6B8, 0.4), 0, 0, 0, 18);
        cyl(g, 0.051, 0.051, 0.012, paint(0xFFFFFF, 0.4), 0, 0.1, 0, 18);
        decal(g, 0.07, 0.035, (c, w, h) => label(c, w, h, 'STRAWB.', '#FFFFFF', '#C8262B'), 0, 0.05, 0.05, 0, 256, 128);
        sph(g, 0.035, paint(0xF8C8D4, 0.7), 0, 0.12, 0, 1, 0.8, 1, 12);
        break;
      }
      if (item.step >= 5) { // in the glass
        lathe(g, [[0, 0], [0.04, 0], [0.042, 0.012], [0.03, 0.03], [0.034, 0.09], [0.052, 0.18], [0.055, 0.185]], M.glass);
        lathe(g, [[0, 0.03], [0.03, 0.03], [0.034, 0.09], [0.05, 0.17], [0, 0.17]], paint(burnt ? BURNT : C.pink, 0.35));
        cyl(g, 0.005, 0.005, 0.18, paint(C.cherry, 0.3), 0.02, 0.1, 0.0, 8).rotation.z = -0.25;
        if (prepDone(item, 'Whipped cream & cherry')) { for (let i = 0; i < 3; i++) sph(g, 0.04 - i * 0.01, M.ceramic, 0, 0.18 + i * 0.02, 0, 1, 0.7, 1, 12); sph(g, 0.014, paint(0xD0101A, 0.1), 0, 0.235, 0, 1, 1, 1, 10); }
        if (item.q.messy) for (let i = 0; i < 4; i++) sph(g, 0.012, paint(C.pink, 0.3), Math.cos(i * 1.6) * 0.05, 0.1 + i * 0.02, Math.sin(i * 1.6) * 0.05, 1, 1.6, 1, 6);
      } else { // contents of the blender jar (level rises with milk)
        const lvl = item.step >= 1 ? 0.16 : 0.07;
        cyl(g, 0.07, 0.055, lvl, paint(lerpC(0xF8C8D4, C.pink, d), 0.3), 0, 0, 0, 18);
        if (item.step < 3) sph(g, 0.045, paint(0xF8C8D4, 0.7), 0, lvl, 0, 1, 0.7, 1, 12);
      }
      break;
    }
  }
  if (item.q?.floor) for (let i = 0; i < 6; i++) sph(g, 0.004, paint(0x5A4A3A), Math.cos(i * 2.7) * 0.05, 0.03 + (i % 2) * 0.02, Math.sin(i * 2.7) * 0.05, 1, 1, 1, 4);
  return g;
}
const isDoneItem = (item) => item.step >= (recipe(item)?.steps.length || 0);

// ---- containers ----------------------------------------------------------------
export function plateModel(plate) {
  const g = new THREE.Group();
  lathe(g, [[0, 0], [0.12, 0], [0.13, 0.008], [0.17, 0.02], [0.175, 0.024], [0.168, 0.026], [0.13, 0.014], [0, 0.012]], M.ceramic);
  torus(g, 0.155, 0.003, paint(C.teal, 0.3), 0, 0.022, 0).rotation.x = Math.PI / 2;
  if (plate.dirty) for (let i = 0; i < 5; i++) { const sm = cyl(g, 0.025 + (i % 2) * 0.015, 0.025, 0.002, paint(0x7A5530, 0.9), Math.cos(i * 1.9) * 0.08, 0.014, Math.sin(i * 1.9) * 0.07, 10); sm.scale.set(1.6, 1, 0.8); sm.rotation.y = i; }
  const n = plate.items.length;
  plate.items.forEach((it, i) => {
    const f = itemModel(it);
    const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.6, r = n > 1 ? 0.07 : 0;
    f.position.set(Math.cos(a) * r, 0.014, Math.sin(a) * r);
    f.scale.multiplyScalar(n > 2 ? 0.72 : 0.88);
    g.add(f);
  });
  return g;
}
export function dishStack(n) { const g = new THREE.Group(); for (let i = 0; i < Math.min(n, 10); i++) { const p = plateModel({ items: [], dirty: true }); p.position.set((i % 2) * 0.012, i * 0.026, 0); p.rotation.y = i; g.add(p); } return g; }
export function trayModel() {
  const g = new THREE.Group();
  rbox(g, 0.6, 0.015, 0.44, paint(0x8A4A26, 0.45), 0, 0, 0, 0.006);
  for (const [w, d, x, z] of [[0.6, 0.02, 0, 0.215], [0.6, 0.02, 0, -0.215], [0.02, 0.44, 0.295, 0], [0.02, 0.44, -0.295, 0]]) rbox(g, w, 0.03, d, paint(0x6E3A1C, 0.45), x, 0.0, z, 0.006);
  return g;
}
export function cupModel(cup) {
  const g = new THREE.Group();
  if (OVERRIDES.sodaCup && cup.lid && cup.fill >= 0.8 && cup.fill <= 1.02) { g.add(OVERRIDES.sodaCup()); return g; }
  lathe(g, [[0, 0], [0.04, 0], [0.052, 0.16], [0.055, 0.162], [0.054, 0.165]], paint(0xFFFFFF, 0.6), 0, 0, 0, 22);
  const band = lathe(g, [[0.0425, 0.05], [0.048, 0.11], [0.0485, 0.11], [0.043, 0.05]], paint(C.cherry, 0.5), 0, 0, 0, 22); void band;
  if (cup.fill > 0.02) { const h = Math.min(1, cup.fill) * 0.15; lathe(g, [[0, 0.006], [0.039, 0.006], [0.039 + h * 0.08, 0.006 + h], [0, 0.006 + h]], paint(0x3A1A0E, 0.15)); }
  if (cup.ice) for (let i = 0; i < 5; i++) rbox(g, 0.022, 0.022, 0.022, paint(0xE8F6FA, 0.05, { transparent: true, opacity: 0.8 }), Math.cos(i * 1.3) * 0.022, Math.min(0.14, 0.006 + Math.max(0.03, Math.min(1, cup.fill) * 0.14)) - 0.012, Math.sin(i * 1.3) * 0.022, 0.004).rotation.set(i, i * 2, 0);
  if (cup.lid) { cyl(g, 0.057, 0.057, 0.012, paint(0xFFFFFF, 0.3), 0, 0.162, 0, 22); cyl(g, 0.005, 0.005, 0.12, paint(0xE03A3A, 0.3), 0.012, 0.16, 0, 8).rotation.z = -0.1; }
  if (cup.fill > 1.02) for (let i = 0; i < 6; i++) sph(g, 0.012, paint(0x3A1A0E, 0.1), Math.cos(i) * 0.055, 0.15 - (i % 3) * 0.04, Math.sin(i) * 0.055, 1, 2, 1, 6);
  return g;
}
export function mugModel(mug) {
  const g = new THREE.Group();
  lathe(g, [[0, 0], [0.045, 0], [0.048, 0.005], [0.048, 0.1], [0.044, 0.1], [0.042, 0.012], [0, 0.012]], M.ceramic, 0, 0, 0, 22);
  const h = torus(g, 0.03, 0.009, M.ceramic, 0.055, 0.052, 0, Math.PI * 1.3); h.rotation.z = -Math.PI * 0.65;
  if (mug.p > 0.02) cyl(g, 0.043, 0.043, 0.004, paint(lerpC(0xB08050, 0x2A140A, mug.p), 0.1), 0, 0.012 + mug.p * 0.075, 0, 20);
  return g;
}
export function receiptModel(grime) {
  const g = new THREE.Group();
  rbox(g, 0.09, 0.002, 0.15, paint(lerpC(C.cream, 0x6B5434, grime * 0.9), 0.9), 0, 0, 0, 0.001);
  for (let i = 0; i < 5; i++) rbox(g, 0.06 - (i % 2) * 0.015, 0.001, 0.005, grime > 0.85 ? paint(0x4A3A24) : M.black, -0.005, 0.002, -0.05 + i * 0.022, 0);
  if (grime > 0.25) for (let i = 0; i < 3; i++) cyl(g, 0.018 + grime * 0.02, 0.018, 0.001, paint(0x5A4020, 0.9), (i - 1) * 0.025, 0.003, (i % 2) * 0.04 - 0.02, 10);
  return g;
}
export function extinguisherModel() {
  const g = new THREE.Group();
  lathe(g, [[0, 0], [0.085, 0], [0.09, 0.02], [0.09, 0.38], [0.07, 0.43], [0.03, 0.45], [0, 0.45]], paint(0xD4161C, 0.25));
  cyl(g, 0.022, 0.026, 0.05, M.chrome, 0, 0.45);
  rbox(g, 0.14, 0.02, 0.03, M.black, 0.04, 0.5, 0, 0.008).rotation.z = 0.15;
  const gauge = cyl(g, 0.018, 0.018, 0.01, M.ceramic, 0.03, 0.47, -0.03, 14); gauge.rotation.x = Math.PI / 2;
  tube(g, [[-0.02, 0.48, 0], [-0.08, 0.42, 0.02], [-0.1, 0.25, 0.03], [-0.095, 0.15, 0.0]], 0.012, M.black);
  cyl(g, 0.016, 0.01, 0.06, M.black, -0.095, 0.1, 0.0, 10);
  decal(g, 0.1, 0.12, (c, w, h) => { c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, w, h); c.fillStyle = '#C8262B'; c.font = 'bold 30px Bungee'; c.textAlign = 'center'; c.fillText('FIRE', w / 2, h / 2 - 4); c.font = 'bold 18px Fredoka'; c.fillText('EXT.', w / 2, h / 2 + 24); }, 0, 0.22, -0.091, Math.PI, 128, 128);
  return g;
}
export function tentModel(n) {
  // a folded card standing like an A-frame; the number reads upright on both faces
  const g = new THREE.Group();
  const t = canvasTex(160, 160, (ctx) => { ctx.fillStyle = '#F5EBD3'; ctx.fillRect(0, 0, 160, 160); ctx.strokeStyle = '#C8262B'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, 144, 144); ctx.fillStyle = '#C8262B'; ctx.font = 'bold 104px Bungee, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), 80, 90); });
  const m = new THREE.MeshStandardMaterial({ map: t.tex, roughness: 0.6 });
  const back = new THREE.MeshStandardMaterial({ color: 0xF5EBD3, roughness: 0.6 });
  const H = 0.16, lean = 0.32;
  for (const side of [0, Math.PI]) {
    const face = new THREE.Group(); face.rotation.y = side; g.add(face);
    const card = new THREE.Group(); card.position.z = Math.sin(lean) * H; card.rotation.x = -lean; face.add(card);  // foot out, top leaning in
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.15, H), m); front.position.y = H / 2; card.add(front);
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(0.15, H), back); rear.position.set(0, H / 2, -0.001); rear.rotation.y = Math.PI; card.add(rear);
  }
  return g;
}


// ---- appliances & props (kitchen) ----------------------------------------------------
// griddle: centred at its middle, sitting on the counter top. slots along x.
export function griddleModel(width, slotX, cx) {
  const g = new THREE.Group();
  rbox(g, width + 0.1, 0.1, 0.72, M.steel, 0, -0.1, 0, 0.01);                       // body lip
  rbox(g, width, 0.04, 0.62, M.griddleTop, 0, 0, 0.01, 0.004);                       // cooking plate
  rbox(g, width + 0.1, 0.24, 0.05, M.steel, 0, 0, -0.34, 0.01);                       // backsplash
  rbox(g, 0.05, 0.12, 0.62, M.steel, -width / 2 - 0.03, 0, 0, 0.01); rbox(g, 0.05, 0.12, 0.62, M.steel, width / 2 + 0.03, 0, 0, 0.01);
  rbox(g, width, 0.03, 0.06, M.darkSteel, 0, -0.01, 0.33, 0.01);                     // grease trough
  slotX.forEach((x) => { knob(g, x - cx, -0.06, 0.37); });
  const sp = grp(g, width / 2 - 0.15, 0.04, 0.24); rbox(sp, 0.09, 0.004, 0.07, M.steel, 0, 0, 0, 0.002); rbox(sp, 0.02, 0.012, 0.18, M.black, 0, 0, 0.12, 0.006); sp.rotation.y = 0.4; // spatula
  return g;
}
export function fryerModel(slotX, cx) {
  const g = new THREE.Group();
  // raised vat housing sitting on the counter, with the oil sunk inside
  rbox(g, 1.42, 0.16, 0.72, M.steel, 0, 0, 0, 0.02);
  rbox(g, 1.3, 0.02, 0.58, M.oil, 0, 0.11, 0, 0.004);                                 // oil surface
  for (const [w, d, x, z] of [[1.42, 0.07, 0, 0.325], [1.42, 0.07, 0, -0.325], [0.07, 0.72, 0.675, 0], [0.07, 0.72, -0.675, 0], [0.05, 0.6, 0, 0]]) rbox(g, w, 0.05, d, M.steel, x, 0.15, z, 0.012);
  rbox(g, 1.42, 0.34, 0.08, M.steel, 0, 0.15, -0.33, 0.015);                           // back panel
  decal(g, 0.56, 0.12, (c, w, h) => { c.fillStyle = '#2A2A2E'; c.fillRect(0, 0, w, h); c.fillStyle = '#E7B23B'; c.font = 'bold 64px Bungee'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FRY-O-MATIC', w / 2, h / 2 + 4); }, 0, 0.4, -0.288, 0, 512, 110);
  slotX.forEach((x) => { knob(g, x - cx, 0.26, -0.285); });
  for (const sx of [-0.6, 0.6]) sph(g, 0.014, emissive(0xFF4020, 1.2), sx, 0.42, -0.285, 1, 1, 1, 8);
  return g;
}
let WIRE = null;
export function fryBasket() {
  if (!WIRE) {
    const t = canvasTex(64, 64, (c) => { c.clearRect(0, 0, 64, 64); c.strokeStyle = '#C9CED2'; c.lineWidth = 5; for (let i = 0; i <= 64; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 64); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(64, i); c.stroke(); } });
    t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.repeat.set(4, 2);
    WIRE = new THREE.MeshStandardMaterial({ map: t.tex, alphaTest: 0.5, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }); WIRE.userData.shared = true;
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.44, 1, 1, 1), WIRE); body.position.y = 0.07; g.add(body);
  rbox(g, 0.42, 0.012, 0.46, M.chrome, 0, 0.135, 0, 0.004);
  tube(g, [[0, 0.14, 0.22], [0, 0.2, 0.3], [0, 0.24, 0.42]], 0.01, M.chrome, 8);
  const h = cyl(g, 0.018, 0.018, 0.12, M.black, 0, 0.0, 0, 10); h.position.set(0, 0.26, 0.47); h.rotation.x = Math.PI / 2 - 0.4;
  return g;
}
export function toasterModel() {
  const g = new THREE.Group();
  rbox(g, 0.62, 0.24, 0.3, M.chrome, 0, 0, 0, 0.09);
  rbox(g, 0.6, 0.02, 0.28, M.black, 0, -0.005, 0, 0.01);
  for (const x of [-0.15, 0.15]) rbox(g, 0.2, 0.02, 0.05, M.black, x, 0.232, 0, 0.01);         // slots
  for (const x of [-0.15, 0.15]) rbox(g, 0.05, 0.03, 0.04, M.black, x, 0.12, 0.16, 0.012);     // levers
  knob(g, 0.27, 0.06, 0.16);
  rbox(g, 0.62, 0.012, 0.302, paint(C.cherry, 0.3), 0, 0.07, 0, 0.005);
  return g;
}
export function blenderModel() {
  const g = new THREE.Group();
  lathe(g, [[0, 0], [0.12, 0], [0.12, 0.02], [0.1, 0.14], [0.085, 0.16], [0, 0.16]], paint(C.cherry, 0.3));
  for (let i = 0; i < 3; i++) { const b = rbox(g, 0.03, 0.02, 0.02, i === 1 ? M.chrome : M.black, -0.04 + i * 0.04, 0.07, 0.105, 0.006); b.rotation.x = -0.35; }
  lathe(g, [[0.07, 0.16], [0.075, 0.16], [0.095, 0.46], [0.1, 0.47], [0.093, 0.47], [0.07, 0.17]], M.glass);
  tube(g, [[0.09, 0.42], [0.14, 0.4], [0.14, 0.24], [0.08, 0.22]].map(([x, y]) => [x, y, 0]), 0.012, M.glass, 10);
  cyl(g, 0.02, 0.02, 0.02, M.steel, 0, 0.16);
  return g;
}
export function blenderLid() { const g = new THREE.Group(); cyl(g, 0.102, 0.098, 0.03, M.black, 0, 0, 0, 22); cyl(g, 0.03, 0.03, 0.02, M.black, 0, 0.03, 0, 14); return g; }

export function fridgeModel() { // faces +x
  const g = new THREE.Group();
  rbox(g, 0.85, 1.9, 1.05, paint(0xBFE3D5, 0.35), 0, 0, 0, 0.12);
  rbox(g, 0.04, 1.08, 0.98, paint(0xC9EADD, 0.3), 0.43, 0.08, 0, 0.03);
  rbox(g, 0.04, 0.62, 0.98, paint(0xC9EADD, 0.3), 0.43, 1.22, 0, 0.03);
  for (const [y, h] of [[0.35, 0.55], [1.32, 0.38]]) { rbox(g, 0.06, h, 0.05, M.chrome, 0.48, y, -0.38, 0.02); }
  decal(g, 0.32, 0.1, (c, w, h) => label(c, w, h, 'Frostee', null, '#C8262B', 'Bungee'), 0.452, 1.72, 0, Math.PI / 2, 256, 80);
  for (const z of [-0.4, 0.4]) cyl(g, 0.04, 0.05, 0.05, M.chrome, 0, -0.04, z, 12);
  return g;
}
export function freezerModel() { // reach-in, faces +z
  const g = new THREE.Group();
  rbox(g, 1.5, 2.15, 0.95, M.steel, 0, 0, 0, 0.04);
  for (const x of [-0.37, 0.37]) {
    rbox(g, 0.7, 1.7, 0.04, M.darkSteel, x, 0.3, 0.48, 0.02);
    rbox(g, 0.6, 1.5, 0.02, M.frost, x, 0.4, 0.5, 0.01);
    rbox(g, 0.04, 0.5, 0.05, M.chrome, x + (x < 0 ? 0.28 : -0.28), 0.9, 0.53, 0.02);
    for (let i = 0; i < 4; i++) rbox(g, 0.56, 0.015, 0.4, M.steel, x, 0.55 + i * 0.36, 0.25, 0.005);
    for (let i = 0; i < 3; i++) rbox(g, 0.12, 0.14, 0.1, i % 2 ? paint(0x2F6FBF, 0.4) : paint(C.pink, 0.4), x - 0.15 + i * 0.15, 0.565 + 0.36, 0.25, 0.02);
  }
  decal(g, 0.6, 0.14, (c, w, h) => label(c, w, h, 'FREEZER', '#3FB8AF', '#1B1B1B'), 0, 2.0, 0.476, 0, 512, 120);
  return g;
}
export function breadboxModel() {
  const g = new THREE.Group();
  rbox(g, 0.5, 0.06, 0.34, M.wood, 0, 0, 0, 0.015);
  const dome = sph(g, 0.25, paint(C.teal, 0.35), 0, 0.06, 0, 1, 0.72, 0.68, 22); void dome;
  rbox(g, 0.18, 0.025, 0.04, M.chrome, 0, 0.1, 0.18, 0.01);
  decal(g, 0.22, 0.06, (c, w, h) => label(c, w, h, 'BREAD', null, '#F5EBD3'), 0, 0.16, 0.172, 0, 256, 70);
  return g;
}
export function cuttingBoard() {
  const g = new THREE.Group();
  rbox(g, 0.55, 0.025, 0.4, M.butcher, 0, 0, 0, 0.012);
  for (let i = 0; i < 6; i++) rbox(g, 0.5, 0.0015, 0.006, paint(0xC08F52, 0.6), 0, 0.025, -0.15 + i * 0.06, 0);
  return g;
}
export function prepProps() {
  const g = new THREE.Group();
  // condiments, salt & pepper, paper towels, whipped cream
  const bottle = (x, z, col, cap) => { lathe(g, [[0, 0], [0.032, 0], [0.034, 0.13], [0.02, 0.16], [0, 0.16]], paint(col, 0.25), x, 0, z, 18); cyl(g, 0.012, 0.006, 0.04, paint(cap, 0.3), x, 0.16, z, 10); };
  bottle(0, 0, 0xC8262B, 0xFFFFFF); bottle(0.08, 0.02, 0xF2C230, 0xFFFFFF);
  lathe(g, [[0, 0], [0.022, 0], [0.024, 0.07], [0.016, 0.085], [0, 0.088]], M.glass, 0.17, 0, 0.03);
  cyl(g, 0.017, 0.022, 0.025, M.chrome, 0.17, 0.068, 0.03, 14);
  lathe(g, [[0, 0], [0.022, 0], [0.024, 0.07], [0.016, 0.085], [0, 0.088]], paint(0x333333, 0.3), 0.23, 0, 0.03);
  const roll = cyl(g, 0.06, 0.06, 0.24, M.paper, 0.45, 0.07, 0, 20); roll.rotation.z = Math.PI / 2; roll.position.y = 0.07;
  rbox(g, 0.02, 0.15, 0.02, M.chrome, 0.32, 0, 0, 0.005); rbox(g, 0.02, 0.15, 0.02, M.chrome, 0.58, 0, 0, 0.005);
  cyl(g, 0.03, 0.03, 0.17, M.chrome, 0.7, 0, 0, 16); cyl(g, 0.012, 0.02, 0.04, paint(0xFFFFFF, 0.3), 0.7, 0.17, 0, 10);
  return g;
}
export function hoodModel(w) {
  const g = new THREE.Group();
  rbox(g, w, 0.45, 0.95, paint(0xA3AAAE, 0.55), 0, 0, 0, 0.02);
  for (let i = 0; i < Math.floor(w / 0.55); i++) {
    const f = rbox(g, 0.5, 0.012, 0.42, paint(0x9AA1A6, 0.4), -w / 2 + 0.3 + i * 0.55, -0.005, 0.05, 0.004);
    for (let j = 0; j < 6; j++) rbox(f, 0.48, 0.004, 0.012, paint(0x7F868B, 0.5), 0, -0.006, -0.18 + j * 0.07, 0);
  }
  for (const x of [-w / 3, w / 3]) cyl(g, 0.06, 0.06, 0.02, emissive(0xFFF2D0, 1.0), x, -0.02, 0.38, 14);
  return g;
}
export function sinkModel() { // on counter, faces -x (into kitchen)
  const g = new THREE.Group();
  for (const z of [-0.27, 0.27]) {
    rbox(g, 0.6, 0.03, 0.5, M.steel, 0, -0.01, z, 0.01);
    rbox(g, 0.52, 0.02, 0.42, M.darkSteel, 0, -0.005, z, 0.01);
    rbox(g, 0.5, 0.004, 0.4, M.water, 0, 0.012, z, 0.002);
  }
  rbox(g, 0.05, 0.05, 1.06, M.steel, 0.29, 0, 0, 0.01);
  tube(g, [[0.27, 0.02, 0], [0.27, 0.35, 0], [0.18, 0.42, 0], [0.08, 0.36, 0]], 0.018, M.chrome, 16);
  for (const z of [-0.08, 0.08]) knob(g, 0.27, 0.06, z, paint(z < 0 ? 0xD02020 : 0x2060D0, 0.3)).rotation.y = Math.PI / 2;
  // drying rack + sponge
  rbox(g, 0.05, 0.03, 0.08, paint(0xF2D23C, 0.8), -0.2, 0.02, 0.0, 0.01);
  return g;
}
export function dishRackModel() {
  const g = new THREE.Group();
  rbox(g, 0.62, 0.02, 0.46, M.chrome, 0, 0, 0, 0.006);
  for (let i = 0; i < 12; i++) { const w = cyl(g, 0.004, 0.004, 0.18, M.chrome, -0.29, 0.02, -0.21 + i * 0.038, 6); void w; const w2 = cyl(g, 0.004, 0.004, 0.18, M.chrome, 0.29, 0.02, -0.21 + i * 0.038, 6); void w2; }
  rbox(g, 0.62, 0.012, 0.012, M.chrome, 0, 0.19, -0.23, 0.004); rbox(g, 0.62, 0.012, 0.012, M.chrome, 0, 0.19, 0.23, 0.004);
  return g;
}
export function printerModel() {
  const g = new THREE.Group();
  rbox(g, 0.3, 0.16, 0.32, paint(0x34353A, 0.45), 0, 0, 0, 0.04);
  rbox(g, 0.26, 0.05, 0.16, paint(0x4A4B52, 0.45), 0, 0.14, 0.04, 0.03);
  rbox(g, 0.2, 0.012, 0.02, M.black, 0, 0.17, -0.08, 0.004);
  rbox(g, 0.05, 0.02, 0.03, paint(0x4A4B52, 0.4), 0.09, 0.16, 0.13, 0.008);
  return g;
}
export function railModel(w) {
  const g = new THREE.Group();
  rbox(g, w, 0.04, 0.05, M.chrome, 0, 0, 0, 0.012);
  for (let i = 0; i < 4; i++) sph(g, 0.012, M.darkSteel, -w / 2 + 0.15 + i * (w - 0.3) / 3, 0.02, -0.03, 1, 1, 1, 8);
  return g;
}
export function bellModel() {
  const g = new THREE.Group();
  cyl(g, 0.07, 0.08, 0.018, paint(0x2E2E30, 0.4), 0, 0, 0, 20);
  sph(g, 0.06, M.chrome, 0, 0.018, 0, 1, 0.82, 1, 20);
  cyl(g, 0.007, 0.007, 0.03, M.chrome, 0, 0.06, 0, 8); sph(g, 0.012, M.chrome, 0, 0.092, 0, 1, 0.6, 1, 10);
  return g;
}
export function trashModel(col = M.darkSteel) {
  const g = new THREE.Group();
  lathe(g, [[0, 0], [0.22, 0], [0.26, 0.72], [0.27, 0.74], [0, 0.74]], col);
  lathe(g, [[0, 0.74], [0.275, 0.74], [0.27, 0.78], [0.12, 0.8], [0, 0.8]], M.steel);
  rbox(g, 0.14, 0.04, 0.04, M.black, 0, 0.8, 0, 0.015);
  return g;
}
export function breakerModel() {
  const g = new THREE.Group();
  rbox(g, 0.1, 0.62, 0.46, paint(0x7D8186, 0.45), 0.04, 0, 0, 0.02);
  rbox(g, 0.02, 0.56, 0.4, paint(0x9AA0A6, 0.4), 0.09, 0.03, 0, 0.01);
  decal(g, 0.18, 0.06, (c, w, h) => label(c, w, h, '⚡ DANGER', '#E7B23B', '#1B1B1B'), 0.101, 0.5, 0, Math.PI / 2, 256, 80);
  return g;
}
// wall-mounted kitchen display: body centred on the group origin, screen faces -z
export function tvModel() {
  const g = new THREE.Group();
  rbox(g, 1.34, 0.8, 0.07, paint(0x1A1A1D, 0.35), 0, -0.4, 0, 0.03);          // bezel
  rbox(g, 0.5, 0.3, 0.06, paint(0x2A2A2E, 0.5), 0, -0.15, 0.06, 0.02);         // back box
  rbox(g, 0.08, 0.08, 0.12, M.darkSteel, 0, -0.04, 0.12, 0.02);                // wall arm
  rbox(g, 0.3, 0.3, 0.02, M.darkSteel, 0, -0.15, 0.17, 0.01);                  // wall plate
  sph(g, 0.008, emissive(0x33DD77, 1.4), 0.6, -0.37, -0.037, 1, 1, 1, 8);      // power light
  return g;
}

// ---- dining room props ------------------------------------------------------------------
export function coffeeMachineModel() {
  const g = new THREE.Group();
  rbox(g, 0.46, 0.06, 0.34, M.steel, 0, 0, 0, 0.02);                // drip tray
  rbox(g, 0.46, 0.62, 0.14, M.steel, 0, 0, -0.1, 0.04);              // tower
  rbox(g, 0.46, 0.14, 0.34, paint(C.cherry, 0.3), 0, 0.5, 0, 0.04);  // head
  cyl(g, 0.05, 0.04, 0.05, M.black, 0, 0.45, 0.06, 16);              // brew basket
  rbox(g, 0.12, 0.05, 0.02, M.black, 0.14, 0.52, 0.17, 0.01);
  const l = sph(g, 0.012, emissive(0x33DD77, 1.2), 0.17, 0.6, 0.17, 1, 1, 1, 8); void l;
  // spare carafe on a warmer
  cyl(g, 0.06, 0.06, 0.012, M.black, 0.32, 0, 0.03, 18);
  lathe(g, [[0, 0], [0.055, 0], [0.065, 0.06], [0.05, 0.13], [0.04, 0.15], [0, 0.15]], M.glass, 0.32, 0.012, 0.03);
  lathe(g, [[0, 0], [0.054, 0], [0.062, 0.05], [0, 0.05]], paint(0x2A140A, 0.1), 0.32, 0.014, 0.03);
  return g;
}
export function sodaFountainModel() {
  const g = new THREE.Group();
  rbox(g, 0.7, 0.04, 0.4, M.steel, 0, 0, 0, 0.01);                   // drip tray
  for (let i = 0; i < 6; i++) rbox(g, 0.66, 0.004, 0.01, M.darkSteel, 0, 0.04, -0.15 + i * 0.06, 0);
  rbox(g, 0.7, 0.72, 0.18, M.steel, 0, 0, -0.12, 0.04);
  rbox(g, 0.7, 0.2, 0.2, paint(C.cherry, 0.3), 0, 0.5, -0.06, 0.04);
  decal(g, 0.6, 0.14, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#C8262B'); gr.addColorStop(1, '#E04048'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = '#F5EBD3'; c.font = 'italic bold 64px Fredoka'; c.textAlign = 'center'; c.fillText('Fizzy Pop', w / 2, 86); }, 0, 0.6, 0.045, 0, 512, 120);
  for (let i = 0; i < 3; i++) {
    const x = -0.2 + i * 0.2;
    cyl(g, 0.025, 0.02, 0.06, M.chrome, x, 0.42, 0.06, 14);
    const lever = rbox(g, 0.03, 0.12, 0.02, M.black, x, 0.3, 0.09, 0.01); lever.rotation.x = 0.15;
    rbox(g, 0.1, 0.06, 0.01, [paint(0x3A1A0E), paint(0xE04A2A), paint(0x9ACD32)][i], x, 0.62, -0.025, 0.004);
  }
  return g;
}
export function cupStackModel() {
  const g = new THREE.Group();
  cyl(g, 0.065, 0.07, 0.03, M.steel, 0, 0, 0, 18);
  for (let i = 0; i < 9; i++) lathe(g, [[0.04, 0], [0.052, 0.16], [0.055, 0.165]], i % 2 ? paint(0xFFFFFF, 0.6) : paint(0xF4F0EA, 0.6), 0, 0.03 + i * 0.02, 0, 18);
  return g;
}
export function mugRackModel() {
  const g = new THREE.Group();
  rbox(g, 0.4, 0.02, 0.28, M.wood, 0, 0, 0, 0.008);
  for (let i = 0; i < 6; i++) { const m = mugModel({ p: 0 }); m.position.set(-0.13 + (i % 3) * 0.13, (i > 2 ? 0.105 : 0.02), -0.06 + (i > 2 ? 0.0 : 0.11)); m.rotation.set(i > 2 ? Math.PI : 0, i, 0); if (i > 2) m.position.y += 0.1; g.add(m); }
  return g;
}
export function iceBinModel() {
  const g = new THREE.Group();
  rbox(g, 0.42, 0.16, 0.34, M.steel, 0, 0, 0, 0.03);
  rbox(g, 0.36, 0.02, 0.28, paint(0xDDF2F8, 0.15), 0, 0.14, 0, 0.01);
  const ice = paint(0xEAF8FC, 0.05, { transparent: true, opacity: 0.85 });
  for (let i = 0; i < 16; i++) { const c = rbox(g, 0.035, 0.035, 0.035, ice, -0.14 + (i % 6) * 0.055, 0.15, -0.09 + Math.floor(i / 6) * 0.08, 0.006); c.rotation.set(i, i * 1.7, 0); }
  const sc = grp(g, 0.12, 0.17, 0.06); rbox(sc, 0.08, 0.03, 0.06, M.chrome, 0, 0, 0, 0.01); rbox(sc, 0.1, 0.02, 0.02, M.black, 0.08, 0.01, 0, 0.008); sc.rotation.y = 0.5;
  return g;
}
export function lidDispenserModel() {
  const g = new THREE.Group();
  rbox(g, 0.36, 0.2, 0.24, M.steel, 0, 0, 0, 0.03);
  for (let i = 0; i < 6; i++) cyl(g, 0.058, 0.058, 0.008, paint(0xFFFFFF, 0.4), -0.08, 0.2 + i * 0.01, 0, 20);
  for (let i = 0; i < 10; i++) { const s = cyl(g, 0.005, 0.005, 0.22, i % 2 ? paint(0xE03A3A, 0.3) : paint(0xFFFFFF, 0.3), 0.1 + (i % 3) * 0.012, 0.2, -0.02 + (i % 4) * 0.012, 6); s.rotation.z = (i - 5) * 0.03; }
  cyl(g, 0.045, 0.045, 0.2, M.glass, 0.11, 0.2, 0, 16);
  return g;
}
export function registerModel() {
  const g = new THREE.Group();
  rbox(g, 0.5, 0.12, 0.42, M.mustard, 0, 0, 0, 0.03);
  const top = rbox(g, 0.5, 0.16, 0.26, M.mustard, 0, 0.12, -0.06, 0.04); top.rotation.x = -0.25;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) rbox(g, 0.045, 0.02, 0.04, c === 3 ? paint(C.cherry, 0.3) : M.ceramic, -0.12 + c * 0.075, 0.13 + r * 0.025, 0.04 + r * -0.045, 0.008).rotation.x = -0.25;
  rbox(g, 0.44, 0.07, 0.03, M.chrome, 0, 0.0, 0.2, 0.01);    // drawer
  rbox(g, 0.1, 0.02, 0.02, M.black, 0, 0.03, 0.22, 0.008);
  return g;
}
export function jukeboxModel() {
  const g = new THREE.Group();
  rbox(g, 0.62, 1.0, 0.85, paint(0x8A3A1E, 0.35), 0, 0, 0, 0.06);
  const arch = cyl(g, 0.42, 0.42, 0.62, paint(0x8A3A1E, 0.35), 0, 0.98, 0, 32); arch.rotation.z = Math.PI / 2; arch.position.y = 1.0; arch.scale.set(1, 1, 1.0);
  const glass = cyl(g, 0.36, 0.36, 0.64, M.glass, 0, 1.0, 0, 32); glass.rotation.z = Math.PI / 2; glass.position.y = 1.0;
  const tubes = [];
  for (let i = 0; i < 2; i++) { const t = torus(g, 0.4, 0.035, emissive(0xFFB040, 0.8), (i ? 1 : -1) * 0.3, 1.0, 0, Math.PI); t.rotation.y = Math.PI / 2; tubes.push(t); }
  for (let i = 0; i < 2; i++) { const t = rbox(g, 0.05, 0.9, 0.05, emissive(0xFFB040, 0.8), (i ? 1 : -1) * 0.3, 0.05, 0.4, 0.02); tubes.push(t); }
  rbox(g, 0.05, 0.4, 0.6, paint(0x202024, 0.4), -0.31, 0.45, 0, 0.02);   // record window
  for (let i = 0; i < 5; i++) { const rec = cyl(g, 0.16, 0.16, 0.008, M.black, -0.33, 0.62, -0.2 + i * 0.1, 24); rec.rotation.z = Math.PI / 2; }
  rbox(g, 0.05, 0.2, 0.6, M.chrome, -0.31, 0.1, 0, 0.02);                // grille
  for (let i = 0; i < 6; i++) rbox(g, 0.055, 0.008, 0.56, M.darkSteel, -0.31, 0.12 + i * 0.03, 0, 0);
  g.userData.tubes = tubes;
  return g;
}
export function napkinHolder() {
  const g = new THREE.Group();
  rbox(g, 0.12, 0.09, 0.06, M.chrome, 0, 0, 0, 0.01);
  rbox(g, 0.1, 0.05, 0.04, M.paper, 0, 0.07, 0, 0.003);
  const bottle = (x, col) => { lathe(g, [[0, 0], [0.022, 0], [0.024, 0.1], [0.014, 0.12], [0, 0.12]], paint(col, 0.25), x, 0, 0.0, 14); cyl(g, 0.008, 0.004, 0.03, paint(0xFFFFFF, 0.3), x, 0.12, 0.0, 8); };
  bottle(0.11, 0xC8262B); bottle(0.16, 0xF2C230);
  return g;
}
export function boothModel() { // seat at origin, back toward +z
  const g = new THREE.Group();
  rbox(g, 1.3, 0.38, 0.52, paint(0x8A1418, 0.5), 0, 0, 0.05, 0.03);
  rbox(g, 1.28, 0.1, 0.5, paint(C.cherry, 0.32), 0, 0.36, 0.05, 0.05);
  rbox(g, 1.3, 0.78, 0.18, paint(0x8A1418, 0.5), 0, 0.4, 0.3, 0.04);
  for (let i = 0; i < 3; i++) rbox(g, 0.4, 0.6, 0.08, paint(C.cherry, 0.32), -0.42 + i * 0.42, 0.5, 0.22, 0.05);
  rbox(g, 1.34, 0.04, 0.22, M.chrome, 0, 1.17, 0.3, 0.015);
  return g;
}
export function tableModel() {
  const g = new THREE.Group();
  rbox(g, 1.2, 0.04, 0.8, paint(0xE4D6BA, 0.72), 0, 0.72, 0, 0.03);
  rbox(g, 1.22, 0.035, 0.82, M.chrome, 0, 0.69, 0, 0.015);
  cyl(g, 0.045, 0.06, 0.66, M.chrome, 0, 0.03, 0, 16);
  lathe(g, [[0, 0], [0.28, 0], [0.26, 0.02], [0.06, 0.04], [0, 0.04]], M.chrome);
  return g;
}
export function stoolModel() {
  const g = new THREE.Group();
  cyl(g, 0.05, 0.05, 0.66, M.chrome, 0, 0, 0, 14);
  lathe(g, [[0, 0], [0.2, 0], [0.18, 0.02], [0, 0.03]], M.chrome);
  torus(g, 0.14, 0.012, M.chrome, 0, 0.25, 0).rotation.x = Math.PI / 2;
  cyl(g, 0.19, 0.17, 0.08, paint(C.cherry, 0.3), 0, 0.66, 0, 24);
  torus(g, 0.18, 0.012, M.chrome, 0, 0.68, 0).rotation.x = Math.PI / 2;
  return g;
}
export { MENU };

// ---- floor-plan furniture -----------------------------------------------------------
export function chairModel(color = C.cherry) { // seat faces -z (you sit looking toward -z)
  const g = new THREE.Group();
  for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) cyl(g, 0.014, 0.012, 0.44, M.chrome, x, 0, z, 8);
  rbox(g, 0.44, 0.07, 0.42, paint(color, 0.35), 0, 0.42, 0, 0.03);
  rbox(g, 0.44, 0.36, 0.06, paint(color, 0.35), 0, 0.5, 0.2, 0.03);
  rbox(g, 0.46, 0.025, 0.08, M.chrome, 0, 0.86, 0.2, 0.01);
  for (const x of [-0.19, 0.19]) cyl(g, 0.012, 0.012, 0.42, M.chrome, x, 0.45, 0.22, 8);
  return g;
}
export function roundTableModel() {
  const g = new THREE.Group();
  cyl(g, 0.5, 0.5, 0.04, paint(0xE4D6BA, 0.72), 0, 0.72, 0, 36);
  torus(g, 0.5, 0.018, M.chrome, 0, 0.74, 0).rotation.x = Math.PI / 2;
  cyl(g, 0.045, 0.06, 0.68, M.chrome, 0, 0.03, 0, 16);
  lathe(g, [[0, 0], [0.3, 0], [0.28, 0.02], [0.06, 0.04], [0, 0.04]], M.chrome);
  return g;
}
export function squareTableModel() {
  const g = new THREE.Group();
  rbox(g, 0.75, 0.04, 0.75, paint(0xE4D6BA, 0.72), 0, 0.72, 0, 0.03);
  rbox(g, 0.77, 0.035, 0.77, M.chrome, 0, 0.69, 0, 0.015);
  cyl(g, 0.045, 0.06, 0.66, M.chrome, 0, 0.03, 0, 16);
  lathe(g, [[0, 0], [0.26, 0], [0.24, 0.02], [0.06, 0.04], [0, 0.04]], M.chrome);
  return g;
}
export function hostStandModel(w, d) { // faces +x (customers stand on the +x side)
  const g = new THREE.Group();
  rbox(g, d, 1.0, w, M.wood, 0, 0, 0, 0.03);
  rbox(g, d + 0.06, 0.05, w + 0.06, paint(0xF4ECDA, 0.25), 0, 1.0, 0, 0.02);
  rbox(g, 0.02, 0.8, w - 0.1, paint(C.cherry, 0.35), d / 2 + 0.005, 0.1, 0, 0.01);
  rbox(g, 0.025, 0.04, w - 0.1, M.chrome, d / 2 + 0.01, 0.5, 0, 0.01);
  return g;
}
export function toiletModel() { // faces -x (sit looking toward -x)
  const g = new THREE.Group();
  lathe(g, [[0, 0], [0.13, 0], [0.11, 0.2], [0.18, 0.36], [0.2, 0.4], [0, 0.4]], M.ceramic, -0.12, 0, 0);
  const seat = torus(g, 0.16, 0.025, M.ceramic, -0.15, 0.42, 0); seat.rotation.x = Math.PI / 2; seat.scale.set(1.15, 0.9, 1);
  rbox(g, 0.2, 0.42, 0.42, M.ceramic, 0.12, 0.35, 0, 0.05);
  rbox(g, 0.05, 0.02, 0.08, M.chrome, 0.06, 0.73, -0.14, 0.008);
  return g;
}
export function washbasinModel() { // on a wall, faces -z
  const g = new THREE.Group();
  lathe(g, [[0, 0], [0.12, 0], [0.22, 0.12], [0.24, 0.14], [0, 0.14]], M.ceramic, 0, 0.7, -0.2);
  cyl(g, 0.05, 0.07, 0.7, M.ceramic, 0, 0, -0.08, 16);
  tube(g, [[0, 0.9, 0.0], [0, 1.02, -0.05], [0, 0.98, -0.16]], 0.014, M.chrome, 8);
  rbox(g, 0.5, 0.65, 0.02, paint(0xCFE3EA, 0.02, { metalness: 0.9 }), 0, 1.15, 0.0, 0.01);
  rbox(g, 0.54, 0.69, 0.015, M.chrome, 0, 1.13, 0.012, 0.01);
  return g;
}
export function doorModel(w = 0.8, color = 0x7A4A2A, sign = '') {
  const g = new THREE.Group();
  rbox(g, w, 2.05, 0.05, paint(color, 0.5), w / 2, 0, 0, 0.015);
  cyl(g, 0.03, 0.03, 0.07, M.chrome, w - 0.08, 1.0, 0, 12).rotation.x = Math.PI / 2;
  if (sign) decal(g, 0.3, 0.3, (c, cw, ch) => { c.fillStyle = '#F5EBD3'; c.beginPath(); c.arc(cw / 2, ch / 2, cw / 2 - 4, 0, 7); c.fill(); c.fillStyle = '#1F3A4D'; c.font = 'bold 54px Bungee'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(sign, cw / 2, ch / 2 + 3); }, w / 2, 1.55, -0.03, Math.PI, 128, 128);
  return g;
}
export function mopBucketModel() {
  const g = new THREE.Group();
  lathe(g, [[0, 0], [0.18, 0], [0.2, 0.3], [0, 0.3]], paint(0xF2C230, 0.4));
  cyl(g, 0.012, 0.012, 1.3, M.wood, 0.05, 0.1, 0.05, 8).rotation.z = 0.2;
  return g;
}

// mop: origin at the grip, handle runs down -y to the head
export function mopModel() {
  const g = new THREE.Group();
  cyl(g, 0.016, 0.016, 1.25, M.wood, 0, -1.25, 0, 10);
  cyl(g, 0.025, 0.03, 0.06, M.darkSteel, 0, -1.28, 0, 10);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const strand = cyl(g, 0.012, 0.01, 0.2, paint(0xEDE6D3, 0.9), Math.cos(a) * 0.05, -1.45, Math.sin(a) * 0.05, 5);
    strand.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
  }
  return g;
}
export function bucketModel() {
  const g = new THREE.Group();
  lathe(g, [[0, 0], [0.2, 0], [0.23, 0.32], [0.24, 0.33], [0, 0.33]], paint(0xF2C230, 0.4));
  cyl(g, 0.2, 0.2, 0.01, paint(0x8AA4AE, 0.1, { transparent: true, opacity: 0.8 }), 0, 0.26, 0, 20);
  rbox(g, 0.18, 0.2, 0.1, paint(0x8C7A1A, 0.5), 0.18, 0.28, 0, 0.02);    // wringer
  torus(g, 0.22, 0.008, M.darkSteel, 0, 0.42, 0, Math.PI).rotation.y = Math.PI / 2;
  return g;
}

export function plungerModel() { // origin at the bottom of the cup
  const g = new THREE.Group();
  lathe(g, [[0, 0], [0.085, 0], [0.08, 0.05], [0.04, 0.09], [0.018, 0.1], [0, 0.1]], paint(0xC8262B, 0.4));
  cyl(g, 0.014, 0.014, 0.55, M.wood, 0, 0.09, 0, 10);
  sph(g, 0.02, M.wood, 0, 0.65, 0, 1, 1, 1, 8);
  return g;
}
export function tpMessModel() { // cartoon toilet-paper streamers on the floor
  const g = new THREE.Group();
  const paper = paint(0xFFFFFF, 0.8);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3, r = 0.25 + (i % 3) * 0.15;
    const pts = [];
    for (let j = 0; j <= 8; j++) { const t = j / 8; pts.push([Math.cos(a + t * 2.4) * r * (0.4 + t), 0.015 + Math.abs(Math.sin(t * 9 + i)) * 0.03, Math.sin(a + t * 2.4) * r * (0.4 + t)]); }
    const m = tube(g, pts, 0.022, paper, 24); m.scale.y = 0.35; m.castShadow = false;
  }
  const roll = cyl(g, 0.05, 0.05, 0.1, paper, 0.25, 0.05, -0.2, 14); roll.rotation.z = Math.PI / 2; roll.position.y = 0.05;
  return g;
}
