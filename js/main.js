// ---------------------------------------------------------------------------
// Short Order — bootstrap, lobby, game loop, hover/menu, networking glue.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createPost } from './fx.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { newFood } from './kitchen.js';
import { itemModel } from './models.js';
import { SOURCES, RECIPES, MUSIC } from './data.js';
import { World, heldModel, heldSig, receiptHeldModel, COLLIDERS } from './world.js';
import { Sim, receiptById } from './sim.js';
import { getMenu, canTouch } from './actions.js';
import { Controls, isTyping } from './player.js';
import { UI } from './ui.js';
import { Net } from './net.js';
import * as audio from './audio.js';

const RANGE = 2.5;
// things with buttons: interacting with them goes *beep*
const APPLIANCES = new Set(['tv', 'printer', 'toaster', 'blender', 'fryer', 'coffee', 'soda', 'register', 'payreg']);
const SEND_INTERVAL = 1 / 15;
const $ = (s) => document.querySelector(s);
const other = (r) => (r === 'cook' ? 'server' : 'cook');

// ---- renderer / scene ----------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);   // fx.js picks the real ratio per graphics quality
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;   // re-rendered a few times a second (see loop), not every frame
$('#game').appendChild(renderer.domElement);
const labels = new CSS2DRenderer({ element: $('#labels') });
labels.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9FD8E8);
// soft studio reflections so chrome and steel actually look like metal
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 120);
camera.rotation.order = 'YXZ';
scene.add(camera);
const CAM = { h: 9.2, back: 6.6 };   // third-person camera offset (above, and south of, the player)

const world = new World(scene);

const post = createPost(renderer, scene, camera);
try { const q = localStorage.getItem('shortorder.quality'); if (q != null) post.setQuality(Number(q)); } catch {}
const controls = new Controls(renderer.domElement);
const raycaster = new THREE.Raycaster();
raycaster.far = 12;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); labels.setSize(window.innerWidth, window.innerHeight); post.setSize(window.innerWidth, window.innerHeight);
});

// ---- game session state --------------------------------------------------
const G = {
  mode: null,          // 'solo' | 'host' | 'guest'
  sim: null, state: null, role: 'cook', me: { x: 0, z: 0, yaw: 0 },
  net: null, sendT: 0, lastSoundId: 0, target: null, hl: null, heldSig: '', rcptSig: '',
  shiftLen: 300, hostRole: 'cook', shiftNo: 1, solo: false, summaryShownFor: 0, muted: false, shake: 0,
  enteredShift: 0,
};

const ui = new UI({
  onAction: (a) => act(a),
  onChat: (text) => act({ type: 'chat', text }),
  onSay: (text) => act({ type: 'say', text }),
  onCloseNpc: () => act({ type: 'closeNpc' }),
});
$('#end-shift').addEventListener('click', () => { if (G.sim && G.solo && G.mode !== 'guest') G.sim.endShift(); });
ui.onShake = () => { if (G.role === 'server') G.shake = 0.35; };
ui.kdsCanvas = world.tvCanvas.cv;   // the kitchen screen, shown in the cook's HUD

function act(a) {
  if (!a || !G.state) return;
  const k = G.target?.key?.split(':')[0];
  audio.play(APPLIANCES.has(k) && a.type !== 'openSource' ? 'beep' : 'menu');
  if (a.type === 'openSource') { openPantry(a.src); return; }
  if (G.mode === 'guest') G.net?.send({ k: 'act', a });
  else G.sim.apply(G.role, a);
}

// ---- pantry (fridge / freezer / bread box): full-screen picker ----------------
const thumbs = new Map();
let thumbR = null;
function thumbnail(kind) {
  if (thumbs.has(kind)) return thumbs.get(kind);
  if (!thumbR) {
    thumbR = { r: new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }), s: new THREE.Scene(), c: new THREE.PerspectiveCamera(30, 1, 0.01, 10) };
    thumbR.r.setSize(256, 256); thumbR.r.outputColorSpace = THREE.SRGBColorSpace; thumbR.r.toneMapping = THREE.ACESFilmicToneMapping;
    const pm = new THREE.PMREMGenerator(thumbR.r);
    thumbR.s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    thumbR.s.add(new THREE.HemisphereLight(0xFFFFFF, 0x886655, 1.2));
    const d = new THREE.DirectionalLight(0xFFFFFF, 2); d.position.set(1, 2, 2); thumbR.s.add(d);
  }
  const { r, s: sc, c } = thumbR;
  const m = itemModel(newFood(kind));
  sc.add(m);
  const box = new THREE.Box3().setFromObject(m), ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  c.position.set(ctr.x + size * 0.9, ctr.y + size * 1.0, ctr.z + size * 1.6); c.lookAt(ctr); c.near = size * 0.1; c.far = size * 10; c.updateProjectionMatrix();
  r.render(sc, c);
  const url = r.domElement.toDataURL('image/png');
  sc.remove(m);
  thumbs.set(kind, url);
  return url;
}
function recipeHint(kind) {
  if (kind === 'bread') return ['Toaster → toast', 'or + cheese at prep → grilled cheese'];
  if (kind === 'cheese') return ['Put on bread at the prep counter', '→ grilled cheese'];
  if (kind === 'bun') return ['Toast it on the griddle', 'then add a cooked patty at prep'];
  const r = RECIPES[kind];
  const at = { griddle: 'on the griddle', fryer: 'in the fryer', toaster: 'in the toaster', blender: 'in the blender', prep: 'at the prep counter' };
  return r.steps.map((st, i) => {
    if (st.fill) return 'Pour into a fryer basket (carefully!)';
    if (st.choices) return 'Flip, stir or leave it (check the receipt!)';
    if (st.toppings) return 'Add the toppings from the receipt, then the top bun';
    if (st.cook && st.place) return `${st.place} ${at[st.at]}, wait`;
    if (st.cook) return 'Wait until it\'s done';
    if (i === 0 && st.place && st.verb) return `${st.place}, ${st.verb.toLowerCase()}`;
    return st.verb + (st.at === 'prep' ? ' (prep counter)' : '');
  });
}
let pantrySrc = null;
ui.onPantryClose = () => { if (pantrySrc !== 'breadbox') audio.play('fridgeClose'); pantrySrc = null; };
function openPantry(src) {
  pantrySrc = src;
  const P = G.state.players[G.role];
  ui.openPantry({
    title: SOURCES[src].name,
    held: !!P.held,
    items: SOURCES[src].items.map(([kind, name]) => ({ kind, name, img: thumbnail(kind), steps: recipeHint(kind), out: !!G.state.inc?.out?.[kind] })),
    onTake: (kind) => { act({ type: 'takeIngredient', src, kind }); },
  });
  audio.play(src === 'breadbox' ? 'paper' : 'fridge');
}

// ---- lobby -----------------------------------------------------------------
const bank = {
  get() { try { return Number(localStorage.getItem('shortorder.bank') || 0); } catch { return 0; } },
  add(v) { try { localStorage.setItem('shortorder.bank', String(this.get() + v)); } catch {} },
};
function showBank() { const b = bank.get(); $('#bank').textContent = b > 0 ? `💰 Diner savings: $${b.toFixed(2)} (maps, skins & new menu items coming soon)` : ''; }
showBank();

function segment(id, attr, onPick) {
  document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.remove('on'));
    b.classList.add('on'); onPick(b.dataset[attr]);
  }));
}
segment('len-seg', 'len', (v) => { G.shiftLen = Number(v); });
segment('role-seg', 'role', (v) => { G.hostRole = v; });

function lobbyError(msg) { const e = $('#lobby-error'); e.textContent = msg; e.classList.toggle('hidden', !msg); }
function lobbyView(which) { $('#lobby-main').classList.toggle('hidden', which !== 'main'); $('#lobby-wait').classList.toggle('hidden', which !== 'wait'); }

$('#btn-solo').addEventListener('click', () => { audio.unlockAudio(); G.mode = 'solo'; G.solo = true; G.shiftNo = 1; startShift(); });

$('#btn-host').addEventListener('click', () => {
  audio.unlockAudio(); lobbyError('');
  G.mode = 'host'; G.solo = false; G.shiftNo = 1;
  lobbyView('wait');
  $('#room-code').textContent = '····';
  $('#lobby-status').textContent = 'Opening a room…';
  $('#btn-start').disabled = true;
  G.net = new Net({
    onConnect: () => { $('#lobby-status').textContent = '🎉 Your friend joined! Start when ready.'; $('#btn-start').disabled = false; audio.play('doorbell'); },
    onData: (d) => hostOnData(d),
    onClose: () => {
      if (G.state) { G.solo = true; ui.localToast?.('Your partner disconnected. You can keep playing solo (Tab swaps roles).', 'danger'); }
      else { $('#lobby-status').textContent = 'Your friend left. Waiting for someone to join…'; $('#btn-start').disabled = true; }
    },
    onError: (m) => lobbyError(m),
  });
  G.net.host((code) => {
    $('#room-code').textContent = code;
    $('#share-link').value = `${location.origin}${location.pathname}?join=${code}`;
    $('#lobby-status').textContent = 'Waiting for your friend to join…';
  });
});
$('#share-link').addEventListener('click', (e) => { e.target.select(); navigator.clipboard?.writeText(e.target.value).catch(() => {}); });
$('#btn-start').addEventListener('click', () => { if (G.net?.connected) startShift(); });
$('#btn-cancel').addEventListener('click', () => { G.net?.destroy(); G.net = null; G.mode = null; lobbyView('main'); lobbyError(''); });

function joinRoom(code) {
  audio.unlockAudio(); lobbyError('');
  if (!/^[A-Z]{4}$/i.test(code)) { lobbyError('Room codes are 4 letters.'); return; }
  G.mode = 'guest'; G.solo = false;
  $('#btn-join').disabled = true; $('#btn-join').textContent = 'Joining…';
  G.net = new Net({
    onConnect: () => { $('#btn-join').textContent = 'Connected!'; lobbyError(''); showGuestWaiting(); },
    onData: (d) => guestOnData(d),
    onClose: () => { if (G.mode === 'guest') { $('#dc-msg').textContent = 'The host left the diner.'; $('#disconnected').classList.remove('hidden'); } },
    onError: (m) => { lobbyError(m); $('#btn-join').disabled = false; $('#btn-join').textContent = 'Join'; },
  });
  G.net.join(code);
}
function showGuestWaiting() {
  lobbyView('wait');
  $('#room-code').textContent = G.net.code;
  $('#share-link').parentElement.classList.add('hidden');
  $('#lobby-status').textContent = 'Connected! Waiting for the host to start the shift…';
  $('#btn-start').classList.add('hidden');
}
$('#btn-join').addEventListener('click', () => joinRoom($('#join-code').value));
$('#join-code').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') joinRoom(e.target.value); });
$('#btn-dc').addEventListener('click', () => location.href = location.pathname);
$('#btn-menu').addEventListener('click', () => location.href = location.pathname);
$('#btn-next').addEventListener('click', () => {
  if (G.mode === 'guest') return;
  G.shiftNo++;
  G.hostRole = other(G.hostRole);
  startShift();
});

const params = new URLSearchParams(location.search);
if (params.get('join')) { $('#join-code').value = params.get('join').toUpperCase(); setTimeout(() => joinRoom($('#join-code').value), 300); }

// ---- network handlers ------------------------------------------------------
function hostOnData(d) {
  if (!G.sim || G.solo) return;
  const guestRole = other(G.sim.s.hostRole);
  if (d.k === 'pose') { const p = G.sim.s.players[guestRole]; p.x = d.x; p.z = d.z; p.yaw = d.yaw; }
  else if (d.k === 'act') G.sim.apply(guestRole, d.a);
}

function guestOnData(d) {
  if (d.k === 'full') { lobbyError('That room already has two players.'); return; }
  if (d.k !== 'state') return;
  const s = d.s;
  const fresh = !G.state || s.shiftNo !== G.state.shiftNo;
  G.state = s;
  if (fresh && s.phase === 'playing') {
    G.role = other(s.hostRole);
    enterGame();
  }
}

// ---- shift lifecycle -------------------------------------------------------
function startShift() {
  G.sim = new Sim({ shiftLen: G.shiftLen, hostRole: G.hostRole, solo: G.solo, shiftNo: G.shiftNo });
  G.state = G.sim.s;
  G.role = G.hostRole;
  enterGame();
  if (G.mode === 'host') G.net.send({ k: 'state', s: G.sim.s });
}

function enterGame() {
  $('#lobby').classList.add('hidden');
  ui.hideSummary();
  ui.showHUD(true);
  const p = G.state.players[G.role];
  G.me = { x: p.x, z: p.z, yaw: p.yaw };
  controls.pitch = -0.15;
  G.target = null;
  G.lastSoundId = G.state.nextId;
  G.enteredShift = G.state.shiftNo;
  if (G.state.shiftNo === 1 && !G.helpShown) { G.helpShown = true; ui.toggleHelp(true); }
}

function swapSoloRole() {
  if (!G.solo || G.mode === 'guest' || !G.sim) return;
  const P = G.sim.s.players[G.role];
  P.x = G.me.x; P.z = G.me.z; P.yaw = G.me.yaw;
  G.role = other(G.role);
  const Q = G.sim.s.players[G.role];
  G.me = { x: Q.x, z: Q.z, yaw: Q.yaw };
  G.target = null;
  audio.play('pop');
}

// ---- keyboard ----------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  audio.unlockAudio();
  if (isTyping() || !G.state || $('#hud').classList.contains('hidden')) return;
  if (ui.pantryOpen) { ui.pantryKey(e); return; }
  if (e.key === 'Enter') { e.preventDefault(); ui.focusStaffChat(); return; }
  if (e.code === 'KeyT') { if (ui.focusNpc()) e.preventDefault(); return; }
  if (e.code === 'Tab') { e.preventDefault(); swapSoloRole(); return; }
  if (e.code === 'Escape') { if (G.state.npc.cid && G.role === 'server') act({ type: 'closeNpc' }); G.target = null; ui.toggleHelp(false); return; }
  if (e.code === 'KeyH') { ui.toggleHelp(); return; }
  if (e.code === 'KeyG') { const P = G.state.players[G.role]; if (P.held || (G.role === 'cook' && P.receipt)) act({ type: 'drop' }); else audio.play('deny'); return; }
  if (e.code === 'KeyV') { const q = post.cycle(); try { localStorage.setItem('shortorder.quality', String(q)); } catch {} ui.localToast(['🖥️ Graphics: low', '🖥️ Graphics: medium', '🖥️ Graphics: high'][q]); return; }
  if (e.code === 'KeyN') { audio.setMusicEnabled(!audio.musicEnabled()); ui.localToast(audio.musicEnabled() ? '🎵 Diner radio on' : '🎵 Diner radio off'); return; }
  if (e.code === 'KeyM') { G.muted = !G.muted; audio.setVolume(G.muted ? 0 : 0.35); ui.localToast(G.muted ? '🔇 Muted' : '🔊 Sound on'); return; }
  if (e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); const a = ui.currentActions.find((x) => !x.disabled && x.a); if (a) act(a.a); else audio.play('deny'); return; }
  const km = /^Key([FZX])$/.exec(e.code);
  if (km) { const a = ui.actionKeys?.[km[1]]; if (a && !a.disabled && a.a) act(a.a); else audio.play('deny'); return; }
  const m = /^Digit([1-9])$/.exec(e.code);
  if (m) { const a = ui.currentActions[Number(m[1]) - 1]; if (a && !a.disabled && a.a) act(a.a); else audio.play('deny'); }
});
window.addEventListener('pointerdown', () => audio.unlockAudio());
// menu-button click for buttons that don't already make a sound through act()
document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled && !b.closest('#menu, #npc, .pt-card')) audio.play('menu'); });

// clicking the hovered object does the same as pressing E
controls.onClick = () => {
  if (!G.target) return;
  const a = G.far ? null : ui.currentActions.find((x) => !x.disabled && x.a);
  if (a) act(a.a); else audio.play('deny');
};

// ---- hover / highlight ---------------------------------------------------------
const tmpV = new THREE.Vector3();
// the thing under the mouse (hidden things on the other side of the wall don't count)
const REACH = 2.1;
function pickHovered() {
  if (!controls.mouse.inside) return null;
  raycaster.setFromCamera({ x: controls.mouse.nx, y: controls.mouse.ny }, camera);
  raycaster.far = 60;
  const hits = raycaster.intersectObjects([world.static, world.dynRoot], true);
  for (const h of hits) {
    let o = h.object, iaObj = null, noHit = false, hidden = false;
    while (o) { if (!o.visible) hidden = true; if (o.userData.noHit) noHit = true; if (!iaObj && o.userData.ia) iaObj = o; o = o.parent; }
    if (hidden || noHit) continue;
    if (h.object.material?.transparent && h.object.material.opacity < 0.6) continue;   // faded (see-through) things
    if (iaObj && !canTouch(G.role, iaObj.userData.ia)) continue;                      // the other side's stuff doesn't block you
    if (!iaObj) return null;                                   // something solid is in the way
    if (iaObj.userData.ia.startsWith('avatar')) continue;
    return iaObj;
  }
  return null;
}

const HL_BOX = new THREE.MeshBasicMaterial({ color: 0x1A3C8C, transparent: true, opacity: 0.38, depthWrite: false });
function setHighlight(obj) {
  if (G.hl === obj) return;
  if (G.hl) G.hl.traverse((m) => { if (m.userData.hlOrig) { m.material = m.userData.hlOrig; delete m.userData.hlOrig; } });
  G.hl = obj;
  if (!obj) return;
  obj.traverse((m) => {
    if (!m.isMesh || m.userData.hlOrig || m.userData.css) return;
    const mat = m.material;
    if (mat && mat.visible === false) { m.userData.hlOrig = mat; m.material = HL_BOX; return; }   // invisible hover box: show it in blue
    if (!mat?.isMaterial || Array.isArray(mat)) return;
    m.userData.hlOrig = mat;
    const c = mat.clone();
    if (c.color) c.color.lerp(new THREE.Color(0x1A3C8C), 0.6);
    if (c.emissive) { c.emissive.setHex(0x14306E); c.emissiveIntensity = 0.6; }
    m.material = c;
  });
}

// ---- main loop ---------------------------------------------------------------
let last = performance.now(), time = 0;
const PERF = { step: 0, render: 0, labels: 0, frames: 0 };
// capped at 60 fps (120 Hz screens would otherwise draw everything twice as often for nothing),
// 30 fps on the lobby screen, and shadows only refresh every few frames
let lastDraw = 0, frameNo = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const minGap = G.state ? 1000 / 60 - 1.5 : 1000 / 30 - 1.5;
  if (now - lastDraw < minGap) return;
  lastDraw = now;
  if (++frameNo % 3 === 0) renderer.shadowMap.needsUpdate = true;
  const rawMs = now - last;
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  const p0 = performance.now();
  if (G.state) step(dt);
  else idleCamera(dt);
  const p1 = performance.now();
  post.render(rawMs);
  const p2 = performance.now();
  labels.render(scene, camera);
  const p3 = performance.now();
  PERF.step += p1 - p0; PERF.render += p2 - p1; PERF.labels += p3 - p2; PERF.frames++;
}

function idleCamera() {
  // slow pan around the dining room behind the lobby
  camera.position.set(Math.sin(time * 0.08) * 6, 12, 10 + Math.cos(time * 0.08) * 4);
  camera.lookAt(0, 0, 1);
}

function step(dt) {
  let s = G.state;
  const playing = s.phase === 'playing';
  const P = s.players[G.role];
  const slipping = P.slipUntil && s.t < P.slipUntil;
  const frozen = isTyping() || !!P.busy || !playing || !$('#help').classList.contains('hidden') || ui.pantryOpen || slipping;
  controls.update(dt, G.me, frozen);

  if (G.mode !== 'guest') {
    const sp = G.sim.s.players[G.role]; sp.x = G.me.x; sp.z = G.me.z; sp.yaw = G.me.yaw;
    G.sim.tick(dt);
    s = G.state = G.sim.s;
  }
  G.sendT += dt;
  if (G.sendT >= SEND_INTERVAL && G.net?.connected) {
    G.sendT = 0;
    if (G.mode === 'host') G.net.send({ k: 'state', s });
    else if (G.mode === 'guest') G.net.send({ k: 'pose', x: G.me.x, z: G.me.z, yaw: G.me.yaw });
  }

  // third-person camera: high and behind (south of) you, looking down at the diner
  G.shake = Math.max(0, G.shake - dt);
  const sh = G.shake * 0.12;
  const ct = G.camT ||= { x: G.me.x, z: G.me.z };
  ct.x += (G.me.x - ct.x) * Math.min(1, dt * 5); ct.z += (G.me.z - ct.z) * Math.min(1, dt * 5);
  camera.position.set(ct.x + (Math.random() - 0.5) * sh, CAM.h + (Math.random() - 0.5) * sh, ct.z + CAM.back);
  camera.lookAt(ct.x, 0.4, ct.z - 0.5);
  const Pm = G.state?.players[G.role]; if (Pm?.slipUntil && G.state.t < Pm.slipUntil) camera.rotation.z += Math.sin(G.state.t * 22) * 0.04;
  if (window.__camOverride) { const o = window.__camOverride; camera.position.set(...o.pos); camera.rotation.set(...o.rot); }
  world.mePose = { x: G.me.x, z: G.me.z, yaw: G.me.yaw };

  world.update(s, G.role, dt, time);

  // what you're standing at
  // the prompt only shows for what the mouse is over; you have to be close enough to use it
  const hov = pickHovered();
  const hovKey = hov?.userData.ia && canTouch(G.role, hov.userData.ia) ? hov.userData.ia : null;
  if (hovKey !== (G.target?.key ?? null)) { G.target = hovKey ? { key: hovKey } : null; if (hovKey) audio.play('hover'); }
  let menu = null, far = false, tObj = null;
  if (G.target) {
    tObj = world.iaObjs.get(G.target.key) || hov;
    menu = tObj ? getMenu(s, G.role, G.target.key) : null;
    if (!menu) { G.target = null; tObj = null; }
    else { tObj.getWorldPosition(tmpV); far = Math.hypot(tmpV.x - G.me.x, tmpV.z - G.me.z) > REACH; }
  }
  G.far = far;
  setHighlight(tObj);

  // receipt you are holding (cook) or carrying on a tray (server)
  const myP = s.players[G.role];
  const myRec = G.role === 'cook' ? myP.receipt : myP.held?.type === 'tray' ? myP.held.receiptId : null;
  let anchor = null;
  if (tObj && menu) { tObj.getWorldPosition(tmpV); tmpV.y += 0.9; tmpV.project(camera); if (tmpV.z < 1) anchor = { x: (tmpV.x * 0.5 + 0.5) * window.innerWidth, y: (-tmpV.y * 0.5 + 0.5) * window.innerHeight }; }
  ui.frame(s, G.role, { menu, far, solo: G.solo && G.mode !== 'guest', myRecView: myRec, anchor });

  const moving = Math.hypot(G.me.x - (G.lastMe?.x ?? G.me.x), G.me.z - (G.lastMe?.z ?? G.me.z)) > 0.001;
  G.lastMe = { x: G.me.x, z: G.me.z };
  G.movedRecently = moving ? 0.25 : Math.max(0, (G.movedRecently || 0) - dt);

  // sounds
  for (const snd of s.sounds) {
    if (snd.id <= G.lastSoundId) continue;
    G.lastSoundId = Math.max(G.lastSoundId, snd.id);
    const mine = G.role === 'cook' ? 'kitchen' : 'dining';
    audio.play(snd.name, snd.zone === 'all' || snd.zone === mine ? 1 : 0.3);
  }
  const loops = {};
  if (s.alarm) loops.alarm = 1;
  {
    const cook = G.role === 'cook';
    const onGriddle = s.stations.griddle.filter((it) => it?.type === 'food').length;
    const frying = s.stations.fryer.some((it) => it?.type === 'food' && it.lowered);
    const bl = s.stations.blender[0];
    const blending = s.power && (s.blenderNoise || (bl?.type === 'food' && RECIPES[bl.kind]?.steps[bl.step]?.cook && RECIPES[bl.kind].steps[bl.step].at === 'blender'));
    // scrubbing = holding the mop, moving (or clicking Mop), with a puddle under the mop head
    const hx = G.me.x - Math.sin(G.me.yaw) * 0.6, hz = G.me.z - Math.cos(G.me.yaw) * 0.6;
    const onPuddle = s.puddles.some((p) => Math.hypot(hx - p.x, hz - p.z) < 0.45 * (p.size ?? 1) + 0.35);
    const scrubbing = myP.held?.type === 'mop' && onPuddle && (G.movedRecently > 0 || myP.busy?.a?.type === 'mop');
    audio.updateSampleLoops({
      grill: onGriddle ? (cook ? Math.min(1, 0.5 + onGriddle * 0.15) : 0.08) : 0,
      fryer: frying ? (cook ? 0.75 : 0.06) : 0,
      blender: blending ? (cook ? 0.9 : s.blenderNoise ? 0.5 : 0.08) : 0,
      mop: scrubbing ? 1 : 0,
      wash: myP.busy?.a?.type === 'wash' ? 1 : 0,
      soda: s.fountain?.pouring && s.power ? (cook ? 0.05 : 0.9) : 0,
    });
    if (s.blenderNoise && s.power && !audio.sampleReady('blender')) loops.blender = cook ? 1 : 0.4;
  }
  // the diner radio; the old synth jukebox only plays if the stream can't load
  audio.updateMusic({ url: MUSIC.url, length: MUSIC.length, playing: s.phase === 'playing', inKitchen: G.role === 'cook', blast: s.jukebox && s.power, power: s.power, syncTime: s.musicSeed + s.t, vol: MUSIC, skipEvery: MUSIC.skipEvery });
  if (s.jukebox && s.power && !audio.musicWorking()) loops.jukebox = G.role === 'server' ? 1 : 0.35;
  audio.updateLoops(loops);

  // end of shift
  if (s.phase === 'summary' && G.summaryShownFor !== s.shiftNo) {
    G.summaryShownFor = s.shiftNo;
    bank.add(s.summary.net);
    ui.showSummary(s.summary, { isHost: G.mode === 'host', solo: G.mode === 'solo', shiftNo: s.shiftNo });
    $('#btn-next').textContent = G.mode === 'solo' ? 'Next shift (swap starting role)' : 'Next shift (swap roles)';
  }
}

requestAnimationFrame(loop);
window.__G = G; // handy for debugging in the console
window.__dbg = {
  PERF, renderer, scene, world, camera, controls, post, act: (a) => act(a),
  // advance the game by hand (for inspecting animation frame by frame)
  advance(seconds, fps = 60) { const dt = 1 / fps; for (let t = 0; t < seconds; t += dt) { time += dt; if (G.state) step(dt); } renderer.shadowMap.needsUpdate = true; post.render(0); labels.render(scene, camera); },
};
