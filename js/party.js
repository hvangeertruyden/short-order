// ---------------------------------------------------------------------------
// Parties (1-4 people), seating, outings (restroom trips + wandering) and
// restroom trouble (toilet paper, clogs, the plunger).
// The party leader orders, pays and has the patience meter; the others tag
// along, sit at their own chairs and occasionally get up.
// ---------------------------------------------------------------------------
import { MENU, DRINKS, TUNING as T, L, TABLES, tableSeats, tableBlocks, LINES } from './data.js';
import { route, tableDef, custById, tableById, receiptById, ticketById, isNoisy, registerUp } from './sim.js';
import { orderList, dishIssues, payMultiplier, drinkOf, drinkIssues, isMenuItem } from './kitchen.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const OUTSIDE = { x: L.door.x, z: 10.4 };
const NUM = ['zero', 'a', 'two', 'three', 'four'];

export function drinkText(list) {
  const counts = {};
  for (const d of list) counts[d] = (counts[d] || 0) + 1;
  const parts = Object.entries(counts).map(([k, n]) => `${NUM[n] || n} ${DRINKS[k].name.toLowerCase()}${n > 1 ? 's' : ''}`);
  return parts.length <= 1 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

// table seats + the aisle point you walk to before stepping into each seat
const SEATS = new Map(TABLES.map((t) => [t.n, tableSeats(t)]));
function blocked(x, z) {
  return TABLES.some((t) => tableBlocks(t, x, z));
}
function clearSegment(a, b) {
  const n = Math.ceil(dist(a, b) / 0.1);
  for (let i = 1; i < n; i++) { const t = i / n; if (blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false; }
  return true;
}
function approachFor(seat) {
  const cands = [...L.aisleZ.map((z) => ({ x: seat.x, z })), ...L.aisleX.map((x) => ({ x, z: seat.z }))]
    .filter((p) => clearSegment(p, seat)).sort((a, b) => dist(a, seat) - dist(b, seat));
  return cands[0] || { x: seat.x, z: L.aisleZ[1] };
}
export const seatsOf = (n) => SEATS.get(n);

export function installParty(Sim) {
  const P_ = Sim.prototype, H = P_.handlers;

  P_.leaderOf = function (c) { return c?.leader ? custById(this.s, c.leader) : c; };
  P_.partyOf = function (c) { const L0 = this.leaderOf(c); return L0 ? [L0, ...(L0.members || []).map((id) => custById(this.s, id)).filter(Boolean)] : []; };
  P_.partySize = function (c) { return 1 + (this.leaderOf(c)?.members?.length || 0); };

  // ---- orders ----
  P_.makeOrder = function (size = 1) {
    const meal = this.prog() < 0.5 ? 'breakfast' : 'lunch';
    const pool = Object.keys(MENU).filter((k) => MENU[k].meal === meal);
    const n = Math.max(1, Math.min(4, size + (Math.random() < 0.3 ? 1 : 0) - (size >= 3 && Math.random() < 0.35 ? 1 : 0)));
    const items = [];
    for (let i = 0; i < n; i++) {
      const kind = Math.random() < 0.15 ? 'milkshake' : pick(pool);
      const it = { kind };
      if (MENU[kind].styles) it.style = pick(MENU[kind].styles);
      if (MENU[kind].toppings) { const tp = MENU[kind].toppings.slice().sort(() => Math.random() - 0.5); it.toppings = tp.slice(0, Math.floor(Math.random() * 3)); }
      items.push(it);
    }
    const drinks = [];
    for (let i = 0; i < size && drinks.length < 3; i++) if (Math.random() < 0.45) drinks.push(meal === 'breakfast' ? (Math.random() < 0.75 ? 'coffee' : 'soda') : (Math.random() < 0.7 ? 'soda' : 'coffee'));
    return { items, drinks };
  };
  P_.orderText = function (c) {
    const d = c.order.drinks.length ? fill(pick(LINES.drinkSuffix), { drink: drinkText(c.order.drinks) }) : '';
    return fill(pick(this.partySize(c) > 1 ? LINES.partyOrder : LINES.order), { items: orderList(c.order.items), drink: d });
  };
  P_.orderSummary = function (c) {
    return orderList(c.order.items) + (c.order.drinks.length ? ` and ${drinkText(c.order.drinks)}` : '');
  };
  P_.orderValue = function (c) {
    return c.order.items.reduce((a, it) => a + MENU[it.kind].price, 0) + c.order.drinks.reduce((a, d) => a + DRINKS[d].price, 0);
  };

  // ---- arriving ----
  P_.newPerson = function (extra) {
    const hues = [0xC8262B, 0x3FB8AF, 0xE7B23B, 0xF4A6B8, 0x6B8DD6, 0x9B6BD6, 0x5FAF5F, 0xFF8C42, 0x4A4A8A];
    return {
      id: this.id(), kind: 'customer', name: pick(LINES.names), color: pick(hues),
      skin: pick([0xF2C8A0, 0xD9A066, 0x8D5A3B, 0xF5D6BA, 0xB07A4F]), hat: Math.random() < 0.35 ? pick([0x1B1B1B, 0xC8262B, 0x3FB8AF, 0xE7B23B]) : null,
      x: L.door.x + rnd(-0.2, 0.2), z: 10.3, yaw: 0, path: [], onArrive: null, spd: rnd(0.78, 1.25), v: 0,
      st: 'enter', pat: 1, stage: 'ok', bubble: '', bubbleUntil: 0, sick: false, calmAt: -99,
      table: null, seat: null, approach: null, outings: 0, outing: null,
      ...extra,
    };
  };
  P_.spawnCustomer = function (force = false) {
    const s = this.s;
    const people = s.customers.filter((c) => c.kind === 'customer' && c.st !== 'leaving').length;
    const r = Math.random(); let size = 1, acc = 0;
    for (let i = 0; i < T.partySizes.length; i++) { acc += T.partySizes[i]; if (r < acc) { size = i + 1; break; } }
    if (!force && people + size > T.maxCustomers + 3) return null;
    if (s.orderLine.length >= 6) return null;
    const leader = this.newPerson({ order: this.makeOrder(size), heard: false, ticket: null, bill: 0, quality: 1, members: [] });
    leader.path = [{ x: L.entry.x, z: L.entry.z }, ...route(L.entry, this.lineSpot(s.orderLine.length))];
    leader.onArrive = 'line';
    s.customers.push(leader);
    s.orderLine.push(leader.id);
    for (let i = 1; i < size; i++) {
      const m = this.newPerson({ leader: leader.id, st: 'tag', z: 10.3 + i * 0.55, x: leader.x + rnd(-0.3, 0.3) });
      leader.members.push(m.id);
      s.customers.push(m);
    }
    this.sound('doorbell', 'dining');
    return leader;
  };

  // a free table whose seats fit the whole party (smallest that fits)
  P_.freeTableFor = function (size) {
    const fits = this.s.tents.map((n) => ({ n, seats: SEATS.get(n).length })).filter((t) => t.seats >= size).sort((a, b) => a.seats - b.seats || a.n - b.n);
    return fits.length ? fits[0].n : null;
  };

  // ---- walking to and from seats ----
  P_.fromSeat = function (c, dest) {
    if (c.seat && c.approach && dist(c, c.seat) < 0.3) return [{ ...c.approach }, ...route(c.approach, dest)];
    return route(c, dest);
  };
  P_.goTable = function (leader) {
    const seats = SEATS.get(leader.table);
    leader.pat = Math.min(1, leader.pat + 0.5); leader.stage = 'ok'; this.updateStage(leader);
    this.partyOf(leader).forEach((p, i) => {
      p.seat = seats[i]; p.approach = approachFor(p.seat); p.table = leader.table;
      p.path = [...route(p, p.approach), { x: p.seat.x, z: p.seat.z }];
      p.st = 'toTable';
      p.onArrive = p === leader ? 'table' : 'seated';
    });
  };
  P_.goPay = function (leader) {
    const s = this.s;
    const t = tableById(s, leader.table);
    if (t) { t.cust = null; t.dirty = true; }
    const spot = this.paySpot(s.payLine.length);
    leader.path = this.fromSeat(leader, spot);
    leader.st = 'toPay'; leader.pat = 1; leader.stage = 'ok'; leader.onArrive = 'pay';
    s.payLine.push(leader.id);
    for (const m of this.partyOf(leader).slice(1)) {
      if (m.st === 'outing') continue;       // they'll catch up
      m.path = this.fromSeat(m, { x: spot.x + 0.7, z: spot.z + 0.5 }); m.st = 'tag'; m.onArrive = null; m.seat = null;
    }
  };
  P_.leave = function (c) {
    const s = this.s;
    if (c.st === 'leaving' || c.st === 'gone') return;
    if (c.outing?.kind === 'restroom' && s.rooms[c.outing.room]?.occ === c.id) s.rooms[c.outing.room].occ = null;
    const pts = this.fromSeat(c, L.entry);
    pts.push(OUTSIDE);
    s.orderLine = s.orderLine.filter((id) => id !== c.id);
    s.payLine = s.payLine.filter((id) => id !== c.id);
    c.st = 'leaving'; c.path = pts; c.onArrive = 'gone'; c.outing = null;
    if (!c.leader) for (const m of this.partyOf(c).slice(1)) this.leave(m);
  };
  P_.getSick = function (c) {
    const s = this.s;
    c.sick = true; c.sickAt = null;
    this.bubble(c, '🤢 ' + pick(LINES.sick), 4);
    this.sound('blegh', 'dining');
    s.sickCount++;
    s.puddles.push({ id: this.id(), x: c.x + 0.35, z: c.z + 0.35, kind: 'sick', table: c.table });
    this.damage('Sick customers (comped + cleanup)', T.sickDamage);
    for (const o of s.customers) {
      if (o !== c && o.kind === 'customer' && dist(o, c) < 4) { const l = this.leaderOf(o); if (l) { l.pat -= 0.2; this.updateStage(l); } this.bubble(o, pick(LINES.ew)); }
      if (o.kind === 'inspector' && o.st === 'inspect') this.damage('Health inspector fines', s.inspector?.lenient ? 12 : 25);
    }
    if (!c.leader) { const t = tableById(s, c.table); if (t) { t.cust = null; t.dirty = true; } }
    this.leave(c);
  };

  // ---- the tick ----
  P_.tickCustomers = function (dt) {
    const s = this.s;
    const mult = (isNoisy(s) ? T.noiseDrain : 1) * (s.fire ? T.smokeDrain : 1);
    const drinkers = s.customers.filter((c) => c.st === 'waitDrink');
    for (const c of s.customers) {
      // slipping on a soda spill
      if (c.slipUntil && s.t < c.slipUntil) c.v = 0;
      else if (c.path.length && c.kind === 'customer' && !c.sick) {
        const sp = s.puddles.find((p) => (p.kind === 'spill' || p.kind === 'flood') && dist(p, c) < 0.45 * (p.size ?? 1) && !(c.slipped || []).includes(p.id));
        if (sp) {
          c.slipped = [...(c.slipped || []), sp.id];
          if (Math.random() < 0.7) {
            c.slipUntil = s.t + 1.4; c.v = 0;
            this.bubble(c, pick(['WHOAAA!', 'WAAAH!', 'YIKES!', 'MY BACK!']), 2);
            this.sound('slip', 'dining');
            const l = this.leaderOf(c); if (l) { l.pat -= 0.06; this.updateStage(l); }
          }
        }
      }
      if (c.slipUntil && s.t < c.slipUntil) { /* frozen mid-slip */ }
      else if (c.path.length) {
        // joining a queue or walking out the door: close enough counts (crowds can't all land on one point)
        const queueEnd = c.path.length === 1 && ((c.onArrive === 'line' || c.onArrive === 'pay') && dist(c, c.path[0]) < 0.8 || c.onArrive === 'gone' && dist(c, c.path[0]) < 0.9);
        if (queueEnd || this.moveToward(c, c.path[0], dt, c.path.length === 1)) {
          c.path.shift();
          if (!c.path.length && c.onArrive) { const f = c.onArrive; c.onArrive = null; this.arrive(c, f); }
        }
      } else if (c.st === 'line') this.moveToward(c, this.lineSpot(s.orderLine.indexOf(c.id)), dt);
      else if (c.st === 'pay') this.moveToward(c, this.paySpot(s.payLine.indexOf(c.id)), dt);
      else if (c.st === 'waitDrink') this.moveToward(c, this.pickupSpot(drinkers.indexOf(c)), dt);
      else if (c.st === 'tag') this.followLeader(c, dt);

      // walkers sidestep anyone they're about to bump into
      if ((c.path.length || c.st === 'tag') && c.v > 0.2) {
        for (const o of s.customers) {
          if (o === c) continue;
          const ox = c.x - o.x, oz = c.z - o.z, od = Math.hypot(ox, oz);
          if (od > 0.01 && od < 0.7) {
            const hx = -Math.sin(c.yaw), hz = -Math.cos(c.yaw);
            const side = (ox * -hz + oz * hx) >= 0 ? 1 : -1;
            const push = (0.7 - od) * 2.2 * dt;
            c.x += -hz * side * push; c.z += hx * side * push;
          }
        }
      }
      if (!c.path.length) {
        if (c.seat && (c.st === 'waitFood' || c.st === 'seated' || c.st === 'eating')) c.yaw = c.seat.yaw;
        if (c.st === 'line' || c.st === 'waitDrink') c.yaw = 0;          // facing the lunch counter
        if (c.st === 'pay') c.yaw = Math.PI / 2;                            // facing the register stand
      }

      // outings: done staying somewhere?
      if (c.st === 'outing' && c.outing?.phase === 'stay' && s.t >= c.outing.until) this.endOutingStay(c);

      // patience (only the leader has a meter)
      const span = T.patience[c.st];
      if (span && c.kind === 'customer' && !c.leader && !c.path.length && !s.solo) {
        let m = mult;
        if (s.puddles.some((p) => dist(p, c) < 2.5)) m *= 1.3;
        if (c.st === 'line' && s.orderLine.indexOf(c.id) > 0) m *= 0.8;
        c.pat -= (dt / span) * m;
        this.updateStage(c);
        if (c.pat <= 0) { this.walkOut(c); continue; }
      }
      if (c.leader) { const l = this.leaderOf(c); if (l) { c.stage = l.stage; c.pat = l.pat; } }

      // eating, getting sick
      if (c.sickAt && s.t >= c.sickAt && (c.st === 'eating' || c.st === 'seated')) this.getSick(c);
      else if (c.st === 'eating' && !c.leader && s.t >= c.eatUntil) this.goPay(c);

      this.maybeOuting(c, dt);
      if (c.bubble && s.t > c.bubbleUntil) c.bubble = '';
    }
    // clogged toilets keep flooding
    s.rooms.forEach((room, i) => {
      if (room.clog <= 0) return;
      const f = s.puddles.find((p) => p.kind === 'flood' && p.room === i);
      if (f) f.size = Math.min(T.floodMax, (f.size ?? 0.3) + T.floodGrow * dt);
      else s.puddles.push({ id: this.id(), kind: 'flood', room: i, x: L.rooms[i].toilet.x - 0.6, z: L.rooms[i].toilet.z, size: 0.3 });
    });
    s.customers = s.customers.filter((c) => c.st !== 'gone');
  };

  // party members stay near their leader in queues, and trail behind when walking
  P_.followLeader = function (c, dt) {
    const l = this.leaderOf(c);
    if (!l || l.st === 'leaving' || l.st === 'gone') { this.leave(c); return; }
    const k = Math.max(0, (l.members || []).indexOf(c.id));
    let target;
    if (l.path.length) {
      const fx = -Math.sin(l.yaw), fz = -Math.cos(l.yaw);
      target = { x: l.x - fx * 0.75 * (k + 1) + (k % 2 ? 0.3 : -0.3) * fz, z: l.z - fz * 0.75 * (k + 1) - (k % 2 ? 0.3 : -0.3) * fx };
    } else if (l.st === 'pay') {
      const o = [[0, -0.75], [0.62, -0.75], [-0.62, -0.75]][k] || [0, -1.4];   // the pay stand is against the front wall: friends wait in front
      target = { x: l.x + o[0], z: l.z + o[1] };
    } else {
      const o = [[0, 0.72], [0.62, 0.72], [-0.62, 0.72]][k] || [0, 1.3];        // friends stand right behind whoever's ordering
      target = { x: l.x + o[0], z: l.z + o[1] };
    }
    const done = this.moveToward(c, target, dt, !l.path.length);
    if (done && !l.path.length) c.yaw = l.yaw;
  };

  P_.arrive = function (c, what) {
    const s = this.s;
    switch (what) {
      case 'line': c.st = 'line'; break;
      case 'table': c.st = 'waitFood'; c.yaw = c.seat.yaw; break;
      case 'seated': c.st = 'seated'; c.yaw = c.seat.yaw; break;
      case 'pay': c.st = 'pay'; break;
      case 'inspect': c.st = 'inspect'; c.yaw = Math.PI / 2; break;
      case 'outingArrive': this.outingArrive(c); break;
      case 'outingBack': this.outingBack(c); break;
      case 'gone': c.st = 'gone'; break;
    }
    if (what === 'gone' && s.npc.cid === c.id) s.npc = { cid: null, lines: [] };
  };

  // ---- outings: the restroom, or a little wander ----
  P_.maybeOuting = function (c, dt) {
    const l = this.leaderOf(c);
    const sitting = c === l ? c.st === 'waitFood' : c.st === 'seated' && l?.st === 'waitFood';
    if (!sitting || c.path.length || !c.seat || c.sick || c.outings >= T.outingMax) return;
    if (Math.random() < T.outingRate * dt) this.startOuting(c);
  };
  P_.startOuting = function (c) {
    const s = this.s;
    const free = s.rooms.map((r, i) => (r.occ == null ? i : -1)).filter((i) => i >= 0);
    if (free.length && Math.random() < T.restroomShare) {
      const i = pick(free), R = L.rooms[i];
      s.rooms[i].occ = c.id;
      c.outing = { kind: 'restroom', room: i, phase: 'go', prev: c.st };
      c.path = [...this.fromSeat(c, L.corridorMouth), { x: L.corridorMouth.x, z: R.doorZ }, { x: 5.0, z: R.doorZ }, { ...R.spot }];
    } else {
      const spot = pick(L.wanderSpots);
      c.outing = { kind: 'wander', spot, phase: 'go', prev: c.st };
      c.path = this.fromSeat(c, spot);
    }
    c.st = 'outing'; c.onArrive = 'outingArrive';
  };
  P_.outingArrive = function (c) {
    const s = this.s, o = c.outing;
    if (!o) return;
    o.phase = 'stay';
    if (o.kind === 'restroom') {
      const messy = s.rooms[o.room].clog > 0 || s.puddles.some((p) => p.room === o.room);
      c.yaw = -Math.PI / 2;
      if (messy) {
        o.ew = true; o.until = s.t + 1.0;
        this.bubble(c, '😖 ' + pick(LINES.restroomEw), 3);
        const l = this.leaderOf(c); if (l) { l.pat -= 0.15; this.updateStage(l); }
      } else o.until = s.t + rnd(T.restroomStay[0], T.restroomStay[1]);
      this.sound('door', 'dining');
    } else {
      c.yaw = Math.atan2(-(o.spot.face.x - c.x), -(o.spot.face.z - c.z));
      o.until = s.t + rnd(T.wanderStay[0], T.wanderStay[1]);
      this.bubble(c, o.spot.bubble, 2.5);
    }
  };
  P_.endOutingStay = function (c) {
    const s = this.s, o = c.outing;
    if (o.kind === 'restroom') {
      const room = s.rooms[o.room], R = L.rooms[o.room];
      if (!o.ew) {
        if (room.clog <= 0 && Math.random() < T.clogChance) {
          room.clog = T.clogPlunges;
          this.bubble(c, '😬 ' + pick(LINES.clogged), 3);
          this.sound('blub', 'dining');
        } else if (Math.random() < T.tpChance) {
          s.puddles.push({ id: this.id(), kind: 'tp', room: o.room, x: R.spot.x - 0.45, z: R.spot.z - 0.2, size: 1 });
          this.bubble(c, pick(LINES.restroomOops), 2.5);
        }
        this.sound('flush', 'dining');
      }
      room.occ = null;
      this.sound('door', 'dining');
      c.path = [{ x: 5.0, z: R.doorZ }, { x: L.corridorMouth.x, z: R.doorZ }, { ...L.corridorMouth }, ...route(L.corridorMouth, c.approach), { x: c.seat.x, z: c.seat.z }];
    } else {
      c.path = [...route(c, c.approach), { x: c.seat.x, z: c.seat.z }];
    }
    o.phase = 'back'; c.onArrive = 'outingBack';
  };
  P_.outingBack = function (c) {
    const s = this.s, o = c.outing;
    c.outings++; c.outing = null; c.yaw = c.seat.yaw;
    if (c.leader) { const l = this.leaderOf(c); c.st = l && ['waitFood', 'eating', 'outing'].includes(l.st) ? 'seated' : 'tag'; if (c.st === 'tag') c.seat = null; return; }
    if (c.eatPending) { c.eatPending = false; c.st = 'eating'; c.eatUntil = s.t + T.eatTime; }
    else c.st = o?.prev === 'eating' ? 'eating' : 'waitFood';
  };

  // ---- handlers ----
  H.ringUp = function (role, P, a) {
    const s = this.s, c = custById(s, a.cid);
    if (!c || s.orderLine[0] !== c.id || !c.heard || !registerUp(s)) return;
    const n = this.freeTableFor(this.partySize(c));
    if (n == null) return;
    s.tents = s.tents.filter((x) => x !== n);
    const tb = tableById(s, n);
    tb.cust = c.id; tb.tent = true;
    const tk = { id: this.id(), cid: c.id, items: c.order.items.slice(), drinks: c.order.drinks.slice(), size: this.partySize(c), table: n, status: 'queued', t: s.t };
    s.tickets.push(tk);
    c.table = n; c.ticket = tk.id;
    s.orderLine.shift();
    this.sound('register', 'dining');
    this.sound('tvbeep', 'kitchen');
    this.npcSay(c, `Table ${n}, got it.`);
    c.drinksLeft = c.order.drinks.slice(); c.drinksGiven = [];
    if (c.drinksLeft.length) { c.st = 'waitDrink'; c.pat = Math.min(1, c.pat + 0.5); c.stage = 'ok'; this.updateStage(c); }
    else this.goTable(c);
  };
  H.giveDrink = function (role, P, a) {
    const s = this.s, c = custById(s, a.cid), h = P.held;
    const kind = drinkOf(h);
    if (!c || !kind) return;
    if (c.kind === 'inspector') {
      if (kind === 'coffee' && h.p >= 0.5 && s.inspector) { s.inspector.lenient = true; P.held = null; this.bubble(c, '☕ ...Fine. I\'ll go easy.', 3); }
      return;
    }
    const l = this.leaderOf(c);
    if (!l || l.st !== 'waitDrink') return;
    if (!l.drinksLeft.includes(kind)) {
      this.bubble(c, fill(pick(LINES.wrongDrink), { drink: DRINKS[kind].name.toLowerCase() }));
      l.pat -= 0.1; this.updateStage(l); this.sound('buzz', 'dining');
      return;
    }
    if ((h.type === 'cup' && h.fill < 0.3) || (h.type === 'mug' && h.p < 0.3)) { this.bubble(c, '😑 It\'s... empty.'); this.sound('buzz', 'dining'); return; }
    const issues = drinkIssues(h);
    l.drinksGiven.push({ kind, m: issues.reduce((m, i) => m * i.m, 1) });
    l.drinksLeft.splice(l.drinksLeft.indexOf(kind), 1);
    if (h.floor && Math.random() < T.floorSickChance) l.dirtyDrink = true;
    P.held = null;
    this.bubble(c, issues.length ? '😒 ' + issues[0].line : '😊 Thanks!', issues.length ? 3.5 : 2);
    if (!l.drinksLeft.length) this.goTable(l);
  };
  H.serve = function (role, P, a) {
    const s = this.s, tb = tableById(s, a.n);
    if (P.held?.type !== 'tray' || !tb) return;
    const c = custById(s, tb.cust);
    if (!c) return;
    const away = c.st === 'outing' && c.outing?.prev === 'waitFood';
    if (c.st !== 'waitFood' && !away) return;
    const plate = P.held.plate;
    const pool = plate.items.filter(isMenuItem);
    const matched = [], missing = [];
    for (const want of c.order.items) {
      let best = -1, bestM = -1;
      pool.forEach((f, i) => { if (f.kind !== want.kind) return; const m = payMultiplier(dishIssues(f, want)); if (m > bestM) { bestM = m; best = i; } });
      if (best >= 0) matched.push({ food: pool.splice(best, 1)[0], want }); else missing.push(want);
    }
    const speaker = away ? (this.partyOf(c).find((p) => p.st === 'seated') || c) : c;
    if (matched.length < Math.ceil(c.order.items.length / 2)) {
      this.bubble(speaker, '😡 ' + pick(LINES.wrongOrder));
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
    for (const d of c.drinksGiven || []) bill += DRINKS[d.kind].price * d.m;
    c.quality = (qsum / c.order.items.length) * (missing.length ? 0.6 : 1);
    c.bill = Math.round(bill * 100) / 100;
    if (gripes.length) { this.bubble(speaker, '😒 ' + gripes[0], 4); c.pat -= 0.08 * gripes.length; }
    else this.bubble(speaker, '😋 ' + pick(LINES.happy), 3);
    tb.plate = { items: plate.items, dirty: plate.dirty };
    const r = receiptById(s, P.held.receiptId); if (r) r.loc = 'done';
    const tk = ticketById(s, c.ticket); if (tk) tk.status = 'served';
    P.held = null;
    if (away) { c.eatPending = true; c.outing.prev = 'eating'; }
    else { c.st = 'eating'; c.eatUntil = s.t + T.eatTime; }
    c.pat = Math.max(0.3, c.pat);
    const risky = plate.dirty || floorFood || c.dirtyDrink;
    if (risky) for (const p of this.partyOf(c)) if (Math.random() < (plate.dirty ? T.sickChance : T.floorSickChance)) p.sickAt = s.t + rnd(T.sickDelay[0], T.sickDelay[1]) + (away && p === c ? 20 : 0);
    s.served++;
    this.sound('plate', 'dining');
  };
  H.takePay = function (role, P, a) {
    const s = this.s, c = custById(s, a.cid);
    if (!c || s.payLine[0] !== c.id || c.st !== 'pay' || !registerUp(s)) return;
    const tip = Math.round(c.bill * T.tipRate * clamp01(c.pat + 0.2) * clamp01(c.quality) * 100) / 100;
    s.money.sales += c.bill; s.money.tips += tip;
    this.bubble(c, `💵 ${pick(LINES.thanks)}${tip > 0.5 ? ` (+$${tip.toFixed(2)} tip)` : ''}`, 3);
    this.sound('chaching', 'dining');
    s.payLine.shift();
    this.leave(c);
  };
  // the plunger
  H.takePlunger = function (role, P) { if (!P.held && this.s.plungerHome) { this.s.plungerHome = false; P.held = { type: 'plunger' }; this.sound('clunk', 'dining'); } };
  H.returnPlunger = function (role, P) { if (P.held?.type === 'plunger' && !this.s.plungerHome) { this.s.plungerHome = true; P.held = null; } };
  H.plunge = function (role, P, a) {
    const room = this.s.rooms[a.i];
    if (!room || P.held?.type !== 'plunger' || room.clog <= 0) return;
    room.clog--;
    this.sound(room.clog ? 'plunge' : 'flush', 'dining');
  };
}
