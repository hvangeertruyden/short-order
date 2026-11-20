// ---------------------------------------------------------------------------
// The diner: static scene + dynamic objects synced from game state.
// Models live in models.js; this file places them and keeps them in sync.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE as C, L, TABLES, TUNING } from './data.js';
import { seatOf, receiptById } from './sim.js';
import { zoneOf } from './actions.js';
import { jellyPerson, updateJelly } from './bean.js';
import { curStep } from './kitchen.js';
import * as Mo from './models.js';
import { buildDecor, Life } from './decor.js';
const { M, paint, rbox, cyl, sph, grp, canvasTex, emissive } = Mo;

const ia = (obj, key) => { obj.userData.ia = key; return obj; };
function label(cls, html = '') {
  const div = document.createElement('div'); div.className = cls; div.innerHTML = html;
  const o = new CSS2DObject(div); o.userData.css = true; return o;
}
// an invisible box that makes a big area easy to hover
function hitBox(parent, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), HIT); m.position.set(x, y + h / 2, z); parent.add(m); return m;
}
const HIT = new THREE.MeshBasicMaterial({ visible: false }); HIT.userData.shared = true;

// ---- collision boxes (x0, z0, x1, z1) -----------------------------------
export const COLLIDERS = [];
const col = (x0, z0, x1, z1) => COLLIDERS.push({ x0, z0, x1, z1 });

const TOP = 0.92;
let FLAME_TEX = null;
// food and dishes are drawn oversized so you can read them from the top-down camera
const big = (m, k = 1.5) => { m.scale.multiplyScalar(k); return m; };
// the mouse looks straight through these to the station / counter underneath
const noHit = (m) => { m.userData.noHit = true; return m; };   // shared texture for fire sprites

export class World {
  constructor(scene) {
    this.scene = scene;
    this.iaObjs = new Map();
    this.static = grp(scene);
    this.dynRoot = grp(scene);
    this.ents = new Map();
    this.frame = 0;
    this.buildLights();
    this.buildShell();
    this.buildKitchen();
    this.buildPass();
    this.buildDining();
    this.decor = buildDecor(this);
    this.buildOutdoors();
    this.buildRoofs();
    this.life = new Life(scene);
    this.static.traverse((o) => { if (o.userData.ia) this.iaObjs.set(o.userData.ia, o); if (o.isMesh) { o.receiveShadow = true; } });
    this.static.updateMatrixWorld(true);
    this.setupZones();
    // toy-like finish: nothing shiny or metallic, soft and matte
    this.static.traverse((o) => { for (const m of o.isMesh ? [].concat(o.material) : []) if (m.isMeshStandardMaterial) { m.metalness = Math.min(m.metalness, 0.25); m.roughness = Math.max(m.roughness, 0.42); m.envMapIntensity = 0.35; } });
    this.staticLabels = [];
    const v = new THREE.Vector3();
    this.static.traverse((o) => { if (o.isCSS2DObject) { o.getWorldPosition(v); this.staticLabels.push({ o, zone: v.z > -1.9 ? 'dining' : v.z < -2.1 ? 'kitchen' : 'pass' }); } });
  }

  buildLights() {
    this.indoor = [];                       // (kept for the power-cut code; everything is daylight now)
    // a bright, soft sky plus one warm sun: the cheerful, toy-like look
    this.hemi = new THREE.HemisphereLight(0xFFF1DE, 0xB89F7A, 0.8);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xFFE9CC, 2.2);
    this.sun.position.set(7, 18, 11);
    this.sun.target.position.set(0, 0, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 2, far: 50 });
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.03; this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.fireLight = new THREE.PointLight(C.orange, 0, 6);
    this.scene.add(this.fireLight);
  }

  buildShell() {
    const S = this.static;
    const H = L.ceiling;
    // ---- floors ----
    const floor = (x0, z0, x1, z1, mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); m.receiveShadow = true; S.add(m); };
    const tex = (draw, rx, ry) => { const t = canvasTex(256, 256, draw); t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.repeat.set(rx, ry); return t.tex; };
    const checker = (ctx) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { ctx.fillStyle = (x + y) % 2 ? '#74C7B9' : '#F3E6C8'; ctx.fillRect(x * 128, y * 128, 128, 128); } ctx.strokeStyle = 'rgba(120,150,140,0.25)'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, 256, 256); };
    floor(-8, -2, 8, 9, new THREE.MeshStandardMaterial({ map: tex(checker, 16, 11), roughness: 0.35 }));
    const quarry = (ctx) => { ctx.fillStyle = '#E6C99A'; ctx.fillRect(0, 0, 256, 256); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = 0.9 + ((x * 7 + y * 13) % 5) * 0.05; ctx.fillStyle = (x + y) % 2 ? '#FFE7B8' : '#F4CD8C'; ctx.fillRect(x * 64 + 3, y * 64 + 3, 58, 58); } };
    floor(-8, -7, 3, -2, new THREE.MeshStandardMaterial({ map: tex(quarry, 5.5, 2.5), roughness: 0.6 }));
    const mosaic = (ctx) => { ctx.fillStyle = '#B9C4C8'; ctx.fillRect(0, 0, 256, 256); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = (x * 7 + y * 3) % 5 ? '#F2F4F2' : '#7FC6C0'; ctx.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); } };
    floor(3, -7, 8, -2, new THREE.MeshStandardMaterial({ map: tex(mosaic, 5, 5), roughness: 0.3 }));
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), paint(0x9BDB72, 0.95)); grass.rotation.x = -Math.PI / 2; grass.position.set(0, -0.04, 0); grass.receiveShadow = true; S.add(grass);
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(34, 6), paint(0xE9E1CF, 0.9)); walk.rotation.x = -Math.PI / 2; walk.position.set(0, -0.01, 12); S.add(walk);
    { const K = L.cut, w = K.x + 12, d = 9.2 - K.z; const fc = new THREE.Mesh(new THREE.PlaneGeometry(w, d), paint(0xE9E1CF, 0.9)); fc.rotation.x = -Math.PI / 2; fc.position.set(K.x - w / 2, 0.004, K.z + d / 2); fc.receiveShadow = true; S.add(fc); }
    const street = new THREE.Mesh(new THREE.PlaneGeometry(60, 9), paint(0x7A7C88, 0.9)); street.receiveShadow = true;
    for (let x = -26; x <= 26; x += 3) rbox(S, 1.4, 0.01, 0.18, paint(0xFFF1B0, 0.8), x, -0.015, 19.5, 0); street.rotation.x = -Math.PI / 2; street.position.set(0, -0.02, 19.5); S.add(street);

    this.lightPanels = [];   // (no ceiling: the camera looks down from above)

    // ---- walls ----
    // full-height tile: jade wainscot, an oxblood pinstripe, then cream tiles that yellow a little toward the top
    const subway = canvasTex(256, 768, (ctx) => {
      ctx.fillStyle = '#8F887A'; ctx.fillRect(0, 0, 256, 768);
      const px = 768 / H;
      for (let row = 0; row < 24; row++) {
        const yb = row * 32, y = 768 - yb - 32, h = yb / px;   // h = height of this row's bottom, in metres
        const base = h < 1.5 ? [96, 158, 140] : h < 1.625 ? [128, 38, 42] : [240, 234, 218];
        for (let x = -1; x < 5; x++) {
          const j = (Math.sin(row * 12.9 + x * 78.2) * 43758.5) % 1, v = 1 + (j - 0.5) * 0.08;
          ctx.fillStyle = `rgb(${base.map((c) => Math.round(c * v)).join(',')})`;
          ctx.fillRect(x * 64 + (row % 2) * 32 + 2, y + 2, 60, 28);
        }
      }
      const g = ctx.createLinearGradient(0, 768, 0, 560); g.addColorStop(0, 'rgba(60,45,30,0.28)'); g.addColorStop(1, 'rgba(60,45,30,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 560, 256, 208);
    });
    subway.tex.wrapS = THREE.RepeatWrapping;
    // y0..y1 lets the short pieces around the pass window take the right slice of the pattern
    const tile = (len, y0 = 0, y1 = H) => { const t = subway.tex.clone(); t.needsUpdate = true; t.repeat.set(len, (y1 - y0) / H); t.offset.y = y0 / H; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.25 }); };
    // dining wallpaper: cream with little atomic starbursts and boomerangs, 1 m repeat
    const paperTex = canvasTex(256, 256, (ctx) => {
      ctx.fillStyle = '#F1E4C6'; ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = 'rgba(200,170,120,0.25)'; ctx.lineWidth = 2;
      for (let x = 0; x < 256; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke(); }
      const star = (x, y, r, col) => { ctx.strokeStyle = col; ctx.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke(); } ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); };
      const boom = (x, y, rot, col) => { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-22, 6); ctx.quadraticCurveTo(0, -18, 22, 6); ctx.quadraticCurveTo(0, -6, -22, 6); ctx.fill(); ctx.restore(); };
      star(56, 60, 18, '#C8463E'); star(190, 180, 14, '#2E9C95'); star(200, 40, 9, '#D9A23A'); star(60, 200, 10, '#D9A23A');
      boom(150, 100, 0.5, '#2E9C95'); boom(90, 140, -0.7, '#C8463E'); boom(30, 110, 2.2, '#D9A23A'); boom(220, 230, 1.1, '#C8463E');
    });
    paperTex.tex.wrapS = paperTex.tex.wrapT = THREE.RepeatWrapping;
    const paper = () => paint(0xFFF0D2, 0.9);   // plain warm cream (the camera's too far away for wallpaper)
    const plaster = paint(0xF2E8D2, 0.85);
    // wall along x (z fixed) or along z (x fixed). finish: per side 'tile' | 'diner' | null
    const wallX = (x0, x1, z, sideNeg, sidePos, y0 = 0, y1 = H, collide = true) => {
      rbox(S, x1 - x0, y1 - y0, 0.2, plaster, (x0 + x1) / 2, y0, z, 0);
      if (collide) col(x0, z - 0.12, x1, z + 0.12);
      for (const [side, sgn] of [[sideNeg, -1], [sidePos, 1]]) {
        if (side === 'tile') rbox(S, x1 - x0, y1 - y0, 0.02, tile(x1 - x0, y0, y1), (x0 + x1) / 2, y0, z + sgn * 0.11, 0);
        if (side === 'diner' && y0 < 1.1) { rbox(S, x1 - x0, Math.min(1.1, y1) - y0, 0.04, M.teal, (x0 + x1) / 2, y0, z + sgn * 0.12, 0.01); if (y1 > 1.1) rbox(S, x1 - x0, 0.05, 0.06, M.chrome, (x0 + x1) / 2, 1.1, z + sgn * 0.13, 0.01); }
        if (side === 'diner' && y1 > 1.15) { const b = Math.max(1.15, y0); rbox(S, x1 - x0, y1 - b, 0.01, paper(x1 - x0, y1 - b), (x0 + x1) / 2, b, z + sgn * 0.105, 0); }
      }
    };
    const wallZ = (z0, z1, x, sideNeg, sidePos, hh = H) => {
      rbox(S, 0.2, hh, z1 - z0, plaster, x, 0, (z0 + z1) / 2, 0);
      col(x - 0.12, z0, x + 0.12, z1);
      for (const [side, sgn] of [[sideNeg, -1], [sidePos, 1]]) {
        if (side === 'tile') { const m = tile(z1 - z0); rbox(S, 0.02, hh, z1 - z0, m, x + sgn * 0.11, 0, (z0 + z1) / 2, 0); }
        if (side === 'diner') { rbox(S, 0.04, Math.min(1.1, hh), z1 - z0, M.teal, x + sgn * 0.12, 0, (z0 + z1) / 2, 0.01); if (hh > 1.15) { rbox(S, 0.06, 0.05, z1 - z0, M.chrome, x + sgn * 0.13, 1.1, (z0 + z1) / 2, 0.01); rbox(S, 0.01, hh - 1.15, z1 - z0, paper(z1 - z0, hh - 1.15), x + sgn * 0.105, 1.15, (z0 + z1) / 2, 0); } }
      }
    };
    // outer walls
    wallX(-8.1, 8.1, -7.1, null, 'tile');
    wallZ(-7, -2, -8.1, null, 'tile'); wallZ(-2, L.cut.z, -8.1, null, 'diner');
    wallZ(-7, -2, 8.1, 'tile', null); wallZ(-2, 9, 8.1, 'diner', null);
    const dW = L.door.w / 2;
    // front walls with windows (+ the double door in the main one). The building is an L,
    // so there's a short front wall on the counter side and a side wall back to the door.
    const front = 9.05, CUT = L.cut, LOW = 0.95;   // walls facing the camera are low, so you can see in
    const frontWall = (x0, x1, z, windows, door) => {
      const gaps = [...windows.map((x) => [x - 1, x + 1]), ...(door ? [door] : [])].sort((a, b) => a[0] - b[0]);
      let cur = x0;
      for (const [g0, g1] of gaps) { if (g0 > cur) wallX(cur, g0, z, 'diner', null, 0, LOW); cur = g1; }
      if (cur < x1) wallX(cur, x1, z, 'diner', null, 0, LOW);
      for (const x of []) {
        wallX(x - 1, x + 1, z, 'diner', null, 0, 0.9);
        wallX(x - 1, x + 1, z, null, null, 2.3, H, false);
        const glassPane = rbox(S, 2.0, 1.4, 0.04, new THREE.MeshStandardMaterial({ color: 0xBFE6F2, roughness: 0.05, transparent: true, opacity: 0.25, emissive: 0x9ED4E8, emissiveIntensity: 0.25 }), x, 0.9, z, 0); glassPane.castShadow = false; glassPane.userData.noShadow = true;
        for (const [w, h, dx, dy] of [[2.06, 0.06, 0, 0.88], [2.06, 0.06, 0, 2.28], [0.06, 1.46, -1.0, 0.88], [0.06, 1.46, 1.0, 0.88], [0.04, 1.4, 0, 0.9]]) rbox(S, w, h, 0.08, M.chrome, x + dx, dy, z - 0.03, 0.01);
      }
    };
    frontWall(CUT.x - 0.1, 8.1, front, L.windows, [L.door.x - dW, L.door.x + dW]);
    frontWall(-8.1, CUT.x + 0.1, CUT.z, L.cutWindows, null);
    wallZ(CUT.z, front, CUT.x - 0.05, null, 'diner', LOW);
    // neon signs
    const neon = canvasTex(512, 128, (ctx, w, h) => { ctx.fillStyle = '#1B1B1B'; ctx.fillRect(0, 0, w, h); ctx.font = 'bold 64px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = '#FF4060'; ctx.shadowBlur = 24; ctx.fillStyle = '#FF7088'; ctx.fillText('SHORT ORDER', w / 2, h / 2 + 4); });
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: neon.tex })); ns.position.set(0, 2.1, 9.6); S.add(ns); for (const sx of [-1.5, 1.5]) cyl(S, 0.05, 0.05, 1.7, M.chrome, sx, 0, 9.6, 10);
    const ns2 = ns.clone(); ns2.rotation.y = Math.PI; ns2.position.set(-4.9, 2.62, L.cut.z - 0.11); S.add(ns2);
    this.neon = [ns, ns2];
    Mo.decal(S, 0.9, 0.32, (c, cw, ch) => { c.clearRect(0, 0, cw, ch); c.shadowColor = '#FF3050'; c.shadowBlur = 18; c.fillStyle = '#FF7088'; c.font = 'bold 70px Bungee'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('OPEN', cw / 2, ch / 2); }, 3.6, 1.95, 8.9, Math.PI, 256, 96);

    // kitchen walls: front wall with the pass, side wall to the restroom corridor
    const dz = L.wallZ, p0 = L.pass.x0, p1 = L.pass.x1;
    wallX(-8, p0, dz, 'tile', 'diner', 0, 1.05); wallX(p1, L.kitchen.x1 + 0.15, dz, 'tile', 'diner', 0, 1.05);
    wallX(p0, p1, dz, 'tile', 'diner', 0, L.pass.shelfY - 0.05);
    col(p0, dz - 0.12, p1, dz + 0.12);
    wallZ(-7, -2, L.kitchen.x1 + 0.05, 'tile', null);
    // restroom block: corridor wall with two door openings, divider, front wall
    const rx = L.corridor.x1 + 0.1;
    const doorsZ = [[-6.3, -5.5], [-3.6, -2.8]];
    wallZ(-7, doorsZ[0][0], rx, null, 'tile'); wallZ(doorsZ[0][1], doorsZ[1][0], rx, null, 'tile'); wallZ(doorsZ[1][1], -2, rx, null, 'tile');
    for (const [z0, z1] of doorsZ) rbox(S, 0.2, H - 2.1, z1 - z0, plaster, rx, 2.1, (z0 + z1) / 2, 0);
    wallX(rx, 8, -4.5, 'tile', 'tile', 0, 1.05);
    wallX(rx - 0.1, 8.1, dz, 'tile', 'diner', 0, 1.05);
  }

  buildKitchen() {
    const S = this.static;
    const cab = (x0, x1, z, depth, facing, top = true) => {
      const w = x1 - x0, cx = (x0 + x1) / 2, made = [];
      made.push(rbox(S, w, TOP - 0.06, depth, M.steel, cx, 0, z, 0.01));
      if (top) made.push(rbox(S, w + 0.02, 0.06, depth + 0.03, M.steel, cx, TOP - 0.06, z, 0.008));
      made.push(rbox(S, w, 0.08, depth - 0.06, M.black, cx, 0, z - facing * 0.03, 0.005));
      const doors = Math.max(1, Math.round(w / 0.6));
      for (let i = 0; i < doors; i++) {
        const dx = x0 + (i + 0.5) * (w / doors);
        made.push(rbox(S, w / doors - 0.03, TOP - 0.24, 0.015, M.panel, dx, 0.12, z + facing * (depth / 2 + 0.005), 0.006));
        made.push(rbox(S, 0.16, 0.018, 0.025, M.chrome, dx, TOP - 0.2, z + facing * (depth / 2 + 0.02), 0.008));
      }
      col(x0, z - depth / 2, x1, z + depth / 2);
      return made;
    };
    // the pieces that make up each table (used by incidents, e.g. flipping)
    this.vis = { tables: {} };
    // the line along the back wall
    // (split so the griddle and fryer stretches can be swapped for real cook-line units)
    this.vis.griddleCab = cab(-6.25, -3.3, -6.6, 0.8, 1); cab(-3.3, -2.85, -6.6, 0.8, 1);
    this.vis.fryerCab = cab(-2.85, -1.55, -6.6, 0.8, 1); cab(-1.55, 2.1, -6.6, 0.8, 1);
    const gm = Mo.griddleModel(3.1, L.griddle.slotX, L.griddle.x); gm.position.set(L.griddle.x, TOP, L.griddle.z); S.add(gm); this.vis.griddle = gm;
    L.griddle.slotX.forEach((x, i) => { const z = ia(grp(S, x, TOP, L.griddle.z), `griddle:${i}`); hitBox(z, 0.7, 0.1, 0.6, 0, 0, 0); });
    const fm = Mo.fryerModel(L.fryer.slotX, L.fryer.x); fm.position.set(L.fryer.x, TOP, L.fryer.z); S.add(fm); this.vis.fryer = fm;
    this.baskets = L.fryer.slotX.map((x, i) => { const z = ia(grp(S, x, TOP, L.fryer.z), `fryer:${i}`); hitBox(z, 0.6, 0.35, 0.6, 0, -0.05, 0); const b = Mo.fryBasket(); b.position.set(0, 0.17, 0); z.add(b); return b; });
    const tx = L.toaster.x;
    const tm = Mo.toasterModel(); tm.position.set(tx, TOP, L.toaster.z); S.add(tm);
    L.toaster.slotX.forEach((x, i) => { const z = ia(grp(S, tx + (i ? 0.15 : -0.15), TOP, L.toaster.z), `toaster:${i}`); hitBox(z, 0.3, 0.3, 0.32, 0, 0, 0); });
    const bm = ia(grp(S, L.blender.slotX[0], TOP, L.blender.z), 'blender:0'); bm.add(Mo.blenderModel()); hitBox(bm, 0.3, 0.5, 0.3, 0, 0, 0);
    const rk = ia(grp(S, L.rack.x, TOP, L.rack.z), 'rack'); rk.add(Mo.dishRackModel()); hitBox(rk, 0.62, 0.3, 0.46, 0, 0, 0);
    // cold storage on the left
    const fz = ia(grp(S, L.freezer.x, 0, L.freezer.z), 'freezer'); this.vis.freezer = Mo.freezerModel(); fz.add(this.vis.freezer); this.vis.freezerGroup = fz; col(-7.9, -7, -6.25, -5.9);
    const fr = ia(grp(S, L.fridge.x, 0, L.fridge.z), 'fridge'); this.vis.fridge = Mo.fridgeModel(); fr.add(this.vis.fridge); this.vis.fridgeGroup = fr; col(-7.95, -4.95, -7.05, -3.85);
    // front counter left of the pass: printer, TV, ticket rail
    cab(-7.9, L.pass.x0 - 0.05, -2.45, 0.65, -1);
    { const g = ia(grp(S, L.printer.x, TOP, L.printer.z), 'printer'); g.add(Mo.printerModel()); this.printerLight = sph(g, 0.012, emissive(0x33FF66, 1), 0.11, 0.17, 0.14, 1, 1, 1, 8); }
    {
      const g = ia(grp(S, L.tv.x, L.tv.y, L.tv.z - 0.17), 'tv'); g.add(Mo.tvModel());
      this.tvCanvas = canvasTex(1024, 576, () => {});
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 0.709), new THREE.MeshBasicMaterial({ map: this.tvCanvas.tex, toneMapped: false }));
      scr.position.set(0, 0, -0.037); scr.rotation.y = Math.PI; g.add(scr);
      g.rotation.x = -0.12;
    }
    { const g = ia(grp(S, (L.rail.x0 + L.rail.x1) / 2, L.rail.y, L.rail.z - 0.04), 'rail'); g.add(Mo.railModel(L.rail.x1 - L.rail.x0 + 0.3)); }
    { const g = ia(grp(S, L.bell.x, L.pass.shelfY, L.bell.z), 'bell'); this.bellObj = g; g.add(Mo.bellModel()); hitBox(g, 0.18, 0.12, 0.18, 0, 0, 0); }
    // prep island in the middle (cabinets on both long sides, butcher-block top)
    {
      const I = L.island;
      rbox(S, I.w, TOP - 0.04, I.d, M.steel, I.x, 0, I.z, 0.01);
      rbox(S, I.w + 0.06, 0.04, I.d + 0.06, M.butcher, I.x, TOP, I.z, 0.012);
      for (const f of [-1, 1]) for (let i = 0; i < 7; i++) { const dx = I.x - I.w / 2 + (i + 0.5) * (I.w / 7); rbox(S, I.w / 7 - 0.03, TOP - 0.24, 0.015, M.panel, dx, 0.12, I.z + f * (I.d / 2 + 0.005), 0.006); rbox(S, 0.14, 0.018, 0.025, M.chrome, dx, TOP - 0.2, I.z + f * (I.d / 2 + 0.02), 0.008); }
      col(I.x - I.w / 2, I.z - I.d / 2, I.x + I.w / 2, I.z + I.d / 2);
      this.prepAnchors = L.prep.slotX.map((x, i) => {
        const g = ia(grp(S, x, TOP + 0.04, L.prep.z), `prep:${i}`);
        g.add(Mo.cuttingBoard()); hitBox(g, 0.6, 0.12, 0.45, 0, 0, 0);
        const n = label('slotnum', String(i + 1)); n.position.set(-0.24, 0.03, 0.16); g.add(n);
        return grp(g, 0, 0.025, 0);
      });
      const bb = ia(grp(S, L.breadbox.x, TOP + 0.04, L.breadbox.z), 'breadbox'); bb.add(Mo.breadboxModel()); hitBox(bb, 0.5, 0.3, 0.35, 0, 0, 0);
      const pp = Mo.prepProps(); pp.position.set(-1.65, TOP + 0.04, I.z - 0.25); pp.scale.setScalar(0.9); S.add(pp);
    }
    { const g = ia(grp(S, L.mopKitchen.x, 0, L.mopKitchen.z), 'kmop'); g.add(Mo.bucketModel()); hitBox(g, 0.5, 1.4, 0.5, 0, 0, 0); col(L.mopKitchen.x - 0.28, L.mopKitchen.z - 0.28, L.mopKitchen.x + 0.28, L.mopKitchen.z + 0.28); }
    { const g = ia(grp(S, L.kTrash.x, 0, L.kTrash.z - 0.1), 'ktrash'); g.add(Mo.trashModel()); hitBox(g, 0.55, 0.8, 0.55, 0, 0, 0); col(L.kTrash.x - 0.3, -2.85, L.kTrash.x + 0.3, -2.1); }
    // sink on the side wall
    rbox(S, 0.85, TOP - 0.04, 2.4, M.steel, L.sink.x, 0, L.sink.z, 0.01);
    col(L.sink.x - 0.45, L.sink.z - 1.2, L.kitchen.x1, L.sink.z + 1.2);
    { const g = ia(grp(S, L.sink.x, TOP, L.sink.z), 'sink'); g.add(Mo.sinkModel()); hitBox(g, 0.7, 0.4, 1.1, 0, 0, 0); }
    // wall stuff
    rbox(S, 0.03, 0.2, 0.2, M.darkSteel, -7.97, 1.2, L.extinguisher.z, 0.005);
    { const g = ia(grp(S, -7.95, 1.2, L.breaker.z), 'breaker'); g.add(Mo.breakerModel()); this.breakerLight = sph(g, 0.02, emissive(0x33FF66, 1), 0.11, 0.48, 0.15, 1, 1, 1, 8); }
    cyl(S, 0.12, 0.12, 0.04, M.ceramic, -2.4, L.ceiling - 0.04, -4.5);
    this.alarmLight = sph(S, 0.025, emissive(0x550000, 0), -2.4, L.ceiling - 0.05, -4.5, 1, 1, 1, 8);
    const poster = canvasTex(256, 320, (ctx, w, h) => { ctx.fillStyle = '#E7B23B'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#C8262B'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, w - 16, h - 16); ctx.fillStyle = '#C8262B'; ctx.font = 'bold 34px Bungee, sans-serif'; ctx.textAlign = 'center'; ['WASH', 'YOUR', 'HANDS', '(AND', 'PLATES)'].forEach((t, i) => ctx.fillText(t, w / 2, 70 + i * 52)); });
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), new THREE.MeshStandardMaterial({ map: poster.tex, roughness: 0.8 })); pm.position.set(L.kitchen.x1 - 0.07, 1.85, -6.0); pm.rotation.y = -Math.PI / 2; S.add(pm);
    rbox(S, 1.6, 0.04, 0.32, M.steel, 0.9, 1.85, -6.85, 0.01);
    for (let i = 0; i < 3; i++) cyl(S, 0.14 - i * 0.015, 0.13 - i * 0.015, 0.18 - i * 0.02, M.steel, 0.4 + i * 0.5, 1.89, -6.85, 20);
  }

  buildPass() {
    const S = this.static;
    const y = L.pass.shelfY, p0 = L.pass.x0, p1 = L.pass.x1, w = p1 - p0, cx = (p0 + p1) / 2;
    rbox(S, w, 0.05, 0.75, M.steel, cx, y - 0.05, L.wallZ, 0.01);
    const glass = null; void glass; /* (open hatch: no glass)
    new THREE.Mesh(new THREE.PlaneGeometry(w, 2.0 - L.pass.glassY), new THREE.MeshStandardMaterial({ color: 0xEEF3F1, transparent: true, opacity: 0.985, roughness: 0.3, side: THREE.DoubleSide }));
    */
    for (const px of [p0 + 0.05, p1 - 0.05]) cyl(S, 0.03, 0.03, L.pass.glassY + 0.05 - y, M.chrome, px, y, L.wallZ, 10);
    const t0 = L.trays[0].x - 0.35, t1 = L.trays[L.trays.length - 1].x + 0.35;
    rbox(S, t1 - t0 + 0.1, 0.07, 0.16, M.steel, (t0 + t1) / 2, L.pass.glassY - 0.08, L.wallZ, 0.02);
    this.heatLamp = rbox(S, t1 - t0, 0.02, 0.1, emissive(0xFF5A1A, 1.2), (t0 + t1) / 2, L.pass.glassY - 0.1, L.wallZ, 0.006);
    this.heatLight = new THREE.PointLight(0xFF6A2A, 1.2, 1.6); this.heatLight.position.set((t0 + t1) / 2, 1.15, L.wallZ); S.add(this.heatLight);
    this.trayAnchors = L.trays.map((t, i) => {
      const g = ia(grp(S, t.x, y, L.wallZ), `tray:${i}`);
      g.add(Mo.trayModel()); hitBox(g, 0.62, 0.12, 0.5, 0, 0, 0);
      const num = label('slotnum', String(i + 1)); num.position.set(-0.24, 0.03, 0); g.add(num);
      return grp(g, 0, 0.015, 0);
    });
    {
      const g = ia(grp(S, L.dishReturn.x, y, L.wallZ), 'dishret');
      rbox(g, 0.55, 0.14, 0.55, paint(0x5E7078, 0.5), 0, 0, 0, 0.03); hitBox(g, 0.55, 0.3, 0.55, 0, 0, 0);
      this.dishAnchor = grp(g, 0, 0.03, 0);
    }
  }

  buildDining() {
    const S = this.static;
    const topY = 1.04;
    // drink station against the kitchen wall, behind the lunch counter (machines face +z)
    const B = L.backCounter;
    rbox(S, B.x1 - B.x0, 0.92, B.z1 - B.z0, M.teal, (B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2, 0.02);
    rbox(S, B.x1 - B.x0 + 0.03, 0.04, B.z1 - B.z0 + 0.03, paint(0xF4ECDA, 0.22), (B.x0 + B.x1) / 2, 0.92, (B.z0 + B.z1) / 2, 0.01);
    col(B.x0, B.z0, B.x1, B.z1);
    const place = (key, p, model, hw = 0.45, hh = 0.7) => { const g = ia(grp(S, p.x, 0.96, p.z), key); g.add(model); hitBox(g, hw, hh, 0.4, 0, 0, 0); return g; };
    place('mugs', L.mugs, Mo.mugRackModel(), 0.42, 0.3);
    place('coffee', L.coffee, Mo.coffeeMachineModel(), 0.5, 0.7);
    place('cups', L.cups, Mo.cupStackModel(), 0.2, 0.35);
    place('ice', L.ice, Mo.iceBinModel(), 0.4, 0.25);
    place('soda', L.soda, Mo.sodaFountainModel(), 0.7, 0.75);
    place('lids', L.lids, Mo.lidDispenserModel(), 0.38, 0.4);
    // the lunch counter (parallel to the pass; customers on its south face)
    const ct = L.counter, cx = (ct.x0 + ct.x1) / 2, cz = (ct.z0 + ct.z1) / 2, cw = ct.x1 - ct.x0, cd = ct.z1 - ct.z0;
    rbox(S, cw, 0.98, cd, paint(C.cherry, 0.35), cx, 0, cz, 0.02);
    rbox(S, cw + 0.1, 0.06, cd + 0.06, paint(0xF4ECDA, 0.22), cx, 0.98, cz, 0.02);
    for (const yy of [0.12, 0.5, 0.9]) rbox(S, cw, 0.035, 0.02, M.chrome, cx, yy, ct.z1 + 0.012, 0.008);
    col(ct.x0, ct.z0, ct.x1, ct.z1);
    const register = (key, x, z, word, yaw) => {
      const g = ia(grp(S, x, topY, z), key); g.rotation.y = yaw;
      g.add(Mo.registerModel()); hitBox(g, 0.5, 0.35, 0.42, 0, 0, 0);
      const scr = rbox(g, 0.3, 0.12, 0.02, emissive(0x33DD77, 0.8), 0, 0.28, -0.16, 0.008); scr.rotation.x = 0.35;
      const tag = label('signlabel', word); tag.position.set(0, 0.62, 0); g.add(tag);
      return scr;
    };
    const regO = register('register', L.regOrder.x, L.regOrder.z, 'ORDER HERE', 0);
    { const g = ia(grp(S, L.tentHolder.x, topY, L.tentHolder.z), 'tents'); rbox(g, 0.42, 0.04, 0.2, M.chrome, 0, 0, 0, 0.01); hitBox(g, 0.42, 0.2, 0.22, 0, 0, 0); this.tentAnchor = grp(g, 0, 0.04, 0); }
    // register stand right of the front door
    const Hs = L.host;
    { const g = grp(S, Hs.x, 0, Hs.z); g.add(Mo.hostStandModel(Hs.w, Hs.d)); col(Hs.x - Hs.d / 2, Hs.z - Hs.w / 2, Hs.x + Hs.d / 2, Hs.z + Hs.w / 2); }
    const regP = register('payreg', L.regPay.x, L.regPay.z, 'PAY HERE', Math.PI / 2);
    regP.parent.position.y = 1.05;
    this.regScreens = [regO, regP];
    // menu board above the drink station
    const mb = canvasTex(1024, 512, (ctx, w, h) => {
      ctx.fillStyle = '#1B1B1B'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#E7B23B'; ctx.lineWidth = 14; ctx.strokeRect(10, 10, w - 20, h - 20);
      ctx.fillStyle = '#E7B23B'; ctx.font = 'bold 58px Bungee, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('MENU', w / 2, 86);
      ctx.font = '38px "Courier Prime", monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#F5EBD3';
      Object.values(Mo.MENU).forEach((m, i) => { const c = i < 4 ? 0 : 1; const r = i % 4; ctx.fillText(m.name, 52 + c * 500, 180 + r * 70); ctx.fillText(`$${m.price}`, 390 + c * 500, 180 + r * 70); });
      ctx.fillStyle = '#F4A6B8'; ctx.fillText('COFFEE / SODA  $2', 300, 470);
    });
    { const g = ia(grp(S, L.menuBoard.x, L.menuBoard.y, L.menuBoard.z), 'menuboard'); const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: mb.tex, roughness: 0.7, emissive: 0x222222 })); m.position.z = 0.05; g.add(m); rbox(g, 2.7, 1.4, 0.04, M.wood, 0, -0.7, 0.01, 0.02); }
    { const g = ia(grp(S, L.fTrash.x, 0, L.fTrash.z), 'ftrash'); g.add(Mo.trashModel(M.teal)); hitBox(g, 0.55, 0.8, 0.55, 0, 0, 0); col(L.fTrash.x - 0.3, L.fTrash.z - 0.3, L.fTrash.x + 0.3, L.fTrash.z + 0.3); }
    // tables + chairs
    for (const t of TABLES) {
      const g = ia(grp(S, t.x, 0, t.z), `table:${t.n}`);
      const V = this.vis.tables[t.n] = { group: g, parts: [], chairs: [] };
      const tm = t.shape === 'booth' ? Mo.dinerBooth(t.n % 2 ? 0xF0564E : 0x4FCFC2) : Mo.squareTableModel();
      if (t.shape === 'booth') tm.rotation.y = Math.atan2(t.seat.x - t.x, t.seat.z - t.z);
      V.parts.push(g.add(tm).children.at(-1));
      const nh = Mo.napkinHolder(); nh.position.set(t.shape === 'booth' ? 0.18 : 0.2, 0.76, t.seat.z > t.z ? -0.2 : 0.2); nh.scale.setScalar(0.8); g.add(nh); V.parts.push(nh);
      // no number sign on the table itself: the tent is what you read
      // chairs: the customer's seat + the others around the table
      const r = t.shape === 'booth' ? 0.82 : 0.68;
      const angles = t.shape === 'booth' ? [] : [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      const seatAng = Math.atan2(t.seat.x - t.x, t.seat.z - t.z);
      for (const a0 of angles) {
        const a = seatAng + a0, ch = Mo.chairModel(t.n % 2 ? C.cherry : C.teal);
        ch.position.set(t.x + Math.sin(a) * r, 0, t.z + Math.cos(a) * r); ch.rotation.y = a; S.add(ch); V.chairs.push(ch);
      }
      const hr = t.shape === 'booth' ? 0.52 : 0.4;
      col(t.x - hr, t.z - hr, t.x + hr, t.z + hr);
      if (t.shape === 'booth') for (const sgn of [-1, 1]) { const base = Math.atan2(t.seat.x - t.x, t.seat.z - t.z), ax = Math.sin(base), az = Math.cos(base); const cx = t.x + ax * sgn * 1.0, cz = t.z + az * sgn * 1.0, hx = Math.abs(az) * 0.78 + Math.abs(ax) * 0.18, hz = Math.abs(ax) * 0.78 + Math.abs(az) * 0.18; col(cx - hx, cz - hz, cx + hx, cz + hz); }
      this[`tableAnchor${t.n}`] = grp(g, 0, 0.77, 0);
      V.anchor = this[`tableAnchor${t.n}`];
    }
    // jukebox against the back wall, between the kitchen and the restroom corridor
    { const g = ia(grp(S, L.jukebox.x, 0, L.jukebox.z), 'jukebox'); const jm = Mo.jukeboxModel(); jm.rotation.y = Math.PI / 2; g.add(jm); hitBox(g, 0.9, 1.4, 0.7, 0, 0, 0); this.jukeTubes = jm.userData.tubes; col(L.jukebox.x - 0.45, L.wallZ, L.jukebox.x + 0.45, L.jukebox.z + 0.35); this.jukebox = g; }
    // gumball machine + plants
    { const gb = grp(S, -1.65, 0, 3.9); Mo.cyl(gb, 0.04, 0.06, 0.8, M.cherry, 0, 0, 0, 14); Mo.cyl(gb, 0.16, 0.12, 0.12, M.cherry, 0, 0.8, 0, 20); Mo.sph(gb, 0.17, M.glass, 0, 1.08, 0, 1, 1, 1, 20); for (let i = 0; i < 14; i++) Mo.sph(gb, 0.035, Mo.paint([0xFF4060, 0xFFE040, 0x40C0FF, 0x7CC44E][i % 4], 0.2), Math.cos(i * 2.4) * 0.09, 0.97 + (i % 4) * 0.04, Math.sin(i * 2.4) * 0.09, 1, 1, 1, 8); Mo.sph(gb, 0.05, M.cherry, 0, 1.25, 0, 1, 0.6, 1, 12); col(7.1, 8.2, 7.5, 8.6); }
    const plant = (x, z, pot) => { const p = grp(S, x, 0, z); Mo.lathe(p, [[0, 0], [0.2, 0], [0.24, 0.4], [0.25, 0.42], [0, 0.42]], pot); for (let i = 0; i < 9; i++) sph(p, 0.18, paint(0x4F9A4A, 0.6), Math.cos(i * 2.4) * 0.12, 0.6 + (i % 3) * 0.18, Math.sin(i * 2.4) * 0.12, 1, 1.4, 1, 10); col(x - 0.25, z - 0.25, x + 0.25, z + 0.25); };
    plant(-7.5, 3.85, M.teal); plant(5.5, 8.55, M.cherry);
    // a cactus in the corner by the door and the diner dog's bowl
    { const p = grp(S, -0.72, 0, 4.75); Mo.lathe(p, [[0, 0], [0.22, 0], [0.26, 0.34], [0.27, 0.36], [0, 0.36]], paint(0xC8643C, 0.8)); const cm = paint(0x3F8A4A, 0.7);
      Mo.cyl(p, 0.11, 0.13, 0.75, cm, 0, 0.34, 0, 14); sph(p, 0.11, cm, 0, 1.09, 0, 1, 1, 1, 14);
      for (const [sx, h, y] of [[1, 0.32, 0.6], [-1, 0.26, 0.75]]) { Mo.cyl(p, 0.06, 0.06, 0.16, cm, sx * 0.17, y, 0, 10).rotation.z = Math.PI / 2; Mo.cyl(p, 0.06, 0.06, h, cm, sx * 0.25, y, 0, 10); sph(p, 0.06, cm, sx * 0.25, y + h, 0, 1, 1, 1, 10); }
      col(-1.0, 4.45, -0.42, 5.05); }
    { const p = grp(S, -7.3, 0, 2.75); Mo.lathe(p, [[0, 0], [0.17, 0], [0.15, 0.07], [0.12, 0.07], [0.11, 0.025], [0, 0.025]], M.chrome); Mo.decal(p, 0.16, 0.05, (c, w, h) => { c.fillStyle = '#C8262B'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 40px Bungee'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('DOG', w / 2, h / 2 + 2); }, 0, 0.04, 0.165, 0, 128, 40); }
    // restrooms: toilet, washbasin + mirror, doors from the corridor, a sign
    const rx = L.corridor.x1 + 0.1;
    [[-7, -4.5, [-6.3, -5.5]], [-4.5, -2, [-3.6, -2.8]]].forEach(([z0, z1, [d0, d1]], i) => {
      const tg = ia(grp(S, L.rooms[i].toilet.x, 0, L.rooms[i].toilet.z), `toilet:${i}`); tg.add(Mo.toiletModel()); hitBox(tg, 0.6, 0.8, 0.5, 0, 0, 0);
      const wb = Mo.washbasinModel(); wb.position.set(6.2, 0, i ? z1 - 0.12 : z0 + 0.12); wb.rotation.y = i ? 0 : Math.PI; S.add(wb);
      rbox(S, 0.25, 0.3, 0.12, M.ceramic, 7.9, 1.1, (z0 + z1) / 2 - 0.6, 0.03);   // hand dryer
      const d = Mo.doorModel(0.8, 0x7A4A2A, 'WC'); d.position.set(rx - 0.02, 0, d0); d.rotation.y = -Math.PI / 2 - 1.1; S.add(d);
      (this.roomDoors ||= [])[i] = d;
      col(7.45, (z0 + z1) / 2, 8, (z0 + z1) / 2 + 0.6);
    });
    { const g = ia(grp(S, L.plunger.x, 0.95, L.plunger.z), 'plunger'); rbox(g, 0.12, 0.04, 0.04, M.darkSteel, 0, 0.55, 0.06, 0.01); hitBox(g, 0.3, 0.75, 0.25, 0, 0, 0); this.plungerHook = g; }
    { const g = ia(grp(S, L.mopDining.x, 0, L.mopDining.z), 'dmop'); g.add(Mo.bucketModel()); hitBox(g, 0.5, 1.4, 0.5, 0, 0, 0); col(L.mopDining.x - 0.28, L.mopDining.z - 0.28, L.mopDining.x + 0.28, L.mopDining.z + 0.28); }
    Mo.decal(S, 1.1, 0.3, (c, w, h) => { c.fillStyle = '#1F3A4D'; c.fillRect(0, 0, w, h); c.fillStyle = '#F5EBD3'; c.font = 'bold 56px Bungee'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('RESTROOMS ↑', w / 2, h / 2 + 3); }, (L.corridor.x0 + L.corridor.x1) / 2, 2.3, L.wallZ + 0.0, Math.PI, 512, 140);
  }

  // ---- per-frame --------------------------------------------------------------
  ensure(key, sig, build, parent = this.dynRoot) {
    let e = this.ents.get(key);
    if (!e || e.sig !== sig || e.obj.parent !== parent) {
      if (e) this.removeEnt(key);
      const obj = build();
      obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      parent.add(obj);
      e = { sig, obj, seen: this.frame };
      this.ents.set(key, e);
      if (obj.userData.ia) this.iaObjs.set(obj.userData.ia, obj);
    }
    e.seen = this.frame;
    return e.obj;
  }
  removeEnt(key) {
    const e = this.ents.get(key);
    if (!e) return;
    e.obj.parent?.remove(e.obj);
    e.obj.traverse((o) => {
      if (o.isCSS2DObject) o.element.remove();
      if (o.geometry && !o.isSkinnedMesh && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material && !o.material.userData?.shared) { o.material.map?.dispose(); o.material.dispose?.(); }
    });
    if (e.obj.userData.ia && this.iaObjs.get(e.obj.userData.ia) === e.obj) this.iaObjs.delete(e.obj.userData.ia);
    this.ents.delete(key);
  }

  itemSig(it) {
    if (!it) return '-';
    switch (it.type) {
      case 'food': return `${it.kind}|${it.step}|${Math.round(Math.min(1, it.p) * 5)}|${it.q.burnt}|${it.q.floor}|${it.q.messy}|${it.cheese}|${it.style}|${it.toppings.join(',')}|${it.candle ? 'c' : ''}`;
      case 'plate': return 'P' + (it.dirty ? 'D' : '') + it.items.map((f) => this.itemSig(f)).join(';');
      case 'tray': return 'T' + this.itemSig(it.plate) + (it.receiptId || '');
      case 'cup': return `cup|${it.ice}|${Math.round(Math.min(1.1, it.fill) * 10)}|${it.lid}`;
      case 'mug': return `mug|${Math.round(it.p * 5)}`;
      case 'dishes': return 'd' + it.n;
      default: return it.type;
    }
  }

  update(s, myRole, dt, time) {
    this.frame++;
    const myZone = myRole === 'cook' ? 'kitchen' : 'dining';
    for (const l of this.staticLabels) l.o.visible = l.zone === 'pass' || l.zone === myZone;
    this.updateTV(s);
    this.updateEnvironment(s, time);
    this.updateLife(s, dt, time);

    // food/plates at stations + progress labels
    for (const at in s.stations) {
      s.stations[at].forEach((it, i) => {
        if (!it) return;
        const a = this.stationPos(at, i);
        const obj = this.ensure(`st:${at}:${i}`, this.itemSig(it), () => noHit(big(it.type === 'plate' ? Mo.plateModel(it) : Mo.itemModel(it))), a.parent || this.dynRoot);
        obj.position.set(a.x, a.y, a.z);
        if (at === 'toaster' && it.type === 'food') obj.rotation.set(Math.PI / 2, Math.PI / 2, 0);
        if (at === 'toaster') { const st = curStep(it); const down = st?.toaster && !it.popped; obj.position.y += down ? 0.06 : 0.16; }
        if (at === 'blender' && it.type === 'food') { obj.position.y += 0.17; const st = curStep(it); if (st?.cook && s.power) { obj.rotation.y += dt * 25; obj.position.x += (Math.random() - 0.5) * 0.008; } }
        if (at === 'fryer') { obj.scale.setScalar(1.4); }
        // progress label (cook only)
        const st = it.type === 'food' ? curStep(it) : null;
        if (st?.cook && st.at === at && !(at === 'fryer' && !it.lowered) && !(st.toaster && it.popped)) {
          const lab = this.ensure(`plab:${at}:${i}`, 'x', () => label('prog', '<div class="bar"><i></i></div>'));
          const wp = this.worldPos(at, i);
          lab.position.set(wp.x, wp.y + 0.4, wp.z);
          lab.visible = myRole === 'cook';
          const el = lab.element, bar = el.querySelector('i');
          if (it.q.burnt) { bar.style.width = '100%'; el.dataset.state = 'burnt'; }
          else if (it.p < 1) { bar.style.width = `${it.p * 100}%`; el.dataset.state = 'cooking'; }
          else { bar.style.width = `${Math.max(0, 100 - (it.over / (st.win * TUNING.burnGrace)) * 100)}%`; el.dataset.state = 'ready'; }
        }
        // smoke from burnt food
        if (it.type === 'food' && it.q.burnt && at !== 'prep') {
          const wp = this.worldPos(at, i);
          // thick dark puffs rolling off it (soft sprites, same system as the steam)
          if (Math.random() < dt * 5) this.life.emit(wp.x, wp.y + 0.08, wp.z, 0.55, 0x5A544E, 0.5);
        }
      });
    }
    // fryer baskets sit up out of the oil unless something is lowered
    this.baskets.forEach((b, i) => { const it = s.stations.fryer[i]; const down = it?.lowered; b.position.y += ((down ? (this.basketDown ?? 0.04) : 0.17) - b.position.y) * Math.min(1, dt * 8); });
    // blender lid
    { const it = s.stations.blender[0]; const lidOn = it?.type === 'food' && it.step >= 2 && it.step < 5; if (lidOn) { const lid = this.ensure('blenderLid', 'x', () => Mo.blenderLid()); lid.position.set(L.blender.slotX[0], TOP + 0.47, L.blender.z); } }

    // fire
    if (s.fire) {
      const at = s.fire.at;
      const f = this.ensure('fire:' + at, 'x', () => {
        // soft licking flames: additive sprites with a teardrop glow texture
        FLAME_TEX ||= Mo.canvasTex(64, 128, (c, w, h) => {
          const g = c.createRadialGradient(w / 2, h * 0.72, 2, w / 2, h * 0.62, h * 0.55);
          g.addColorStop(0, 'rgba(255,250,210,1)'); g.addColorStop(0.25, 'rgba(255,200,60,0.95)'); g.addColorStop(0.55, 'rgba(255,90,10,0.6)'); g.addColorStop(1, 'rgba(160,20,0,0)');
          c.fillStyle = g; c.beginPath(); c.moveTo(w / 2, 0); c.bezierCurveTo(w * 1.05, h * 0.45, w, h, w / 2, h); c.bezierCurveTo(0, h, -w * 0.05, h * 0.45, w / 2, 0); c.fill();
        }).tex;
        const g = new THREE.Group(); g.userData.noHit = true;
        const n = at === 'fryer' ? 16 : 30, w = at === 'fryer' ? 1.1 : 2.6;
        for (let i = 0; i < n; i++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLAME_TEX, color: 0xFFFFFF, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
          sp.userData = { x: -w / 2 + (i + 0.5) * (w / n) + (Math.random() - 0.5) * 0.1, z: (Math.random() - 0.5) * 0.35, ph: Math.random() * 10, k: 0.7 + Math.random() * 0.6 };
          g.add(sp);
        }
        return g;
      });
      const fx = at === 'fryer' ? L.fryer.x : at === 'staff' ? L.staffMeal.x : at === 'poster' ? L.poster.x : L.griddle.x;
      if (at === 'staff' || at === 'poster') { f.scale.setScalar(0.35); f.position.set(fx, at === 'poster' ? L.poster.y - 0.25 : TOP + 0.05, at === 'poster' ? -6.85 : L.staffMeal.z); }
      else f.position.set(fx, 1.0, L.griddle.z);
      f.children.forEach((c) => { const u = c.userData, t = time * 7 + u.ph, hgt = (0.42 + Math.abs(Math.sin(t)) * 0.3 + Math.sin(t * 2.3) * 0.08) * u.k * (s.fire.big ? 1.5 : 1); c.scale.set(hgt * 0.75, hgt * 1.1, 1); c.position.set(u.x + Math.sin(t * 1.7) * 0.04, hgt * 0.42 - 0.04, u.z); c.material.opacity = 0.75 + Math.sin(t * 3) * 0.2; });
      if (Math.random() < 0.4) this.life.emit(f.position.x + (Math.random() - 0.5) * (at === 'fryer' ? 0.8 : 2), f.position.y + 0.55, f.position.z + 0.1, 0.75, 0x35302B, 0.55);
      this.fireLight.position.set(fx, 1.6, -6.3);
      this.fireLight.intensity = 4 + Math.sin(time * 20) * 1.5;
    } else this.fireLight.intensity = 0;

    // receipts (printer / floor / rail)
    for (const r of s.receipts) {
      if (!['printer', 'floor', 'rail'].includes(r.loc)) continue;
      const obj = this.ensure(`rcpt:${r.id}`, `${r.loc}|${Math.round(r.grime * 8)}`, () => { const g = new THREE.Group(); g.add(Mo.receiptModel(r.grime)); ia(g, `receipt:${r.id}`); return g; });
      const m = obj.children[0];
      if (r.loc === 'printer') { obj.position.set(L.printer.x, TOP + 0.26, L.printer.z - 0.08); m.rotation.set(-Math.PI / 2 + 0.25, 0, 0); }
      else if (r.loc === 'floor') { obj.position.set(r.fx, 0.004, r.fz); m.rotation.set(0, r.rot || 0, 0); }
      else { const x = L.rail.x0 + r.slot * ((L.rail.x1 - L.rail.x0) / (TUNING.railSlots - 1)); obj.position.set(x, L.rail.y - 0.08, L.rail.z - 0.1); m.rotation.set(-Math.PI / 2, 0, 0); }
    }

    // trays at the pass
    s.trays.forEach((tr, i) => {
      if (!tr) return;
      const r = tr.receiptId ? receiptById(s, tr.receiptId) : null;
      this.ensure(`tray:${i}`, this.itemSig(tr.plate) + `|r${r ? Math.round(r.grime * 8) : '-'}`, () => {
        const g = new THREE.Group();
        g.add(big(Mo.plateModel(tr.plate), 1.3));
        if (r) { const rm = Mo.receiptModel(r.grime); rm.position.set(0.22, 0.01, 0.02); rm.rotation.y = 0.3; g.add(rm); }
        return g;
      }, this.trayAnchors[i]);
    });

    // restroom doors close while someone's inside; clogged toilets bubble
    s.rooms.forEach((room, i) => {
      const d = this.roomDoors?.[i];
      if (d) { const want = room.occ != null ? -Math.PI / 2 : -Math.PI / 2 - 1.1; d.rotation.y += (want - d.rotation.y) * Math.min(1, dt * 6); }
      if (room.clog > 0) {
        const T0 = L.rooms[i].toilet;
        const b = this.ensure('clog:' + i, 'x', () => { const g = new THREE.Group(); g.userData.noHit = true; for (let j = 0; j < 7; j++) { const m = sph(g, 0.05, new THREE.MeshStandardMaterial({ color: 0xBFEFFF, roughness: 0.05, transparent: true, opacity: 0.7 }), 0, 0, 0, 1, 1, 1, 10); m.userData.off = j / 7; m.castShadow = false; } return g; });
        b.position.set(T0.x - 0.15, 0.45, T0.z);
        b.children.forEach((m) => { const t = (time * 0.7 + m.userData.off) % 1; m.position.set(Math.sin(m.userData.off * 20) * 0.12, t * 0.5, Math.cos(m.userData.off * 17) * 0.1); m.scale.setScalar(0.5 + t); m.material.opacity = 0.7 * (1 - t); });
      }
    });
    if (s.plungerHome) { const pl = this.ensure('plungerHome', 'x', () => Mo.plungerModel()); pl.position.set(L.plunger.x, 0.98, L.plunger.z + 0.05); pl.rotation.set(0, 0, 0.05); }
    // mops standing in their buckets
    for (const [where, p] of [['dining', L.mopDining], ['kitchen', L.mopKitchen]]) {
      if (!s.mops[where]) continue;
      const m = this.ensure('mopIn:' + where, 'x', () => Mo.mopModel());
      m.position.set(p.x + 0.04, 1.6, p.z); m.rotation.set(0.12, 0, 0.08);
    }
    // dish return, clean plates, extinguisher, tents
    this.ensure('dishes', `d${Math.min(s.dirtyDishes, 10)}`, () => Mo.dishStack(s.dirtyDishes), this.dishAnchor);
    {
      const n = Math.min(s.cleanPlates, 12);
      const rk = this.ensure('rackplates', `c${n}`, () => { const g = new THREE.Group(); for (let i = 0; i < n; i++) { const p = Mo.plateModel({ items: [], dirty: false }); p.rotation.x = Math.PI / 2; p.position.set(0, 0.18, -0.2 + i * 0.036); g.add(p); } return g; });
      rk.position.set(L.rack.x, TOP + 0.02, L.rack.z);
    }
    if (s.extOnWall) { const e = this.ensure('ext', 'x', () => { const g = Mo.extinguisherModel(); ia(g, 'ext'); return g; }); e.position.set(-7.82, 0.7, L.extinguisher.z); e.rotation.y = -Math.PI / 2; }
    this.ensure('tents', s.tents.slice().sort().join(','), () => { const g = new THREE.Group(); s.tents.slice().sort((a, b) => a - b).forEach((n, i) => { const t = Mo.tentModel(n); t.position.set(-0.15 + i * 0.06, 0, 0); t.rotation.y = Math.PI / 2; t.scale.setScalar(0.8); g.add(t); }); return g; }, this.tentAnchor);
    for (const tb of s.tables) {
      const anchor = this[`tableAnchor${tb.n}`];
      if (tb.tent) this.ensure(`tent:${tb.n}`, 'x', () => { const t = Mo.tentModel(tb.n); t.position.set(-0.16, 0, -0.12); t.rotation.y = 0.3; return t; }, anchor);
      if (tb.plate) this.ensure(`tplate:${tb.n}`, this.itemSig(tb.plate) + (tb.dirty ? 'd' : ''), () => {
        const p = big(tb.dirty ? Mo.plateModel({ items: [], dirty: true }) : Mo.plateModel(tb.plate), 1.35);
        p.position.set(0, 0, 0.15); return p;
      }, anchor);
    }

    // drink station: cup under the fountain, mug in the coffee machine
    if (s.fountain) {
      const c = this.ensure('fountainCup', this.itemSig(s.fountain.cup), () => noHit(big(Mo.cupModel(s.fountain.cup), 1.3)));
      c.position.set(L.soda.x + 0.08, 1.0, L.soda.z);
      if (s.fountain.pouring && s.power) { const st = this.ensure('stream', 'x', () => { const m = cyl(null, 0.008, 0.008, 0.25, Mo.paint(0x3A1A0E, 0.1), 0, 0, 0, 8); m.userData.noHit = true; return m; }); st.position.set(L.soda.x + 0.08, 1.18, L.soda.z); }
    }
    if (s.coffeeM) { const m = this.ensure('coffeeMug', this.itemSig(s.coffeeM.mug), () => noHit(big(Mo.mugModel(s.coffeeM.mug), 1.3))); m.position.set(L.coffee.x + 0.06, 1.0, L.coffee.z); }

    // puddles
    for (const p of s.puddles) {
      const colr = { sick: C.sick, shake: C.pink, flood: 0x3FB4F0, water: 0x7EC8EE, oil: 0xD9A43A, coffee: 0x3A1E0C, food: 0x9A5A2A }[p.kind] ?? 0x5A2A10;
      const o = this.ensure(`pud:${p.id}`, p.kind, () => {
        if (p.kind === 'tp') { const g = Mo.tpMessModel(); ia(g, `puddle:${p.id}`); return g; }
        if (p.kind === 'shards') { const g = Mo.shardsModel(); ia(g, `puddle:${p.id}`); return g; }
        if (p.kind === 'food') { const g = Mo.foodMessModel(); ia(g, `puddle:${p.id}`); return g; }
        const g = new THREE.Group();
        if (p.kind === 'flood') for (let i = 0; i < 9; i++) { const b = sph(g, 0.05 + (i % 3) * 0.02, new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.05, transparent: true, opacity: 0.75 }), Math.cos(i * 2.4) * 0.3, 0.03, Math.sin(i * 2.4) * 0.25, 1, 0.8, 1, 10); b.castShadow = false; }
        const m = cyl(g, 0.45, 0.45, 0.008, new THREE.MeshStandardMaterial({ color: colr, roughness: 0.05, transparent: true, opacity: 0.85 }), 0, 0.004, 0, 24); m.scale.set(1, 1, 0.7); m.castShadow = false;
        for (let i = 0; i < 3; i++) { const b = cyl(g, 0.1 + i * 0.03, 0.1 + i * 0.03, 0.009, new THREE.MeshStandardMaterial({ color: colr, roughness: 0.05, transparent: true, opacity: 0.85 }), Math.cos(i * 2.1) * 0.4, 0.004, Math.sin(i * 2.1) * 0.3, 16); b.castShadow = false; }
        ia(g, `puddle:${p.id}`); return g;
      });
      o.position.set(p.x, 0, p.z);
      const sz = Math.max(0.15, p.size ?? (p.kind === 'sick' ? 1.3 : 1)); o.scale.set(sz, 1, sz);
    }

    this.updateIncidents(s, dt, time);

    // stuff dropped on the floor (falls with a little bounce)
    for (const f of s.floor) {
      const o = this.ensure(`floor:${f.id}`, this.itemSig(f.thing), () => {
        const g = new THREE.Group();
        const m = f.thing.type === 'food' ? Mo.itemModel(f.thing) : f.thing.type === 'plate' ? Mo.plateModel(f.thing) : heldModel(f.thing);
        g.add(m); ia(g, `floor:${f.id}`);
        hitBox(g, 0.35, 0.15, 0.35, 0, 0, 0);
        return g;
      });
      const age = s.t - f.t0;
      const bounce = age < 0.35 ? (1 - (age / 0.35) ** 2) * 0.9 : age < 0.6 ? Math.sin(((age - 0.35) / 0.25) * Math.PI) * 0.08 : 0;
      o.position.set(f.x, bounce, f.z);
      const lies = f.thing.type === 'mop' || f.thing.type === 'plunger';
      o.rotation.set(age < 0.6 ? (0.6 - age) * 2 : 0, f.rot, lies ? Math.PI / 2 : 0);
      if (lies) o.position.y += 0.05;
    }

    // customers + the other player
    for (const c of s.customers) this.updatePerson(`cust:${c.id}`, c, s, myRole, dt, time);
    // both players (yours uses your local position so it never lags)
    for (const r of ['cook', 'server']) {
      const p = r === myRole && this.mePose ? { ...s.players[r], ...this.mePose } : s.players[r];
      const av = this.ensure(`avatar:${r}`, 'x', () => noHit(jellyPerson({ color: r === 'cook' ? 0xFFD36B : 0x7FD3E6, role: r, scale: 0.98 })));
      const slip = p.slipUntil && s.t < p.slipUntil ? 1 - (p.slipUntil - s.t) / 0.9 : 0;
      updateJelly(av, dt, time, { x: p.x, z: p.z, yaw: p.yaw, pose: p.held && p.held.type !== 'mop' ? 'carry' : 'idle', slip });
      if (p.held) {
        const o = this.ensure(`avheld:${r}`, this.itemSig(p.held), () => { const g = new THREE.Group(); const m = heldModel(p.held); g.add(m); g.scale.setScalar(p.held.type === 'tray' ? 1.1 : p.held.type === 'mop' || p.held.type === 'ext' || p.held.type === 'plunger' ? 1 : 1.6); return g; }, av);
        if (p.held.type === 'mop' || p.held.type === 'plunger' || p.held.type === 'ext') { o.position.set(0.36, 0.25, -0.22); o.rotation.set(0.25 + (p.busy ? Math.sin(time * 14) * 0.3 : 0), 0, 0); }
        else { o.position.set(0, 0.5, -0.5); o.rotation.set(0, 0, 0); }
        o.position.y += p.busy ? Math.sin(time * 18) * 0.02 : 0;
      }
    }

    for (const [k, e] of this.ents) if (e.seen !== this.frame) this.removeEnt(k);
    this.applyZones(myRole);
  }

  // where items sit at a station (dynRoot coordinates, or relative to an anchor)
  stationPos(at, i) {
    if (at === 'prep') return { parent: this.prepAnchors[i], x: 0, y: 0, z: 0 };
    return this.worldPos(at, i);
  }
  worldPos(at, i) {
    if (at === 'griddle') return { x: L.griddle.slotX[i], y: TOP + 0.045, z: L.griddle.z };
    if (at === 'fryer') { const b = this.baskets[i]; return { x: L.fryer.slotX[i], y: TOP + 0.03 + b.position.y, z: L.fryer.z }; }
    if (at === 'toaster') { const tx = L.toaster.x; return { x: tx + (i ? 0.15 : -0.15), y: TOP + 0.12, z: L.toaster.z }; }
    if (at === 'prep') return { x: L.prep.slotX[i], y: TOP + 0.1, z: L.prep.z };
    return { x: L.blender.slotX[0], y: TOP, z: L.blender.z };
  }

  updatePerson(key, c, s, myRole, dt, time) {
    const obj = this.ensure(key, 'x', () => { const g = jellyPerson({ color: c.color, hat: c.hat, kind: c.kind, scale: 0.8 + ((c.id * 37) % 13) / 100 }); ia(g, key); const b = label('bubble'); b.position.set(0, 1.55, 0); g.add(b); g.userData.bubble = b; if (c.kind === 'artist') { const bl = Mo.balloonBunch(); bl.position.set(0.38, 1.05, 0.12); g.add(bl); g.userData.balloons = bl; } return g; });
    if (obj.userData.balloons) { const bl = obj.userData.balloons; bl.children.forEach((b, i) => { b.visible = !(c.st === 'popped' || c.st === 'leaving') || i % 3 !== 0; b.rotation.z = Math.sin(time * 1.5 + i) * 0.12; }); }
    const lead = c.leader ? s.customers.find((o) => o.id === c.leader) : c;
    const seated = !!c.seat && ['waitFood', 'eating', 'seated', 'stall'].includes(c.st) && Math.hypot(c.x - c.seat.x, c.z - c.seat.z) < 0.05;
    const eating = c.st === 'eating' || (c.st === 'seated' && lead?.st === 'eating');
    const pose = c.sick ? 'sick' : eating && seated ? 'eat' : seated ? 'sit' : 'idle';
    const tint = c.sick ? { color: C.sick, amount: 0.75 } : c.stage === 'furious' ? { color: 0xFF2A2A, amount: 0.55 + Math.abs(Math.sin(time * 10)) * 0.2 } : c.stage === 'angry' ? { color: 0xFF4A3A, amount: 0.3 } : null;
    const showMood = c.kind === 'customer' && ['line', 'waitDrink', 'waitFood', 'pay', 'leaving'].includes(c.st);
    const slip = c.slipUntil && s.t < c.slipUntil ? 1 - (c.slipUntil - s.t) / 1.4 : 0;
    const sy = seated ? c.seat.yaw : 0;
    updateJelly(obj, dt, time, { x: c.x + (seated ? Math.sin(sy) * 0.08 : 0), z: c.z + (seated ? Math.cos(sy) * 0.08 : 0), y: seated ? 0.08 : 0, yaw: c.yaw, pose, mood: showMood ? c.stage : 'ok', tint, slip });

    const b = obj.userData.bubble;
    b.visible = myRole === 'server' && c.st !== 'leaving' || (myRole === 'server' && !!c.bubble);
    const icon = c.kind === 'inspector' ? '📋' : c.sick ? '🤢' : c.st === 'eating' ? '😋'
      : c.st === 'waitDrink' ? (c.drinksLeft?.[0] === 'coffee' ? '☕' : '🥤') : c.st === 'pay' ? '💵'
      : s.noise.length && ['line', 'waitDrink', 'waitFood', 'pay'].includes(c.st) ? '🙉'
      : { ok: '', impatient: '😒', angry: '😠', furious: '🤬' }[c.stage];
    const showBar = c.kind === 'customer' && !c.leader && ['line', 'waitDrink', 'waitFood', 'pay'].includes(c.st);
    const tableTag = '';
    const html = `${c.bubble ? `<div class="say ${c.stage}">${esc(c.bubble)}</div>` : ''}<div class="row">${tableTag}${icon ? `<span class="ic">${icon}</span>` : ''}${showBar ? `<span class="pat"><i style="width:${Math.max(0, c.pat) * 100}%" class="${c.stage}"></i></span>` : ''}</div>`;
    if (b.element.dataset.html !== html) { b.element.innerHTML = html; b.element.dataset.html = html; }
  }

  // Kitchen display (KDS): one card per open ticket, oldest first.
  // Shows the table, a timer and the first few items; long orders say "print for the full ticket".
  updateTV(s) {
    const open = s.tickets.filter((t) => t.status !== 'served' && s.customers.some((c) => c.id === t.cid && c.st !== 'leaving'));
    const blink = Math.floor(performance.now() / 450) % 2;
    const sig = `${s.power}|${s.jam}|${blink && s.jam ? 1 : 0}|${open.map((t) => `${t.id}${t.status[0]}${Math.floor((s.t - t.t) / 5)}`).join(',')}|${Math.floor(s.t / 60)}`;
    if (sig === this.tvSig) return;
    this.tvSig = sig;
    const MAXLINES = 3;
    const name = (it) => {
      const n = { pancakes: 'PANCAKES', eggs: 'EGGS', bacon: 'BACON', toast: 'TOAST', cheeseburger: 'CHEESEBURGER', fries: 'FRIES', grilledcheese: 'GRILLED CHEESE', milkshake: 'MILKSHAKE' }[it.kind] || it.kind.toUpperCase();
      return it.style ? `${n} · ${it.style.replace('sunny side up', 'SUNNY').replace('over easy', 'OVER EZ').toUpperCase()}` : n;
    };
    this.tvCanvas.redraw((ctx, W, H) => {
      ctx.fillStyle = s.power ? '#E9EEF1' : '#050505'; ctx.fillRect(0, 0, W, H);
      if (!s.power) return;
      const rr = (x, y, w, h, r, fill) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); };
      // top bar
      rr(0, 0, W, 56, 0, '#1F3A4D');
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 26px Fredoka, sans-serif'; ctx.textBaseline = 'middle';
      const mins = 7 * 60 + Math.min(1, s.solo ? (s.t % 600) / 600 : s.t / s.shiftLen) * 420;
      const hh = Math.floor(mins / 60), mm = Math.floor(mins % 60);
      ctx.fillText(`SHORT ORDER  ·  KITCHEN`, 22, 29);
      ctx.textAlign = 'right'; ctx.fillText(`${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`, W - 22, 29);
      ctx.textAlign = 'left';
      const q = open.filter((t) => t.status === 'queued').length;
      rr(370, 12, 230, 34, 17, q ? '#E7B23B' : '#3FB8AF');
      ctx.fillStyle = '#1B1B1B'; ctx.font = 'bold 20px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${open.length} OPEN`, 485, 30); ctx.textAlign = 'left';

      if (!open.length) {
        ctx.fillStyle = '#7C8C96'; ctx.font = 'bold 40px Fredoka, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('All caught up :)', W / 2, H / 2 + 20); ctx.textAlign = 'left';
      }
      // ticket cards
      const cols = 4, gap = 14, cw = (W - gap * (cols + 1)) / cols, top = 70, ch = H - top - 14;
      open.slice(0, cols).forEach((t, i) => {
        const x = gap + i * (cw + gap), age = s.t - t.t;
        const hdr = age > 150 ? '#C8262B' : age > 80 ? '#E7A21B' : '#2E8B84';
        rr(x, top, cw, ch, 12, '#FFFFFF');
        ctx.save(); ctx.beginPath(); ctx.roundRect(x, top, cw, 74, [12, 12, 0, 0]); ctx.fillStyle = hdr; ctx.fill(); ctx.restore();
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 40px Fredoka, sans-serif'; ctx.fillText(`T${t.table}`, x + 14, top + 28);
        ctx.font = 'bold 22px Fredoka, sans-serif'; ctx.fillText(`#${String(t.id).padStart(3, '0')}`, x + 14, top + 60);
        ctx.textAlign = 'right'; ctx.font = 'bold 34px "Courier Prime", monospace';
        ctx.fillText(`${Math.floor(age / 60)}:${String(Math.floor(age % 60)).padStart(2, '0')}`, x + cw - 14, top + 28);
        ctx.font = 'bold 19px Fredoka, sans-serif'; ctx.fillText(t.status === 'queued' ? 'NEW' : 'PRINTED ✓', x + cw - 14, top + 60); ctx.textAlign = 'left';
        // items
        const lines = t.items.map(name);
        const shown = lines.length > MAXLINES ? lines.slice(0, MAXLINES - 1) : lines;
        ctx.fillStyle = '#1B1B1B';
        shown.forEach((l, j) => {
          const y = top + 120 + j * 74;
          ctx.font = 'bold 26px "Courier Prime", monospace';
          ctx.fillText('1×', x + 12, y);
          ctx.font = `bold ${l.length > 12 ? 22 : 28}px "Courier Prime", monospace`;
          ctx.fillText(l, x + 52, y, cw - 64);
          const it = t.items[j];
          if (it.toppings) { ctx.font = '18px "Courier Prime", monospace'; ctx.fillStyle = '#6A7880'; ctx.fillText(it.toppings.length ? '+ MODS' : 'PLAIN', x + 52, y + 27, cw - 64); ctx.fillStyle = '#1B1B1B'; }
          ctx.strokeStyle = '#E3E8EB'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 10, y + 44); ctx.lineTo(x + cw - 10, y + 44); ctx.stroke();
        });
        if (lines.length > shown.length) {
          const y = top + 120 + shown.length * 74;
          rr(x + 10, y - 26, cw - 20, 64, 10, '#FFE7B0');
          ctx.fillStyle = '#8A5A00'; ctx.font = 'bold 22px Fredoka, sans-serif';
          ctx.font = 'bold 26px Fredoka, sans-serif'; ctx.fillText(`+${lines.length - shown.length} MORE`, x + 22, y + 4, cw - 44);
        }
        if (t.drinks?.length) { ctx.fillStyle = '#8A98A0'; ctx.font = '19px Fredoka, sans-serif'; ctx.fillText(`+ ${t.drinks.length} DRINK${t.drinks.length > 1 ? 'S' : ''} (FOH)`, x + 14, top + ch - 20); }
      });
      if (open.length > cols) {
        rr(W - 150, H - 46, 136, 34, 17, '#1F3A4D');
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 18px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`+${open.length - cols} more →`, W - 82, H - 28); ctx.textAlign = 'left';
      }
      // printer jam banner
      if (s.jam) {
        rr(W / 2 - 230, H / 2 - 44, 460, 88, 16, blink ? '#C8262B' : '#E7B23B');
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 40px Bungee, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('PRINTER JAM!', W / 2, H / 2 + 2); ctx.textAlign = 'left';
      }
    });
  }

  // ---- each player only sees their own side of the wall ----
  // The other side is covered by the diner's flat roof, so the cook can't watch the dining
  // room and the server can't watch the kitchen: they have to talk to each other.
  zoneAt(x, z) { if (x < 3.1 && Math.abs(z - L.wallZ) < 0.16) return 'both'; return z < L.wallZ && x < 3.1 ? 'kitchen' : 'dining'; }
  setupZones() {
    const b = new THREE.Box3(), c = new THREE.Vector3();
    this.zoneList = [];
    for (const o of this.static.children) {
      if (o === this.roofs?.kitchen || o === this.roofs?.dining || o.userData.outdoor) continue;
      b.setFromObject(o); if (b.isEmpty() || b.max.y < 0.02) continue;      // floors and ground stay
      if (b.min.x < 3.0 && b.max.x > 3.2 && b.min.z < L.wallZ - 1) continue;   // long walls shared by both sides
      b.getCenter(c);
      const z = this.zoneAt(c.x, c.z); if (z !== 'both') this.zoneList.push([o, z]);
    }
    this.zoneRole = null;
  }
  applyZones(role) {
    const mine = role === 'cook' ? 'kitchen' : 'dining';
    const hideSubtree = (o, show) => o.traverse((x) => { if (x.isCSS2DObject || x.userData.css) { if (!show) { if (x.visible) { x.visible = false; x.userData.zoneHidden = true; } } else if (x.userData.zoneHidden) { x.visible = true; x.userData.zoneHidden = false; } } });
    if (this.zoneRole !== role) {
      this.zoneRole = role;
      for (const [o, z] of this.zoneList) { const show = z === mine; o.visible = show; hideSubtree(o, show); }
      this.roofs.kitchen.visible = role !== 'cook'; this.roofs.dining.visible = role === 'cook';
    }
    for (const o of this.dynRoot.children) {
      const z = this.zoneAt(o.position.x, o.position.z);
      const show = z === 'both' || z === mine;
      if (o.visible !== show) { o.visible = show; hideSubtree(o, show); }
      else if (!show) hideSubtree(o, false);
    }
  }

  buildRoofs() {
    const mk = (parts) => {
      const g = new THREE.Group();
      const top = paint(0xE4DCCD, 0.95), lip = paint(0xF0786A, 0.8), duct = paint(0xC9D3DC, 0.7);
      for (const [x0, z0, x1, z1] of parts) {
        rbox(g, x1 - x0, 0.14, z1 - z0, top, (x0 + x1) / 2, 1.08, (z0 + z1) / 2, 0);
        // a chunky coral parapet around each section
        for (const [w, d, x, z] of [[x1 - x0, 0.22, (x0 + x1) / 2, z0 + 0.11], [x1 - x0, 0.22, (x0 + x1) / 2, z1 - 0.11], [0.22, z1 - z0, x0 + 0.11, (z0 + z1) / 2], [0.22, z1 - z0, x1 - 0.11, (z0 + z1) / 2]]) rbox(g, w, 0.22, d, lip, x, 1.08, z, 0.06);
        // air-conditioning boxes and vents so it reads as a roof
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        rbox(g, 1.1, 0.55, 0.8, duct, cx - (x1 - x0) * 0.22, 1.22, cz, 0.1);
        for (let i = 0; i < 3; i++) cyl(g, 0.09, 0.11, 0.35, duct, cx + (x1 - x0) * 0.18 + i * 0.5, 1.22, cz - (z1 - z0) * 0.2, 14);
        for (const sx of [-1, 1]) { const f = cyl(g, 0.28, 0.28, 0.08, duct, cx - (x1 - x0) * 0.22 + sx * 0.25, 1.77, cz, 18); f.castShadow = false; }
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      g.visible = false;
      this.static.add(g);
      return g;
    };
    this.roofs = {
      kitchen: mk([[-8.2, -7.25, 3.15, L.wallZ - 0.2]]),
      dining: mk([[-8.2, L.wallZ + 0.2, 8.2, L.cut.z], [L.cut.x, L.cut.z, 8.2, 9.15], [3.15, -7.25, 8.2, L.wallZ - 0.05]]),
    };
  }

  // grass, trees, bushes and benches around the diner (cartoon scenery)
  buildOutdoors() {
    const S = this.static, g = new THREE.Group(); g.userData.outdoor = true; S.add(g);
    const leaf = [paint(0x5CC46B, 0.85), paint(0x4FB062, 0.85), paint(0x74D27A, 0.85)], trunk = paint(0xA0693E, 0.9);
    const tree = (x, z, k = 1) => {
      cyl(g, 0.12 * k, 0.16 * k, 1.1 * k, trunk, x, 0, z, 10);
      for (let i = 0; i < 4; i++) sph(g, (0.6 + (i % 2) * 0.15) * k, leaf[i % 3], x + Math.cos(i * 2.1) * 0.35 * k, (1.45 + (i % 3) * 0.25) * k, z + Math.sin(i * 2.1) * 0.3 * k, 1, 0.9, 1, 14);
    };
    const bush = (x, z, k = 1) => { for (let i = 0; i < 3; i++) sph(g, 0.35 * k, leaf[(i + 1) % 3], x + (i - 1) * 0.32 * k, 0.25 * k, z + (i % 2) * 0.12, 1, 0.85, 1, 12); };
    for (const x of [-11, -6, 6, 11]) tree(x, 12.8, 1.1);
    for (const [x, z] of [[-10.5, -3], [-10.5, 3.5], [10.6, -4], [10.6, 2.5], [-6, -9.6], [0, -9.8], [6, -9.6]]) tree(x, z, 1.15);
    for (const [x, z] of [[-7.4, 6.2], [-3.2, 8.4], [-6.0, 8.6], [4.5, 9.9], [-0.3, 10.2]]) bush(x, z);
    // a bench and a mailbox in the little forecourt
    rbox(g, 1.6, 0.08, 0.45, paint(0xF0786A, 0.8), -4.6, 0.42, 6.3, 0.04);
    rbox(g, 1.6, 0.4, 0.08, paint(0xF0786A, 0.8), -4.6, 0.5, 6.5, 0.04);
    for (const sx of [-0.65, 0.65]) rbox(g, 0.08, 0.42, 0.4, paint(0x5B6270, 0.8), -4.6 + sx, 0, 6.3, 0.03);
    cyl(g, 0.05, 0.05, 0.9, paint(0x3E6FD8, 0.7), -2.2, 0, 7.6, 10); rbox(g, 0.42, 0.36, 0.3, paint(0x3E6FD8, 0.7), -2.2, 0.9, 7.6, 0.12);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  // everything the incidents put in the world (see incidents.js)
  updateIncidents(s, dt, time) {
    const I = s.inc || {};
    // flipped tables lie on their side
    for (const tb of s.tables) {
      const V = this.vis.tables[tb.n]; if (!V) continue;
      const want = tb.flipped ? -1.42 : 0;
      V.group.rotation.x += (want - V.group.rotation.x) * Math.min(1, dt * 9);
      V.group.position.y = Math.sin(-V.group.rotation.x) * 0.38;
    }
    // the stray dog
    if (I.dog) {
      const d = this.ensure('dog', 'x', () => { const g = Mo.dogModel(); ia(g, 'dog'); hitBox(g, 0.5, 0.6, 0.8, 0, 0, 0); return g; });
      d.position.set(I.dog.x, 0, I.dog.z); d.rotation.y = I.dog.yaw;
      const u = d.userData, ph = time * 16;
      u.legs?.forEach((l, i) => { l.rotation.x = Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6; });
      if (u.tail) u.tail.rotation.y = Math.sin(time * 18) * 0.6;
      if (u.body) u.body.position.y = 0.32 + Math.abs(Math.sin(ph)) * 0.03;
    }
    // the cook's forgotten lunch
    if (I.staffMeal || s.fire?.at === 'staff') {
      const m = this.ensure('staffmeal', 'x', () => { const g = Mo.staffMealModel(); ia(g, 'staffmeal'); hitBox(g, 0.4, 0.3, 0.4, 0, 0, 0); return g; });
      m.position.set(L.staffMeal.x, TOP, L.staffMeal.z);
    }
    // the knife on the floor
    if (I.knife) { const k = this.ensure('knife', 'x', () => { const g = Mo.knifeModel(); ia(g, 'knife'); hitBox(g, 0.4, 0.15, 0.3, 0, 0, 0); return g; }); k.position.set(I.knife.x, 0.01, I.knife.z); k.rotation.y = I.knife.x * 3; }
    // the poster (charred once it's burned) and the smoke detector
    { const p = this.ensure('poster', I.posterBurnt ? 'b' : 'n', () => { const g = Mo.posterModel(I.posterBurnt); ia(g, 'poster'); hitBox(g, 0.5, 0.6, 0.1, 0, -0.3, 0); return g; }); p.position.set(L.poster.x, L.poster.y, -6.95); }
    { const on = s.alarm && Math.sin(time * 12) > 0; const dd = this.ensure('detector', on ? '1' : '0', () => { const g = Mo.detectorModel(on); ia(g, 'detector'); hitBox(g, 0.5, 0.3, 0.5, 0, -0.3, 0); return g; }); dd.position.set(L.detector.x, L.ceiling, L.detector.z); }
    // the stuck order bell rattles
    if (this.bellObj) this.bellObj.rotation.z = I.bellStuck ? Math.sin(time * 45) * 0.18 : 0;
  }

  // fans, the clock, flickering neon and steam from whatever's cooking
  updateLife(s, dt, time) {
    const D = this.decor;
    for (const b of D.fans) b.rotation.y += dt * (s.power ? 2.4 : 0.3);
    const prog = s.solo ? (s.t % 600) / 600 : Math.min(1, s.t / s.shiftLen);
    const mins = 7 * 60 + prog * 420;
    D.clock.minute.rotation.z = -((mins % 60) / 60) * Math.PI * 2;
    D.clock.hour.rotation.z = -(((mins / 60) % 12) / 12) * Math.PI * 2;
    D.flick = D.flick || D.neon.map(() => 0);
    D.neon.forEach((m, i) => {
      if (D.flick[i] <= 0 && Math.random() < dt * 0.06) D.flick[i] = 0.25 + Math.random() * 0.5;
      if (D.flick[i] > 0) D.flick[i] -= dt;
      const on = !s.power ? 0 : D.flick[i] > 0 ? (Math.random() < 0.5 ? 0.15 : 1) : 1;
      m.material.emissiveIntensity = 4 * on;
    });
    const src = [];
    s.stations.griddle.forEach((it, i) => { if (it?.type === 'food') src.push({ x: L.griddle.slotX[i], y: TOP + 0.12, z: L.griddle.z, rate: it.q?.burnt ? 1 : 2.4, size: 0.32 }); });
    s.stations.fryer.forEach((it, i) => { if (it?.type === 'food' && it.lowered) src.push({ x: L.fryer.slotX[i], y: TOP + (this.basketDown ?? 0.1) + 0.12, z: L.fryer.z, rate: 3.5, size: 0.38 }); });
    s.stations.toaster.forEach((it, i) => { if (it?.type === 'food' && !it.popped) src.push({ x: L.toaster.x + (i ? 0.15 : -0.15), y: TOP + 0.26, z: L.toaster.z, rate: 0.8, size: 0.2 }); });
    if (s.coffeeM) src.push({ x: L.coffee.x + 0.08, y: 1.25, z: L.coffee.z, rate: s.coffeeM.mug.p < 1 ? 2 : 0.6, size: 0.18 });
    s.trays.forEach((tr, i) => { if (tr?.plate?.items.some((f) => f.age < 25)) src.push({ x: L.trays[i].x, y: L.pass.shelfY + 0.12, z: L.wallZ, rate: 0.9, size: 0.2 }); });
    const I = s.inc || {};
    if (I.freezerOpenAt != null) src.push({ x: L.freezer.x + (Math.random() - 0.5) * 1.2, y: 1.2, z: L.freezer.z + 0.55, rate: 6, size: 0.45 });
    if (I.coffee?.phase === 'leak') { src.push({ x: L.coffee.x, y: 1.3, z: L.coffee.z, rate: 5, size: 0.3 }); if (Math.random() < dt * 4) this.life.emit(L.coffee.x, 1.15, L.coffee.z + 0.1, 0.2, 0x3A2A1E, 0.6); }
    if (I.staffMeal && s.t > I.staffMeal.burnAt - 12 && Math.random() < dt * 3) this.life.emit(L.staffMeal.x, TOP + 0.12, L.staffMeal.z, 0.3, 0x6A625A, 0.45);
    if (I.toasterJam && s.stations.toaster.some((x) => x) && Math.random() < dt * 2.5) this.life.emit(L.toaster.x, TOP + 0.3, L.toaster.z, 0.25, 0x5A544E, 0.45);
    if (s.fire && (s.fire.at === 'staff' || s.fire.at === 'poster') && Math.random() < dt * 6) this.life.emit(s.fire.at === 'staff' ? L.staffMeal.x : L.poster.x, s.fire.at === 'staff' ? TOP + 0.3 : L.poster.y + 0.2, s.fire.at === 'staff' ? L.staffMeal.z : -6.8, 0.5, 0x3E3934, 0.55);
    this.life.update(dt, time, src);
  }

  updateEnvironment(s, time) {
    const dim = !s.power;
    this.hemi.intensity = dim ? 0.35 : 0.8; this.sun.intensity = dim ? 0.7 : 2.2;
    // indoor lights die with the power (the daylight doesn't); the kitchen fluorescent stutters now and then
    const stutter = Math.sin(time * 0.7) > 0.985 ? (Math.random() < 0.5 ? 0.15 : 1) : 1;
    for (const [l, base] of this.indoor) l.intensity = dim ? 0 : base * (l === this.kLight ? stutter : 1);
    this.neon.forEach((n) => { n.material.color.setHex(dim ? 0x333333 : 0xFFFFFF); });
    this.printerLight.material.emissive.setHex(!s.power ? 0x000000 : s.jam ? (Math.floor(time * 4) % 2 ? 0xFF2020 : 0x000000) : 0x33FF66);
    this.breakerLight.material.emissive.setHex(s.power ? 0x33FF66 : 0xFF2020);
    this.alarmLight.material.emissive.setHex(s.alarm && Math.floor(time * 4) % 2 ? 0xFF0000 : 0x000000);
    this.alarmLight.material.emissiveIntensity = 1;
    this.heatLamp.material.emissiveIntensity = s.power ? 1.2 : 0.1;
    this.heatLight.intensity = s.power ? 1.2 : 0;
    const regOk = s.power && s.t >= s.registerBootUntil;
    this.regScreens.forEach((r) => { const c = !s.power ? 0x111111 : regOk ? 0x33DD77 : 0xE7B23B; r.material.color.setHex(c); r.material.emissive.setHex(c); });
    const juke = s.jukebox && s.power;
    const jc = !s.power ? 0x000000 : juke ? [0xFF2040, 0x40FF80, 0x4080FF, 0xFFE040][Math.floor(time * 8) % 4] : 0xFFB040;
    this.jukeTubes.forEach((t) => t.material.emissive.setHex(jc));
    this.jukebox.position.x = L.jukebox.x + (juke ? Math.sin(time * 50) * 0.02 : 0);
  }
}

export function heldSig(h) { return World.prototype.itemSig.call(World.prototype, h); }

export function heldModel(h, grime = 0) {
  const g = new THREE.Group();
  switch (h?.type) {
    case 'food': g.add(Mo.itemModel(h)); break;
    case 'plate': g.add(Mo.plateModel(h)); break;
    case 'tray': {
      g.add(Mo.trayModel());
      const p = Mo.plateModel(h.plate); p.position.y = 0.015; g.add(p);
      if (h.receiptId) { const r = Mo.receiptModel(grime); r.position.set(0.22, 0.02, 0.05); r.rotation.y = 0.3; g.add(r); }
      break;
    }
    case 'dishes': g.add(Mo.dishStack(h.n)); break;
    case 'cup': g.add(Mo.cupModel(h)); break;
    case 'mug': g.add(Mo.mugModel(h)); break;
    case 'ext': { const e = Mo.extinguisherModel(); e.position.y = -0.25; g.add(e); break; }
    case 'mop': { const m = Mo.mopModel(); m.position.y = 0.6; m.rotation.x = 0.75; g.add(m); break; }
    case 'plunger': { const m = Mo.plungerModel(); m.position.set(0, -0.35, 0); m.rotation.x = 0.4; g.add(m); break; }
  }
  return g;
}
export function receiptHeldModel(grime) { const r = Mo.receiptModel(grime); r.rotation.x = Math.PI / 2 - 0.3; return r; }

const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
export { zoneOf };
