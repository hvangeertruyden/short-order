// ---------------------------------------------------------------------------
// Short Order — all tweakable content lives here (menu, layout, events, lines).
// Change numbers here; game logic reads them.
// ---------------------------------------------------------------------------

// Background music (streamed, not bundled). NOTE: this archive.org upload has no
// license listed. Fine for playing with friends; swap in licensed / royalty-free
// music before releasing the game publicly.
export const MUSIC = {
  url: 'https://archive.org/download/vintage-1950s-diner-music-doo-wop-rockabilly-classics-for-relaxing-nostalgic-moments/Vintage%201950s%20Diner%20Music%20%20%20Doo-Wop%20%20Rockabilly%20Classics%20for%20Relaxing%20%20Nostalgic%20Moments.mp3',
  length: 9067,          // seconds (about 2 h 31 min); it loops
  dining: 0.55,          // normal background volume in the dining room
  kitchen: 0.32,         // heard through the wall (also muffled)
  blast: 1.9,            // jukebox stuck on 11
  skipEvery: 0.85,       // stuck jukebox: the record skips back this many seconds, over and over
};

export const PALETTE = {
  cherry: 0xC8262B, teal: 0x3FB8AF, cream: 0xF5EBD3, chrome: 0xC9D1D6,
  black: 0x1B1B1B, white: 0xF7F5EE, mustard: 0xE7B23B, pink: 0xF4A6B8,
  orange: 0xFF6B2C, sick: 0x8FD16B, highlight: 0xFFF6C9,
};

// What customers order and pay for. soggy = seconds after plating before it
// goes soggy under the heat lamp. price is what a happy customer pays.
export const MENU = {
  pancakes:      { name: 'Pancakes',       price: 6, soggy: 30, meal: 'breakfast' },
  eggs:          { name: 'Eggs',           price: 4, soggy: 34, meal: 'breakfast', styles: ['over easy', 'scrambled', 'sunny side up'] },
  bacon:         { name: 'Bacon',          price: 4, soggy: 45, meal: 'breakfast' },
  toast:         { name: 'Toast',          price: 2, soggy: 18, meal: 'breakfast' },
  cheeseburger:  { name: 'Cheeseburger',   price: 9, soggy: 45, meal: 'lunch', toppings: ['lettuce', 'tomato', 'onion', 'pickles'] },
  fries:         { name: 'Fries',          price: 3, soggy: 18, meal: 'lunch' },
  grilledcheese: { name: 'Grilled Cheese', price: 7, soggy: 40, meal: 'lunch' },
  milkshake:     { name: 'Milkshake',      price: 5, soggy: 30, meal: 'any' },
};

export const DRINKS = {
  coffee: { name: 'Coffee', price: 2 },
  soda:   { name: 'Soda',   price: 2 },
};

// --------------------------------------------------------------------------
// RECIPES. Every food is a physical item that walks through its steps in
// order. Each step happens at one place:
//   griddle / fryer / toaster / blender  (the item must be sitting in a slot)
//   prep                                  (the item must be on a prep-counter spot)
// Step kinds:
//   cook:  seconds until done; win = seconds it can sit done before burning.
//          Cooking runs by itself while the item sits there.
//   verb:  a button the cook presses (busy = seconds it takes, 0 = instant).
//   choices: pick one (sets item[key]); e.g. egg style.
//   toppings: add any toppings, then press verb to finish.
//   optional: can be skipped (skipFx says what happens).
// place: button text for putting the item there. Leaving a cook early = raw.
// --------------------------------------------------------------------------
export const RECIPES = {
  pancakes: { name: 'Pancakes', raw: 'Pancake batter', steps: [
    { at: 'griddle', place: 'Pour batter', cook: 7, win: 6, ready: 'Bubbling. Flip it!' },
    { at: 'griddle', verb: 'Flip' },
    { at: 'griddle', cook: 6, win: 7 },
    { at: 'prep', verb: 'Add butter & syrup', busy: 1.0, missing: 'syrup' },
  ] },
  eggs: { name: 'Eggs', raw: 'Raw eggs', steps: [
    { at: 'griddle', place: 'Crack eggs', cook: 5, win: 6, ready: 'Set. Check the receipt for the style!' },
    { at: 'griddle', key: 'style', choices: [
      { key: 'over easy', verb: 'Flip (over easy)' }, { key: 'scrambled', verb: 'Stir (scrambled)' }, { key: 'sunny side up', verb: 'Leave alone (sunny side up)' }] },
    { at: 'griddle', cook: 4, win: 6 },
    { at: 'prep', verb: 'Season', busy: 0.7, missing: 'salt and pepper' },
  ] },
  bacon: { name: 'Bacon', raw: 'Raw bacon', steps: [
    { at: 'griddle', place: 'Lay strips', cook: 8, win: 4, flare: 0.6, ready: 'Flip before it flares up!' },
    { at: 'griddle', verb: 'Flip' },
    { at: 'griddle', cook: 6, win: 6 },
    { at: 'prep', verb: 'Drain on paper towel', busy: 1.0, greasyIfSkipped: true },
  ] },
  toast: { name: 'Toast', raw: 'Bread', steps: [
    { at: 'toaster', place: 'Put in toaster', cook: 6, win: 2.5, toaster: true, ready: 'Golden. Lift it before it burns!' },
    { at: 'prep', verb: 'Butter', busy: 0.8, missing: 'butter' },
  ] },
  patty: { name: 'Burger patty', raw: 'Raw patty', steps: [
    { at: 'griddle', place: 'Lay patty', cook: 7, win: 6 },
    { at: 'griddle', verb: 'Flip' },
    { at: 'griddle', cook: 6, win: 6, ready: 'Add the cheese while it\'s hot!' },
    { at: 'griddle', verb: 'Add cheese', cheese: true },
  ] },
  bun: { name: 'Bun', raw: 'Bun', steps: [
    { at: 'griddle', place: 'Toast the bun', cook: 3, win: 5 },
  ] },
  cheeseburger: { name: 'Cheeseburger', steps: [   // made at the prep counter: toasted bun + finished patty
    { at: 'prep', toppings: true, verb: 'Top bun (finish)' },
  ] },
  fries: { name: 'Fries', raw: 'Frozen fries', steps: [
    { at: 'fryer', fill: true },                    // placing: pour carefully (slow) or dump it in (risky)
    { at: 'fryer', verb: 'Lower into the oil' },
    { at: 'fryer', cook: 8, win: 5, ready: 'Golden! Lift the basket.' },
    { at: 'fryer', verb: 'Lift basket' },
    { at: 'fryer', verb: 'Shake', greasyIfSkipped: true },
    { at: 'prep', verb: 'Salt', busy: 0.6, missing: 'salt' },
  ] },
  grilledcheese: { name: 'Grilled cheese', steps: [   // made at the prep counter: bread + cheese
    { at: 'prep', verb: 'Butter & assemble', busy: 1.2 },
    { at: 'griddle', place: 'Put on griddle', cook: 5, win: 5 },
    { at: 'griddle', verb: 'Flip' },
    { at: 'griddle', verb: 'Press with spatula', optional: true },
    { at: 'griddle', cook: 4, win: 4 },
    { at: 'prep', verb: 'Cut in half', busy: 0.7, missing: 'cut' },
  ] },
  milkshake: { name: 'Milkshake', raw: 'Ice cream', steps: [
    { at: 'blender', place: 'Scoop into blender cup', verb: 'Add milk & syrup' },
    { at: 'blender', verb: 'Put the lid on', optional: true, skipFx: 'splatter' },
    { at: 'blender', verb: 'Blend' },
    { at: 'blender', cook: 5, win: 7, runaway: true, ready: 'Smooth! Stop the blender.' },
    { at: 'blender', verb: 'Stop & pour into a glass' },
    { at: 'prep', verb: 'Whipped cream & cherry', busy: 0.8, missing: 'whipped cream' },
  ] },
  // plain ingredients (no steps of their own; they get combined)
  bread: { name: 'Bread', raw: 'Bread', steps: [] },
  cheese: { name: 'Cheese slice', raw: 'Cheese slice', steps: [] },
};

// Where raw ingredients come from. Each entry makes an item of that recipe at step 0.
export const SOURCES = {
  fridge: { name: 'Fridge', items: [['pancakes', 'Pancake batter'], ['eggs', 'Eggs'], ['bacon', 'Bacon'], ['patty', 'Burger patty'], ['cheese', 'Cheese slice']] },
  freezer: { name: 'Freezer', items: [['fries', 'Frozen fries'], ['milkshake', 'Ice cream']] },
  breadbox: { name: 'Bread box', items: [['bread', 'Bread'], ['bun', 'Burger bun']] },
};

export const STATIONS = {
  griddle: { name: 'Griddle', slots: 4 },
  fryer:   { name: 'Fryer basket', slots: 2 },
  toaster: { name: 'Toaster', slots: 2 },
  blender: { name: 'Blender', slots: 1 },
  prep:    { name: 'Prep counter', slots: 3 },
};

// Server drinks
export const DRINK_TUNING = {
  fillTime: 2.4,       // seconds to fill a soda cup to the top
  fillGood: [0.8, 1.0],
  brewTime: 4,
  spillAt: 1.25,       // keep pouring past this and it spills on the floor
};

// pay multipliers for problems with a dish (they stack, down to a minimum)
export const QUALITY_PAY = { burnt: 0.35, raw: 0.4, soggy: 0.65, greasy: 0.75, plain: 0.7, missing: 0.85, wrongStyle: 0.6, wrongToppings: 0.75, messy: 0.85 };

export const TUNING = {
  startPlates: 6,          // clean plates at the start of a shift
  plateCapacity: 4,
  receiptSlipAfter: 7,     // seconds a printed receipt sits before slipping to the floor
  floorGrimePerSec: 0.05,
  greasyFingers: 0.07,     // grime added to a held receipt per griddle/fryer action
  dumpOverflow: 0.45,      // chance that dumping fries in makes the oil overflow
  floorSickChance: 0.5,    // food that touched the floor counts like a dirty plate
  railSlots: 4,
  maxDishesCarried: 4,
  washPerPlate: 1.0,
  pourTime: 1.2,
  carefulPour: 1.3,
  mopTime: 0.5,            // one 'Mop' click = a short scrub
  scrubClick: 0.35,        // how much one click scrubs away (a puddle is ~1)
  scrubPerMeter: 0.22,     // how much walking around on a puddle with the mop scrubs away
  sprayTime: 1.5,
  breakerTime: 1.2,
  eatTime: 14,
  sickChance: 0.5,         // dirty dish rule
  sickDelay: [10, 12],
  sickDamage: 15,
  maxCustomers: 9,
  spawnInterval: [30, 13], // seconds between arrivals, start of shift -> end
  soloSpawnInterval: 35,   // solo practice: steady, relaxed arrivals
  walkSpeed: 1.5,
  // patience: seconds from full to zero in each waiting state
  patience: { line: 120, waitDrink: 80, waitFood: 200, pay: 85 },   // (none in solo practice)
  burnGrace: 1.35,         // multiplies every recipe's 'win' (time before burning)
  soggyGrace: 1.3,         // multiplies how long plated food survives the heat lamp
  noiseDrain: 1.6,
  smokeDrain: 1.3,
  fireAlarmAfter: 4,
  fireDamagePerSec: 1,
  tipRate: 0.3,
  partySizes: [0.35, 0.35, 0.18, 0.12],   // chance of a party of 1, 2, 3, 4
  outingRate: 1 / 55,      // per seated person per second: get up for the restroom or a wander
  outingMax: 2,            // per person per visit
  restroomShare: 0.55,     // vs wandering
  restroomStay: [5, 9],
  wanderStay: [4, 8],
  tpChance: 0.3,           // a restroom visit leaves toilet paper everywhere
  clogChance: 0.16,        // ...or clogs the toilet
  clogPlunges: 3,
  floodGrow: 0.05,         // a clogged toilet keeps flooding (puddle size per second)
  floodMax: 1.8,
};

// --------------------------------------------------------------------------
// Layout (1 unit = 1 m). Kitchen is z < -2, dining room is z > -2.
// --------------------------------------------------------------------------
export const L = {
  // building: x -8..8, z -7..9. Kitchen top-left, restrooms top-right, dining below.
  wallZ: -2,                                   // kitchen front wall (the pass is in it)
  kitchen: { x0: -8, x1: 3, z0: -7, z1: -2 },  // the cook's whole world
  corridor: { x0: 3.15, x1: 4.45 },            // restroom corridor (dining side), runs z -7..-2
  restrooms: [{ z0: -7, z1: -4.55 }, { z0: -4.45, z1: -2 }],  // x 4.45..8
  bounds: { x0: -8, x1: 8, z0: -7, z1: 9 },
  ceiling: 3,
  pass: { x0: -5.2, x1: -1.0, shelfY: 1.0, glassY: 1.28 },
  trays: [{ x: -4.6 }, { x: -3.7 }, { x: -2.8 }],
  dishReturn: { x: -1.65, z: -2 },
  bell: { x: -5.05, z: -2.3 },
  cookSpawn: { x: -3.2, z: -2.9, yaw: Math.PI },
  serverSpawn: { x: -6.7, z: -1.0, yaw: Math.PI },

  // kitchen
  tv: { x: -6.7, y: 2.05, z: -2.08 },
  printer: { x: -6.7, z: -2.4 },
  rail: { x0: -6.05, x1: -5.45, y: 1.6, z: -2.07 },
  griddle: { x: -4.65, z: -6.6, slotX: [-5.8, -5.05, -4.3, -3.55] },
  fryer: { x: -2.2, z: -6.6, slotX: [-2.55, -1.85] },
  toaster: { x: -0.75, z: -6.6, slotX: [-0.9, -0.6] },
  blender: { x: 0.35, z: -6.6, slotX: [0.35] },
  rack: { x: 1.45, z: -6.6 },
  sink: { x: 2.55, z: -4.6 },
  kTrash: { x: 0.9, z: -2.45 },
  extinguisher: { x: -7.9, z: -3.3 },
  breaker: { x: -7.9, z: -5.55 },
  freezer: { x: -7.0, z: -6.4 },
  mopKitchen: { x: 2.55, z: -6.45 },
  fridge: { x: -7.5, z: -4.4 },
  island: { x: -2.4, z: -4.35, w: 4.6, d: 0.95 },          // prep island in the middle of the kitchen
  breadbox: { x: -0.55, z: -4.35 },
  prep: { z: -4.35, slotX: [-4.15, -3.2, -2.25] },

  // dining room: order counter runs along the left wall (where the bar is in the plan)
  counter: { x0: -6.05, x1: -5.35, z0: -0.4, z1: 5.3 },     // customers stand on its east side
  backCounter: { x0: -8, x1: -7.35, z0: -1.6, z1: 5.3 },    // drink station against the wall
  regOrder: { x: -5.7, z: 1.9 },
  tentHolder: { x: -5.7, z: 3.0 },
  host: { x: -6.55, z: 7.85, w: 1.5, d: 0.7 },              // host stand by the door = pay register
  regPay: { x: -6.55, z: 7.85 },
  // drink station items along the back counter (z positions; they face +x)
  mugs: { x: -7.68, z: -1.15 },
  coffee: { x: -7.68, z: -0.3 },
  cups: { x: -7.68, z: 0.45 },
  ice: { x: -7.68, z: 0.95 },
  soda: { x: -7.68, z: 1.75 },
  lids: { x: -7.68, z: 2.7 },
  menuBoard: { x: -7.94, y: 2.3, z: 3.9 },
  fTrash: { x: -0.4, z: -1.6 },
  mopDining: { x: 3.8, z: -6.6 },          // janitor bucket at the end of the restroom corridor
  jukebox: { x: 7.45, z: 3.3 },
  door: { x: 0, z: 9, w: 2.0 },
  windows: [-6.2, -3.6, 3.6, 6.2],
  // walking: queue in front of the counter, pickup at its north end, pay at the host stand
  orderLine: { x: -4.75, z: 1.9, step: 0.85 },     // grows toward +z (toward the door)
  pickup: { x: -4.75, z: 0.95 },                    // waiting for a drink: north of the register
  payLine: { x: -5.35, z: 7.85, step: 0.8 },        // grows toward +x
  inspectorSpot: { x: 6.6, z: 7.7 },
  // places customers wander over to while they wait (face = what they look at)
  wanderSpots: [
    { x: 6.55, z: 3.3, face: { x: 7.45, z: 3.3 }, bubble: '🎵' },
    { x: 6.75, z: 7.75, face: { x: 7.3, z: 8.4 }, bubble: '🍬' },
    { x: -3.6, z: 8.2, face: { x: -3.6, z: 9.5 }, bubble: '☁️' },
    { x: -4.1, z: 4.3, face: { x: -7.9, z: 3.9 }, bubble: '🤔' },
    { x: 6.85, z: 6.4, face: { x: 7.5, z: 6.4 }, bubble: '🌿' },
  ],
  // restrooms: corridor mouth, each room's door line and the spot by the toilet
  corridorMouth: { x: 3.8, z: -0.8 },
  rooms: [
    { doorZ: -5.9, spot: { x: 7.1, z: -5.45 }, toilet: { x: 7.75, z: -5.45 } },
    { doorZ: -3.2, spot: { x: 7.1, z: -2.95 }, toilet: { x: 7.75, z: -2.95 } },
  ],
  plunger: { x: 4.3, z: -6.86 },
  // aisle network customers walk along (no cutting through furniture)
  aisleX: [-3.85, -0.5, 3.1],
  aisleZ: [0.0, 3.3, 6.6],
  entry: { x: 0, z: 8.2 },
};

// Every chair at a table (first one = the 'seat' above). Round tables seat 4,
// square two-tops seat 2. yaw = facing the table.
export function tableSeats(t) {
  const r = t.shape === 'round' ? 0.82 : 0.68;
  const base = Math.atan2(t.seat.x - t.x, t.seat.z - t.z);
  const angs = t.shape === 'round' ? [0, Math.PI, Math.PI / 2, -Math.PI / 2] : [0, Math.PI];
  return angs.map((a0) => {
    const a = base + a0, x = t.x + Math.sin(a) * r, z = t.z + Math.cos(a) * r;
    return { x, z, yaw: Math.atan2(-(t.x - x), -(t.z - z)) };
  });
}

// Tables: shape, centre, and where the customer sits (seat) + how they face.
// approach = the aisle point next to the seat they walk to first.
export const TABLES = [
  { n: 1, shape: 'round',  x: -2.2, z: 1.5, seat: { x: -2.2, z: 2.3, yaw: 0 },        approach: { x: -2.2, z: 3.3 } },
  { n: 2, shape: 'round',  x: 1.2,  z: 1.5, seat: { x: 1.2,  z: 2.3, yaw: 0 },        approach: { x: 1.2,  z: 3.3 } },
  { n: 3, shape: 'square', x: 5.3,  z: 1.5, seat: { x: 5.3,  z: 2.2, yaw: 0 },        approach: { x: 5.3,  z: 3.3 } },
  { n: 4, shape: 'round',  x: -2.2, z: 5.0, seat: { x: -2.2, z: 5.8, yaw: 0 },        approach: { x: -2.2, z: 6.6 } },
  { n: 5, shape: 'round',  x: 1.2,  z: 5.0, seat: { x: 1.2,  z: 5.8, yaw: 0 },        approach: { x: 1.2,  z: 6.6 } },
  { n: 6, shape: 'square', x: 5.3,  z: 5.0, seat: { x: 5.3,  z: 5.7, yaw: 0 },        approach: { x: 5.3,  z: 6.6 } },
  { n: 7, shape: 'square', x: 3.3,  z: 8.1, seat: { x: 2.62, z: 8.1, yaw: -Math.PI / 2 }, approach: { x: 2.62, z: 6.6 } },
];

// --------------------------------------------------------------------------
// Events. Each one must push a problem across the wall.
// side: who can fix it. from: earliest point in the shift (0..1).
// --------------------------------------------------------------------------
export const EVENTS = {
  greaseFire:  { name: 'Grease fire',          side: 'cook',   weight: 3, from: 0.25, cooldown: 70,
                 crossWall: 'Smoke alarm deafens the dining room; customers cannot hear orders.' },
  breaker:     { name: 'Breaker trip',         side: 'cook',   weight: 2, from: 0.2, cooldown: 80,
                 crossWall: 'The register dies, so the server cannot take orders or payments.' },
  printerJam:  { name: 'Printer jam',          side: 'cook',   weight: 3, from: 0.15, cooldown: 50,
                 crossWall: 'Tickets back up; the server has to stall the dining room.' },
  jukebox:     { name: 'Jukebox stuck on 11',  side: 'server', weight: 3, from: 0.15, cooldown: 60,
                 crossWall: 'Noise. The cook can kill it by flipping the breaker, at a price.' },
  inspector:   { name: 'Health inspector',     side: 'server', weight: 2, from: 0.35, cooldown: 140,
                 crossWall: 'He peeks through the pass: dirty plates, fires and floor receipts get fined.' },
  spill:       { name: 'Soda spill',           side: 'server', weight: 2, from: 0.1, cooldown: 45,
                 crossWall: 'Customers near it get grumpy; the inspector hates it.' },
  rush:        { name: 'Bus tour rush',        side: 'both',   weight: 2, from: 0.4, cooldown: 90,
                 crossWall: 'Four customers at once. Everyone panics.' },
  greasyRail:  { name: 'Grease splatter',      side: 'cook',   weight: 2, from: 0.2, cooldown: 50,
                 crossWall: 'Pinned receipts get smudged; the server may get a mystery table number.' },
};

export const DIRECTOR = {
  calmUntil: 0.12,        // fraction of the shift with no random events
  interval: [45, 18],     // seconds between events, start -> end
  maxActive: [1, 3],      // overlap cap, start -> end
};

// --------------------------------------------------------------------------
// Scripted NPC lines. {items} {drink} {item} {n} are filled in.
// --------------------------------------------------------------------------
export const LINES = {
  names: ['Marge', 'Dale', 'Rusty', 'Bev', 'Earl', 'Dot', 'Hank', 'Lou', 'Peggy', 'Walt', 'Rita', 'Gus',
          'Fern', 'Buck', 'Opal', 'Vern', 'Trixie', 'Clyde', 'Mabel', 'Duke', 'Nell', 'Skip', 'June', 'Ike'],
  order: [
    "Hiya! I'll have {items}{drink}.",
    "Gimme {items}{drink}. And make it snappy!",
    "Ooh, uh... {items}{drink}, please!",
    "Same as always: {items}{drink}.",
    "I'm STARVING. {items}{drink}!",
    "Can I get {items}{drink}? Thanks, hon.",
  ],
  drinkSuffix: [', and {drink}', ' with {drink}', ', plus {drink} to wash it down'],
  cantHear: ["WHAT?!", "I CAN'T HEAR YOU!", "SPEAK UP!", "HUH?! IT'S SO LOUD IN HERE!", "SAY AGAIN?!", "I CAN'T HEAR A THING!"],
  hello: ['Hey there!', 'Howdy!', 'Hi hon.', "Mornin'!"],
  sorry: ["Hmph. Fine. Apology accepted.", "Okay, okay. Just hurry.", "Aw, it's alright."],
  hurry: ["You said that ten minutes ago!", "I'll believe it when I see it.", "Tick tock!"],
  thanks: ['Thanks!', 'Much obliged!', 'Keep the change, kiddo.', 'Best diner in town!'],
  smalltalk: ["Nice weather, huh?", "Is the jukebox always this loud?", "My cousin used to work here. Got fired.",
              "Do you have pie? No? Ugh.", "I love the checkered floor.", "Is it always this chaotic?"],
  impatient: ['Ahem...', 'Any day now...', '*taps foot*', 'Hellooo?'],
  angry: ['HELLO?!', 'I DO NOT HAVE ALL DAY!', 'WHERE IS MY FOOD?!', 'UNBELIEVABLE!'],
  furious: ['SLAM!', '*SLAMS FIST*', 'THIS IS AN OUTRAGE!', 'I WANT TO SEE A MANAGER!'],
  wrongOrder: ["This isn't what I ordered!", "Who's this for? NOT ME.", "Wrong table, genius!"],
  missing: ["Where's my {item}?!", "You forgot my {item}!"],
  burnt: ['This {item} is CHARCOAL!', 'My {item} is on FIRE. Well, it was.'],
  soggy: ['Why is my {item} so SOGGY?', 'This {item} is sadder than I am.'],
  plain: ['I said CHEESEburger!', 'Where is the CHEESE?!'],
  raw: ['This {item} is RAW!', 'Is this {item} even cooked?!'],
  greasy: ['This {item} is DRIPPING with grease!', 'Ugh, greasy {item}.'],
  missingStep: ['Where\'s the {thing}?!', 'You forgot the {thing}!'],
  wrongStyle: ['I said {style}!', 'These eggs are NOT {style}!'],
  wrongToppings: ['I asked for {list}!', 'Wrong toppings, pal!'],
  messy: ['Why is my {item} splattered everywhere?'],
  noIce: ['Warm soda?! Where\'s the ice?'],
  lowFill: ['Half a cup? Seriously?'],
  noLid: ['No lid? No straw? Am I a dog?'],
  happy: ['Mmm! Perfect!', 'Now THAT is a meal!', 'Chef\'s kiss!', 'Delicious!'],
  wrongDrink: ['We didn't order a {drink}!', 'That is NOT what we ordered.'],
  partyOrder: ["We'll have {items}{drink}.", "Okay gang... {items}{drink}!", "For the table: {items}{drink}.", "Uhh... {items}{drink}. Everyone good? Good."],
  restroomEw: ["EW! IT'S FLOODED!", 'WHO DID THIS?!', "I'm not going in THERE.", '*squelch*'],
  restroomOops: ['Oops...', '...', '*whistles innocently*'],
  clogged: ['*blub blub*', 'Uh oh.', 'Is it supposed to do that?'],
  sick: ['BLEGHHH!', 'Urk... I don\'t feel so good...', '*turns green*'],
  ew: ['EW!', 'Gross!', 'I lost my appetite...'],
  walkout: ['I\'M LEAVING!', 'NEVER COMING BACK!', 'Worst. Diner. Ever.'],
  inspector: ['📋 Hmm...', '📋 *scribbles*', '📋 Interesting...'],
};
