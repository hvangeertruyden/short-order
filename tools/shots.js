// Dev helper: stage the same scenes every time for screenshots.
// In the browser console:  const S = await import('/tools/shots.js'); await S.stage(); S.view('dining')
export async function stage() {
  if (!window.__G?.state) { document.querySelector('#btn-solo').click(); for (let i = 0; i < 40 && !window.__G?.state; i++) await new Promise((r) => setTimeout(r, 200)); await new Promise((r) => setTimeout(r, 300)); document.querySelector('#help [data-close]')?.click(); }
  const G = window.__G, s = G.sim.s, sim = G.sim;
  const K = await import('/js/kitchen.js');
  const D = await import('/js/data.js');
  s.ev.next = 1e9; s.spawnAt = 1e9; D.TUNING.outingRate = 0;
  // a few parties, seated with drinks done
  for (let i = 0; i < 4; i++) sim.spawnCustomer(true);
  window.__dbg.advance(22, 20);
  for (let k = 0; k < 6; k++) {
    const f = s.customers.find((c) => s.orderLine[0] === c.id && c.st === 'line');
    if (f) {
      sim.apply('server', { type: 'takeOrder', cid: f.id }); sim.apply('server', { type: 'ringUp', cid: f.id });
      while (f.st === 'waitDrink' && f.drinksLeft.length) { s.players.server.held = f.drinksLeft[0] === 'coffee' ? { type: 'mug', p: 1 } : { type: 'cup', ice: true, fill: 0.9, lid: true }; sim.apply('server', { type: 'giveDrink', cid: f.id }); }
    }
    window.__dbg.advance(5, 20);
  }
  sim.apply('server', { type: 'closeNpc' });
  s.players.server.held = null;
  // the kitchen in full swing
  const put = (at, i, kind, step, p, extra = {}) => { s.stations[at][i] = Object.assign(K.newFood(kind), { step, p }, extra); };
  put('griddle', 0, 'pancakes', 0, 0.6); put('griddle', 1, 'eggs', 2, 0.4, { style: 'sunny side up' });
  put('griddle', 2, 'bacon', 2, 0.5); put('griddle', 3, 'patty', 3, 1, { cheese: true });
  put('fryer', 0, 'fries', 2, 0.5, { lowered: true }); put('toaster', 0, 'toast', 0, 0.5); put('blender', 0, 'milkshake', 3, 0.4);
  s.coffeeM = { mug: { type: 'mug', p: 0.4 } };
  window.__dbg.advance(12, 20);
}
const VIEWS = {
  dining:  { pos: [-0.6, 1.7, 8.4], look: [6.0, 0.9, 1.0] },
  counter: { pos: [-0.2, 1.6, 4.0], look: [-6.0, 1.0, 0.6] },
  kitchen: { pos: [-0.6, 1.6, -2.7], look: [-3.0, 1.1, -6.6] },
  tables:  { pos: [0.2, 1.5, 6.8], look: [6.5, 0.8, 2.0] },
  server:  { pos: [-1.6, 1.6, -1.3], look: [-6.5, 1.0, 1.5] },
};
export function view(name) {
  const v = VIEWS[name];
  const [x, y, z] = v.pos, [lx, ly, lz] = v.look;
  const yaw = Math.atan2(-(lx - x), -(lz - z));
  const pitch = Math.atan2(ly - y, Math.hypot(lx - x, lz - z));
  window.__camOverride = { pos: v.pos, rot: [pitch, yaw, 0] };
  window.__dbg.advance(0.2, 30);
}
