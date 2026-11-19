// ---------------------------------------------------------------------------
// Interactables: for a hovered object key, return the title, info lines and
// quick actions for the given role. The bottom menu renders whatever this
// returns, so new objects only need an entry here + a mesh with userData.ia.
// ---------------------------------------------------------------------------
import { MENU, DRINKS, STATIONS, SOURCES, RECIPES, DRINK_TUNING as DT, TUNING as T } from './data.js';
import { custById, receiptById, tableById, ticketById, isNoisy, registerUp } from './sim.js';
import { seatsOf, drinkText } from './party.js';
import { curStep, isDone, isMenuItem, foodName, thingName, stationOptions, canPlaceAt, placeLabel, drinkOf, drinkName, orderItemText, zoneAt } from './kitchen.js';

const A = (label, a, disabled = false, why = '') => ({ label, a, disabled, why });
const handsFull = (P) => (P.held ? `Hands full: ${thingName(P.held).toLowerCase()} (G to drop)` : '');

const KITCHEN = new Set(['kmop', 'tv', 'printer', 'rail', 'griddle', 'fryer', 'toaster', 'blender', 'prep', 'rack', 'sink', 'ktrash', 'ext', 'breaker', 'receipt', 'freezer', 'fridge', 'breadbox']);
const DINING = new Set(['toilet', 'plunger', 'dmop', 'cust', 'table', 'coffee', 'soda', 'cups', 'mugs', 'ice', 'lids', 'ftrash', 'jukebox', 'register', 'payreg', 'tents', 'menuboard']);
const BOTH = new Set(['tray', 'dishret', 'bell']);
const ANY = new Set(['puddle', 'floor']);   // whichever side of the wall they're on

export function zoneOf(key) {
  const k = key.split(':')[0];
  if (KITCHEN.has(k)) return 'kitchen';
  if (DINING.has(k)) return 'dining';
  if (BOTH.has(k)) return 'pass';
  if (ANY.has(k)) return 'any';
  return 'none';
}

export function canTouch(role, key) {
  const z = zoneOf(key);
  if (z === 'any') return true;
  if (z === 'pass') return key.split(':')[0] !== 'bell' || role === 'cook';
  return (role === 'cook' && z === 'kitchen') || (role === 'server' && z === 'dining');
}
// the smallest free table that seats the whole party
export function freeTableFor(s, size) {
  const fits = s.tents.map((n) => ({ n, seats: seatsOf(n).length })).filter((t) => t.seats >= size).sort((a, b) => a.seats - b.seats || a.n - b.n);
  return fits.length ? fits[0].n : null;
}
const mySide = (role, z, x) => (role === 'cook') === (zoneAt(z, x) === 'kitchen');

export function plateSummary(plate) {
  if (!plate) return '';
  if (!plate.items.length) return 'Empty plate';
  return plate.items.map(foodName).join(', ');
}

// status line for a food item sitting at a station
function foodStatus(it, at) {
  const st = curStep(it);
  const lines = [foodName(it)];
  if (it.q.burnt) lines.push('Burnt');
  if (!st) return lines;
  if (st.cook && st.at === at) {
    if (at === 'fryer' && !it.lowered) { /* nothing to report */ }
    else if (it.p < 1) lines.push(`${Math.round(it.p * 100)}%`);
  }
  if (it.style) lines.push(it.style);
  if (it.kind === 'cheeseburger' && it.toppings.length) lines.push(it.toppings.join(', '));
  return lines;
}

// is this food still mid-cook at this station?
function st0(it, at) { const st = curStep(it); return !!(st?.cook && st.at === at && it.p < (st.toaster ? 0.7 : 1)); }

function stationMenu(s, role, P, at, i) {
  const def = STATIONS[at];
  const title = `${def.name}${def.slots > 1 ? ` ${i + 1}` : ''}`;
  const info = [], actions = [];
  const it = s.stations[at][i];
  const electric = at === 'toaster' || at === 'blender';
  if (s.fire && s.fire.at === at) {
    if (P.held?.type === 'ext') actions.push(A('🧯 SPRAY IT!', { type: 'spray' }));
    else actions.push(A('🧯 Spray', null, true));
    return { title, info, actions };
  }
  const h = P.held;

  if (!it) {
    if (at === 'fryer' && h?.type === 'food' && canPlaceAt(h, 'fryer')) {
      actions.push(A('Pour fries in carefully', { type: 'place', at, i, mode: 'careful' }));
      actions.push(A('Dump them in', { type: 'place', at, i, mode: 'dump' }));
    } else if (h && (at === 'prep' ? (h.type === 'food' || h.type === 'plate') : canPlaceAt(h, at))) {
      actions.push(A(at === 'prep' && h.type === 'plate' ? 'Set the plate down' : placeLabel(h, at), { type: 'place', at, i }));
    } else if (h?.type === 'food') {
      const st = curStep(h);
      actions.push(A(placeLabel(h, at), null, true, isDone(h) ? 'Already done. Plate it' : st ? `Next step is at the ${STATIONS[st.at]?.name.toLowerCase()}` : 'Not for this'));
    }
    return { title, info, actions };
  }

  // a plate on the prep counter
  if (it.type === 'plate') {
    info.push(plateSummary(it));
    if (h?.type === 'food') {
      actions.push(A('🍽️ Put it on this plate', { type: 'plateFood', at: 'prep', i }, !isMenuItem(h) || it.items.length >= T.plateCapacity,
        !isMenuItem(h) ? (h.kind === 'patty' || h.kind === 'bun' ? 'Build the burger first' : 'Not a finished dish') : 'Plate is full'));
    }
    actions.push(A('Pick up plate', { type: 'take', at, i }, !!h, handsFull(P)));
    return { title, info, actions };
  }

  info.push(...foodStatus(it, at));
  // combining at the prep counter
  if (at === 'prep' && h?.type === 'food') {
    const kinds = [it.kind, h.kind].sort().join('+');
    if (kinds === 'bread+cheese') actions.push(A('🧀 Make a grilled cheese', { type: 'combine', i }));
    if (kinds === 'bun+patty') actions.push(A('🍔 Build the burger', { type: 'combine', i }));
  }
  // the next recipe step(s)
  for (const o of stationOptions(it, at)) actions.push(A(o.label, { type: 'stepAct', at, i, ...o.act }));
  if (h?.type === 'plate' && isMenuItem(it)) actions.unshift(A('🍽️ Plate it', { type: 'plateFood', at, i }, h.items.length >= T.plateCapacity, 'Plate is full'));
  const st = curStep(it);
  const lift = at === 'toaster' ? 'Lift it out' : at === 'blender' ? 'Take the cup' : at === 'fryer' ? 'Take the basket out' : 'Pick it up';
  actions.push(A(lift, { type: 'take', at, i }, !!h));
  return { title, info, actions };
}

export function getMenu(s, role, key) {
  if (!s || !canTouch(role, key)) return null;
  const [kind, idStr] = key.split(':');
  const id = idStr != null ? Number(idStr) : null;
  const P = s.players[role];
  const h = P.held;
  const info = [], actions = [];
  let title = '', receiptId = null;

  switch (kind) {
    // ---------------------------- kitchen ----------------------------
    case 'tv': {
      title = 'Order TV';
      const q = s.tickets.filter((t) => t.status === 'queued');
      actions.push(A('🖨️ Print next ticket', { type: 'print' }, !s.power || s.jam > 0 || !q.length, !s.power ? 'No power' : s.jam > 0 ? 'Printer jammed. Whack it' : 'Nothing to print'));
      break;
    }
    case 'printer': {
      title = 'Receipt printer';
      if (s.jam > 0) actions.push(A('👊 Whack it', { type: 'whack' }));
      else {
        const q = s.tickets.filter((t) => t.status === 'queued').length;
        actions.push(A('🖨️ Print next ticket', { type: 'print' }, !s.power || !q, !s.power ? 'No power' : 'Nothing to print'));
      }
      break;
    }
    case 'receipt': {
      const r = receiptById(s, id);
      if (!r) return null;
      title = r.loc === 'floor' ? 'Receipt (on the floor!)' : r.loc === 'rail' ? 'Receipt (on the rail)' : 'Receipt';
      receiptId = r.id;
      actions.push(A('✋ Pick up receipt', { type: 'takeReceipt', rid: r.id }, !!P.receipt, 'Already holding a receipt'));
      break;
    }
    case 'rail': {
      title = 'Ticket rail';
      const n = s.receipts.filter((r) => r.loc === 'rail').length;
      info.push(`${n}/${T.railSlots} receipts pinned`);
      actions.push(A('📌 Pin held receipt', { type: 'pinReceipt' }, !P.receipt || n >= T.railSlots, !P.receipt ? 'Not holding a receipt' : 'Rail is full'));
      break;
    }
    case 'fridge': case 'freezer': case 'breadbox': {
      const src = SOURCES[kind];
      title = src.name;
      actions.push(A(kind === 'breadbox' ? '🍞 Open the bread box' : `🚪 Open the ${src.name.toLowerCase()}`, { type: 'openSource', src: kind }));
      break;
    }
    case 'griddle': case 'fryer': case 'toaster': case 'blender': case 'prep':
      return { ...stationMenu(s, role, P, kind, id), key };
    case 'rack': {
      title = 'Dish rack';
      info.push(`${s.cleanPlates} clean plate${s.cleanPlates === 1 ? '' : 's'}`);
      if (h?.type === 'food') actions.push(A('🍽️ Grab a plate & plate it', { type: 'plateFood', at: 'rack' }, !isMenuItem(h) || s.cleanPlates <= 0, !isMenuItem(h) ? (h.kind === 'patty' || h.kind === 'bun' ? 'Build the burger first' : 'Not a finished dish') : 'Out of clean plates! Wash some.'));
      else if (h?.type === 'plate' && !h.items.length && !h.dirty) actions.push(A('Put plate back', { type: 'returnPlate' }));
      else actions.push(A('🍽️ Take a clean plate', { type: 'takePlate' }, !!h || s.cleanPlates <= 0, h ? handsFull(P) : 'Out of clean plates! Wash some.'));
      break;
    }
    case 'sink': {
      title = 'Dish sink';
      const canWash = h?.type === 'dishes' || (h?.type === 'plate' && h.dirty && !h.items.length);
      actions.push(A(h?.type === 'dishes' ? `🧽 Wash ${h.n} plate${h.n > 1 ? 's' : ''}` : '🧽 Wash', { type: 'wash' }, !canWash, 'Bring dirty dishes'));
      break;
    }
    case 'ktrash': {
      title = 'Kitchen trash';
      const ok = h?.type === 'food' || (h?.type === 'plate' && h.items.length);
      actions.push(A(h?.type === 'plate' ? '🗑️ Scrape the plate' : '🗑️ Throw it away', { type: 'trash' }, !ok, 'Nothing to throw away'));
      if (P.receipt) actions.push(A('Drop held receipt', { type: 'dropHeldReceipt' }));
      break;
    }
    case 'ext': {
      title = 'Fire extinguisher';
      if (h?.type === 'ext') actions.push(A('Hang it back up', { type: 'returnExt' }));
      else actions.push(A('🧯 Grab extinguisher', { type: 'takeExt' }, !!h || !s.extOnWall, handsFull(P)));
      break;
    }
    case 'breaker': {
      title = 'Breaker box';
      if (!s.power) actions.push(A('⚡ Reset the breaker', { type: 'resetBreaker' }));
      else actions.push(A('Flip it off and on', { type: 'cycleBreaker' }));
      break;
    }

    // ---------------------------- the pass ----------------------------
    case 'tray': {
      const tr = s.trays[id];
      title = `Pass shelf ${id + 1}`;
      if (tr) {
        info.push(plateSummary(tr.plate));
        if (tr.receiptId) receiptId = tr.receiptId;
      }
      if (role === 'cook') {
        if (!tr && h?.type === 'food') actions.push(A('🍽️ Plate it here', { type: 'plateFood', at: 'tray', i: id }, !isMenuItem(h) || s.cleanPlates <= 0, !isMenuItem(h) ? 'Not a finished dish' : 'Out of clean plates! Wash some.'));
        else if (!tr) actions.push(A('Set plate here', { type: 'trayPut', i: id }, h?.type !== 'plate', 'Hold a plate'));
        else {
          if (h?.type === 'food') actions.push(A('🍽️ Put it on this plate', { type: 'plateFood', at: 'tray', i: id }, !isMenuItem(h) || tr.plate.items.length >= T.plateCapacity, !isMenuItem(h) ? 'Not a finished dish' : 'Plate is full'));
          actions.push(A('🧾 Attach receipt', { type: 'attachReceipt', i: id }, !P.receipt || !!tr.receiptId, tr.receiptId ? 'Already has one' : 'Not holding a receipt'));
          actions.push(A('Take plate back', { type: 'trayTake', i: id }, !!h || (tr.receiptId && !!P.receipt), handsFull(P) || 'Hands full of receipt'));
        }
      } else {
        if (!tr) actions.push(A('Put tray back', { type: 'trayPut', i: id }, h?.type !== 'tray', 'Not holding a tray'));
        else actions.push(A('🍽️ Pick up tray', { type: 'trayTake', i: id }, !!h, handsFull(P)));
      }
      break;
    }
    case 'dishret': {
      title = 'Dirty dish return';
      info.push(`${s.dirtyDishes} dirty plate${s.dirtyDishes === 1 ? '' : 's'}`);
      if (role === 'cook') {
        actions.push(A('Take dirty dishes', { type: 'takeDirty' }, !!h || !s.dirtyDishes, h ? handsFull(P) : 'None'));
        actions.push(A('Use a dirty plate', { type: 'takeDirtyPlate' }, !!h || !s.dirtyDishes, h ? handsFull(P) : 'None'));
      } else actions.push(A('Drop off dishes', { type: 'dropDishes' }, h?.type !== 'dishes', 'Not carrying dishes'));
      break;
    }
    case 'kmop': case 'dmop': {
      const where = kind === 'kmop' ? 'kitchen' : 'dining';
      title = 'Mop bucket';
      if (h?.type === 'mop') actions.push(A('Put the mop back', { type: 'returnMop', where }, s.mops[where]));
      else actions.push(A('Take the mop', { type: 'takeMop', where }, !!h || !s.mops[where]));
      break;
    }
    case 'toilet': {
      title = 'Toilet';
      const room = s.rooms[id];
      actions.push(A('🪠 Plunge', { type: 'plunge', i: id }, !(h?.type === 'plunger' && room?.clog > 0)));
      break;
    }
    case 'plunger': {
      title = 'Plunger';
      if (h?.type === 'plunger') actions.push(A('Hang it back up', { type: 'returnPlunger' }, s.plungerHome));
      else actions.push(A('🪠 Take the plunger', { type: 'takePlunger' }, !!h || !s.plungerHome));
      break;
    }
    case 'bell': title = 'Order bell'; actions.push(A('🔔 Ring the bell', { type: 'bell' })); break;

    // ---------------------------- either side ----------------------------
    case 'floor': {
      const f = s.floor.find((x) => x.id === id);
      if (!f || !mySide(role, f.z, f.x)) return null;
      title = thingName(f.thing) + ' (on the floor)';
      if (h?.type === 'plate' && isMenuItem(f.thing)) actions.push(A('🍽️ Scoop it onto your plate', { type: 'plateFood', at: 'floor', fid: id }, h.items.length >= T.plateCapacity, 'Plate is full'));
      actions.push(A('✋ Pick it up', { type: 'pickUp', fid: id }, !!h, handsFull(P)));
      break;
    }
    case 'puddle': {
      const p = s.puddles.find((x) => x.id === id);
      if (!p || !mySide(role, p.z, p.x)) return null;
      title = p.kind === 'sick' ? 'Puddle of... sick 🤢' : p.kind === 'shake' ? 'Milkshake splatter' : 'Soda spill';
      actions.push(A('🧽 Mop', { type: 'mop', pid: id }, h?.type !== 'mop'));
      break;
    }

    // ---------------------------- dining room ----------------------------
    case 'cust': {
      const c = custById(s, id);
      if (!c || c.st === 'leaving') return null;
      title = c.kind === 'inspector' ? '📋 Health Inspector' : c.name;
      const front = s.orderLine[0] === c.id;
      if (c.kind === 'inspector') {
        actions.push(A('☕ Offer free coffee', { type: 'giveDrink', cid: c.id }, !(h?.type === 'mug' && h.p >= 0.5) || s.inspector?.lenient, 'Hold a coffee'));
        actions.push(A('💬 Talk', { type: 'talk', cid: c.id }));
        break;
      }
      const l = c.leader ? custById(s, c.leader) : c;
      const size = 1 + (l?.members?.length || 0);
      const mood = { ok: '🙂 Fine', impatient: '😒 Impatient', angry: '😠 Angry', furious: '🤬 FURIOUS' }[c.stage];
      const st = {
        enter: 'Walking in', line: front ? 'Ready to order' : `In line (#${s.orderLine.indexOf(c.id) + 1})`,
        waitDrink: 'Waiting', toTable: 'Heading to a table', waitFood: 'Waiting for food', seated: 'Sitting',
        eating: 'Eating', toPay: 'Heading to pay', pay: s.payLine[0] === c.id ? 'Ready to pay' : 'In the pay line',
        tag: '', outing: c.outing?.kind === 'restroom' ? 'In the restroom' : 'Wandering', inspect: '',
      }[c.st] || '';
      info.push([st, c.leader ? `with ${l?.name}` : size > 1 ? `party of ${size}` : '', mood].filter(Boolean).join(' · '));
      if (c.st === 'line' && front) {
        actions.push(A('📝 Take order', { type: 'takeOrder', cid: c.id }));
        actions.push(A('🧾 Ring it up', { type: 'ringUp', cid: c.id }, !c.heard || !registerUp(s) || freeTableFor(s, size) == null));
      }
      if (l?.st === 'waitDrink') {
        const d = drinkOf(h);
        actions.push(A(d ? `🥤 Give ${drinkName(h).toLowerCase()}` : '🥤 Give drink', { type: 'giveDrink', cid: c.id }, !d));
      }
      const waiting = l && (l.st === 'waitFood' || (l.st === 'outing' && l.outing?.prev === 'waitFood'));
      if (waiting && h?.type === 'tray') actions.push(A('🍽️ Serve tray', { type: 'serve', n: l.table }));
      if (c.st === 'pay' && s.payLine[0] === c.id) actions.push(A('💵 Take payment', { type: 'takePay', cid: c.id }, !registerUp(s)));
      actions.push(A('💬 Talk', { type: 'talk', cid: c.id }));
      break;
    }
    case 'table': {
      const tb = tableById(s, id);
      title = `Table ${id}`;
      const c = custById(s, tb.cust);
      if (c) info.push(`${c.name}: ${c.st === 'waitFood' ? 'waiting for food' : c.st === 'eating' ? 'eating' : 'on their way'}`);
      if (h?.type === 'tray') actions.push(A('🍽️ Serve tray here', { type: 'serve', n: id }));
      if (!tb.cust && (tb.dirty || tb.tent)) {
        const canCarry = !h || (h.type === 'dishes' && h.n < T.maxDishesCarried) || !tb.dirty;
        const puddle = s.puddles.some((p) => p.table === id);
        actions.push(A(tb.dirty ? '🧹 Clear table' : '⛺ Collect number tent', { type: 'clear', n: id }, !canCarry || puddle, puddle ? 'Mop the puddle first' : handsFull(P) || 'Hands full'));
      }
      break;
    }
    // drink station
    case 'cups': title = 'Soda cups'; actions.push(A('🥤 Grab a cup', { type: 'grabCup' }, !!h, handsFull(P))); break;
    case 'mugs': title = 'Coffee mugs'; actions.push(A('☕ Grab a mug', { type: 'grabMug' }, !!h, handsFull(P))); break;
    case 'ice': {
      title = 'Ice bin';
      actions.push(A('🧊 Add ice', { type: 'addIce' }, !(h?.type === 'cup' && !h.ice && !h.lid), h?.type === 'cup' ? (h.ice ? 'Already has ice' : 'Lid is on') : 'Hold a cup'));
      break;
    }
    case 'lids': {
      title = 'Lids & straws';
      actions.push(A('Lid & straw', { type: 'lidStraw' }, !(h?.type === 'cup' && h.fill > 0.05 && !h.lid), h?.type === 'cup' ? (h.lid ? 'Already done' : 'Fill it first') : 'Hold a soda'));
      break;
    }
    case 'soda': {
      title = 'Soda fountain';
      const f = s.fountain;
      if (!f) {
        actions.push(A('▶ Start filling', { type: 'fountainStart' }, !(h?.type === 'cup' && !h.lid), h?.type === 'cup' ? 'Take the lid off' : 'Hold a cup'));
      } else {
        const fl = f.cup.fill;
        void fl;
        if (f.pouring) actions.push(A('⏹ STOP', { type: 'fountainStop' }));
        else actions.push(A('▶ Fill some more', { type: 'fountainStart' }));
        actions.push(A('Take the cup', { type: 'fountainTake' }, !!h || f.pouring, f.pouring ? 'Stop pouring first' : handsFull(P)));
      }
      break;
    }
    case 'coffee': {
      title = 'Coffee machine';
      const m = s.coffeeM;
      if (!m) actions.push(A('☕ Place mug & brew', { type: 'brew' }, h?.type !== 'mug' || h.p > 0, h?.type === 'mug' ? 'Already full' : 'Hold an empty mug'));
      else {
        actions.push(A('Take the mug', { type: 'takeMug' }, !!h, handsFull(P)));
      }
      break;
    }
    case 'ftrash': {
      title = 'Trash can';
      const ok = h?.type === 'tray' || h?.type === 'cup' || h?.type === 'mug' || h?.type === 'food';
      actions.push(A(h?.type === 'tray' ? '🗑️ Dump the tray (keeps the plate)' : '🗑️ Throw away', { type: 'trash' }, !ok, 'Nothing to throw away'));
      break;
    }
    case 'jukebox': {
      title = 'Jukebox';
      if (s.jukebox && s.power) actions.push(A('🦶 Kick it', { type: 'kick' }));
      break;
    }
    case 'register': case 'payreg': {
      title = kind === 'register' ? 'Order register' : 'Pay register';
      break;
    }
    case 'tents': {
      title = 'Number tents';
      info.push(s.tents.length ? s.tents.slice().sort((a, b) => a - b).join(' · ') : '—');
      break;
    }
    case 'menuboard': title = 'Menu board'; break;
    default: return null;
  }
  return { key, title, info, actions, receiptId };
}

// Receipt display: grime hides characters. Deterministic per receipt.
function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function receiptText(s, rid) {
  const r = receiptById(s, rid);
  if (!r) return null;
  const tk = ticketById(s, r.tid);
  if (!tk) return null;
  const g = r.grime;
  const smudge = (str, salt) => g > 0.85 ? str.replace(/\S/g, '▓') : str.replace(/\S/g, (ch, i) => (hash(r.id * 31 + salt, i) < g * 0.55 ? '▓' : ch));
  const tableHidden = g > 0.3 && hash(r.id, 999) < g + 0.25;
  const lines = [];
  tk.items.forEach((it, i) => {
    let main = MENU[it.kind].name.toUpperCase();
    if (it.style) main += ` - ${it.style.toUpperCase()}`;
    lines.push({ text: smudge(main, i + 1), sub: false });
    if (it.toppings) lines.push({ text: smudge(it.toppings.length ? '+ ' + it.toppings.join(', ').toUpperCase() : 'PLAIN (NO TOPPINGS)', i + 20), sub: true });
  });
  if (tk.drinks?.length) lines.push({ text: smudge(`(${drinkText(tk.drinks).toUpperCase()} - FOH)`, 50), sub: true });
  if (tk.size > 1) lines.unshift({ text: smudge(`PARTY OF ${tk.size}`, 60), sub: true });
  return {
    no: tk.id, table: tableHidden || g > 0.85 ? '▓' : String(tk.table), lines, grime: g,
    state: g > 0.85 ? 'ruined' : g > 0.3 ? 'smudged' : g > 0.05 ? 'greasy' : 'clean',
  };
}

export { isNoisy, orderItemText };
