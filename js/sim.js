// ---------------------------------------------------------------------------
// The simulation. Runs only on the host (or in solo practice). Everything in
// `this.s` is plain JSON so it can be sent to the other player as-is.
// ---------------------------------------------------------------------------
import { MENU, DRINKS, STATIONS, RECIPES, QUALITY_PAY, TUNING as T, L, TABLES, EVENTS, DIRECTOR, LINES } from './data.js';
import { installKitchen, orderList, dishIssues, payMultiplier, drinkOf, drinkIssues, isMenuItem } from './kitchen.js';

const RECIPE_OF = (it) => RECIPES[it.kind];
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function itemList(kinds) {
  const names = kinds.map((k) => (MENU[k]?.name || k).toLowerCase());
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

export function itemQuality(item) {
  if (item.q === 'burnt') return 'burnt';
  if (item.age > (MENU[item.kind]?.soggy ?? 999)) return 'soggy';
  return item.q; // good | plain
}

export const tableById = (s, n) => s.tables.find((t) => t.n === n);
export const custById = (s, id) => s.customers.find((c) => c.id === id);
export const receiptById = (s, id) => s.receipts.find((r) => r.id === id);
export const ticketById = (s, id) => s.tickets.find((t) => t.id === id);
export const isNoisy = (s) => s.noise.length > 0;
export const registerUp = (s) => s.power && s.t >= s.registerBootUntil;

export const tableDef = (n) => TABLES.find((x) => x.n === n);
export const seatOf = (n) => tableDef(n).seat;

// ---- walking routes: a small grid of aisle points (+ the entrance) ----------
const NODES = [];
for (const z of L.aisleZ) for (const x of L.aisleX) NODES.push({ x, z });
NODES.push({ x: L.entry.x, z: L.entry.z });
const ENTRY = NODES.length - 1;
const nodeIdx = (x, z) => NODES.findIndex((n) => n.x === x && n.z === z);
const EDGES = NODES.map(() => []);
const link = (a, b) => { if (a >= 0 && b >= 0) { EDGES[a].push(b); EDGES[b].push(a); } };
L.aisleZ.forEach((z, zi) => L.aisleX.forEach((x, xi) => {
  if (xi + 1 < L.aisleX.length) link(nodeIdx(x, z), nodeIdx(L.aisleX[xi + 1], z));
  if (zi + 1 < L.aisleZ.length) link(nodeIdx(x, z), nodeIdx(x, L.aisleZ[zi + 1]));
}));
link(ENTRY, nodeIdx(L.aisleX[1], L.aisleZ[2])); link(ENTRY, nodeIdx(L.aisleX[2], L.aisleZ[2]));
const nearestNode = (p) => NODES.reduce((b, n, i) => (Math.hypot(n.x - p.x, n.z - p.z) < Math.hypot(NODES[b].x - p.x, NODES[b].z - p.z) ? i : b), 0);
// path of points from p to q along the aisles (q itself is the last point)
export function route(p, q) {
  const a = nearestNode(p), b = nearestNode(q);
  const prev = new Map([[a, -1]]), queue = [a];
  while (queue.length) { const n = queue.shift(); if (n === b) break; for (const m of EDGES[n]) if (!prev.has(m)) { prev.set(m, n); queue.push(m); } }
  const pts = [];
  for (let n = b; n !== -1 && n !== undefined; n = prev.get(n)) pts.unshift({ x: NODES[n].x, z: NODES[n].z });
  // skip a first point that's behind us, and a last one that overshoots the target
  if (pts.length > 1 && dist(p, pts[1]) < dist(pts[0], pts[1]) && dist(p, pts[0]) > 0.3) pts.shift();
  if (pts.length > 1 && dist(q, pts[pts.length - 2]) < dist(pts[pts.length - 1], pts[pts.length - 2])) pts.pop();
  pts.push({ x: q.x, z: q.z });
  return pts;
}
const OUTSIDE = { x: L.door.x, z: 10.4 };

export function newState({ shiftLen = 600, hostRole = 'cook', solo = false, shiftNo = 1 } = {}) {
  const stations = {};
  for (const k in STATIONS) stations[k] = Array(STATIONS[k].slots).fill(null);
  const player = (sp) => ({ x: sp.x, z: sp.z, yaw: sp.yaw, held: null, receipt: null, busy: null });
  return {
    t: 0, phase: 'playing', shiftLen, hostRole, solo, shiftNo, musicSeed: Math.floor(Math.random() * 9000),
    players: { cook: player(L.cookSpawn), server: player(L.serverSpawn) },
    nextId: 1,
    money: { sales: 0, tips: 0 }, damages: [], lost: 0, served: 0, sickCount: 0, walkouts: 0,
    tickets: [], receipts: [], stations, trays: [null, null, null],
    cleanPlates: T.startPlates, dirtyDishes: 0,
    tents: TABLES.map((t) => t.n),
    tables: TABLES.map((t) => ({ n: t.n, cust: null, tent: false, dirty: false, plate: null })),
    customers: [], orderLine: [], payLine: [], puddles: [], floor: [], fountain: null, coffeeM: null,
    fire: null, alarm: false, alarmOffAt: 0, power: true, registerBootUntil: 0, jam: 0,
    jukebox: false, blenderNoise: false, mops: { dining: true, kitchen: true }, extOnWall: true,
    inspector: null, bellAt: -10,
    noise: [],
    ev: { next: solo ? 75 : shiftLen * DIRECTOR.calmUntil + 8, cd: {}, log: [] },
    spawnAt: 2.5,
    toasts: [], sounds: [], chat: [], npc: { cid: null, lines: [] },
    summary: null,
  };
}

export class Sim {
  constructor(opts) { this.s = newState(opts); }
  id() { return this.s.nextId++; }
  // 0..1 through the shift. Solo practice has no clock, so it loops a 10-minute day.
  prog() { const s = this.s; return s.solo ? (s.t % 600) / 600 : Math.min(1, s.t / s.shiftLen); }

  // ---- feedback helpers -------------------------------------------------
  toast(to, text, kind = 'info') { this.s.toasts.push({ id: this.id(), to, text, kind, t: this.s.t }); }
  sound(name, zone = 'all') { this.s.sounds.push({ id: this.id(), name, zone, t: this.s.t }); }
  damage(label, amount) {
    if (amount <= 0) return;
    const d = this.s.damages.find((x) => x.label === label);
    if (d) { d.amount += amount; d.count++; } else this.s.damages.push({ label, amount, count: 1 });
  }
  bubble(c, text, secs = 3.5) { c.bubble = text; c.bubbleUntil = this.s.t + secs; }
  npcSay(c, text) {
    const s = this.s;
    if (s.npc.cid !== c.id) return;
    s.npc.lines.push({ who: c.name, text });
    if (s.npc.lines.length > 30) s.npc.lines.shift();
  }

  // ---- main loop ----------------------------------------------------------
  tick(dt) {
    const s = this.s;
    if (s.phase !== 'playing') return;
    s.t += dt;

    for (const role of ['cook', 'server']) {
      const P = s.players[role];
      if (P.busy && s.t >= P.busy.until) {
        const a = P.busy.a; P.busy = null;
        this.apply(role, { ...a, _fin: true });
      }
    }

    this.tickKitchen(dt);
    this.tickMops();
    this.tickReceipts(dt);
    this.tickFire(dt);
    this.tickCustomers(dt);
    this.tickSpawns();
    this.tickInspector();
    this.director();

    const noise = [];
    if (s.alarm) noise.push('Smoke alarm');
    if (s.blenderNoise && s.power) noise.push('Blender');
    if (s.jukebox && s.power) noise.push('Jukebox');
    s.noise = noise;

    s.toasts = s.toasts.filter((x) => s.t - x.t < 6);
    s.sounds = s.sounds.filter((x) => s.t - x.t < 3);

    if (!s.solo && s.t >= s.shiftLen) this.endShift();
  }

  // anyone carrying a mop scrubs whatever puddle they're walking around on
  tickMops() {
    const s = this.s;
    for (const role of ['cook', 'server']) {
      const P = s.players[role];
      const moved = P._lx == null ? 0 : Math.hypot(P.x - P._lx, P.z - P._lz) + Math.abs(P.yaw - P._ly) * 0.15;
      P._lx = P.x; P._lz = P.z; P._ly = P.yaw;
      if (P.held?.type !== 'mop' || moved <= 0 || moved > 1) continue;
      for (const p of s.puddles) {
        if (p.size == null) p.size = p.kind === 'sick' ? 1.3 : 1;
        // the mop head reaches a little in front of you
        const hx = P.x - Math.sin(P.yaw) * 0.6, hz = P.z - Math.cos(P.yaw) * 0.6;
        if (Math.hypot(hx - p.x, hz - p.z) < 0.45 * p.size + 0.35) this.scrub(p, moved * T.scrubPerMeter, role);
      }
    }
  }
  scrub(p, amount, role) {
    const s = this.s;
    if (p.size == null) p.size = p.kind === 'sick' ? 1.3 : 1;
    p.size -= amount;
    if (Math.random() < 0.15 + amount) this.sound('splash', role === 'cook' ? 'kitchen' : 'dining');
    if (p.size <= 0.1) s.puddles = s.puddles.filter((x) => x !== p);
  }

  endShift() {
    const s = this.s;
    s.phase = 'summary';
    const dmg = s.damages.reduce((a, d) => a + d.amount, 0);
    const gross = s.money.sales + s.money.tips;
    s.summary = {
      sales: s.money.sales, tips: s.money.tips, damages: s.damages, damageTotal: dmg,
      net: Math.max(0, gross - dmg), served: s.served, sick: s.sickCount, walkouts: s.walkouts, lost: s.lost,
    };
  }

  tickReceipts(dt) {
    const s = this.s;
    for (const r of s.receipts) {
      if (r.loc === 'printer' && s.t - r.t0 > T.receiptSlipAfter) this.dropReceipt(r, 'A receipt slipped off the printer onto the floor!');
      if (r.loc === 'floor') r.grime = clamp01(r.grime + T.floorGrimePerSec * dt);
    }
    s.receipts = s.receipts.filter((r) => r.loc !== 'done');
  }

  dropReceipt(r, msg) {
    r.loc = 'floor';
    r.fx = L.printer.x + rnd(-0.5, 0.5);
    r.fz = L.printer.z - 0.55 - rnd(0, 0.5);
    r.rot = rnd(0, Math.PI * 2);
    r.grime = clamp01(r.grime + 0.12);
    this.sound('flutter', 'kitchen');
  }

  tickFire(dt) {
    const s = this.s;
    if (s.fire) {
      const age = s.t - s.fire.t0;
      if (age > T.fireAlarmAfter && !s.alarm) {
        s.alarm = true;
      }
      if (age > 18) this.damage('Fire damage', T.fireDamagePerSec * dt);
    } else if (s.alarm && s.t >= s.alarmOffAt) {
      s.alarm = false;
    }
  }

  // ---- customers ------------------------------------------------------
  makeOrder() {
    const s = this.s;
    const meal = this.prog() < 0.5 ? 'breakfast' : 'lunch';
    const pool = Object.keys(MENU).filter((k) => MENU[k].meal === meal);
    const r = Math.random();
    const n = r < 0.4 ? 1 : r < 0.82 ? 2 : 3;
    const kinds = [];
    const bag = pool.slice();
    for (let i = 0; i < n && bag.length; i++) kinds.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
    if (Math.random() < 0.22) { if (kinds.length >= 3) kinds.pop(); kinds.push('milkshake'); }
    const items = kinds.map((kind) => {
      const it = { kind };
      if (MENU[kind].styles) it.style = pick(MENU[kind].styles);
      if (MENU[kind].toppings) { const tp = MENU[kind].toppings.slice().sort(() => Math.random() - 0.5); it.toppings = tp.slice(0, Math.floor(Math.random() * 3)); }
      return it;
    });
    const drink = Math.random() < 0.5 ? (meal === 'breakfast' ? (Math.random() < 0.75 ? 'coffee' : 'soda') : (Math.random() < 0.7 ? 'soda' : 'coffee')) : null;
    return { items, drink };
  }

  orderText(c) {
    const drink = c.order.drink ? fill(pick(LINES.drinkSuffix), { drink: DRINKS[c.order.drink].name.toLowerCase() }) : '';
    return fill(pick(LINES.order), { items: orderList(c.order.items), drink });
  }

  spawnCustomer(force = false) {
    const s = this.s;
    const count = s.customers.filter((c) => c.kind === 'customer' && c.st !== 'leaving').length;
    if (!force && count >= T.maxCustomers) return null;
    if (s.orderLine.length >= 7) return null;
    const hues = [0xC8262B, 0x3FB8AF, 0xE7B23B, 0xF4A6B8, 0x6B8DD6, 0x9B6BD6, 0x5FAF5F, 0xFF8C42, 0x4A4A8A];
    const c = {
      id: this.id(), kind: 'customer', name: pick(LINES.names), color: pick(hues),
      skin: pick([0xF2C8A0, 0xD9A066, 0x8D5A3B, 0xF5D6BA, 0xB07A4F]), hat: Math.random() < 0.35 ? pick([0x1B1B1B, 0xC8262B, 0x3FB8AF, 0xE7B23B]) : null,
      x: L.door.x + rnd(-0.2, 0.2), z: 10.3, yaw: 0, path: [], onArrive: null, spd: rnd(0.78, 1.25), v: 0,
      st: 'enter', pat: 1, stage: 'ok', order: this.makeOrder(), heard: false,
      table: null, ticket: null, bill: 0, quality: 1, bubble: '', bubbleUntil: 0, sick: false, calmAt: -99,
    };
    c.path = route(L.entry, this.lineSpot(s.orderLine.length));
    c.path.unshift({ x: L.entry.x, z: L.entry.z });
    c.onArrive = 'line';
    s.customers.push(c);
    s.orderLine.push(c.id);
    this.sound('doorbell', 'dining');
    return c;
  }

  tickSpawns() {
    const s = this.s;
    if (s.t < s.spawnAt) return;
    const prog = this.prog();
    const iv = (s.solo ? T.soloSpawnInterval : lerp(T.spawnInterval[0], T.spawnInterval[1], prog)) * rnd(0.7, 1.3);
    s.spawnAt = s.t + iv;
    if (!s.solo && s.t > s.shiftLen - 25) return; // no arrivals in the last moments
    this.spawnCustomer();
  }

  lineSpot(i) { return { x: L.orderLine.x + (i > 5 ? 0.7 : 0), z: L.orderLine.z + Math.min(i, 5) * L.orderLine.step + (i > 5 ? (i - 6) * -L.orderLine.step : 0) }; }
  paySpot(i) { return { x: L.payLine.x + i * L.payLine.step, z: L.payLine.z }; }
  pickupSpot(i) { return { x: L.pickup.x + (i % 2) * 0.65, z: L.pickup.z - Math.floor(i / 2) * 0.7 }; }

  // Walk toward p with easing: speed up from a standstill, slow down when
  // arriving, cut corners at intermediate waypoints, and walk at a personal pace.
  moveToward(c, p, dt, final = true) {
    const dx = p.x - c.x, dz = p.z - c.z;
    const d = Math.hypot(dx, dz);
    let pace = T.walkSpeed * (c.spd || 1);
    if (c.st === 'leaving' && c.stage === 'furious') pace *= 1.45;   // storming out
    if (c.sick) pace *= 1.6;                                          // gotta go!
    const want = final ? Math.min(pace, 0.2 + d * 1.8) : pace;
    c.v = c.v || 0;
    c.v += Math.max(-4 * dt, Math.min(2.6 * dt, want - c.v));
    const step = c.v * dt;
    if (d > 0.06) c.yaw = Math.atan2(-dx, -dz);
    if (!final && d < 0.38) return true;                              // cut the corner
    if (d <= step + 0.005) { c.x = p.x; c.z = p.z; if (final) c.v = 0; return true; }
    c.x += (dx / d) * step; c.z += (dz / d) * step;
    return false;
  }

  tickCustomers(dt) {
    const s = this.s;
    const drinkers = s.customers.filter((c) => c.st === 'waitDrink');
    const mult = (isNoisy(s) ? T.noiseDrain : 1) * (s.fire ? T.smokeDrain : 1);

    for (const c of s.customers) {
      // slipping on a soda spill: no walking until they recover
      if (c.slipUntil && s.t < c.slipUntil) { c.v = 0; }
      else if (c.path.length && c.kind === 'customer' && !c.sick) {
        const sp = s.puddles.find((p) => p.kind === 'spill' && dist(p, c) < 0.45 && !(c.slipped || []).includes(p.id));
        if (sp) {
          c.slipped = [...(c.slipped || []), sp.id];
          if (Math.random() < 0.7) {
            c.slipUntil = s.t + 1.4; c.v = 0;
            this.bubble(c, pick(['WHOAAA!', 'WAAAH!', 'YIKES!', 'MY BACK!']), 2);
            this.sound('slip', 'dining');
            c.pat -= 0.06; this.updateStage(c);
          }
        }
      }
      if (c.slipUntil && s.t < c.slipUntil) { /* frozen mid-slip */ }
      else if (c.path.length) {
        // joining a queue: close enough counts (the queue then gives everyone their own spot)
        const queueEnd = c.path.length === 1 && (c.onArrive === 'line' || c.onArrive === 'pay') && dist(c, c.path[0]) < 0.8;
        if (queueEnd || this.moveToward(c, c.path[0], dt, c.path.length === 1)) {
          c.path.shift();
          if (!c.path.length && c.onArrive) { const f = c.onArrive; c.onArrive = null; this.arrive(c, f); }
        }
      } else if (c.st === 'line') {
        this.moveToward(c, this.lineSpot(s.orderLine.indexOf(c.id)), dt);
      } else if (c.st === 'pay') {
        this.moveToward(c, this.paySpot(s.payLine.indexOf(c.id)), dt);
      } else if (c.st === 'waitDrink') {
        this.moveToward(c, this.pickupSpot(drinkers.indexOf(c)), dt);
      }
      // walkers sidestep around anyone they're about to bump into
      if (c.path.length && c.v > 0.2) {
        for (const o of s.customers) {
          if (o === c) continue;
          const ox = c.x - o.x, oz = c.z - o.z, od = Math.hypot(ox, oz);
          if (od > 0.01 && od < 0.6) {
            // sidestep only (perpendicular to where they're heading), so nobody gets stuck
            const hx = -Math.sin(c.yaw), hz = -Math.cos(c.yaw);
            const side = (ox * -hz + oz * hx) >= 0 ? 1 : -1;
            const push = (0.6 - od) * 2.2 * dt;
            c.x += -hz * side * push; c.z += hx * side * push;
          }
        }
      }
      if (c.st === 'waitFood' && !c.path.length) c.yaw = seatOf(c.table).yaw;
      if (c.st === 'line' || c.st === 'pay' || c.st === 'waitDrink') {
        if (!c.path.length) c.yaw = Math.PI / 2; // face the counter / host stand (west)
      }

      // patience
      const span = T.patience[c.st];
      if (span && c.kind === 'customer' && !c.path.length && !s.solo) {
        let m = mult;
        if (s.puddles.some((p) => dist(p, c) < 2.5)) m *= 1.3;
        if (c.st === 'line' && s.orderLine.indexOf(c.id) > 0) m *= 0.8;
        c.pat -= (dt / span) * m;
        this.updateStage(c);
        if (c.pat <= 0) { this.walkOut(c); continue; }
      }

      if (c.st === 'eating') {
        if (c.sickAt && s.t >= c.sickAt) this.getSick(c);
        else if (s.t >= c.eatUntil) this.goPay(c);
      }
      if (c.bubble && s.t > c.bubbleUntil) c.bubble = '';
    }
    s.customers = s.customers.filter((c) => c.st !== 'gone');
  }

  updateStage(c) {
    const p = c.pat;
    const stage = p > 0.6 ? 'ok' : p > 0.35 ? 'impatient' : p > 0.15 ? 'angry' : 'furious';
    if (stage === c.stage) return;
    const worse = ['ok', 'impatient', 'angry', 'furious'].indexOf(stage) > ['ok', 'impatient', 'angry', 'furious'].indexOf(c.stage);
    c.stage = stage;
    if (!worse) return;
    if (stage === 'impatient') this.bubble(c, pick(LINES.impatient));
    if (stage === 'angry') { this.bubble(c, pick(LINES.angry)); this.sound('grumble', 'dining'); }
    if (stage === 'furious') {
      this.bubble(c, pick(LINES.furious), 4);
      this.sound('slam', 'dining');
      this.toast('server', '', 'shake');
      for (const o of this.s.customers) if (o !== c && o.kind === 'customer' && dist(o, c) < 4) { o.pat -= 0.06; this.updateStage(o); }
    }
  }

  arrive(c, what) {
    const s = this.s;
    switch (what) {
      case 'line': c.st = 'line'; break;
      case 'table': c.st = 'waitFood'; c.yaw = seatOf(c.table).yaw; break;
      case 'pay': c.st = 'pay'; break;
      case 'inspect': c.st = 'inspect'; c.yaw = Math.PI / 2; break;
      case 'gone': c.st = 'gone'; break;
    }
    if (what === 'gone' && s.npc.cid === c.id) s.npc = { cid: null, lines: [] };
  }

  pathToTable(c, n) { const t = tableDef(n); return [...route(c, t.approach), t.seat]; }
  pathFromTable(n, to) { const t = tableDef(n); return [t.approach, ...route(t.approach, to)]; }

  goTable(c) {
    c.st = 'toTable';
    c.pat = Math.min(1, c.pat + 0.5); c.stage = 'ok'; this.updateStage(c);
    c.path = this.pathToTable(c, c.table);
    c.onArrive = 'table';
  }

  goPay(c) {
    const s = this.s;
    const t = tableById(s, c.table);
    if (t) { t.cust = null; t.dirty = true; }
    c.st = 'toPay';
    c.pat = 1; c.stage = 'ok';
    c.path = this.pathFromTable(c.table, this.paySpot(s.payLine.length));
    c.onArrive = 'pay';
    s.payLine.push(c.id);
  }

  leave(c) {
    const s = this.s;
    const atSeat = c.table && (c.st === 'waitFood' || c.st === 'eating') && !c.path.length;
    const pts = atSeat ? this.pathFromTable(c.table, L.entry) : route(c, L.entry);
    pts.push(OUTSIDE);
    s.orderLine = s.orderLine.filter((id) => id !== c.id);
    s.payLine = s.payLine.filter((id) => id !== c.id);
    c.st = 'leaving';
    c.path = pts;
    c.onArrive = 'gone';
  }

  orderValue(c) {
    return c.order.items.reduce((a, it) => a + MENU[it.kind].price, 0) + (c.order.drink ? DRINKS[c.order.drink].price : 0);
  }

  walkOut(c) {
    const s = this.s;
    s.walkouts++;
    this.bubble(c, pick(LINES.walkout), 4);
    this.sound('slam', 'dining');
    if (['waitDrink', 'toTable', 'waitFood'].includes(c.st)) {
      const t = tableById(s, c.table);
      if (t && t.cust === c.id) t.cust = null; // tent stays on the table until cleared
      s.lost += this.orderValue(c);
    } else if (c.st === 'pay') {
      s.lost += c.bill;
    } else {
    }
    this.leave(c);
  }

  getSick(c) {
    const s = this.s;
    c.sick = true; c.sickAt = null;
    this.bubble(c, '🤢 ' + pick(LINES.sick), 4);
    this.sound('blegh', 'dining');
    s.sickCount++;
    s.puddles.push({ id: this.id(), x: c.x + 0.35, z: c.z + 0.35, kind: 'sick', table: c.table });
    this.damage('Sick customers (comped + cleanup)', T.sickDamage);
    for (const o of s.customers) {
      if (o !== c && o.kind === 'customer' && dist(o, c) < 4) {
        o.pat -= 0.25; this.bubble(o, pick(LINES.ew)); this.updateStage(o);
      }
      if (o.kind === 'inspector' && o.st === 'inspect') {
        this.damage('Health inspector fines', s.inspector?.lenient ? 12 : 25);
      }
    }
    const t = tableById(s, c.table);
    if (t) { t.cust = null; t.dirty = true; }
    this.leave(c);
  }

  spawnInspector() {
    const s = this.s;
    const c = {
      id: this.id(), kind: 'inspector', name: 'Inspector Grimsby', color: 0x6E6E6E, skin: 0xF2C8A0, hat: 0x2A2A2A,
      x: L.door.x, z: 10.3, yaw: 0, path: [{ x: L.entry.x, z: L.entry.z }, ...route(L.entry, L.inspectorSpot)], onArrive: 'inspect',
      st: 'enter', pat: 1, stage: 'ok', order: { items: [], drink: null }, bubble: '', bubbleUntil: 0, table: null,
    };
    s.customers.push(c);
    s.inspector = { id: c.id, until: s.t + 65, nextAudit: s.t + 12, lenient: false };
    this.sound('doorbell', 'dining');
  }

  tickInspector() {
    const s = this.s;
    if (!s.inspector) return;
    const c = custById(s, s.inspector.id);
    if (!c) { s.inspector = null; return; }
    if (c.st !== 'inspect') return;
    if (s.t >= s.inspector.until) {
      this.bubble(c, '📋 Carry on.', 3);
      this.leave(c); s.inspector = null; return;
    }
    if (s.t >= s.inspector.nextAudit) {
      s.inspector.nextAudit = s.t + 10;
      const k = s.inspector.lenient ? 0.5 : 1;
      const found = [];
      let fine = 0;
      const puddles = s.puddles.length; if (puddles) { fine += 10 * puddles; found.push(`${puddles} puddle${puddles > 1 ? 's' : ''}`); }
      if (s.fire) { fine += 30; found.push('a FIRE'); }
      const dirtyTrays = s.trays.filter((t) => t?.plate?.dirty).length; if (dirtyTrays) { fine += 10 * dirtyTrays; found.push('dirty plates in the pass'); }
      const floorR = s.receipts.filter((r) => r.loc === 'floor').length; if (floorR) { fine += 5 * floorR; found.push('receipts on the kitchen floor'); }
      const floorF = s.floor.filter((f) => f.thing.type === 'food' || f.thing.type === 'plate').length; if (floorF) { fine += 8 * floorF; found.push('food on the floor'); }
      if (fine) {
        fine *= k;
        this.damage('Health inspector fines', fine);
        this.bubble(c, '📋 *scribbles furiously*', 3);
        this.toast('server', `📋 −$${fine.toFixed(0)}`, 'danger');
      } else {
        this.bubble(c, pick(LINES.inspector), 3);
      }
    }
  }

  // ---- event director -----------------------------------------------------
  isActive(id) {
    const s = this.s;
    return {
      greaseFire: !!s.fire, breaker: !s.power, printerJam: s.jam > 0, jukebox: s.jukebox,
      inspector: s.inspector != null,
      spill: s.puddles.some((p) => p.kind === 'spill'), rush: false, greasyRail: false,
    }[id];
  }
  canStart(id) {
    const s = this.s;
    switch (id) {
      case 'greaseFire': return s.stations.griddle.some((x) => x) || s.stations.fryer.some((x) => x);
      case 'jukebox': return s.power;
      case 'greasyRail': return s.receipts.some((r) => r.loc === 'rail' || r.loc === 'held');
      default: return true;
    }
  }
  activeCount() { return Object.keys(EVENTS).filter((id) => this.isActive(id)).length; }

  director() {
    const s = this.s;
    const prog = this.prog();
    if ((!s.solo && prog < DIRECTOR.calmUntil) || s.t < s.ev.next) return;
    s.ev.next = s.t + lerp(DIRECTOR.interval[0], DIRECTOR.interval[1], prog) * rnd(0.75, 1.25);
    const cap = Math.round(lerp(DIRECTOR.maxActive[0], DIRECTOR.maxActive[1], prog));
    if (this.activeCount() >= cap) return;
    const cands = Object.entries(EVENTS).filter(([id, e]) => prog >= e.from && !((s.ev.cd[id] || 0) > s.t) && !this.isActive(id) && this.canStart(id));
    if (!cands.length) return;
    let r = Math.random() * cands.reduce((a, [, e]) => a + e.weight, 0);
    for (const [id, e] of cands) {
      r -= e.weight;
      if (r <= 0) { this.startEvent(id); s.ev.cd[id] = s.t + e.cooldown; return; }
    }
  }

  startEvent(id) {
    const s = this.s;
    s.ev.log.push({ id, t: s.t });
    switch (id) {
      case 'greaseFire': this.startFire(s.stations.griddle.some((x) => x) ? 'griddle' : 'fryer'); break;
      case 'breaker':
        s.power = false;
        this.sound('powerdown');
        break;
      case 'printerJam':
        s.jam = 3; this.sound('clunk', 'kitchen');
        break;
      case 'jukebox':
        s.jukebox = true;
        break;
      case 'inspector':
        this.spawnInspector();
        this.toast('server', '📋 Health inspector', 'warn');
        break;
      case 'spill':
        { const ax = pick(L.aisleX), az = pick(L.aisleZ.slice(1)); s.puddles.push({ id: this.id(), x: ax + rnd(-1, 1), z: az + rnd(-0.2, 0.2), kind: 'spill', table: null }); }
        this.sound('splash', 'dining');
        break;
      case 'rush':
        for (let i = 0; i < 4; i++) { const c = this.spawnCustomer(true); if (c) { c.x += i * 0.4; c.z += i * 0.5; } }
        this.sound('bus', 'dining');
        break;
      case 'greasyRail':
        for (const r of s.receipts) if (r.loc === 'rail' || r.loc === 'held') r.grime = clamp01(r.grime + 0.4);
        this.sound('sizzle', 'kitchen');
        break;
    }
  }

  // ---- actions ------------------------------------------------------------
  timedFor(role, a) {
    const P = this.s.players[role];
    switch (a.type) {
      case 'place': return a.at === 'fryer' && a.mode === 'careful' ? [T.carefulPour, 'Pouring carefully...'] : null;
      case 'stepAct': {
        const it = this.s.stations[a.at]?.[a.i];
        const st = it?.type === 'food' ? RECIPE_OF(it)?.steps[a.idx] : null;
        return st?.busy && !a.topping ? [st.busy, st.verb + '...'] : null;
      }
      case 'mop': return P.held?.type === 'mop' ? [T.mopTime, 'Scrubbing...'] : null;
      case 'spray': return [T.sprayTime, 'SPRAYING!'];
      case 'resetBreaker': return [T.breakerTime, 'Resetting breaker...'];
      case 'cycleBreaker': return [T.breakerTime, 'Flipping the breaker...'];
      case 'wash': { const n = P.held?.type === 'dishes' ? P.held.n : 1; return [n * T.washPerPlate, `Washing ${n} plate${n > 1 ? 's' : ''}...`]; }
    }
    return null;
  }

  apply(role, a) {
    const s = this.s;
    if (!a || !s.players[role]) return;
    if (a.type === 'chat') {
      const text = String(a.text || '').slice(0, 200).trim();
      if (text) { s.chat.push({ id: this.id(), from: role, text, t: s.t }); if (s.chat.length > 60) s.chat.shift(); this.sound('pop', role === 'cook' ? 'dining' : 'kitchen'); }
      return;
    }
    if (s.phase !== 'playing') return;
    const P = s.players[role];
    if (P.busy) return;
    const tm = this.timedFor(role, a);
    if (tm && !a._fin) { P.busy = { until: s.t + tm[0], dur: tm[0], label: tm[1], a }; return; }
    const h = this.handlers[a.type];
    if (h) h.call(this, role, P, a);
  }

  receiptGrease(P, amt) {
    if (!P.receipt) return;
    const r = receiptById(this.s, P.receipt);
    if (r) r.grime = clamp01(r.grime + amt);
  }
}

// Each handler re-checks what it needs; menus (actions.js) only show valid ones.
Sim.prototype.handlers = {
  // ---------------- cook ----------------
  print(role, P) {
    const s = this.s;
    if (!s.power || s.jam > 0) return;
    const tk = s.tickets.find((t) => t.status === 'queued');
    if (!tk) return;
    const old = s.receipts.find((r) => r.loc === 'printer');
    if (old) this.dropReceipt(old, 'The new receipt pushed the old one onto the floor!');
    tk.status = 'printed';
    s.receipts.push({ id: this.id(), tid: tk.id, loc: 'printer', grime: 0, t0: s.t, slot: null, tray: null });
    this.sound('print', 'kitchen');
  },
  whack() {
    const s = this.s;
    if (s.jam <= 0) return;
    s.jam--; this.sound('clunk', 'kitchen');
  },
  takeReceipt(role, P, a) {
    const s = this.s, r = receiptById(s, a.rid);
    if (!r || P.receipt) return;
    if (r.loc === 'tray' && s.trays[r.tray]) s.trays[r.tray].receiptId = null;
    r.loc = 'held'; r.slot = null; r.tray = null;
    P.receipt = r.id;
  },
  pinReceipt(role, P) {
    const s = this.s, r = receiptById(s, P.receipt);
    if (!r) return;
    const used = s.receipts.filter((x) => x.loc === 'rail').map((x) => x.slot);
    const slot = [...Array(T.railSlots).keys()].find((i) => !used.includes(i));
    if (slot == null) return;
    r.loc = 'rail'; r.slot = slot; P.receipt = null;
  },
  dropHeldReceipt(role, P) {
    const r = receiptById(this.s, P.receipt);
    if (!r) return;
    P.receipt = null; this.dropReceipt(r, null);
    r.fx = P.x + rnd(-0.3, 0.3); r.fz = P.z + rnd(-0.3, 0.3);
  },
  attachReceipt(role, P, a) {
    const s = this.s, tr = s.trays[a.i], r = receiptById(s, P.receipt);
    if (!tr || !r || tr.receiptId) return;
    r.loc = 'tray'; r.tray = a.i; tr.receiptId = r.id; P.receipt = null;
    this.sound('paper', 'kitchen');
  },
  takePlate(role, P) {
    const s = this.s;
    if (P.held || s.cleanPlates <= 0) return;
    s.cleanPlates--; P.held = { type: 'plate', items: [], dirty: false };
    this.sound('plate', 'kitchen');
  },
  returnPlate(role, P) {
    if (P.held?.type !== 'plate' || P.held.items.length || P.held.dirty) return;
    this.s.cleanPlates++; P.held = null;
  },
  takeDirty(role, P) {
    const s = this.s;
    if (P.held || s.dirtyDishes <= 0) return;
    P.held = { type: 'dishes', n: s.dirtyDishes }; s.dirtyDishes = 0;
    this.sound('plate', 'kitchen');
  },
  takeDirtyPlate(role, P) {
    const s = this.s;
    if (P.held || s.dirtyDishes <= 0) return;
    s.dirtyDishes--; P.held = { type: 'plate', items: [], dirty: true };
  },
  wash(role, P) {
    const s = this.s;
    if (P.held?.type === 'dishes') { s.cleanPlates += P.held.n; P.held = null; }
    else if (P.held?.type === 'plate' && P.held.dirty && !P.held.items.length) { s.cleanPlates++; P.held = null; }
    else return;
    this.sound('splash', 'kitchen');
  },
  trayPut(role, P, a) {
    const s = this.s;
    if (s.trays[a.i]) return;
    if (role === 'cook' && P.held?.type === 'plate') { s.trays[a.i] = { plate: P.held, receiptId: null }; P.held = null; }
    else if (role === 'server' && P.held?.type === 'tray') {
      s.trays[a.i] = { plate: P.held.plate, receiptId: P.held.receiptId };
      const r = receiptById(s, P.held.receiptId); if (r) { r.loc = 'tray'; r.tray = a.i; }
      P.held = null;
    } else return;
    this.sound('plate');
  },
  trayTake(role, P, a) {
    const s = this.s, tr = s.trays[a.i];
    if (!tr || P.held) return;
    if (role === 'cook') {
      if (tr.receiptId) {
        if (P.receipt) return;
        const r = receiptById(s, tr.receiptId); if (r) { r.loc = 'held'; r.tray = null; P.receipt = r.id; }
      }
      P.held = tr.plate;
    } else {
      P.held = { type: 'tray', plate: tr.plate, receiptId: tr.receiptId };
      const r = receiptById(s, tr.receiptId); if (r) { r.loc = 'server'; r.tray = null; }
    }
    s.trays[a.i] = null;
  },
  bell() {
    const s = this.s;
    if (s.t - s.bellAt < 1.5) return;
    s.bellAt = s.t;
    this.sound('bell');
    this.toast('server', '🔔 ORDER UP!', 'good');
  },
  takeExt(role, P) {
    if (P.held || !this.s.extOnWall) return;
    this.s.extOnWall = false; P.held = { type: 'ext' };
  },
  returnExt(role, P) {
    if (P.held?.type !== 'ext') return;
    this.s.extOnWall = true; P.held = null;
  },
  spray(role, P) {
    const s = this.s;
    if (P.held?.type !== 'ext' || !s.fire) return;
    s.fire = null; s.alarmOffAt = s.t + 3;
    this.sound('psssh', 'kitchen');
  },
  resetBreaker() {
    const s = this.s;
    if (s.power) return;
    s.power = true; s.registerBootUntil = s.t + 3;
    this.sound('powerup');
  },
  cycleBreaker() {
    const s = this.s;
    if (!s.power) return;
    const hadJukebox = s.jukebox;
    s.jukebox = false; s.blenderNoise = false;
    s.registerBootUntil = s.t + 10;
    s.stations.blender = s.stations.blender.map(() => null);
    this.sound('powerup');
  },

  // ---------------- server ----------------
  takeOrder(role, P, a) {
    const s = this.s, c = custById(s, a.cid);
    if (!c || s.orderLine[0] !== c.id || c.st !== 'line') return;
    s.npc = { cid: c.id, lines: [] };
    if (isNoisy(s)) { this.npcSay(c, pick(LINES.cantHear)); this.bubble(c, '🙉 WHAT?!'); return; }
    c.heard = true;
    c.orderLine = this.orderText(c);
    this.npcSay(c, c.orderLine);
    this.bubble(c, '🗣️ ...', 2);
  },
  talk(role, P, a) {
    const s = this.s, c = custById(s, a.cid);
    if (!c) return;
    s.npc = { cid: c.id, lines: [] };
    if (isNoisy(s)) { this.npcSay(c, pick(LINES.cantHear)); return; }
    if (c.kind === 'inspector') { this.npcSay(c, pick(['Just do your jobs.', 'Don\'t mind me.', 'Is that a puddle?'])); return; }
    const status = c.stage === 'furious' ? pick(LINES.furious) : c.stage === 'angry' ? pick(LINES.angry) : pick(LINES.hello);
    this.npcSay(c, status);
  },
  say(role, P, a) {
    const s = this.s, c = custById(s, s.npc.cid);
    const text = String(a.text || '').slice(0, 160).trim();
    if (!c || !text) return;
    s.npc.lines.push({ who: 'You', text });
    if (isNoisy(s)) { this.npcSay(c, pick(LINES.cantHear)); return; }
    const t = text.toLowerCase();
    const calm = (amt) => { if (s.t - c.calmAt > 20 && c.kind === 'customer') { c.calmAt = s.t; c.pat = Math.min(1, c.pat + amt); c.stage = 'ok'; this.updateStage(c); return true; } return false; };
    if (c.kind === 'inspector') {
      this.npcSay(c, /coffee|free|pie|bribe/.test(t) ? 'Is that a BRIBE? ...I take two sugars.' : 'Mm-hm. *writes something down*');
    } else if (/sorry|apolog|my bad|forgive/.test(t)) {
      this.npcSay(c, calm(0.15) ? pick(LINES.sorry) : 'Sorry doesn\'t cook food!');
    } else if (/table|number|where.*sit|sitting/.test(t)) {
      this.npcSay(c, c.table ? `I'm at table ${c.table}. Says so on the tent!` : "I don't have a table yet!");
    } else if (/order|what.*(want|have|get)|again|repeat|remind/.test(t)) {
      this.npcSay(c, c.heard || c.ticket ? `I ordered ${orderList(c.order.items)}${c.order.drink ? ' and a ' + DRINKS[c.order.drink].name.toLowerCase() : ''}.` : 'You haven\'t taken my order yet!');
    } else if (/soon|minute|coming|wait|hold|almost|patien/.test(t)) {
      this.npcSay(c, calm(0.07) ? 'Okay... I\'ll wait. A LITTLE longer.' : pick(LINES.hurry));
    } else if (/^(hi|hello|hey|howdy|morning|yo)\b/.test(t)) {
      this.npcSay(c, pick(LINES.hello));
    } else if (/thank/.test(t)) {
      this.npcSay(c, 'Mm-hm.');
    } else {
      this.npcSay(c, pick(LINES.smalltalk));
    }
  },
  closeNpc() { this.s.npc = { cid: null, lines: [] }; },
  ringUp(role, P, a) {
    const s = this.s, c = custById(s, a.cid);
    if (!c || s.orderLine[0] !== c.id || !c.heard || !registerUp(s) || !s.tents.length) return;
    s.tents.sort((x, y) => x - y);
    const n = s.tents.shift();
    const tb = tableById(s, n);
    tb.cust = c.id; tb.tent = true;
    const tk = { id: this.id(), cid: c.id, items: c.order.items.slice(), drink: c.order.drink, table: n, status: 'queued', t: s.t };
    s.tickets.push(tk);
    c.table = n; c.ticket = tk.id;
    s.orderLine.shift();
    this.sound('register', 'dining');
    this.sound('tvbeep', 'kitchen');
    this.npcSay(c, `Table ${n}, got it.` + (c.order.drink ? ` Don't forget my ${DRINKS[c.order.drink].name.toLowerCase()}!` : ''));
    if (c.order.drink) { c.st = 'waitDrink'; c.pat = Math.min(1, c.pat + 0.5); c.stage = 'ok'; this.updateStage(c); }
    else this.goTable(c);
  },
  giveDrink(role, P, a) {
    const s = this.s, c = custById(s, a.cid), h = P.held;
    const kind = drinkOf(h);
    if (!c || !kind) return;
    if (c.kind === 'inspector') {
      if (kind === 'coffee' && h.p >= 0.5 && s.inspector) { s.inspector.lenient = true; P.held = null; this.bubble(c, '☕ ...Fine. I\'ll go easy.', 3); }
      return;
    }
    if (c.st !== 'waitDrink') return;
    if (kind !== c.order.drink) {
      this.bubble(c, fill(pick(LINES.wrongDrink), { drink: DRINKS[c.order.drink].name.toLowerCase() }));
      c.pat -= 0.1; this.updateStage(c); this.sound('buzz', 'dining');
      return;
    }
    if ((h.type === 'cup' && h.fill < 0.3) || (h.type === 'mug' && h.p < 0.3)) {
      this.bubble(c, '😑 It\'s... empty.'); this.sound('buzz', 'dining'); return;
    }
    const issues = drinkIssues(h);
    c.drinkMult = issues.reduce((m, i) => m * i.m, 1);
    if (h.floor && Math.random() < T.floorSickChance) c.dirtyDrink = true;
    P.held = null; c.gotDrink = true;
    this.bubble(c, issues.length ? '😒 ' + issues[0].line : '😊 Thanks!', issues.length ? 3.5 : 2);
    this.goTable(c);
  },
  serve(role, P, a) {
    const s = this.s, tb = tableById(s, a.n);
    if (P.held?.type !== 'tray' || !tb) return;
    const c = custById(s, tb.cust);
    if (!c) { return; }
    if (c.st !== 'waitFood') { return; }
    const plate = P.held.plate;
    const pool = plate.items.filter(isMenuItem);
    const matched = [], missing = [];
    for (const want of c.order.items) {
      // pick the best matching dish of that kind
      let best = -1, bestM = -1;
      pool.forEach((f, i) => { if (f.kind !== want.kind) return; const m = payMultiplier(dishIssues(f, want)); if (m > bestM) { bestM = m; best = i; } });
      if (best >= 0) matched.push({ food: pool.splice(best, 1)[0], want }); else missing.push(want);
    }
    if (matched.length < Math.ceil(c.order.items.length / 2)) {
      this.bubble(c, '😡 ' + pick(LINES.wrongOrder));
      c.pat -= 0.15; this.updateStage(c); this.sound('buzz', 'dining');
      return;
    }
    let bill = 0, qsum = 0, floorFood = false;
    const gripes = [];
    for (const { food, want } of matched) {
      const issues = dishIssues(food, want);
      const m = payMultiplier(issues);
      bill += MENU[food.kind].price * m; qsum += m;
      if (issues.length) gripes.push(issues[0].line);
      if (food.q.floor) floorFood = true;
    }
    for (const w of missing) gripes.push(fill(pick(LINES.missing), { item: MENU[w.kind].name.toLowerCase() }));
    if (c.gotDrink) bill += DRINKS[c.order.drink].price * (c.drinkMult ?? 1);
    c.quality = (qsum / c.order.items.length) * (missing.length ? 0.6 : 1);
    c.bill = Math.round(bill * 100) / 100;
    if (gripes.length) { this.bubble(c, '😒 ' + gripes[0], 4); c.pat -= 0.08 * gripes.length; }
    else { this.bubble(c, '😋 ' + pick(LINES.happy), 3); }
    tb.plate = { items: plate.items, dirty: plate.dirty };
    const r = receiptById(s, P.held.receiptId); if (r) r.loc = 'done';
    const tk = ticketById(s, c.ticket); if (tk) tk.status = 'served';
    P.held = null;
    c.st = 'eating';
    c.eatUntil = s.t + T.eatTime;
    c.pat = Math.max(0.3, c.pat);
    const risky = plate.dirty || floorFood || c.dirtyDrink;
    if (risky && Math.random() < (plate.dirty ? T.sickChance : T.floorSickChance)) c.sickAt = s.t + rnd(T.sickDelay[0], T.sickDelay[1]);
    s.served++;
    this.sound('plate', 'dining');
  },
  takePay(role, P, a) {
    const s = this.s, c = custById(s, a.cid);
    if (!c || s.payLine[0] !== c.id || c.st !== 'pay' || !registerUp(s)) return;
    const tip = Math.round(c.bill * T.tipRate * clamp01(c.pat + 0.2) * clamp01(c.quality) * 100) / 100;
    s.money.sales += c.bill; s.money.tips += tip;
    this.bubble(c, `💵 ${pick(LINES.thanks)}${tip > 0.5 ? ` (+$${tip.toFixed(2)} tip)` : ''}`, 3);
    this.sound('chaching', 'dining');
    s.payLine.shift();
    this.leave(c);
  },
  clear(role, P, a) {
    const s = this.s, tb = tableById(s, a.n);
    if (!tb || tb.cust || (!tb.dirty && !tb.tent)) return;
    if (s.puddles.some((p) => p.table === tb.n)) { return; }
    if (tb.dirty) {
      if (!P.held) P.held = { type: 'dishes', n: 1 };
      else if (P.held.type === 'dishes' && P.held.n < T.maxDishesCarried) P.held.n++;
      else return;
      tb.dirty = false; tb.plate = null;
    }
    if (tb.tent) { tb.tent = false; s.tents.push(tb.n); }
    this.sound('plate', 'dining');
  },
  dropDishes(role, P) {
    if (P.held?.type !== 'dishes') return;
    this.s.dirtyDishes += P.held.n; P.held = null;
    this.sound('plate');
  },
  mop(role, P, a) {
    const p = this.s.puddles.find((x) => x.id === a.pid);
    if (!p || P.held?.type !== 'mop') return;
    this.scrub(p, T.scrubClick, role);
  },
  takeMop(role, P, a) {
    const s = this.s;
    if (P.held || !s.mops[a.where]) return;
    s.mops[a.where] = false; P.held = { type: 'mop', home: a.where };
    this.sound('clunk', a.where === 'kitchen' ? 'kitchen' : 'dining');
  },
  returnMop(role, P, a) {
    const s = this.s;
    if (P.held?.type !== 'mop' || s.mops[a.where]) return;
    s.mops[a.where] = true; P.held = null;
    this.sound('splash', a.where === 'kitchen' ? 'kitchen' : 'dining');
  },
  kick() {
    const s = this.s;
    if (!s.jukebox) return;
    this.sound('thud', 'dining');
    if (Math.random() < 0.4) { s.jukebox = false; }
  },
};

installKitchen(Sim);
