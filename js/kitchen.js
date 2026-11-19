// ---------------------------------------------------------------------------
// Recipe engine + everything you can hold. Pure helpers (used by the sim, the
// menus and the 3D view) and the sim handlers for cooking, plating, drinks,
// dropping and picking things up.
// ---------------------------------------------------------------------------
import { MENU, DRINKS, RECIPES, SOURCES, STATIONS, QUALITY_PAY, DRINK_TUNING as DT, TUNING as T, L, LINES } from './data.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const ELECTRIC = new Set(['toaster', 'blender']);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
export const recipe = (item) => RECIPES[item.kind];
export const curStep = (item) => recipe(item)?.steps[item.step] || null;
export const isDone = (item) => item.step >= (recipe(item)?.steps.length || 0);
export const isMenuItem = (item) => item?.type === 'food' && !!MENU[item.kind];

export function newFood(kind) {
  return { type: 'food', kind, step: 0, p: 0, over: 0, popped: false, popAt: rnd(1.2, 4.2), style: null, toppings: [], cheese: false, age: 0,
    q: { burnt: false, raw: false, greasy: false, floor: false, messy: false, skipped: [] } };
}

export function foodName(item) {
  const r = recipe(item);
  if (!r) return item.kind;
  if (item.step === 0 && item.p === 0 && r.raw && !['cheeseburger', 'grilledcheese'].includes(item.kind)) return r.raw;
  let n = r.name;
  if (item.kind === 'patty' && item.cheese) n = 'Cheesy patty';
  if (item.kind === 'bun' && isDone(item)) n = 'Toasted bun';
  if (item.kind === 'eggs' && item.style) n = `Eggs (${item.style})`;
  return n;
}

// What a dish looks like to a customer, compared to what they ordered.
export function dishIssues(item, want) {
  const out = [];
  const name = (MENU[item.kind]?.name || item.kind).toLowerCase();
  if (item.q.burnt) out.push({ k: 'burnt', line: fill(pick(LINES.burnt), { item: name }) });
  else if (item.q.raw) out.push({ k: 'raw', line: fill(pick(LINES.raw), { item: name }) });
  if (item.age > (MENU[item.kind]?.soggy ?? 999) * T.soggyGrace) out.push({ k: 'soggy', line: fill(pick(LINES.soggy), { item: name }) });
  if (item.q.greasy) out.push({ k: 'greasy', line: fill(pick(LINES.greasy), { item: name }) });
  if (item.q.plain) out.push({ k: 'plain', line: pick(LINES.plain) });
  if (item.q.messy) out.push({ k: 'messy', line: fill(pick(LINES.messy), { item: name }) });
  for (const thing of item.q.skipped) out.push({ k: 'missing', line: fill(pick(LINES.missingStep), { thing }) });
  if (want?.style && item.style !== want.style) out.push({ k: 'wrongStyle', line: fill(pick(LINES.wrongStyle), { style: want.style.toUpperCase() }) });
  if (want?.toppings) {
    const a = [...want.toppings].sort().join(','), b = [...(item.toppings || [])].sort().join(',');
    if (a !== b) out.push({ k: 'wrongToppings', line: fill(pick(LINES.wrongToppings), { list: want.toppings.length ? want.toppings.join(' and ') : 'NOTHING on it' }) });
  }
  return out;
}
export function payMultiplier(issues) { return Math.max(0.2, issues.reduce((m, i) => m * (QUALITY_PAY[i.k] ?? 1), 1)); }

export function orderItemText(it) {
  let t = (MENU[it.kind]?.name || it.kind).toLowerCase();
  if (it.style) t = `eggs, ${it.style}`;
  if (it.toppings) t += it.toppings.length ? ` with ${it.toppings.join(' and ')}` : ', plain';
  return t;
}
export function orderList(items) {
  const n = items.map(orderItemText);
  return n.length <= 1 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
}

// Cups and mugs (server drinks)
export function drinkOf(h) { return h?.type === 'cup' ? 'soda' : h?.type === 'mug' ? 'coffee' : null; }
export function drinkName(h) {
  if (h.type === 'cup') {
    if (h.fill <= 0.05) return h.ice ? 'Cup of ice' : 'Empty cup';
    return `Soda${h.ice ? '' : ' (no ice)'}${h.fill < DT.fillGood[0] ? ' (half full)' : ''}${h.lid ? ' with lid & straw' : ''}`;
  }
  if (h.type === 'mug') return h.p >= 1 ? 'Coffee' : h.p > 0 ? 'Weak coffee' : 'Empty mug';
  return '';
}
export function drinkIssues(h) {
  const out = [];
  if (h.type === 'cup') {
    if (!h.ice) out.push({ line: pick(LINES.noIce), m: 0.7 });
    if (h.fill < DT.fillGood[0]) out.push({ line: pick(LINES.lowFill), m: 0.6 });
    if (!h.lid) out.push({ line: pick(LINES.noLid), m: 0.85 });
  } else if (h.type === 'mug' && h.p < 1) out.push({ line: 'This coffee is basically water.', m: 0.6 });
  return out;
}

export function thingName(h) {
  if (!h) return '';
  switch (h.type) {
    case 'food': return foodName(h);
    case 'plate': return h.items.length ? `Plate (${h.items.map(foodName).join(', ')})` : h.dirty ? 'Dirty plate' : 'Clean plate';
    case 'tray': return 'Tray' + (h.plate.items.length ? ` (${h.plate.items.map(foodName).join(', ')})` : '');
    case 'dishes': return `${h.n} dirty plate${h.n > 1 ? 's' : ''}`;
    case 'ext': return 'Fire extinguisher';
    case 'plunger': return 'Plunger';
    case 'mop': return 'Mop';
    case 'cup': case 'mug': return drinkName(h);
  }
  return h.type;
}

// Steps left when a dish is put on a plate are "skipped": raw, greasy, missing...
export function finalize(item) {
  const r = recipe(item);
  if (!r) return item;
  for (let i = item.step; i < r.steps.length; i++) {
    const st = r.steps[i];
    if (st.cook && !(i === item.step && item.p >= 1) && !(st.toaster && i === item.step && item.p >= 0.7)) item.q.raw = true;
    if (st.greasyIfSkipped) item.q.greasy = true;
    if (st.missing) item.q.skipped.push(st.missing);
    if (st.cheese) item.q.plain = true;
  }
  item.step = r.steps.length;
  return item;
}

// What the cook can do to an item sitting at a station: the current step and,
// if it is optional or a cook step, the one after it (doing that early).
export function stationOptions(item, at) {
  const r = recipe(item);
  if (!r) return [];
  const out = [];
  const st = r.steps[item.step];
  if (!st || st.at !== at) return out;
  const add = (step, idx, early) => {
    if (step.at !== at || step.cook || step.fill) return;
    if (step.choices) step.choices.forEach((c) => out.push({ label: c.verb, act: { idx, choice: c.key } }));
    else if (step.toppings) {
      (MENU.cheeseburger.toppings).forEach((tp) => { if (!item.toppings.includes(tp)) out.push({ label: `Add ${tp}`, act: { idx, topping: tp } }); });
      out.push({ label: step.verb, act: { idx } });
    } else out.push({ label: step.verb, act: { idx } });
  };
  if (st.cook) {
    const nx = r.steps[item.step + 1];
    if (nx) add(nx, item.step + 1, item.p < 1);
  } else {
    add(st, item.step, false);
    if (st.optional && r.steps[item.step + 1]) add(r.steps[item.step + 1], item.step + 1, false);
  }
  return out;
}

// Where an item goes next: can it be placed on this station?
export function canPlaceAt(item, at) {
  if (item?.type !== 'food') return false;
  if (at === 'prep') return true;
  if (at === 'toaster') return item.kind === 'bread' || (item.kind === 'toast' && !isDone(item));
  const st = curStep(item);
  return !!st && st.at === at;
}
export function placeLabel(item, at) {
  if (at === 'prep') return 'Set it down';
  if (at === 'toaster') return 'Put in toaster';
  const st = curStep(item);
  return st?.place || `Put it on the ${STATIONS[at].name.toLowerCase()}`;
}

// the kitchen is the top-left block; the restroom corridor behind the wall line is dining side
export const zoneAt = (z, x = 0) => (z < L.wallZ && x < L.kitchen.x1 ? 'kitchen' : 'dining');

// ---------------------------------------------------------------------------
// Sim methods + handlers
// ---------------------------------------------------------------------------
export function installKitchen(Sim) {
  const P_ = Sim.prototype;

  P_.tickKitchen = function (dt) {
    const s = this.s;
    for (const at in s.stations) {
      s.stations[at].forEach((it, i) => {
        if (!it || it.type !== 'food') return;
        const st = curStep(it);
        if (s.fire && s.fire.at === at) { it.q.burnt = true; return; }
        if (!st || st.at !== at || !st.cook) return;
        if (ELECTRIC.has(at) && !s.power) return;
        if (at === 'fryer' && !it.lowered) return;
        if (st.toaster && it.popped) return;
        if (it.p < 1) {
          it.p = Math.min(1, it.p + dt / st.cook);
          if (it.p >= 1) { it.over = 0; this.sound('ding', 'kitchen'); }
        } else {
          it.over += dt;
          if (st.toaster && it.over >= it.popAt) { it.popped = true; this.sound('toastPop', 'kitchen'); }
          if (it.over > st.win * T.burnGrace && !it.q.burnt && !st.runaway) {
            it.q.burnt = true;
            this.sound('sizzle', 'kitchen');
            if (st.flare && Math.random() < st.flare) this.startFire('griddle');
          }
          if (st.runaway && it.over > st.win * T.burnGrace && !s.blenderNoise) {
            s.blenderNoise = true;
          }
        }
      });
    }
    // anything plated (or carried) slowly goes soggy
    const age = (plate) => plate?.items.forEach((f) => { f.age += dt; });
    s.trays.forEach((tr) => tr && age(tr.plate));
    s.stations.prep.forEach((x) => { if (x?.type === 'plate') age(x); });
    for (const r of ['cook', 'server']) { const h = s.players[r].held; if (h?.type === 'plate') age(h); if (h?.type === 'tray') age(h.plate); }
    // drinks
    const f = s.fountain;
    if (f && f.pouring && s.power) {
      f.cup.fill += dt / DT.fillTime;
      if (f.cup.fill > DT.spillAt && !f.spilled) {
        f.spilled = true;
        s.puddles.push({ id: this.id(), x: L.soda.x + 0.85, z: L.soda.z + rnd(-0.3, 0.3), kind: 'spill', table: null });
        this.sound('splash', 'dining');
      }
    }
    const cm = s.coffeeM;
    if (cm && cm.mug.p < 1 && s.power) { cm.mug.p = Math.min(1, cm.mug.p + dt / DT.brewTime); if (cm.mug.p >= 1) this.sound('ding', 'dining'); }
  };

  // advance an item past step idx (doing an earlier cook step early counts as raw)
  P_.advanceTo = function (item, idx) {
    const r = recipe(item);
    for (let i = item.step; i < idx; i++) {
      const st = r.steps[i];
      if (st.cook && !(i === item.step && item.p >= 1)) item.q.raw = true;
      if (st.greasyIfSkipped) item.q.greasy = true;
      if (st.skipFx) item.skipFx = st.skipFx;
    }
    item.step = idx; item.p = 0; item.over = 0; item.popped = false;
  };

  P_.dropToFloor = function (thing, x, z) {
    const s = this.s;
    if (thing.type === 'food') thing.q.floor = true;
    if (thing.type === 'plate') { thing.dirty = true; thing.items.forEach((f) => { f.q.floor = true; }); }
    if (thing.type === 'tray') { thing.plate.dirty = true; thing.plate.items.forEach((f) => { f.q.floor = true; }); }
    if (thing.type === 'cup' || thing.type === 'mug') thing.floor = true;
    if (thing.type === 'cup' && thing.fill > 0.25) {
      s.puddles.push({ id: this.id(), x: x + rnd(-0.2, 0.2), z: z + rnd(-0.2, 0.2), kind: 'spill', table: null, zone: zoneAt(z, x) });
      thing.fill = 0; thing.lid = false;
    }
    if (thing.type === 'mug' && thing.p > 0.2) { thing.p = 0; }
    s.floor.push({ id: this.id(), x, z, rot: rnd(0, Math.PI * 2), t0: s.t, thing });
    this.sound(thing.type === 'plate' || thing.type === 'dishes' || thing.type === 'tray' ? 'clatter' : 'thud', zoneAt(z, x));
  };

  P_.startFire = function (at = 'griddle') {
    const s = this.s;
    if (s.fire) return false;
    s.fire = { t0: s.t, at };
    this.sound('whoosh', 'kitchen');
    return true;
  };

  const H = Sim.prototype.handlers;

  // ---- sources ----
  H.takeIngredient = function (role, P, a) {
    if (P.held || !SOURCES[a.src]?.items.some(([k]) => k === a.kind)) return;
    P.held = newFood(a.kind);
    this.sound(a.src === 'freezer' || a.src === 'fridge' ? 'fridge' : 'paper', 'kitchen');
  };

  // ---- stations (griddle/fryer/toaster/blender/prep) ----
  H.place = function (role, P, a) {
    const s = this.s, slots = s.stations[a.at];
    if (!slots || slots[a.i] || !P.held) return;
    const h = P.held;
    if (a.at === 'prep') {
      if (h.type !== 'food' && h.type !== 'plate') return;
      slots[a.i] = h; P.held = null; this.sound('plate', 'kitchen'); return;
    }
    if (!canPlaceAt(h, a.at) || (s.fire && s.fire.at === a.at)) return;
    if (a.at === 'toaster' && h.kind === 'bread') { const q = h.q; Object.assign(h, newFood('toast')); h.q = q; }
    if (a.at === 'fryer') {
      const careful = a.mode === 'careful';
      if (careful && !a._fin) return; // timed: handled via timedFor
      if (!careful && Math.random() < T.dumpOverflow) {
        this.sound('sizzle', 'kitchen');
        h.q.greasy = true;
        if (Math.random() < 0.5) this.startFire('fryer');
      }
      this.advanceTo(h, h.step + 1); // the fill step
    }
    slots[a.i] = h; P.held = null;
    if (a.at === 'griddle' || a.at === 'fryer') { this.receiptGrease(P, T.greasyFingers); this.sound('sizzle', 'kitchen'); }
    else this.sound('click', 'kitchen');
  };

  // take whatever is in a station slot out (lifting finished food completes its cook step)
  P_.liftFrom = function (P, at, i) {
    const s = this.s, slots = s.stations[at], it = slots?.[i];
    if (!it) return null;
    if (it.type === 'food') {
      const st = curStep(it);
      if (st?.cook && st.at === at && (it.p >= 1 || (st.toaster && it.p >= 0.7))) { it.p = 1; this.advanceTo(it, it.step + 1); }
      if (at === 'blender') s.blenderNoise = false;
      if (at === 'fryer') it.lowered = false;
    }
    slots[i] = null;
    if (at === 'griddle' || at === 'fryer') this.receiptGrease(P, T.greasyFingers);
    return it;
  };
  H.take = function (role, P, a) {
    if (P.held || !this.s.stations[a.at]?.[a.i]) return;
    P.held = this.liftFrom(P, a.at, a.i);
  };

  H.stepAct = function (role, P, a) {
    const s = this.s, it = s.stations[a.at]?.[a.i];
    if (!it || it.type !== 'food') return;
    const r = recipe(it), st = r.steps[a.idx];
    if (!st || st.at !== a.at || a.idx < it.step || a.idx > it.step + 1) return;
    if (st.busy && !a._fin) return; // timed handled by timedFor
    if (a.topping) { if (!it.toppings.includes(a.topping)) it.toppings.push(a.topping); this.sound('plate', 'kitchen'); return; }
    this.advanceTo(it, a.idx);
    if (st.choices) it[st.key] = a.choice;
    if (st.cheese) it.cheese = true;
    if (st.verb === 'Lower into the oil') it.lowered = true;
    if (/Stop/.test(st.verb || '')) s.blenderNoise = false;
    if (st.verb === 'Blend' && it.skipFx === 'splatter') {
      it.q.messy = true; it.skipFx = null;
      s.puddles.push({ id: this.id(), x: L.blender.slotX[0] + rnd(-0.3, 0.3), z: L.blender.z + 0.9, kind: 'shake', table: null, zone: 'kitchen' });
      this.receiptGrease(P, 0.3);
      this.sound('splash', 'kitchen');
    }
    it.step = a.idx + 1; it.p = 0; it.over = 0;
    if (a.at === 'griddle' || a.at === 'fryer') this.receiptGrease(P, T.greasyFingers * 0.5);
    this.sound(st.at === 'prep' ? 'paper' : a.at === 'griddle' ? 'sizzle' : 'click', 'kitchen');
  };

  // combine at the prep counter: bread + cheese, bun + patty
  H.combine = function (role, P, a) {
    const s = this.s, slot = s.stations.prep, base = slot[a.i], h = P.held;
    if (!base || base.type !== 'food' || h?.type !== 'food') return;
    const kinds = [base.kind, h.kind].sort().join('+');
    let made = null;
    if (kinds === 'bread+cheese') made = newFood('grilledcheese');
    if (kinds === 'bun+patty') {
      const bun = base.kind === 'bun' ? base : h, patty = base.kind === 'patty' ? base : h;
      const toasted = isDone(bun) || (curStep(bun)?.cook && bun.p >= 1);
      if (toasted) finalize(bun); else bun.q.skipped = ['toasted bun'];
      finalize(patty);
      made = newFood('cheeseburger');
      made.q.burnt = bun.q.burnt || patty.q.burnt; made.q.raw = patty.q.raw; made.q.plain = patty.q.plain || !patty.cheese;
      made.q.skipped = [...bun.q.skipped];
    }
    if (!made) return;
    made.q.floor = base.q.floor || h.q.floor;
    slot[a.i] = made; P.held = null;
    this.sound('plate', 'kitchen');
  };

  // put a dish onto a plate (prep spot, tray, or the plate in your hands)
  // Plating works from either side:
  //   holding food  -> a plate on a prep spot / tray, the dish rack (grabs a plate), or an empty tray (grabs a plate)
  //   holding plate -> food sitting at any station, or food on the floor
  H.plateFood = function (role, P, a) {
    const s = this.s, h = P.held;
    const full = (plate) => plate.items.length >= T.plateCapacity;
    const done = () => this.sound('plate', 'kitchen');
    if (h?.type === 'food') {
      if (!isMenuItem(h)) return;
      if (a.at === 'rack') {                                   // grab a clean plate with the food on it
        if (s.cleanPlates <= 0) return;
        s.cleanPlates--; P.held = { type: 'plate', items: [finalize(h)], dirty: false }; return done();
      }
      if (a.at === 'tray' && !s.trays[a.i]) {                  // empty pass tray: fetch a plate for it
        if (s.cleanPlates <= 0) return;
        s.cleanPlates--; s.trays[a.i] = { plate: { type: 'plate', items: [finalize(h)], dirty: false }, receiptId: null }; P.held = null; return done();
      }
      const where = a.at === 'tray' ? s.trays[a.i]?.plate : a.at === 'prep' ? s.stations.prep[a.i] : null;
      if (where?.type !== 'plate' || full(where)) return;
      where.items.push(finalize(h)); P.held = null; return done();
    }
    if (h?.type === 'plate') {
      if (full(h)) return;
      if (a.at === 'floor') {
        const f = s.floor.find((x) => x.id === a.fid);
        if (!f || !isMenuItem(f.thing)) return;
        s.floor = s.floor.filter((x) => x !== f);
        h.items.push(finalize(f.thing)); return done();
      }
      const it = s.stations[a.at]?.[a.i];
      if (!isMenuItem(it)) return;
      h.items.push(finalize(this.liftFrom(P, a.at, a.i))); return done();
    }
  };

  // ---- dropping / picking up ----
  H.drop = function (role, P) {
    const s = this.s;
    const fx = P.x - Math.sin(P.yaw) * 0.5, fz = P.z - Math.cos(P.yaw) * 0.5;
    // keep things on your side of the wall
    let x = Math.max(-7.7, Math.min(7.7, fx)), z = fz;
    if (role === 'cook') { z = Math.min(z, L.wallZ - 0.35); x = Math.min(x, L.kitchen.x1 - 0.35); }
    else if (zoneAt(z, x) === 'kitchen') z = L.wallZ + 0.35;     // never lands on the cook's side
    if (P.held) {
      const h = P.held; P.held = null;
      if (h.type === 'ext') s.extOnWall = false;
      this.dropToFloor(h, x, z);
    } else if (role === 'cook' && P.receipt) {
      this.handlers.dropHeldReceipt.call(this, role, P);
    }
  };
  H.pickUp = function (role, P, a) {
    const s = this.s, f = s.floor.find((x) => x.id === a.fid);
    if (!f || P.held) return;
    if ((role === 'cook') !== (zoneAt(f.z, f.x) === 'kitchen')) return;
    s.floor = s.floor.filter((x) => x !== f);
    P.held = f.thing;
    this.sound('pop', zoneAt(f.z, f.x));
  };

  // ---- trash ----
  H.trash = function (role, P) {
    const h = P.held;
    if (!h) return;
    if (h.type === 'food') { this.damage('Wasted food', 1); P.held = null; }
    else if (h.type === 'plate' && h.items.length) { this.damage('Wasted food', h.items.length); h.items = []; }
    else if (h.type === 'tray') {
      if (h.plate.items.length) this.damage('Wasted food', h.plate.items.length);
      const r = this.s.receipts.find((x) => x.id === h.receiptId); if (r) r.loc = 'done';
      P.held = { type: 'dishes', n: 1 };
    } else if (h.type === 'cup' || h.type === 'mug') P.held = null;
    else return;
    this.sound('trash', role === 'cook' ? 'kitchen' : 'dining');
  };

  // ---- server drinks ----
  H.grabCup = function (role, P) { if (!P.held) { P.held = { type: 'cup', ice: false, fill: 0, lid: false }; this.sound('click', 'dining'); } };
  H.grabMug = function (role, P) { if (!P.held) { P.held = { type: 'mug', p: 0 }; this.sound('plate', 'dining'); } };
  H.addIce = function (role, P) { if (P.held?.type === 'cup' && !P.held.lid) { P.held.ice = true; this.sound('ice', 'dining'); } };
  H.lidStraw = function (role, P) { if (P.held?.type === 'cup' && P.held.fill > 0.05) { P.held.lid = true; this.sound('click', 'dining'); } };
  H.fountainStart = function (role, P) {
    const s = this.s;
    if (s.fountain) { if (!s.fountain.pouring) s.fountain.pouring = true; return; }
    if (P.held?.type !== 'cup' || P.held.lid) return;
    s.fountain = { cup: P.held, pouring: true, spilled: false }; P.held = null;
    this.sound('pour', 'dining');
  };
  H.fountainStop = function () { if (this.s.fountain) this.s.fountain.pouring = false; };
  H.fountainTake = function (role, P) {
    const s = this.s;
    if (!s.fountain || P.held) return;
    P.held = s.fountain.cup; P.held.fill = Math.min(1, P.held.fill); s.fountain = null;
  };
  H.brew = function (role, P) {
    const s = this.s;
    if (s.coffeeM || P.held?.type !== 'mug') return;
    s.coffeeM = { mug: P.held }; P.held = null;
    this.sound('pour', 'dining');
  };
  H.takeMug = function (role, P) {
    const s = this.s;
    if (!s.coffeeM || P.held) return;
    P.held = s.coffeeM.mug; s.coffeeM = null;
  };
}
