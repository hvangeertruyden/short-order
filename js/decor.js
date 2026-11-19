// ---------------------------------------------------------------------------
// Atmosphere: things that move (steam, dust, fans, clock, flickering neon) and
// clutter that makes the diner feel lived in (neon signs, framed ads, pie case,
// sugar shakers, kitchen odds and ends). Also the surface textures.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { L, TABLES } from './data.js';
import * as Mo from './models.js';
const { M, paint, rbox, cyl, sph, grp, lathe, tube, torus, canvasTex } = Mo;

// ---- textures ------------------------------------------------------------------
function speckleTex(base, flecks, repeat = 2) {
  const t = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { c.fillStyle = flecks[i % flecks.length]; const r = Math.random() * 1.6 + 0.4; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, r * 1.6, r, Math.random() * 3, 0, 7); c.fill(); }
  });
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping; t.tex.repeat.set(repeat, repeat);
  return t.tex;
}
// height canvas -> normal map (Sobel), so grout and grooves catch the light
function normalFrom(drawHeight, size = 256, strength = 2.5) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d'); drawHeight(c, size);
  const src = c.getImageData(0, 0, size, size).data;
  const out = c.createImageData(size, size);
  const hAt = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * strength, dy = (hAt(x, y + 1) - hAt(x, y - 1)) * strength;
    const nx = -dx, ny = -dy, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * size + x) * 4;
    out.data[i] = (nx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; out.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  c.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
export function upgradeSurfaces(world) {
  // speckled formica for counters and tabletops
  const formica = speckleTex('#E8DCC3', ['#C8262B', '#3FB8AF', '#2A2A2A', '#B9AD94'], 3);
  // brushed steel streaks
  const brushed = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#8C8C8C'; c.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { const v = 110 + Math.random() * 80; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 90, 1); } });
  brushed.tex.wrapS = brushed.tex.wrapT = THREE.RepeatWrapping; brushed.tex.repeat.set(3, 3);
  for (const m of [M.steel, M.panel, M.darkSteel]) { m.roughnessMap = brushed.tex; m.needsUpdate = true; }
  world.static.traverse((o) => {
    if (!o.isMesh || !o.material?.color) return;
    const hex = o.material.color.getHex();
    if (hex === 0xF4ECDA || hex === 0xE4D6BA) {       // counter tops + tabletops
      o.material = new THREE.MeshStandardMaterial({ map: formica, roughness: 0.6 });
    }
  });
  // floors: grout you can see, slightly polished tiles
  const grout = (c, n) => { c.fillStyle = '#fff'; c.fillRect(0, 0, n, n); c.fillStyle = '#000'; c.fillRect(0, 0, n, 5); c.fillRect(0, 0, 5, n); c.fillRect(0, n / 2 - 2, n, 4); c.fillRect(n / 2 - 2, 0, 4, n); };
  const floorN = normalFrom(grout, 256, 3);
  world.static.traverse((o) => {
    if (o.isMesh && o.geometry?.type === 'PlaneGeometry' && Math.abs(o.rotation.x + Math.PI / 2) < 0.01 && o.material?.map?.repeat.x === 16) {   // the checkered dining floor
      const t = floorN.clone(); t.needsUpdate = true; t.repeat.copy(o.material.map.repeat);
      o.material.normalMap = t; o.material.normalScale = new THREE.Vector2(0.6, 0.6); o.material.needsUpdate = true;
    }
  });
}

// ---- glowing signs ------------------------------------------------------------------
function neonSign(parent, text, color, w, h, font = 'Bungee', extra) {
  const t = canvasTex(512, Math.round(512 * h / w), (c, cw, ch) => {
    c.clearRect(0, 0, cw, ch);
    c.font = `bold ${Math.floor(ch * 0.62)}px ${font}, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = ch * 0.1; c.strokeStyle = color; c.shadowColor = color; c.shadowBlur = ch * 0.14;
    c.strokeText(text, cw / 2, ch / 2 + 4); c.shadowBlur = 0; c.globalAlpha = 0.45; c.lineWidth = ch * 0.03; c.strokeStyle = '#FFFFFF'; c.strokeText(text, cw / 2, ch / 2 + 4); c.globalAlpha = 1;
    extra?.(c, cw, ch);
  });
  const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xFFFFFF, emissiveMap: t.tex, emissiveIntensity: 4, transparent: true, alphaMap: t.tex, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  parent.add(m);
  const back = rbox(parent, w + 0.1, h + 0.1, 0.03, paint(0x1B1B1B, 0.6), 0, -(h + 0.1) / 2, -0.03, 0.01); void back;
  return m;
}

// ---- framed retro ads (original designs) ---------------------------------------------
const ADS = {
  fizzy: (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3FB8AF'); g.addColorStop(1, '#1F6F6A'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#F5EBD3'; c.beginPath(); c.arc(w / 2, h * 0.42, w * 0.3, 0, 7); c.fill();
    c.fillStyle = '#C8262B'; c.beginPath(); c.moveTo(w * 0.42, h * 0.2); c.lineTo(w * 0.58, h * 0.2); c.lineTo(w * 0.6, h * 0.66); c.quadraticCurveTo(w / 2, h * 0.72, w * 0.4, h * 0.66); c.closePath(); c.fill();
    c.fillStyle = '#F5EBD3'; c.fillRect(w * 0.45, h * 0.12, w * 0.1, h * 0.09);
    c.font = `italic bold ${w * 0.15}px Fredoka`; c.textAlign = 'center'; c.fillStyle = '#F5EBD3'; c.fillText('Fizzy Pop', w / 2, h * 0.84);
    c.font = `bold ${w * 0.06}px Fredoka`; c.fillText('THE TASTE OF TOMORROW!', w / 2, h * 0.93);
  },
  burger: (c, w, h) => {
    c.fillStyle = '#E7B23B'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#F2C452' : '#E7B23B'; c.beginPath(); c.moveTo(w / 2, h * 0.42); c.arc(w / 2, h * 0.42, w, (i / 12) * 6.283, ((i + 1) / 12) * 6.283); c.fill(); }
    const cx = w / 2, cy = h * 0.42, r = w * 0.3;
    c.fillStyle = '#D8963E'; c.beginPath(); c.ellipse(cx, cy - r * 0.15, r, r * 0.55, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#7CC44E'; c.fillRect(cx - r, cy - r * 0.15, r * 2, r * 0.18);
    c.fillStyle = '#FFC93C'; c.fillRect(cx - r * 0.95, cy, r * 1.9, r * 0.12);
    c.fillStyle = '#5A3320'; c.fillRect(cx - r, cy + r * 0.1, r * 2, r * 0.3);
    c.fillStyle = '#D8963E'; c.fillRect(cx - r, cy + r * 0.4, r * 2, r * 0.25);
    c.font = `bold ${w * 0.14}px Bungee`; c.textAlign = 'center'; c.fillStyle = '#C8262B'; c.fillText('BIG BUN', w / 2, h * 0.82);
    c.font = `bold ${w * 0.07}px Fredoka`; c.fillStyle = '#1B1B1B'; c.fillText('BURGERS · 2 FOR 49¢', w / 2, h * 0.92);
  },
  malt: (c, w, h) => {
    c.fillStyle = '#F4A6B8'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc((i * 73) % w, (i * 131) % h, 4, 0, 7); c.fill(); }
    c.fillStyle = '#FFFFFF'; c.beginPath(); c.moveTo(w * 0.32, h * 0.25); c.lineTo(w * 0.68, h * 0.25); c.lineTo(w * 0.6, h * 0.66); c.lineTo(w * 0.4, h * 0.66); c.closePath(); c.fill();
    c.fillStyle = '#C8262B'; c.beginPath(); c.arc(w / 2, h * 0.17, w * 0.05, 0, 7); c.fill();
    c.fillStyle = '#FFF6EE'; c.beginPath(); c.arc(w * 0.44, h * 0.24, w * 0.09, 0, 7); c.arc(w * 0.56, h * 0.24, w * 0.09, 0, 7); c.fill();
    c.font = `bold ${w * 0.13}px Bungee`; c.textAlign = 'center'; c.fillStyle = '#7A1E3A'; c.fillText('FROSTEE', w / 2, h * 0.8);
    c.font = `bold ${w * 0.07}px Fredoka`; c.fillText('MALTS & SHAKES', w / 2, h * 0.9);
  },
};
function framedAd(parent, kind, w = 0.7, h = 0.95) {
  const t = canvasTex(256, Math.round(256 * h / w), (c, cw, ch) => ADS[kind](c, cw, ch));
  rbox(parent, w + 0.08, h + 0.08, 0.04, M.chrome, 0, -(h + 0.08) / 2, -0.02, 0.012);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t.tex, roughness: 0.4 }));
  m.position.z = 0.002; parent.add(m);
}

// ---- props ----------------------------------------------------------------------------
function pieCase() {
  const g = new THREE.Group();
  cyl(g, 0.3, 0.32, 0.03, M.chrome, 0, 0, 0, 28); cyl(g, 0.03, 0.04, 0.12, M.chrome, 0, 0.03, 0, 12); cyl(g, 0.27, 0.27, 0.015, M.ceramic, 0, 0.15, 0, 28);
  const pie = (x, z, filling, cut) => {
    const p = grp(g, x, 0.165, z);
    lathe(p, [[0, 0], [0.1, 0], [0.11, 0.03], [0.105, 0.035], [0, 0.03]], paint(0xD8A060, 0.7));
    cyl(p, 0.098, 0.098, 0.01, paint(filling, 0.3), 0, 0.022, 0, 20);
    for (let i = -2; i <= 2; i++) { rbox(p, 0.2, 0.008, 0.018, paint(0xE4B472, 0.7), 0, 0.03, i * 0.04, 0.003); rbox(p, 0.018, 0.009, 0.2, paint(0xE4B472, 0.7), i * 0.04, 0.031, 0, 0.003); }
    if (cut) { const gap = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.06, 20, 1, false, 0, 0.9), paint(0xF4F1E8, 0.3)); gap.position.y = 0.02; p.add(gap); }
  };
  pie(-0.1, 0.05, 0xB0182A, true); pie(0.11, -0.06, 0xE7B23B, false);
  sph(g, 0.29, new THREE.MeshPhysicalMaterial({ color: 0xEAF6FA, roughness: 0.02, transparent: true, opacity: 0.18, metalness: 0 }), 0, 0.16, 0, 1, 0.9, 1, 28);
  sph(g, 0.03, M.chrome, 0, 0.43, 0, 1, 1, 1, 10);
  return g;
}
function sugarShaker() {
  const g = new THREE.Group();
  cyl(g, 0.032, 0.035, 0.1, M.glass, 0, 0, 0, 14); cyl(g, 0.03, 0.03, 0.07, paint(0xFFFFFF, 0.9), 0, 0.002, 0, 12);
  lathe(g, [[0.034, 0], [0.034, 0.02], [0.012, 0.05], [0.006, 0.06], [0, 0.06]], M.chrome, 0, 0.1, 0, 14);
  return g;
}
function fanModel() {
  const g = new THREE.Group();
  cyl(g, 0.012, 0.012, 0.3, M.chrome, 0, -0.3, 0, 8);
  lathe(g, [[0, 0], [0.11, 0], [0.12, 0.05], [0.06, 0.12], [0, 0.12]], M.chrome, 0, -0.42, 0, 18);
  const blades = grp(g, 0, -0.38, 0);
  for (let i = 0; i < 4; i++) { const b = rbox(null, 0.62, 0.012, 0.15, M.wood, 0, 0, 0, 0.005); b.position.set(Math.cos(i * Math.PI / 2) * 0.38, 0, Math.sin(i * Math.PI / 2) * 0.38); b.rotation.y = -i * Math.PI / 2; b.rotation.x = 0.12; blades.add(b); }
  sph(g, 0.07, emissive(0xFFF3D6, 1.4), 0, -0.47, 0, 1, 0.6, 1, 14);
  g.userData.blades = blades;
  return g;
}
const emissive = (c, i) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 });
function radioModel() {
  const g = new THREE.Group();
  rbox(g, 0.34, 0.2, 0.14, paint(0x3FB8AF, 0.35), 0, 0, 0, 0.06);
  cyl(g, 0.06, 0.06, 0.01, paint(0xE7D6B0, 0.5), -0.06, 0.1, 0.071, 20).rotation.x = Math.PI / 2;
  rbox(g, 0.1, 0.05, 0.01, paint(0xFFE7A8, 0.4, { emissive: 0xFFB040, emissiveIntensity: 0.6 }), 0.08, 0.11, 0.072, 0.005);
  Mo.knob(g, 0.06, 0.05, 0.075); Mo.knob(g, 0.11, 0.05, 0.075);
  tube(g, [[0.12, 0.2, -0.02], [0.18, 0.4, -0.03]], 0.004, M.chrome, 4);
  return g;
}
function utensilRail() {
  const g = new THREE.Group();
  cyl(g, 0.012, 0.012, 1.5, M.chrome, 0, 0, 0, 8).rotation.z = Math.PI / 2;
  g.children[0].position.set(0, 0, 0);
  const hang = (x, make) => { const h = grp(g, x, -0.02, 0.0); torus(h, 0.02, 0.004, M.chrome, 0, 0, 0).rotation.y = Math.PI / 2; make(h); };
  hang(-0.6, (h) => { cyl(h, 0.008, 0.008, 0.3, M.black, 0, -0.32, 0, 6); lathe(h, [[0, 0], [0.05, 0], [0.055, 0.04], [0, 0.04]], M.steel, 0, -0.36, 0, 14); });  // ladle
  hang(-0.3, (h) => { cyl(h, 0.008, 0.008, 0.22, M.black, 0, -0.24, 0, 6); rbox(h, 0.09, 0.12, 0.004, M.steel, 0, -0.38, 0, 0.004); });                          // spatula
  hang(0.0, (h) => { cyl(h, 0.008, 0.008, 0.16, M.wood, 0, -0.18, 0, 6); for (let i = 0; i < 5; i++) { const w = torus(h, 0.035, 0.002, M.steel, 0, -0.26, 0, Math.PI); w.rotation.set(Math.PI, i * 0.6, 0); w.scale.set(1, 1.8, 1); } }); // whisk
  hang(0.3, (h) => { cyl(h, 0.01, 0.01, 0.2, M.black, 0, -0.2, 0, 6); cyl(h, 0.1, 0.09, 0.05, M.darkSteel, 0, -0.32, 0.0, 18).rotation.x = Math.PI / 2; });          // small pan
  hang(0.6, (h) => { cyl(h, 0.008, 0.008, 0.24, M.wood, 0, -0.26, 0, 6); sph(h, 0.04, M.wood, 0, -0.3, 0, 1, 0.4, 1, 10); });                                         // wooden spoon
  return g;
}

// ---- build it all -------------------------------------------------------------------------
export function buildDecor(world) {
  const S = world.static;
  const out = { neon: [], fans: [] };
  // neon signs
  { const g = grp(S, 7.93, 2.15, 1.3); g.rotation.y = -Math.PI / 2; out.neon.push(neonSign(g, 'EAT', '#FF4A5A', 1.4, 0.6)); }
  { const g = grp(S, -7.93, 2.35, -0.6); g.rotation.y = Math.PI / 2; out.neon.push(neonSign(g, 'COFFEE', '#40E0D0', 1.6, 0.42)); }
  { const g = grp(S, 4.9, 2.35, -1.87); out.neon.push(neonSign(g, 'Since 1955', '#FFC94D', 1.5, 0.42, 'Fredoka')); }
  // framed ads
  { const g = grp(S, 7.93, 1.75, 5.9); g.rotation.y = -Math.PI / 2; framedAd(g, 'fizzy'); }
  { const g = grp(S, 0.6, 1.75, -1.87); framedAd(g, 'burger'); }
  { const g = grp(S, 7.93, 1.75, -0.4); g.rotation.y = -Math.PI / 2; framedAd(g, 'malt'); }
  // wall clock (hands follow the diner clock)
  {
    const g = grp(S, 2.4, 2.25, -1.86);
    const face = canvasTex(256, 256, (c, w) => { c.fillStyle = '#F5EBD3'; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 4, 0, 7); c.fill(); c.fillStyle = '#C8262B'; c.font = 'bold 30px Bungee'; c.textAlign = 'center'; c.textBaseline = 'middle'; for (let i = 1; i <= 12; i++) { const a = i / 12 * 6.283 - 1.571; c.fillText(String(i), w / 2 + Math.cos(a) * 98, w / 2 + Math.sin(a) * 98); } });
    const rim = torus(g, 0.27, 0.025, M.chrome, 0, 0, 0.02); void rim;
    const fm = new THREE.Mesh(new THREE.CircleGeometry(0.26, 40), new THREE.MeshStandardMaterial({ map: face.tex, roughness: 0.5 })); fm.position.z = 0.02; g.add(fm);
    const hand = (len, w) => { const p = grp(g, 0, 0, 0.03); rbox(p, w, len, 0.006, M.black, 0, 0, 0, 0.003).position.y = len / 2; return p; };
    out.clock = { hour: hand(0.14, 0.022), minute: hand(0.21, 0.014) };
  }
  // ceiling fans
  for (const [x, z] of [[-2.2, 3.3], [3.1, 3.3]]) { const f = fanModel(); f.position.set(x, L.ceiling, z); S.add(f); out.fans.push(f.userData.blades); }
  // pie case on the counter + sugar shakers on every table
  { const p = pieCase(); p.position.set(-6.7, 1.04, 0.9); S.add(p); }
  for (const t of TABLES) { const sh = sugarShaker(); sh.position.set(t.x - 0.16, 0.76, t.z + (t.seat.z > t.z ? -0.18 : 0.18)); S.add(sh); world.vis.tables[t.n].parts.push(sh); }
  // kitchen: utensil rail, radio, spice jars
  { const r = utensilRail(); r.position.set(0.9, 1.62, -6.92); S.add(r); }
  { const r = radioModel(); r.position.set(1.95, 1.89, -6.85); S.add(r); }
  for (let i = 0; i < 6; i++) { cyl(S, 0.035, 0.035, 0.1, M.glass, -0.95 + i * 0.09, 1.89, -6.85, 12); cyl(S, 0.03, 0.03, 0.06, paint([0xC8262B, 0x8B5A2B, 0xE7B23B, 0x5FAF5F, 0x6E3A1C, 0xF4F1E8][i], 0.8), -0.95 + i * 0.09, 1.892, -6.85, 12); cyl(S, 0.037, 0.037, 0.02, M.chrome, -0.95 + i * 0.09, 1.99, -6.85, 12); }
  rbox(S, 0.7, 0.03, 0.2, M.steel, -0.73, 1.86, -6.85, 0.01);
  return out;
}

// ---- moving bits: steam puffs + dust in the light --------------------------------------------
export class Life {
  constructor(scene) {
    const puff = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
    this.puffs = [];
    for (let i = 0; i < 90; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff.tex, transparent: true, opacity: 0, depthWrite: false }));
      sp.visible = false; sp.userData.noHit = true; scene.add(sp);
      this.puffs.push({ sp, life: 0, max: 1, vx: 0, vz: 0 });
    }
    this.next = 0;
    // dust motes drifting in the window light
    const n = 220, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = -7 + Math.random() * 14; pos[i * 3 + 1] = 0.3 + Math.random() * 2.3; pos[i * 3 + 2] = 4.5 + Math.random() * 4.3; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xFFE8B8, size: 0.009, transparent: true, opacity: 0.22, depthWrite: false }));
    this.dust.userData.noHit = true; scene.add(this.dust);
  }
  emit(x, y, z, size = 0.25, color = 0xFFFFFF, alpha = 0.32) {
    const p = this.puffs.find((q) => q.life <= 0);
    if (!p) return;
    p.life = p.max = 1.4 + Math.random() * 0.8; p.size = size; p.alpha = alpha;
    p.sp.material.color.setHex(color);
    p.vx = (Math.random() - 0.5) * 0.08; p.vz = (Math.random() - 0.5) * 0.08;
    p.sp.position.set(x + (Math.random() - 0.5) * 0.15, y, z + (Math.random() - 0.5) * 0.15);
    p.sp.visible = true;
  }
  update(dt, time, sources) {
    // sources: [{x, y, z, rate, size}]
    for (const s of sources) if (Math.random() < s.rate * dt) this.emit(s.x, s.y, s.z, s.size);
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const t = 1 - p.life / p.max;
      p.sp.position.x += p.vx * dt; p.sp.position.z += p.vz * dt; p.sp.position.y += (0.35 + t * 0.2) * dt;
      p.sp.scale.setScalar(p.size * (0.5 + t * 1.6));
      p.sp.material.opacity = Math.sin(Math.PI * t) * p.alpha;
      if (p.life <= 0) p.sp.visible = false;
    }
    const a = this.dust.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      let y = a.getY(i) + Math.sin(time * 0.3 + i) * 0.0008 - 0.0004, x = a.getX(i) + Math.cos(time * 0.2 + i * 1.7) * 0.0009;
      if (y < 0.2) y = 2.6;
      a.setXY(i, x, y);
    }
    a.needsUpdate = true;
  }
}
