// ---------------------------------------------------------------------------
// Incidents: everything that can go wrong at the diner (the v0.1 event list),
// plus the conversation system the server uses to talk customers through it.
//
// Every incident is an entry in INC below: when it may start, what it does,
// what it changes every tick, and which replies it adds to the NPC chat.
// The director (sim.js) picks them using the weights in data.js → EVENTS.
// Nothing here can end a shift: incidents cost money, time or patience.
// ---------------------------------------------------------------------------
import { MENU, TUNING as T, L, TABLES, LINES, RECIPES } from './data.js';
import { route, custById, tableById, ticketById, isNoisy, registerUp } from './sim.js';
import { newFood, isDone, curStep, isMenuItem, drinkOf } from './kitchen.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const OUTSIDE = { x: L.door.x, z: 10.4 };
const nameOf = (kind) => MENU[kind]?.name.toLowerCase() ?? kind;

// which menu items an empty ingredient tray knocks out
export const OUT_HITS = { eggs: ['eggs'], bacon: ['bacon'], bun: ['cheeseburger'], patty: ['cheeseburger'], bread: ['toast', 'grilledcheese'], milkshake: ['milkshake'] };
const OUT_LABEL = { eggs: 'eggs', bacon: 'bacon', bun: 'burger buns', patty: 'burger patties', bread: 'bread', milkshake: 'ice cream' };
export const outMenuKinds = (s) => Object.keys(s.inc?.out || {}).flatMap((k) => OUT_HITS[k] || []);

// things on the floor you can slip on (and what they're called)
const SLIPPERY = new Set(['spill', 'flood', 'oil', 'coffee', 'water', 'shake', 'food']);

export function freshInc() {
  return {
    out: {},                 // ingredient -> restock time
    batterUntil: 0, coffee: null, freezerOpenAt: null, sinkClog: false, bellStuck: false, toasterJam: false,
    knife: null, staffMeal: null, posterBurnt: false, falseAlarm: false, extDud: false, extKnownEmpty: false,
    dog: null, dashNext: false, criticNext: false, dupNext: false, panicUntil: 0, alarmSeen: false, nextBell: 0,
  };
}

// ----------------------------------------------------------------------------
// the incidents
// ----------------------------------------------------------------------------
const waitingLeaders = (sim, sts = ['waitFood']) => sim.s.customers.filter((c) => c.kind === 'customer' && !c.leader && sts.includes(c.st) && !c.topic && c.table);

const INC = {
  // ======================= front of house =======================
  meltdown: {
    active: (sim) => sim.s.customers.some((c) => c.topic?.kind === 'melt'),
    can: (sim) => waitingLeaders(sim, ['waitFood', 'waitDrink']).length > 0,
    start(sim) {
      const c = waitingLeaders(sim, ['waitFood', 'waitDrink']).sort((a, b) => a.pat - b.pat)[0];
      sim.startMeltdown(c);
    },
  },
  tableFlip: {
    active: (sim) => sim.s.tables.some((t) => t.flipped),
    can: (sim) => flipTarget(sim) != null,
    start(sim) {
      const s = sim.s, c = flipTarget(sim), tb = tableById(s, c.table);
      tb.flipped = true;
      if (tb.plate) { sim.damage('Food lost (flipped table)', tb.plate.items.length * 3); tb.plate = null; c.remake = c.st === 'eating'; }
      if (c.st === 'eating') { c.st = 'waitFood'; }
      const t = TABLES.find((x) => x.n === c.table);
      s.puddles.push({ id: sim.id(), kind: 'food', x: t.x + rnd(-0.3, 0.3), z: t.z + 0.9, table: c.table, size: 1.2 });
      c.pat = Math.min(c.pat, 0.25); sim.updateStage(c);
      c.topic = { kind: 'flip' };
      sim.bubble(c, '🤬 ' + pick(LINES.flip), 4);
      sim.sound('crash', 'dining'); sim.sound('slam', 'dining');
      nearbyGrumble(sim, c, 0.15, pick(LINES.ew));
    },
  },
  critic: {
    active: (sim) => sim.s.inc.criticNext,
    can: () => true,
    start(sim) {
      // mark someone in line who hasn't ordered yet, or the next party through the door
      const c = sim.s.customers.find((x) => x.kind === 'customer' && !x.leader && x.st === 'line' && !x.heard);
      if (c) c.critic = true; else sim.s.inc.criticNext = true;
    },
  },
  birthday: {
    active: () => false,
    can: (sim) => sim.s.customers.some((c) => c.kind === 'customer' && !c.leader && (c.members?.length) && ['line', 'enter', 'waitDrink', 'waitFood'].includes(c.st) && !c.topic && !c.birthday),
    start(sim) {
      const c = pick(sim.s.customers.filter((x) => x.kind === 'customer' && !x.leader && (x.members?.length) && ['line', 'enter', 'waitDrink', 'waitFood'].includes(x.st) && !x.topic && !x.birthday));
      const who = custById(sim.s, pick(c.members))?.name || c.name;
      c.birthday = { who, promised: null, cake: false, sung: false };
      c.topic = { kind: 'bday' };
      sim.bubble(c, '🎂 ' + fill(pick(LINES.bdayHint), { who }), 4);
    },
  },
  changeOrder: {
    active: (sim) => sim.s.customers.some((c) => c.topic?.kind === 'change'),
    can: (sim) => waitingLeaders(sim).some((c) => c.ticket),
    start(sim) {
      const s = sim.s, c = pick(waitingLeaders(sim).filter((x) => x.ticket));
      const idx = Math.floor(Math.random() * c.order.items.length), old = c.order.items[idx].kind;
      const meal = MENU[old].meal === 'any' ? (sim.prog() < 0.5 ? 'breakfast' : 'lunch') : MENU[old].meal;
      const to = pick(Object.keys(MENU).filter((k) => k !== old && (MENU[k].meal === meal) && !outMenuKinds(s).includes(k)));
      c.topic = { kind: 'change', idx, from: old, to, until: s.t + 35 };
      sim.bubble(c, '✋ ' + pick(LINES.changeHail), 5);
    },
  },
  manager: {
    active: (sim) => sim.s.customers.some((c) => c.topic?.kind === 'mgr'),
    can: (sim) => waitingLeaders(sim).length > 0,
    start(sim) {
      const c = pick(waitingLeaders(sim));
      c.topic = { kind: 'mgr', round: 0, need: 3 };
      c.pat = Math.min(c.pat, 0.45); sim.updateStage(c);
      sim.bubble(c, '👔 ' + pick(LINES.manager), 5);
      sim.sound('grumble', 'dining');
    },
  },
  dash: {
    active: (sim) => sim.s.inc.dashNext || sim.s.customers.some((c) => c.st === 'dash'),
    can: () => true,
    start(sim) { sim.s.inc.dashNext = true; },
  },
  fly: {
    active: (sim) => sim.s.customers.some((c) => c.topic?.kind === 'fly'),
    can: (sim) => sim.s.customers.some((c) => !c.leader && c.st === 'eating' && !c.topic && !c.critic),
    start(sim) {
      const s = sim.s, c = pick(s.customers.filter((x) => !x.leader && x.st === 'eating' && !x.topic && !x.critic));
      const item = c.order.items.find((i) => i.kind === 'pancakes') || pick(c.order.items);
      c.topic = { kind: 'fly', item: { ...item } };
      c.pat = Math.min(c.pat, 0.4); sim.updateStage(c);
      sim.bubble(c, '🪰 ' + fill(pick(LINES.fly), { item: nameOf(item.kind) }), 5);
      sim.sound('scream', 'dining');
      nearbyGrumble(sim, c, 0.08, '🤢');
    },
  },
  dog: {
    active: (sim) => !!sim.s.inc.dog,
    can: () => true,
    start(sim) {
      const s = sim.s;
      s.inc.dog = { x: L.door.x, z: 10.2, yaw: Math.PI, tx: L.entry.x, tz: L.entry.z, st: 'run', until: s.t + 70, nextBark: s.t + 1, nextMess: s.t + 5 };
      sim.sound('bark', 'dining');
    },
  },
  balloon: {
    active: (sim) => sim.s.customers.some((c) => c.kind === 'artist'),
    can: (sim) => sim.s.customers.some((c) => !c.leader && ['waitFood', 'eating'].includes(c.st)),
    start(sim) {
      const s = sim.s;
      const near = pick(s.customers.filter((c) => !c.leader && ['waitFood', 'eating'].includes(c.st)));
      const t = TABLES.find((x) => x.n === near.table);
      const spot = { x: t.x - 1.35, z: t.z + 0.3 };
      if (t.shape === 'booth') { spot.x = t.x - 1.35; }
      const a = sim.newPerson({ kind: 'artist', name: 'Bingo the Balloon Guy', color: 0xFFD23C, hat: 0xC8262B, order: { items: [], drinks: [] }, spd: 1 });
      a.path = [{ x: L.entry.x, z: L.entry.z }, ...route(L.entry, spot)];
      a.onArrive = 'artist';
      s.customers.push(a);
      sim.sound('doorbell', 'dining');
    },
  },
  refills: {
    active: () => false,
    can: (sim) => refillTarget(sim) != null,
    start(sim) {
      const c = refillTarget(sim);
      c.refills = { kind: c.order.drinks.includes('coffee') ? 'coffee' : 'soda', n: 0, want: true, nag: sim.s.t };
      sim.bubble(c, c.refills.kind === 'coffee' ? '☕ Refill, hon?' : '🥤 Refill?', 4);
    },
  },
  mixup: {
    active: (sim) => sim.s.customers.some((c) => c.topic?.kind === 'mixup'),
    can: (sim) => mixupTarget(sim) != null && sim.s.customers.filter((c) => c.kind === 'customer').length < T.maxCustomers + 4,
    start(sim) {
      const s = sim.s, occ = mixupTarget(sim), t = TABLES.find((x) => x.n === occ.table);
      const leader = sim.newPerson({ order: sim.makeOrder(2), heard: false, ticket: null, bill: 0, quality: 1, members: [] });
      leader.path = [{ x: L.entry.x, z: L.entry.z }, ...route(L.entry, { x: t.approach.x - 0.4, z: t.z })];
      leader.onArrive = 'mixup'; leader.topic = { kind: 'mixup', n: occ.table };
      s.customers.push(leader);
      const m = sim.newPerson({ leader: leader.id, st: 'tag', z: 10.85 });
      leader.members.push(m.id); s.customers.push(m);
      sim.sound('doorbell', 'dining');
    },
  },
  coffeeBoom: {
    active: (sim) => !!sim.s.inc.coffee,
    can: (sim) => sim.s.power,
    start(sim) {
      const s = sim.s;
      s.inc.coffee = { phase: 'leak' };
      if (s.coffeeM) s.coffeeM = null;
      s.puddles.push({ id: sim.id(), kind: 'coffee', x: L.coffee.x + 0.1, z: L.backCounter.z1 + 0.45, size: 0.4, src: 'coffee' });
      sim.sound('bang', 'dining'); sim.sound('splash', 'dining');
      nearbyGrumble(sim, { x: L.coffee.x, z: 0 }, 0, '😱', 6);
    },
  },

  // ======================= back of house =======================
  extDud: {
    active: (sim) => sim.s.inc.extDud,
    can: (sim) => sim.s.extOnWall && !sim.s.fire,
    start(sim) { sim.s.inc.extDud = true; },          // nobody knows until they need it
  },
  soakedReceipt: {
    active: () => false,
    can: (sim) => sim.s.receipts.some((r) => ['rail', 'held', 'printer'].includes(r.loc) && r.grime < 0.8),
    start(sim) {
      const r = pick(sim.s.receipts.filter((x) => ['rail', 'held', 'printer'].includes(x.loc) && x.grime < 0.8));
      r.grime = 0.95; r.stain = pick(['coffee', 'syrup', 'grease']);
      sim.sound('splash', 'kitchen');
    },
  },
  receiptDrift: {
    active: () => false,
    can: (sim) => sim.s.receipts.some((r) => r.loc === 'rail'),
    start(sim) {
      const r = pick(sim.s.receipts.filter((x) => x.loc === 'rail'));
      sim.dropReceipt(r);
      r.fx = rnd(-6.2, -1.5); r.fz = rnd(-3.4, -2.6);
    },
  },
  batter: {
    active: (sim) => sim.s.inc.batterUntil > sim.s.t,
    can: () => true,
    start(sim) {
      sim.s.inc.batterUntil = sim.s.t + 20;
      sim.sound('splash', 'kitchen'); sim.sound('thud', 'kitchen');
    },
  },
  fryerOverflow: {
    active: (sim) => sim.s.puddles.some((p) => p.kind === 'oil'),
    can: (sim) => sim.s.stations.fryer.some((x) => x),
    start(sim) {
      sim.s.puddles.push({ id: sim.id(), kind: 'oil', x: L.fryer.x + rnd(-0.3, 0.3), z: -5.65, size: 1.1 });
      sim.sound('sizzle', 'kitchen'); sim.sound('splash', 'kitchen');
    },
  },
  outOf: {
    active: (sim) => Object.keys(sim.s.inc.out).length > 0,
    can: () => true,
    start(sim) {
      const s = sim.s, k = pick(['eggs', 'bacon', 'bun', 'patty', 'bread'].filter((x) => !s.inc.out[x]));
      if (k) s.inc.out[k] = s.t + 80;
    },
  },
  falseAlarm: {
    active: (sim) => sim.s.inc.falseAlarm,
    can: (sim) => !sim.s.fire && !sim.s.alarm,
    start(sim) {
      const s = sim.s;
      s.inc.falseAlarm = true; s.alarm = true; s.alarmOffAt = 1e9;
    },
  },
  dishTower: {
    active: () => false,
    can: (sim) => sim.s.dirtyDishes >= 5,
    start(sim) {
      const s = sim.s, n = Math.min(s.dirtyDishes, 3 + Math.floor(Math.random() * 3));
      s.dirtyDishes -= n;
      sim.damage('Broken plates', n * 2);
      s.puddles.push({ id: sim.id(), kind: 'shards', x: L.dishReturn.x + rnd(-0.3, 0.3), z: L.wallZ - 0.75, size: 1 });
      sim.sound('crash', 'kitchen'); sim.sound('crash', 'dining');
    },
  },
  sinkClog: {
    active: (sim) => sim.s.inc.sinkClog,
    can: () => true,
    start(sim) {
      sim.s.inc.sinkClog = true;
      sim.s.puddles.push({ id: sim.id(), kind: 'water', x: L.sink.x - 0.75, z: L.sink.z, size: 0.35, src: 'sink' });
      sim.sound('blub', 'kitchen');
    },
  },
  freezerOpen: {
    active: (sim) => sim.s.inc.freezerOpenAt != null,
    can: (sim) => !sim.s.inc.out.milkshake,
    start(sim) { sim.s.inc.freezerOpenAt = sim.s.t; sim.sound('fridge', 'kitchen'); },
  },
  dupTicket: {
    active: (sim) => sim.s.inc.dupNext,
    can: () => true,
    start(sim) { sim.s.inc.dupNext = true; },
  },
  staffMeal: {
    active: (sim) => !!sim.s.inc.staffMeal || sim.s.fire?.at === 'staff',
    can: (sim) => !sim.s.fire,
    start(sim) { sim.s.inc.staffMeal = { t0: sim.s.t, burnAt: sim.s.t + 28 }; sim.sound('sizzle', 'kitchen'); },
  },
  knife: {
    active: (sim) => !!sim.s.inc.knife,
    can: () => true,
    start(sim) {
      sim.s.inc.knife = { x: L.island.x + rnd(-1.8, 1.8), z: L.island.z + (Math.random() < 0.5 ? -0.75 : 0.75) };
      sim.sound('clatter', 'kitchen');
    },
  },
  poster: {
    active: (sim) => sim.s.fire?.at === 'poster',
    can: (sim) => !sim.s.fire && !sim.s.inc.posterBurnt,
    start(sim) {
      sim.startFire('poster');
      const c = sim.s.customers.find((x) => x.kind === 'customer' && ['line', 'waitDrink', 'pickup'].includes(x.st));
      if (c) sim.bubble(c, '🔥 Is that... the FIRE SAFETY poster?', 4);
    },
  },
  toasterJam: {
    active: (sim) => sim.s.inc.toasterJam,
    can: (sim) => sim.s.stations.toaster.some((x) => x && !x.popped),
    start(sim) { sim.s.inc.toasterJam = true; sim.sound('clunk', 'kitchen'); },
  },
  bellStuck: {
    active: (sim) => sim.s.inc.bellStuck,
    can: () => true,
    start(sim) { sim.s.inc.bellStuck = true; sim.s.inc.nextBell = sim.s.t; },
  },
};

function flipTarget(sim) {
  return sim.s.customers.find((c) => !c.leader && ['waitFood', 'eating'].includes(c.st) && !c.topic && c.table && TABLES.find((t) => t.n === c.table)?.shape === 'square' && c.pat < 0.6);
}
function refillTarget(sim) {
  return sim.s.customers.find((c) => !c.leader && ['waitFood', 'eating'].includes(c.st) && !c.topic && !c.refills && c.order.drinks?.length && (c.drinksGiven?.length));
}
function mixupTarget(sim) {
  return sim.s.customers.find((c) => !c.leader && c.table && TABLES.find((t) => t.n === c.table)?.shape === 'booth' && ['waitFood', 'eating'].includes(c.st) && !c.topic);
}
function nearbyGrumble(sim, c, amt, text, r = 3.5) {
  for (const o of sim.s.customers) {
    if (o === c || o.kind !== 'customer' || dist(o, c) > r) continue;
    const l = sim.leaderOf(o);
    if (l && amt) { l.pat -= amt; sim.updateStage(l); }
    if (Math.random() < 0.5) sim.bubble(o, text, 2.5);
  }
}

// ----------------------------------------------------------------------------
// install
// ----------------------------------------------------------------------------
export function installIncidents(Sim) {
  const P_ = Sim.prototype, H = P_.handlers;
  const base = {
    isActive: P_.isActive, canStart: P_.canStart, startEvent: P_.startEvent, tick: P_.tick, arrive: P_.arrive, goPay: P_.goPay,
    spawnCustomer: P_.spawnCustomer, getSick: P_.getSick, tickInspector: P_.tickInspector, tickKitchen: P_.tickKitchen, timedFor: P_.timedFor, talk: H.talk, say: H.say,
    serve: H.serve, takePay: H.takePay, giveDrink: H.giveDrink, takeOrder: H.takeOrder, print: H.print, spray: H.spray, returnExt: H.returnExt,
    takeIngredient: H.takeIngredient, wash: H.wash, brew: H.brew, stepAct: H.stepAct, bell: H.bell, openSource: H.openSource,
  };

  // ---- the director's view of incidents ----
  P_.isActive = function (id) { return INC[id] ? INC[id].active(this) : base.isActive.call(this, id); };
  P_.canStart = function (id) { return INC[id] ? INC[id].can(this) : base.canStart.call(this, id); };
  P_.startEvent = function (id) {
    if (!INC[id]) return base.startEvent.call(this, id);
    if (!INC[id].can(this)) return;
    this.s.ev.log.push({ id, t: this.s.t });
    INC[id].start(this);
  };

  P_.startMeltdown = function (c) {
    if (!c || c.topic) return;
    c.topic = { kind: 'melt', next: this.s.t + 1 };
    c.pat = Math.min(c.pat, 0.12); this.updateStage(c);
    this.bubble(c, '🤬 ' + pick(LINES.meltdown), 4);
    this.sound('scream', 'dining');
  };

  // ---- every tick ----
  P_.tick = function (dt) {
    const s = this.s;
    s.inc ||= freshInc();
    base.tick.call(this, dt);
    if (s.phase !== 'playing') return;
    this.tickIncidents(dt);
    if (s.npc.cid) { const c = custById(s, s.npc.cid); s.npc.choices = c ? this.npcChoices(c) : []; }
    else s.npc.choices = [];
  };

  P_.tickIncidents = function (dt) {
    const s = this.s, I = s.inc;
    const every = (sec) => Math.random() < dt / sec;

    for (const c of s.customers) {
      const tp = c.topic;
      // a natural meltdown: some furious guests just lose it
      if (!tp && c.kind === 'customer' && !c.leader && c.stage === 'furious' && ['waitFood', 'waitDrink'].includes(c.st) && !c.meltChecked) {
        c.meltChecked = true;
        if (Math.random() < 0.35) this.startMeltdown(c);
      }
      if (!tp) continue;
      if (tp.kind === 'melt' && s.t >= tp.next) {
        tp.next = s.t + rnd(3, 5);
        this.bubble(c, pick(['🤬 *SMASH*', '🤬 *CRASH*', '🤬 AAARGH!', '🤬 *throws a fork*']), 2.5);
        this.sound('crash', 'dining');
        if (s.cleanPlates > 0 && Math.random() < 0.5) { s.cleanPlates--; this.damage('Broken plates', 2); }
        if (!s.puddles.some((p) => p.kind === 'shards' && p.by === c.id)) s.puddles.push({ id: this.id(), kind: 'shards', by: c.id, x: c.x + rnd(-0.5, 0.5), z: c.z + rnd(0.3, 0.7), size: 0.8 });
        nearbyGrumble(this, c, 0.04, pick(['😰', '😬', 'Yikes...']));
      }
      if (tp.kind === 'mgr') nearbyGrumble(this, c, 0.012 * dt, '🙄', 3);
      if (tp.kind === 'fly' && c.eatUntil) c.eatUntil += dt;               // nobody eats with a fly on the plate
      if (tp.kind === 'change' && s.t > tp.until) { c.topic = null; c.pat -= 0.1; this.updateStage(c); this.bubble(c, '😤 Never mind, then!', 3); }
      if (tp.kind === 'mixup') {
        const occ = s.customers.find((o) => !o.leader && o.table === tp.n && ['waitFood', 'eating'].includes(o.st));
        if (occ) { occ.pat -= (dt / 160); this.updateStage(occ); if (every(7)) this.bubble(occ, pick(['🤨 We were here FIRST.', '😒 Can we help you?']), 3); }
        if (c.st === 'mixup' && every(6)) this.bubble(c, pick(['🤨 This is OUR booth!', '😤 We ALWAYS sit here!']), 3);
        if (c.st === 'mixup') { c.pat -= dt / 70; if (c.pat <= 0) { c.topic = null; this.leave(c); } }
      }
    }
    // endless refills
    for (const c of s.customers) {
      const r = c.refills;
      if (!r || c.leader) continue;
      if (!['waitFood', 'eating', 'seated'].includes(c.st)) { c.refills = null; continue; }
      if (!r.want && s.t >= r.again) { r.want = true; r.nag = s.t; }
      if (r.want) {
        c.pat -= dt / 150; this.updateStage(c);
        if (s.t - r.nag > 7) { r.nag = s.t; this.bubble(c, r.kind === 'coffee' ? pick(['☕ Refill!', '☕ More coffee?', '☕ Hon? Refill?']) : pick(['🥤 Refill!', '🥤 More soda!']), 3); }
      }
    }

    // fire alarms make people think the building is burning down
    if (s.alarm && !I.alarmSeen) {
      I.alarmSeen = true;
      if (Math.random() < 0.65) {
        I.panicUntil = s.t + 30;
        for (const c of s.customers) if (c.kind === 'customer' && Math.random() < 0.5) this.bubble(c, pick(['🔥 FIRE?!', '😱 IS THAT A FIRE?!', '🏃 EVERYBODY OUT!']), 3);
      }
    }
    if (!s.alarm) { I.alarmSeen = false; if (I.panicUntil > s.t + 4) I.panicUntil = s.t + 4; }
    if (I.panicUntil > s.t) {
      for (const c of s.customers) {
        if (c.kind !== 'customer' || c.leader || !['waitFood', 'waitDrink', 'line', 'seated'].includes(c.st)) continue;
        if (Math.random() < dt * 0.035) { this.bubble(c, pick(['🏃 I\'M OUTTA HERE!', '😱 SAVE YOURSELVES!']), 3); this.walkOut(c); }
      }
    }
    // smoke drifts into the dining room
    if (s.fire && every(2.5)) { const c = pick(s.customers.filter((x) => x.kind === 'customer')); if (c) this.bubble(c, pick(['*cough cough*', '😷 *cough*', 'Is something BURNING?']), 2.5); }

    // the stray dog
    if (I.dog) this.tickDog(dt);

    // the balloon artist
    for (const a of s.customers) {
      if (a.kind !== 'artist' || a.st !== 'balloon') continue;
      if (s.t >= a.squeakAt) { a.squeakAt = s.t + 3; this.sound('squeak', 'dining'); this.bubble(a, pick(['🎈 *squeak squeak*', '🎈 A DOGGY!', '🎈 Who wants a giraffe?']), 2.5); }
      if (s.t >= a.popAt) this.balloonPop(a);
    }

    // the coffee machine floods the drink station
    if (I.coffee?.phase === 'leak') { const p = s.puddles.find((x) => x.src === 'coffee'); if (p) p.size = Math.min(1.7, p.size + dt * 0.04); else s.puddles.push({ id: this.id(), kind: 'coffee', x: L.coffee.x + 0.1, z: L.backCounter.z1 + 0.45, size: 0.4, src: 'coffee' }); }
    if (I.coffee?.phase === 'cool' && s.t >= I.coffee.until) I.coffee = null;
    // the sink overflows
    if (I.sinkClog) { const p = s.puddles.find((x) => x.src === 'sink'); if (p) p.size = Math.min(1.8, p.size + dt * 0.035); }
    // hot oil on the floor near a working fryer is asking for trouble
    if (s.puddles.some((p) => p.kind === 'oil') && s.stations.fryer.some((x) => x?.lowered) && !s.fire && Math.random() < dt * 0.02) this.startFire('fryer');
    // deliveries
    for (const k of Object.keys(I.out)) if (s.t >= I.out[k]) { delete I.out[k]; this.sound('doorbell', 'kitchen'); }
    // the freezer door
    if (I.freezerOpenAt != null && s.t - I.freezerOpenAt > 25) { I.freezerOpenAt = null; I.out.milkshake = s.t + 90; this.sound('blub', 'kitchen'); }
    // the staff meal
    if (I.staffMeal && s.t >= I.staffMeal.burnAt && !s.fire) { I.staffMeal = null; this.startFire('staff'); }
    // the stuck bell
    if (I.bellStuck && s.t >= I.nextBell) { I.nextBell = s.t + 1.4; this.sound('bell'); for (const c of s.customers) if (c.kind === 'customer' && !c.leader && c.st === 'waitFood' && Math.random() < 0.05) { c.pat -= 0.02; this.updateStage(c); } }

    this.tickSlips();
  };

  // anyone carrying something who runs over something slippery may lose it
  P_.tickSlips = function () {
    const s = this.s;
    for (const role of ['cook', 'server']) {
      const P = s.players[role];
      const v = P._sx == null ? 0 : Math.hypot(P.x - P._sx, P.z - P._sz);
      P._sx = P.x; P._sz = P.z;
      if (v < 0.01 || (P.slipUntil && s.t < P.slipUntil)) continue;
      const p = s.puddles.find((x) => SLIPPERY.has(x.kind) && Math.hypot(x.x - P.x, x.z - P.z) < 0.42 * (x.size ?? 1));
      if (!p) { P.lastSlip = null; continue; }
      if (P.lastSlip === p.id) continue;
      P.lastSlip = p.id;
      if (Math.random() < (P.held ? 0.55 : 0.3)) {
        P.slipUntil = s.t + 0.9;
        this.sound('slip', role === 'cook' ? 'kitchen' : 'dining');
        this.toast(role, '💫 WHOA!', 'warn');
        if (P.held && P.held.type !== 'mop' && P.held.type !== 'ext') H.drop.call(this, role, P);
      }
    }
  };

  // ---- the dog ----
  P_.tickDog = function (dt) {
    const s = this.s, d = s.inc.dog;
    if (s.t >= d.until && d.st === 'run') { d.st = 'out'; d.tx = L.entry.x; d.tz = L.entry.z; }
    const dx = d.tx - d.x, dz = d.tz - d.z, len = Math.hypot(dx, dz);
    const sp = d.st === 'out' ? 3.4 : 2.4;
    if (len > 0.05) { const k = Math.min(1, (sp * dt) / len); d.x += dx * k; d.z += dz * k; d.yaw = Math.atan2(dx, dz); d.moving = true; }
    if (len < 0.3) {
      if (d.st === 'out') { if (d.tz < 10) { d.tx = OUTSIDE.x; d.tz = 11.5; } else { s.inc.dog = null; return; } }
      else {
        const spots = [...TABLES.map((t) => ({ x: t.approach.x, z: t.approach.z })), ...L.wanderSpots.map((w) => ({ x: w.x, z: w.z })), { x: -6.0, z: 2.6 }, { x: 2.9, z: 6.5 }];
        const p = pick(spots); d.tx = p.x + rnd(-0.4, 0.4); d.tz = p.z + rnd(-0.4, 0.4);
      }
    }
    if (s.t >= d.nextBark) { d.nextBark = s.t + rnd(2.5, 5); this.sound('bark', 'dining'); }
    for (const c of s.customers) if (c.kind === 'customer' && dist(c, d) < 1.1 && Math.random() < dt * 0.6) this.bubble(c, pick(['😱 A DOG!', '🐕 Whose dog is THAT?!', '🐶 Aww— AAH!']), 2);
    if (d.st === 'run' && s.t >= d.nextMess) {
      const tb = s.tables.find((t) => { const def = TABLES.find((x) => x.n === t.n); return t.plate && Math.hypot(def.x - d.x, def.z - d.z) < 1.6; });
      if (tb) {
        d.nextMess = s.t + 8;
        const def = TABLES.find((x) => x.n === tb.n);
        s.puddles.push({ id: this.id(), kind: 'food', x: def.x + rnd(-0.5, 0.5), z: def.z + rnd(0.6, 1), table: null, size: 0.7 });
        const c = custById(s, tb.cust) || s.customers.find((x) => !x.leader && x.table === tb.n);
        if (c) { this.bubble(c, pick(['🐕 MY BACON!', '😱 HE ATE MY TOAST!', '🐕 BAD DOG!']), 3); c.pat -= 0.12; this.updateStage(c); }
        this.sound('crash', 'dining');
      }
    }
  };

  P_.balloonPop = function (a) {
    const s = this.s;
    a.st = 'popped'; a.popAt = 1e9;
    this.sound('bang');
    this.bubble(a, '😬 ...heh. Sorry folks!', 3);
    for (const c of s.customers) if (c.kind === 'customer' && dist(c, a) < 3 && Math.random() < 0.6) this.bubble(c, pick(['😱 GUNSHOT?!', '😨 WHAT WAS THAT?!', '🙀']), 2.5);
    // the cook only stays calm if the server warned them
    const warned = s.chat.some((m) => m.from === 'server' && /balloon|pop|bang|loud|clown|relax|don.?t panic|it.?s fine/i.test(m.text) && m.t >= a.arrivedAt - 10);
    if (!warned) {
      const P = s.players.cook;
      P.slipUntil = s.t + 1.2;
      this.toast('cook', '💥 BANG?!', 'danger');
      if (P.held && P.held.type !== 'ext') H.drop.call(this, 'cook', P);
    }
    a.leaveAt = s.t + 2.5;
  };

  // ---- arrivals for the new characters ----
  P_.arrive = function (c, what) {
    const s = this.s;
    switch (what) {
      case 'artist': c.st = 'balloon'; c.arrivedAt = s.t; c.squeakAt = s.t; c.popAt = s.t + rnd(16, 22); c.yaw = Math.PI / 2; return;
      case 'mixup': c.st = 'mixup'; c.yaw = -Math.PI / 2; this.bubble(c, '🤨 Excuse me, this is OUR booth!', 4); return;
      case 'dashed': c.st = 'gone'; this.damage('Dine & dash', c.bill || this.orderValue(c)); s.lost += 0; return;
      case 'stallSit': c.st = 'stall'; c.yaw = c.seat?.yaw ?? 0; return;
    }
    base.arrive.call(this, c, what);
  };
  // the balloon guy leaves after the pop
  const baseTickCustomers = P_.tickCustomers;
  P_.tickCustomers = function (dt) {
    for (const a of this.s.customers) if (a.kind === 'artist' && a.leaveAt && this.s.t >= a.leaveAt && a.st !== 'leaving') { a.leaveAt = null; this.leave(a); }
    baseTickCustomers.call(this, dt);
  };

  // ---- dine and dash ----
  P_.goPay = function (leader) {
    const s = this.s;
    if (s.inc?.dashNext && leader.kind === 'customer' && !leader.critic) {
      s.inc.dashNext = false;
      const t = tableById(s, leader.table); if (t) { t.cust = null; t.dirty = true; }
      leader.st = 'dash'; leader.spd = 2.3; leader.dashing = true;
      leader.path = [...this.fromSeat(leader, L.entry), OUTSIDE]; leader.onArrive = 'dashed';
      this.bubble(leader, '🏃💨', 3);
      for (const m of this.partyOf(leader).slice(1)) { if (m.st === 'outing') continue; m.spd = 2.3; m.path = [...this.fromSeat(m, L.entry), OUTSIDE]; m.st = 'leaving'; m.onArrive = 'gone'; m.seat = null; }
      return;
    }
    base.goPay.call(this, leader);
  };
  H.catchDasher = function (role, P, a) {
    const s = this.s, c = custById(s, a.cid);
    if (!c || c.st !== 'dash' || dist(P, c) > 2.4) return;
    c.spd = 1; c.dashing = false;
    this.bubble(c, '😅 Heh... I was just getting my wallet!', 3);
    this.sound('slam', 'dining');
    base.goPay.call(this, c);
  };

  // ---- critic: marked on arrival ----
  P_.spawnCustomer = function (force) {
    const c = base.spawnCustomer.call(this, force);
    if (c && this.s.inc?.criticNext) { this.s.inc.criticNext = false; c.critic = true; }
    return c;
  };

  // ---- sick guests put everyone off their food (and the inspector screams) ----
  P_.getSick = function (c) {
    const s = this.s;
    for (const o of s.customers) {
      if (o !== c && o.st === 'eating' && dist(o, c) < 4) { o.eatUntil = (o.eatUntil || s.t) + 10; if (Math.random() < 0.6) this.bubble(o, '🤢 I\'m not hungry anymore...', 3); }
      if (o.kind === 'inspector' && dist(o, c) < 6) { this.bubble(o, '😱 AAAAAAH!', 3); this.sound('scream', 'dining'); }
    }
    base.getSick.call(this, c);
  };

  // ---- the inspector can be steered to a booth ----
  P_.tickInspector = function () {
    const s = this.s;
    if (s.inspector) {
      const c = custById(s, s.inspector.id);
      if (c && s.inspector.stallUntil) {
        if (s.t < s.inspector.stallUntil) return;
        if (c.st === 'stall' || c.st === 'toStall') {
          s.inspector.stallUntil = null;
          const tb = s.tables.find((t) => t.cust === c.id); if (tb) tb.cust = null;
          c.path = [...route(c, L.inspectorSpot), { ...L.inspectorSpot }]; c.onArrive = 'inspect'; c.st = 'enter'; c.seat = null;
          this.bubble(c, '📋 Lovely booth. Now. The KITCHEN.', 3);
        }
      }
    }
    base.tickInspector.call(this);
  };

  // ---- toaster jam ----
  P_.tickKitchen = function (dt) {
    const s = this.s;
    if (s.inc?.toasterJam) for (const it of s.stations.toaster) if (it && !it.popped) it.popAt = Math.max(it.popAt, it.over + 5);
    base.tickKitchen.call(this, dt);
  };

  // ---- timed actions for the new things ----
  P_.timedFor = function (role, a) {
    switch (a.type) {
      case 'npcChoice': {
        if (/^mgr:/.test(a.choice)) return a.choice === 'mgr:long' ? [3, 'Rambling...'] : [1.2, 'Placating...'];
        return null;
      }
      case 'upright': return [2, 'Heaving the table up...'];
      case 'sing': return [3.5, '🎵 Happy birthday to youuu...'];
      case 'unplugCoffee': return [1.5, 'Unplugging...'];
      case 'unclog': return [2.5, 'Reaching into the drain...'];
      case 'fanAlarm': return [2, 'Waving a towel at it...'];
      case 'smother': return [2.5, 'Smothering it...'];
      case 'wipeBatter': return [1.5, 'Wiping off the batter...'];
      case 'unstickBell': return [1.5, 'Bending the clapper back...'];
      case 'eatStaff': return [2, 'Scarfing it down...'];
      case 'whackToaster': return [0.6, 'WHACK!'];
      case 'wash': if (this.s.inc?.sinkClog) return null; break;   // the clog stops you straight away
    }
    return base.timedFor.call(this, role, a);
  };

  // ---- handler wrappers ----
  H.serve = function (role, P, a) {
    const s = this.s, tb = tableById(s, a.n);
    if (tb?.flipped) { const c = custById(s, tb.cust); if (c) this.bubble(c, '😤 Our TABLE is on the FLOOR!', 3); return; }
    const c = tb && custById(s, tb.cust);
    if (c && c.st === 'eating' && P.held?.type === 'tray') { this.bubble(c, '🤨 We already GOT ours!', 3); this.sound('buzz', 'dining'); return; }
    const plate = P.held?.type === 'tray' ? P.held.plate : null;
    base.serve.call(this, role, P, a);
    if (c && c.birthday && plate && c.st === 'eating') {
      if (plate.items.some((f) => f.candle)) { c.birthday.cake = true; this.bubble(c, '🎂 A CANDLE! AWWW!', 4); this.sound('ding2', 'dining'); for (const m of this.partyOf(c).slice(1)) this.bubble(m, '🥳', 3); }
      else if (c.birthday.promised) { c.pat -= 0.2; this.updateStage(c); this.bubble(c, '😢 Where\'s the... cake?', 4); }
    }
    if (c && c.remake && c.st === 'eating') c.remake = false;
  };

  H.takePay = function (role, P, a) {
    const s = this.s, c = custById(s, a.cid);
    if (!c || s.payLine[0] !== c.id || c.st !== 'pay' || !registerUp(s)) return;
    const critic = c.critic, q = c.quality ?? 1, bday = c.birthday;
    base.takePay.call(this, role, P, a);
    if (critic) {
      if (q >= 0.95) { s.money.tips += 20; this.bubble(c, '⭐⭐⭐⭐⭐ "Simply divine."', 4); this.toast('both', '⭐ A food critic loved it!', 'good'); }
      else { this.damage('Bad review (food critic)', 25); this.bubble(c, '📝 *writes a scathing review*', 4); this.toast('both', '📝 That was a food critic...', 'danger'); }
    }
    if (bday?.sung) s.money.tips += 8;
  };

  H.giveDrink = function (role, P, a) {
    const s = this.s, c = custById(s, a.cid), h = P.held;
    const l = c && this.leaderOf(c);
    const kind = drinkOf(h);
    if (l && kind && l.topic?.kind === 'melt') {
      P.held = null; this.damage('Comped drinks', 2);
      this.resolveTopic(l, '😮‍💨 ...okay. Okay. Thank you.', 0.45);
      return;
    }
    if (l && kind && l.refills?.want && l.refills.kind === kind) {
      P.held = null;
      const r = l.refills; r.n++; r.want = false; r.again = s.t + rnd(7, 10);
      this.sound('pour', 'dining');
      if (r.n >= 11) { l.refills = null; this.bubble(c, '😌 Okay. NOW I\'m good.', 3); }
      else this.bubble(c, `${kind === 'coffee' ? '☕' : '🥤'} Ahh. (${r.n}/11)`, 2.5);
      return;
    }
    base.giveDrink.call(this, role, P, a);
  };

  H.takeOrder = function (role, P, a) {
    base.takeOrder.call(this, role, P, a);
    const c = custById(this.s, a.cid);
    if (c?.heard && c.birthday && c.birthday.promised == null) this.npcSay(c, fill(pick(LINES.bday), { who: c.birthday.who }));
  };

  H.talk = function (role, P, a) {
    const s = this.s, c = custById(s, a.cid);
    base.talk.call(this, role, P, a);
    if (!c || isNoisy(s)) return;
    const l = this.leaderOf(c), tp = l?.topic;
    if (!tp) return;
    const line = {
      melt: pick(LINES.meltdown), flip: '🤬 ' + pick(LINES.flip), mgr: tp.round ? pick(LINES.mgrMore) : 'Are YOU the manager?! I want the MANAGER!',
      fly: fill(pick(LINES.fly), { item: nameOf(tp.item?.kind) }), change: fill(pick(LINES.change), { from: nameOf(tp.from), to: nameOf(tp.to) }),
      bday: fill(pick(LINES.bday), { who: l.birthday?.who }), mixup: 'We ALWAYS sit in that booth. ALWAYS.',
    }[tp.kind];
    if (line) { s.npc.lines.pop(); this.npcSay(c, line); }
  };

  H.print = function (role, P, a) {
    const s = this.s;
    if (s.inc?.dupNext && s.power && s.jam <= 0) {
      const last = [...s.tickets].reverse().find((t) => t.status === 'printed' || t.status === 'served');
      if (last) {
        s.inc.dupNext = false;
        const old = s.receipts.find((r) => r.loc === 'printer');
        if (old) this.dropReceipt(old);
        s.receipts.push({ id: this.id(), tid: last.id, loc: 'printer', grime: 0, t0: s.t, slot: null, tray: null, dup: true });
        this.sound('print', 'kitchen');
        return;
      }
    }
    base.print.call(this, role, P, a);
  };

  // the extinguisher that turns out to be empty
  H.spray = function (role, P, a) {
    const s = this.s;
    if (P.held?.type === 'ext' && s.fire && (P.held.empty || s.inc?.extDud)) {
      if (s.inc.extDud) { s.inc.extDud = false; }
      P.held.empty = true; s.inc.extKnownEmpty = true;
      this.sound('pfft', 'kitchen');
      this.toast(role, '🧯 *pfft*', 'danger');
      s.fire.t0 -= 8; s.fire.big = true;
      return;
    }
    base.spray.call(this, role, P, a);
    if (!s.fire) s.inc.extKnownEmpty = false;
  };
  H.returnExt = function (role, P, a) {
    if (P.held?.type === 'ext') P.held.empty = false;     // swapped for a full one on the wall
    base.returnExt.call(this, role, P, a);
  };
  H.smother = function (role, P) {
    const s = this.s;
    if (!s.fire) return;
    if (s.fire.at === 'poster') s.inc.posterBurnt = true;
    s.fire = null; s.alarmOffAt = s.t + 3; s.inc.extKnownEmpty = false;
    this.sound('clunk', 'kitchen'); this.sound('psssh', 'kitchen');
  };

  H.takeIngredient = function (role, P, a) {
    const s = this.s;
    if (s.inc?.out[a.kind] || (a.kind === 'milkshake' && s.inc?.out.milkshake)) { this.sound('deny', 'kitchen'); return; }
    base.takeIngredient.call(this, role, P, a);
  };
  H.openSource = function (role, P, a) {
    if (a.src === 'freezer' && this.s.inc) this.s.inc.freezerOpenAt = null;  // you have to shut it to open it properly
    base.openSource?.call(this, role, P, a);
  };
  H.wash = function (role, P, a) {
    if (this.s.inc?.sinkClog) { this.sound('blub', 'kitchen'); this.toast(role, '🫧 *glug*', 'warn'); return; }
    base.wash.call(this, role, P, a);
  };
  H.brew = function (role, P, a) {
    if (this.s.inc?.coffee) { this.sound('deny', 'dining'); return; }
    base.brew.call(this, role, P, a);
  };
  H.stepAct = function (role, P, a) {
    const s = this.s, it = s.stations[a.at]?.[a.i];
    const st = it?.type === 'food' ? curStep(it) : null;
    const verb = (a.idx != null && it?.type === 'food' ? RECIPES[it.kind]?.steps[a.idx]?.verb : st?.verb) || '';
    if (s.inc?.knife && /Cut|Butter/.test(verb || '')) { this.sound('deny', 'kitchen'); this.toast(role, '🔪 ?', 'warn'); return; }
    base.stepAct.call(this, role, P, a);
  };
  H.bell = function (role, P, a) {
    if (this.s.inc?.bellStuck) { this.sound('bell'); return; }
    base.bell?.call(this, role, P, a);
  };

  // ---- new actions ----
  H.upright = function (role, P, a) {
    const s = this.s, tb = tableById(s, a.n);
    if (!tb?.flipped || s.puddles.some((p) => p.table === a.n && p.kind === 'food')) return;
    tb.flipped = false;
    this.sound('thud', 'dining');
  };
  H.sing = function (role, P, a) {
    const s = this.s, tb = tableById(s, a.n), c = tb && custById(s, tb.cust);
    if (!c?.birthday?.cake || c.birthday.sung) return;
    c.birthday.sung = true; c.topic = null;
    c.pat = 1; c.stage = 'ok'; this.updateStage(c);
    this.sound('kazoo', 'dining');
    for (const m of this.partyOf(c)) this.bubble(m, pick(['🥳', '🎉', '🥲 So beautiful', '👏']), 4);
    for (const o of s.customers) if (o.kind === 'customer' && !this.partyOf(c).includes(o) && dist(o, c) < 4 && Math.random() < 0.5) this.bubble(o, pick(['👏', '🎵 ...to youuu', '😬']), 3);
  };
  H.candle = function (role, P, a) {
    const s = this.s;
    let it = null;
    if (a.at === 'tray') { const tr = s.trays[a.i]; it = tr?.plate?.items.find((f) => (f.kind === 'pancakes' || f.kind === 'milkshake') && !f.candle); }
    else it = s.stations[a.at]?.[a.i];
    if (!it || !(it.kind === 'pancakes' || it.kind === 'milkshake') || it.candle) return;
    it.candle = true;
    this.sound('ding', 'kitchen');
  };
  H.unplugCoffee = function () {
    const s = this.s;
    if (s.inc?.coffee?.phase !== 'leak') return;
    s.inc.coffee = { phase: 'cool', until: s.t + 20 };
    this.sound('clunk', 'dining');
  };
  H.unclog = function () { const s = this.s; if (!s.inc?.sinkClog) return; s.inc.sinkClog = false; this.sound('plunge', 'kitchen'); const p = s.puddles.find((x) => x.src === 'sink'); if (p) p.src = null; };
  H.fanAlarm = function () { const s = this.s; if (!s.inc?.falseAlarm) return; s.inc.falseAlarm = false; s.alarm = false; s.alarmOffAt = 0; this.sound('click', 'kitchen'); };
  H.wipeBatter = function () { this.s.inc.batterUntil = 0; this.sound('paper', 'kitchen'); };
  H.shutFreezer = function () { this.s.inc.freezerOpenAt = null; this.sound('fridgeClose', 'kitchen'); };
  H.unstickBell = function () { this.s.inc.bellStuck = false; this.sound('clunk', 'kitchen'); };
  H.eatStaff = function () { if (!this.s.inc.staffMeal) return; this.s.inc.staffMeal = null; this.sound('blub', 'kitchen'); };
  H.pickKnife = function () { if (!this.s.inc.knife) return; this.s.inc.knife = null; this.sound('clatter', 'kitchen'); };
  H.whackToaster = function () {
    const s = this.s;
    if (!s.inc?.toasterJam) return;
    s.inc.whacks = (s.inc.whacks || 0) + 1;
    this.sound('clunk', 'kitchen');
    if (s.inc.whacks >= 2) { s.inc.whacks = 0; s.inc.toasterJam = false; for (const it of s.stations.toaster) if (it && !it.popped) it.popAt = it.over; }
  };
  H.shooDog = function (role, P) {
    const d = this.s.inc?.dog;
    if (!d || d.st !== 'run' || Math.hypot(P.x - d.x, P.z - d.z) > 1.8) return;
    d.st = 'out'; d.tx = L.entry.x; d.tz = L.entry.z;
    this.sound('bark', 'dining');
  };
  // re-send a table's order to the kitchen (after a change, a fly, a flipped table...)
  H.resend = function (role, P, a) {
    const s = this.s, tb = tableById(s, a.n), c = tb && custById(s, tb.cust);
    if (!c || !c.remake || !registerUp(s)) return;
    const tk = { id: this.id(), cid: c.id, items: c.order.items.slice(), drinks: [], size: this.partySize(c), table: a.n, status: 'queued', t: s.t, redo: true };
    s.tickets.push(tk); c.ticket = tk.id; c.remake = false;
    this.sound('register', 'dining'); this.sound('tvbeep', 'kitchen');
  };

  // ---- conversations ----
  P_.resolveTopic = function (c, line, calm = 0.3) {
    c.topic = null;
    c.pat = Math.min(1, Math.max(c.pat, 0) + calm); c.stage = 'ok'; this.updateStage(c);
    if (line) { this.npcSay(c, line); this.bubble(c, line, 3); }
  };

  // the replies the server can pick right now (each also has words that trigger it when typed)
  P_.npcChoices = function (c) {
    const s = this.s, l = this.leaderOf(c) || c, tp = l.topic, out = [];
    const add = (id, label, kw) => out.push({ id, label, kw });
    if (s.npc.sub === 'out') {
      const kinds = [...new Set(l.order.items.map((i) => i.kind))];
      for (const k of kinds) add('out:' + k, `We're out of ${nameOf(k)}...`);
      add('back', '← Back');
      return out;
    }
    if (c.kind === 'inspector') {
      if (s.inspector && !s.inspector.stalled && c.st === 'inspect') add('insp:booth', 'Right this way, our finest booth!', /booth|sit|seat|table|this way/);
      add('g:hello', 'Can I get you anything?', /coffee|get you|anything/);
      return out;
    }
    if (c.kind === 'artist') { add('artist:out', 'No balloons in here, please.', /balloon|out|leave|no /); return out; }
    if (s.inc?.panicUntil > s.t) add('panic', 'Everybody relax! It\'s just the bacon!', /relax|calm|fine|bacon|no fire|okay|ok/);
    if (tp?.kind === 'melt') { add('melt:calm', 'Deep breaths. Your food is almost here.', /breath|calm|relax|almost|easy/); add('melt:comp', 'Here, a drink on the house.', /house|free|comp|drink/); }
    if (tp?.kind === 'flip') { add('flip:sorry', 'So sorry! A fresh plate, on the house.', /sorry|fresh|house|new/); add('flip:firm', 'Sir. This is a FAMILY diner.', /family|sir|ma.?am|behave/); }
    if (tp?.kind === 'mgr') {
      const opts = [['mgr:good', pick(LINES.mgrGood), /sorry|right|fix|promise|yes|manager/], ['mgr:long', pick(LINES.mgrLong), /technically|well|actually/], ['mgr:rude', pick(LINES.mgrRude), /deal|no manager|whatever|leave/]];
      const k = (l.id * 7 + tp.round * 3) % 3;
      for (let i = 0; i < 3; i++) add(...opts[(i + k) % 3]);
    }
    if (tp?.kind === 'fly') { add('fly:comp', 'So sorry! A fresh one, on the house.', /sorry|fresh|house|new|replace/); add('fly:blue', 'That\'s... a blueberry.', /blueberry|raisin|pepper/); }
    if (tp?.kind === 'change') { add('chg:yes', 'Sure thing!', /sure|okay|ok|yes|no problem/); add('chg:no', 'Sorry, it\'s already cooking.', /already|cooking|sorry|no/); }
    if (tp?.kind === 'bday' && l.birthday?.promised == null && (l.heard || l.ticket)) { add('bday:yes', 'We\'ll whip something up!', /yes|whip|sure|something|cake/); add('bday:no', 'Sorry, no cake here.', /no cake|sorry|don.?t have/); }
    if (tp?.kind === 'mixup') { add('mix:counter', 'Please order at the counter, I\'ll seat you.', /counter|order|seat you|line/); add('mix:taken', 'Sorry, this booth is taken.', /taken|occupied|sorry/); }
    if (l.refills) add('refill:stop', 'That\'s your last one, hon.', /last|enough|no more|cut/);
    add('g:sorry', 'Sorry for the wait!');
    add('g:soon', 'Coming right up!');
    add('g:order', 'What did you order?');
    add('g:table', 'Which table?');
    if (l.heard || l.ticket) add('g:out', 'We\'re out of something...', /out of|ran out|none left|no more/);
    return out;
  };

  const GENERIC = { 'g:sorry': 'Sorry for the wait!', 'g:soon': 'Coming right up!', 'g:order': 'What did you order again?', 'g:table': 'What table number are you?', 'g:hello': 'Can I get you anything?' };

  H.npcChoice = function (role, P, a) {
    const s = this.s, c = custById(s, a.cid ?? s.npc.cid);
    if (!c || s.npc.cid !== c.id) return;
    const ch = a.choice;
    if (ch === 'g:out') { s.npc.sub = 'out'; return; }
    if (ch === 'back') { s.npc.sub = null; return; }
    if (GENERIC[ch]) { base.say.call(this, role, P, { text: a.text || GENERIC[ch] }); return; }
    const opt = this.npcChoices(c).find((o) => o.id === ch);
    if (!opt) return;
    s.npc.lines.push({ who: 'You', text: a.text || opt.label });
    if (isNoisy(s) && ch !== 'panic') { this.npcSay(c, pick(LINES.cantHear)); return; }
    this.chooseReply(c, ch);
  };

  P_.chooseReply = function (c, ch) {
    const s = this.s, l = this.leaderOf(c) || c, tp = l.topic;
    const say = (t) => this.npcSay(c, t);
    switch (ch) {
      case 'panic':
        s.inc.panicUntil = 0;
        for (const o of s.customers) if (o.kind === 'customer' && Math.random() < 0.6) this.bubble(o, pick(['...oh.', '😅 Phew.', 'Just the bacon?']), 2.5);
        say('...oh. Okay. Phew.');
        return;
      case 'melt:calm':
        if (Math.random() < 0.55) this.resolveTopic(l, '😮‍💨 ...fine. FINE. I\'m calm.', 0.3);
        else { say('DON\'T TELL ME TO BREATHE!'); this.bubble(l, '🤬 DON\'T TELL ME TO BREATHE!', 3); }
        return;
      case 'melt:comp': say('...a free one? Hand it over, then.'); return;   // the drink itself does it (giveDrink)
      case 'flip:sorry':
        if (l.remake) this.damage('Comped dishes', 4);     // their food hit the floor: re-send it from the register
        this.resolveTopic(l, '😤 ...fine. But make it QUICK.', 0.4);
        return;
      case 'flip:firm':
        if (Math.random() < 0.5) this.resolveTopic(l, '😳 ...sorry. I don\'t know what came over me.', 0.25);
        else { say('THEN I\'LL TAKE MY FAMILY ELSEWHERE!'); l.topic = null; this.walkOut(l); }
        return;
      case 'mgr:good':
        tp.round++;
        if (tp.round >= tp.need) this.resolveTopic(l, '😐 ...Well. Alright then. I\'ll wait.', 0.6);
        else say(pick(LINES.mgrMore));
        return;
      case 'mgr:long': say(pick(['Get to the POINT!', 'I don\'t have all DAY!', 'Is this going somewhere?!'])); l.pat -= 0.05; this.updateStage(l); return;
      case 'mgr:rude':
        l.pat = Math.min(l.pat, 0.05); this.updateStage(l);
        if (Math.random() < 0.5) { say('I\'M WRITING A LETTER TO CORPORATE!'); l.topic = null; this.walkOut(l); }
        else say('HOW DARE YOU!');
        return;
      case 'fly:comp': {
        const item = tp.item;
        this.damage('Comped dishes', MENU[item.kind].price);
        const tb = tableById(s, l.table); if (tb) tb.plate = null;
        l.order = { ...l.order, items: [item] }; l.st = 'waitFood'; l.remake = true; l.eatUntil = null;
        this.resolveTopic(l, '😒 ...thank you. No flies THIS time.', 0.45);
        return;
      }
      case 'fly:blue':
        if (Math.random() < 0.35) this.resolveTopic(l, '🫐 ...oh. It IS a blueberry. Huh.', 0.2);
        else { l.pat -= 0.25; this.updateStage(l); say('A BLUEBERRY. WITH. WINGS?!'); this.bubble(l, '🤬 IT HAS WINGS!', 3); }
        return;
      case 'chg:yes': {
        const it = { kind: tp.to };
        if (MENU[tp.to].styles) it.style = pick(MENU[tp.to].styles);
        if (MENU[tp.to].toppings) it.toppings = [];
        l.order.items[tp.idx] = it; l.remake = true;
        this.resolveTopic(l, '😊 You\'re a doll.', 0.15);
        return;
      }
      case 'chg:no': l.topic = null; l.pat -= 0.12; this.updateStage(l); say('Ugh. FINE.'); return;
      case 'bday:yes': l.birthday.promised = true; l.topic = null; say('😍 Oh, you\'re the BEST!'); this.bubble(l, '🥰', 2); return;
      case 'bday:no': l.birthday.promised = false; l.topic = null; l.pat -= 0.15; this.updateStage(l); say('🥲 ...on her BIRTHDAY?'); return;
      case 'mix:counter': {
        l.topic = null;
        if (s.orderLine.length >= 6) { say('Forget it, we\'re LEAVING.'); this.leave(l); return; }
        say('...fine. But we want a BOOTH.');
        l.path = route(l, this.lineSpot(s.orderLine.length)); l.onArrive = 'line'; l.st = 'enter';
        s.orderLine.push(l.id); l.pat = Math.max(l.pat, 0.7);
        return;
      }
      case 'mix:taken': l.topic = null; say('Hmph! We\'ll take our business ELSEWHERE.'); this.leave(l); return;
      case 'refill:stop': l.refills = null; l.pat -= 0.08; this.updateStage(l); say('😤 Fine. I\'ll get thirsty, then.'); return;
      case 'insp:booth': {
        const n = this.freeTableFor(1);
        if (n == null) { say('Your booths look FULL.'); return; }
        const tb = tableById(s, n); tb.cust = c.id;
        const seat = TABLES.find((t) => t.n === n).seat;
        s.inspector.stalled = true; s.inspector.stallUntil = s.t + 20;
        c.seat = seat; c.path = [...route(c, seat), { x: seat.x, z: seat.z }]; c.onArrive = 'stallSit'; c.st = 'toStall';
        say('Oh! Well... I suppose I could sit for a minute.');
        return;
      }
      case 'artist:out': this.bubble(c, '😢 ...okay.', 2.5); c.popAt = 1e9; this.leave(c); say('Tough crowd...'); return;
    }
    if (ch.startsWith('out:')) {
      const kind = ch.slice(4);
      const meal = MENU[kind].meal === 'any' ? 'lunch' : MENU[kind].meal;
      const avoid = outMenuKinds(s);
      const sub = pick(Object.keys(MENU).filter((k) => k !== kind && MENU[k].meal === meal && !avoid.includes(k))) || 'toast';
      let changed = false;
      l.order.items = l.order.items.map((it) => { if (it.kind !== kind) return it; changed = true; const n = { kind: sub }; if (MENU[sub].styles) n.style = pick(MENU[sub].styles); if (MENU[sub].toppings) n.toppings = []; return n; });
      s.npc.sub = null;
      if (!changed) return;
      if (l.ticket) l.remake = true;
      l.pat -= 0.05; this.updateStage(l);
      say(fill(pick(LINES.outOf), { item: nameOf(kind), sub: nameOf(sub) }));
    }
  };

  // typed words can pick a reply too
  H.say = function (role, P, a) {
    const s = this.s, c = custById(s, s.npc.cid);
    const text = String(a.text || '').slice(0, 160).trim();
    if (c && text) {
      const t = text.toLowerCase();
      const hit = this.npcChoices(c).find((o) => o.kw && o.kw.test(t) && !o.id.startsWith('g:'));
      if (hit) { H.npcChoice.call(this, role, P, { cid: c.id, choice: hit.id, text }); return; }
    }
    base.say.call(this, role, P, a);
  };
}

export { INC };
