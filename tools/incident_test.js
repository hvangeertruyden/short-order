// Dev helper: start every incident, resolve it the way a player would, report what happened.
//   const T = await import('/tools/incident_test.js'); await T.run()
export async function run(only) {
  const G = window.__G, sim = G.sim, s = sim.s, adv = (t) => window.__dbg.advance(t, 10);
  const K = await import('/js/kitchen.js');
  const D = await import('/js/data.js');
  const { INC } = await import('/js/incidents.js');
  const out = [];
  const act = (role, a) => { sim.apply(role, a); for (let i = 0; i < 80 && s.players[role].busy; i++) adv(0.1); };
  const at = (role, x, z) => { s.players[role].x = x; s.players[role].z = z; };
  const talk = (c) => { at('server', c.x + 0.6, c.z + 0.6); sim.apply('server', { type: 'talk', cid: c.id }); };
  const choose = (c, id) => { talk(c); act('server', { type: 'npcChoice', cid: c.id, choice: id }); };
  const leaders = (st) => s.customers.filter((c) => c.kind === 'customer' && !c.leader && c.st === st);
  const heal = () => {
    // reset the world between incidents: calm everyone, keep a few parties seated, one eating
    s.fire = null; s.alarm = false; s.inc = (sim.constructor.freshInc || (() => s.inc))() || s.inc;
    for (const c of s.customers) { c.topic = null; c.pat = 1; c.stage = 'ok'; c.refills = null; }
    s.puddles = []; s.tables.forEach((t) => (t.flipped = false));
    s.players.server.held = null; s.players.cook.held = null; s.players.server.busy = null; s.players.cook.busy = null;
    s.noise = []; s.jukebox = false; s.blenderNoise = false; s.stations.blender[0] = null; s.power = true; s.jam = 0; s.npc = { cid: null, lines: [], choices: [] };
  };
  const ensureEating = () => {
    let c = leaders('eating')[0];
    if (!c) { c = leaders('waitFood')[0]; if (!c) return null; c.st = 'eating'; c.eatUntil = s.t + 999; }
    const tb = s.tables.find((t) => t.n === c.table);
    tb.plate = { items: [Object.assign(K.newFood('pancakes'), { step: 9, p: 1 })], dirty: false };
    c.eatUntil = s.t + 999;
    return c;
  };
  const freshInc = (await import('/js/incidents.js')).freshInc;
  const ids = only ? [only] : Object.keys(INC);
  for (const id of ids) {
    heal(); s.inc = freshInc();
    s.ev.next = 1e9;
    if (id === 'fly' || id === 'refills' || id === 'mixup') ensureEating();
    if (id === 'fryerOverflow') s.stations.fryer[0] = Object.assign(K.newFood('fries'), { step: 2, p: 0.3, lowered: true });
    if (id === 'toasterJam') s.stations.toaster[0] = Object.assign(K.newFood('toast'), { step: 0, p: 0.3 });
    if (id === 'dishTower') s.dirtyDishes = 7;
    if (id === 'refills') { const c = ensureEating(); c.order.drinks = ['coffee']; c.drinksGiven = [{ kind: 'coffee', m: 1 }]; }
    if (id === 'tableFlip') { const c = s.customers.find((x) => !x.leader && x.table && D.TABLES.find((t) => t.n === x.table).shape === 'square' && ['waitFood', 'eating'].includes(x.st)); if (c) c.pat = 0.4; }
    if (id === 'soakedReceipt' || id === 'receiptDrift') { if (!s.receipts.some((r) => r.loc === 'rail')) { const tk = s.tickets[0]; if (tk) s.receipts.push({ id: sim.id(), tid: tk.id, loc: 'rail', grime: 0, t0: s.t, slot: 0, tray: null }); } }
    if (id === 'birthday' && !s.customers.some((c) => !c.leader && c.members?.length && ['line', 'waitFood'].includes(c.st))) { sim.spawnCustomer(true); adv(1); }
    let res = '';
    try {
      if (!sim.canStart(id)) { out.push(`${id}: (can't start here)`); continue; }
      sim.startEvent(id); adv(1.5);
      const before = INC[id].active(sim);
      res = solve(id);
      adv(2);
      const after = INC[id].active(sim);
      out.push(`${id}: started${before ? ' (active)' : ''} → ${res}${after ? ' ⚠ STILL ACTIVE' : ''}`);
    } catch (e) { out.push(`${id}: ❌ ${e.message} ${e.stack?.split('\n')[1]}`); }
  }

  function solve(id) {
    const tp = (k) => s.customers.find((c) => c.topic?.kind === k);
    switch (id) {
      case 'meltdown': { const c = tp('melt'); if (!c) return 'no target'; s.players.server.held = { type: 'mug', p: 1 }; at('server', c.x + 0.5, c.z); act('server', { type: 'giveDrink', cid: c.id }); return c.topic ? 'comp failed' : 'comped a drink'; }
      case 'tableFlip': { const tb = s.tables.find((t) => t.flipped); if (!tb) return 'nothing flipped'; const p = s.puddles.find((x) => x.table === tb.n); s.puddles = s.puddles.filter((x) => x !== p); act('server', { type: 'upright', n: tb.n }); const c = s.customers.find((x) => x.topic?.kind === 'flip'); if (c) choose(c, 'flip:sorry'); return `upright=${!tb.flipped} calm=${!c?.topic}`; }
      case 'critic': return `critic marked: ${s.customers.some((c) => c.critic) || s.inc.criticNext}`;
      case 'birthday': { const c = s.customers.find((x) => x.birthday); if (!c) return 'no party'; if (c.heard || c.ticket) choose(c, 'bday:yes'); else c.birthday.promised = true; return `promised=${c.birthday.promised}`; }
      case 'changeOrder': { const c = tp('change'); if (!c) return 'none'; const from = c.topic.from; choose(c, 'chg:yes'); const ok = c.remake; at('server', D.L.regOrder.x, D.L.regOrder.z + 1); act('server', { type: 'resend', n: c.table }); return `${from}→${c.order.items.map((i) => i.kind)} remake=${ok} resent=${!c.remake}`; }
      case 'manager': { const c = tp('mgr'); if (!c) return 'none'; for (let i = 0; i < 3; i++) choose(c, 'mgr:good'); return c.topic ? 'still angry' : 'placated in 3'; }
      case 'dash': { const c = leaders('waitFood')[0] || leaders('eating')[0]; if (!c) return 'no payer'; sim.goPay(c); adv(0.5); if (c.st !== 'dash') return 'did not dash'; at('server', c.x + 0.5, c.z + 0.5); act('server', { type: 'catchDasher', cid: c.id }); return `caught → ${c.st}`; }
      case 'fly': { const c = tp('fly'); if (!c) return 'none'; choose(c, 'fly:comp'); return `${c.st} remake=${c.remake}`; }
      case 'dog': { const d = s.inc.dog; at('server', d.x + 0.5, d.z); act('server', { type: 'shooDog' }); adv(6); return `dog=${s.inc.dog ? s.inc.dog.st : 'gone'}`; }
      case 'balloon': { adv(25); const a = s.customers.find((c) => c.kind === 'artist'); return `artist ${a ? a.st : 'left'}; cook held=${!!s.players.cook.held}`; }
      case 'refills': { const c = s.customers.find((x) => x.refills); if (!c) return 'none'; s.players.server.held = { type: 'mug', p: 1 }; at('server', c.x + 0.5, c.z); act('server', { type: 'giveDrink', cid: c.id }); const n = c.refills?.n; choose(c, 'refill:stop'); return `refilled ${n}, cut off=${!c.refills}`; }
      case 'mixup': { adv(15); const c = tp('mixup'); if (!c) return 'none arrived'; choose(c, 'mix:counter'); return `→ ${c.st}`; }
      case 'coffeeBoom': { at('server', D.L.coffee.x, -0.9); act('server', { type: 'unplugCoffee' }); adv(22); return `coffee=${JSON.stringify(s.inc.coffee)} puddle=${s.puddles.some((p) => p.kind === 'coffee')}`; }
      case 'extDud': { s.stations.griddle[0] = Object.assign(K.newFood('bacon'), { step: 1, p: 0.5 }); sim.startFire('griddle'); s.players.cook.held = { type: 'ext' }; act('cook', { type: 'spray' }); const known = s.inc.extKnownEmpty; act('cook', { type: 'smother' }); return `pfft=${known} fireOut=${!s.fire}`; }
      case 'soakedReceipt': return `ruined=${s.receipts.some((r) => r.grime >= 0.95)}`;
      case 'receiptDrift': return `floor=${s.receipts.some((r) => r.loc === 'floor')}`;
      case 'batter': act('cook', { type: 'wipeBatter' }); return `wiped=${s.inc.batterUntil <= s.t}`;
      case 'fryerOverflow': { const p = s.puddles.find((x) => x.kind === 'oil'); s.puddles = s.puddles.filter((x) => x !== p); return 'mopped'; }
      case 'outOf': { const k = Object.keys(s.inc.out)[0]; sim.apply('cook', { type: 'takeIngredient', src: 'fridge', kind: k }); const blocked = !s.players.cook.held; adv(85); return `${k} blocked=${blocked} restocked=${!s.inc.out[k]}`; }
      case 'falseAlarm': { const n = s.noise.length; act('cook', { type: 'fanAlarm' }); adv(0.5); return `noise ${n}→${s.noise.length}`; }
      case 'dishTower': return `dirty now ${s.dirtyDishes}, shards=${s.puddles.some((p) => p.kind === 'shards')}`;
      case 'sinkClog': { s.players.cook.held = { type: 'dishes', n: 1 }; sim.apply('cook', { type: 'wash' }); const blocked = !s.players.cook.busy; s.players.cook.busy = null; act('cook', { type: 'unclog' }); s.players.cook.held = null; return `wash blocked=${blocked} clog=${s.inc.sinkClog}`; }
      case 'freezerOpen': act('cook', { type: 'shutFreezer' }); return `open=${s.inc.freezerOpenAt != null}`;
      case 'dupTicket': { const n = s.receipts.length; act('cook', { type: 'print' }); return `dup printed=${s.receipts.some((r) => r.dup)} (${n}→${s.receipts.length})`; }
      case 'staffMeal': act('cook', { type: 'eatStaff' }); return `meal=${!!s.inc.staffMeal}`;
      case 'knife': { const c = s.stations.prep; act('cook', { type: 'pickKnife' }); void c; return `knife=${!!s.inc.knife}`; }
      case 'poster': { s.players.cook.held = { type: 'ext' }; act('cook', { type: 'spray' }); return `fire=${!!s.fire}`; }
      case 'toasterJam': { act('cook', { type: 'whackToaster' }); act('cook', { type: 'whackToaster' }); adv(0.5); return `jam=${s.inc.toasterJam} popped=${s.stations.toaster[0]?.popped}`; }
      case 'bellStuck': act('cook', { type: 'unstickBell' }); return `stuck=${s.inc.bellStuck}`;
    }
    return '?';
  }
  return out.join('\n');
}
