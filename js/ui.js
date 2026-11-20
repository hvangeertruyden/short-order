// HTML overlay UI: HUD, bottom action menu, receipts, chats, toasts, summary.
import { MENU, DRINKS } from './data.js';
import { custById } from './sim.js';
import { receiptText } from './actions.js';
import { thingName } from './kitchen.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const money = (v) => '$' + (Math.round(v * 100) / 100).toFixed(2);

export class UI {
  constructor({ onAction, onChat, onSay, onCloseNpc }) {
    Object.assign(this, { onAction, onChat, onSay, onCloseNpc });
    this.menuSig = ''; this.lastChatId = 0; this.npcSig = ''; this.seenToasts = new Set();
    this.currentActions = [];

    const sc = $('#staff-chat .sc-input');
    sc.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const t = sc.value.trim(); if (t) this.onChat(t); sc.value = ''; sc.blur(); }
      if (e.key === 'Escape') { sc.value = ''; sc.blur(); }
    });
    const ni = $('#npc .npc-input');
    ni.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const t = ni.value.trim(); if (t) this.onSay(t); ni.value = ''; }
      if (e.key === 'Escape') { ni.value = ''; ni.blur(); }
    });
    $('#npc .npc-close').addEventListener('click', () => this.onCloseNpc());
    $('#help [data-close]').addEventListener('click', () => this.toggleHelp(false));
    $('#pantry .pt-close').addEventListener('click', () => this.closePantry());
    $('#pantry').addEventListener('click', (e) => { if (e.target.id === 'pantry') this.closePantry(); });
  }

  // full-screen ingredient picker
  openPantry({ title, items, held, onTake }) {
    const el = $('#pantry');
    this.pantryOpen = true; this.pantryTake = onTake; this.pantryItems = items; this.pantryHeld = held;
    el.querySelector('.pt-title').textContent = title;
    el.querySelector('.pt-note').textContent = '';
    const grid = el.querySelector('.pt-grid');
    grid.innerHTML = '';
    items.forEach((it, i) => {
      const card = document.createElement('div');
      card.className = 'pt-card' + (it.out ? ' out' : '');
      card.innerHTML = `<div class="pt-img"><img src="${it.img}" alt="">${it.out ? '<div class="pt-out">EMPTY</div>' : ''}</div><div class="pt-name">${esc(it.name)}</div>`;
      const b = document.createElement('button');
      b.className = 'btn big'; b.innerHTML = `<span class="n">${i + 1}</span> Take`; b.disabled = held || it.out;
      b.addEventListener('click', () => this.takeFromPantry(i));
      card.appendChild(b);
      grid.appendChild(card);
    });
    el.classList.remove('hidden');
  }
  takeFromPantry(i) { const it = this.pantryItems?.[i]; if (!it || this.pantryHeld || it.out) return; this.pantryTake(it.kind); this.closePantry(); }
  closePantry() { if (!this.pantryOpen) return; $('#pantry').classList.add('hidden'); this.pantryOpen = false; this.onPantryClose?.(); }
  pantryKey(e) {
    if (e.code === 'Escape' || e.code === 'KeyE' && false) { this.closePantry(); return; }
    const m = /^Digit([1-9])$/.exec(e.code); if (m) this.takeFromPantry(Number(m[1]) - 1);
  }

  focusStaffChat() { $('#staff-chat .sc-input').focus(); }
  focusNpc() { if (!$('#npc').classList.contains('hidden')) { $('#npc .npc-input').focus(); return true; } return false; }
  toggleHelp(v) { $('#help').classList.toggle('hidden', v === undefined ? undefined : !v); }
  showHUD(v) { $('#hud').classList.toggle('hidden', !v); if (!v) this.reset(); }
  reset() {
    this.menuSig = ''; this.lastChatId = 0; this.npcSig = ''; this.seenToasts.clear();
    $('#staff-chat .sc-log').innerHTML = ''; $('#toasts').innerHTML = '';
  }

  // ------------------------------------------------------------------
  frame(s, role, opts) {
    const { menu, far, solo, myRecView } = opts;
    // top-left
    const rb = $('#role-badge');
    rb.className = role; rb.textContent = role === 'cook' ? '🍳 COOK' : '🧾 SERVER';
    const prog = s.solo ? (s.t % 600) / 600 : Math.min(1, s.t / s.shiftLen);
    const mins = 7 * 60 + prog * 7 * 60;
    const hh = Math.floor(mins / 60), mm = Math.floor(mins % 60);
    const left = Math.max(0, s.shiftLen - s.t);
    const tail = s.solo ? '<span class="left">practice · no clock</span>' : `<span class="left">${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left</span>`;
    $('#clock').innerHTML = `🕖 ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'} · ${prog < 0.5 ? 'Breakfast' : 'Lunch'} ${tail}`;
    $('#end-shift').classList.toggle('hidden', !s.solo || s.phase !== 'playing');
    const dmg = s.damages.reduce((a, d) => a + d.amount, 0);
    $('#till').innerHTML = `💰 ${money(s.money.sales + s.money.tips)}${dmg > 0 ? ` <span class="dmg">−${money(dmg)}</span>` : ''}`;

    // noise banner (audible to both)
    const nz = $('#noise');
    if (s.noise.length) {
      nz.classList.remove('hidden');
      nz.innerHTML = `🔊 ${s.noise.join(' + ').toUpperCase()}`;
    } else nz.classList.add('hidden');

    // busy
    const P = s.players[role];
    const busy = $('#busy');
    if (P.busy) { busy.classList.remove('hidden'); busy.querySelector('.lbl').textContent = P.busy.label; busy.querySelector('i').style.width = `${(1 - (P.busy.until - s.t) / P.busy.dur) * 100}%`; }
    else busy.classList.add('hidden');

    // held
    const h = P.held;
    let held = h ? thingName(h) : '';
    if (role === 'cook' && P.receipt) held += (held ? ' + ' : '') + '🧾 receipt';
    $('#held').innerHTML = held ? `Holding: ${esc(held)} <span class="kbd">G</span> drop` : '';
    $('#solo-tip').classList.toggle('hidden', !solo);
    $('#vignette').className = s.fire && role === 'cook' ? 'smoke' : !s.power ? 'dark' : '';
    $('#batter').classList.toggle('hidden', !(role === 'cook' && s.inc?.batterUntil > s.t));
    { const k = $('#kds'); k.classList.toggle('hidden', role !== 'cook'); if (role === 'cook' && this.kdsCanvas && !k.firstChild) k.appendChild(this.kdsCanvas); }

    this.renderMenu(menu, far);
    this.placeMenu(opts.anchor);
    this.renderReceipts(s, role, menu, myRecView);
    this.renderToasts(s, role);
    this.renderChat(s, role);
    this.renderNpc(s, role);
    if (this.posOpen) this.renderPOS(s, role);
  }

  renderMenu(menu, far) {
    const el = $('#menu');
    if (!menu) { el.classList.add('hidden'); this.menuSig = ''; this.currentActions = []; this.actionKeys = {}; return; }
    // live info (cooking %, etc.) updates in place; the buttons are only rebuilt when the choices change
    const infoHtml = menu.info.map((t) => `<div>${esc(t)}</div>`).join('');
    if (infoHtml !== this.menuInfo) { this.menuInfo = infoHtml; $('.m-info', el).innerHTML = infoHtml; }
    const sig = JSON.stringify([menu.key, menu.title, menu.actions.map((a) => [a.label, a.disabled]), far]);
    if (sig === this.menuSig) return;
    this.menuSig = sig;
    el.classList.remove('hidden');
    el.classList.toggle('far', far);
    $('.m-title', el).textContent = menu.title;
    const box = $('.m-actions', el);
    box.innerHTML = '';
    this.currentActions = far ? [] : menu.actions;
    // E for the main action, then F, Z, X for the rest (in order)
    const primary = menu.actions.findIndex((x) => !x.disabled && x.a);
    const spare = ['F', 'Z', 'X'];
    this.actionKeys = {};
    const keyOf = menu.actions.map((a, i) => (i === primary ? 'E' : spare.shift() || ''));
    keyOf.forEach((k, i) => { if (k) this.actionKeys[k] = menu.actions[i]; });
    menu.actions.forEach((a, i) => {
      const b = document.createElement('button');
      b.disabled = a.disabled || far || !a.a;
      b.className = i === primary ? 'primary' : '';
      b.innerHTML = `${keyOf[i] ? `<span class="key">${keyOf[i]}</span>` : '<span class="key blank"></span>'}<span class="lbl">${esc(a.label)}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); if (!b.disabled) this.onAction(a.a); });
      box.appendChild(b);
    });
  }

  // ---------------------------------------------------------------------------
  // The POS: the server actually punches the order in from what the customer says.
  // Whatever gets rung up is what prints in the kitchen.
  // ---------------------------------------------------------------------------
  openPOS(cid) {
    this.posOpen = true;
    this.pos = { cid, items: [], drinks: [], mod: null };
    this.posSig = '';
    $('#pos').classList.remove('hidden');
  }
  closePOS() { if (!this.posOpen) return; this.posOpen = false; $('#pos').classList.add('hidden'); this.pos = null; }
  posKey(e) {
    if (e.code === 'Escape') { e.preventDefault(); this.closePOS(); }
    else if (e.code === 'Enter') { e.preventDefault(); this.posRing(); }
  }
  posRing() {
    const P = this.pos; if (!P || !P.items.length) return;
    this.onAction({ type: 'ringUp', cid: P.cid, items: P.items, drinks: P.drinks });
    this.closePOS();
  }
  renderPOS(s, role) {
    const P = this.pos, c = custById(s, P.cid);
    if (role !== 'server' || !c || c.st !== 'line' || s.orderLine[0] !== c.id) { this.closePOS(); return; }
    const noisy = s.noise.length > 0;
    const said = !c.heard ? (noisy ? "WHAT?! I CAN'T HEAR YOU!" : '...') : c.orderLine || '';
    const size = 1 + (c.members?.length || 0);
    const regOk = s.power && s.t >= s.registerBootUntil;
    const sig = JSON.stringify([c.id, said, c.heard, noisy, P, regOk]);
    if (sig === this.posSig) return;
    this.posSig = sig;
    const el = $('#pos');
    const kinds = Object.keys(MENU);
    const itemLine = (it) => MENU[it.kind].name + (it.style ? ` (${it.style})` : '') + (it.toppings ? (it.toppings.length ? ` + ${it.toppings.join(', ')}` : ' (plain)') : '');
    const mod = P.mod;
    const modRow = !mod ? '' : `<div class="pos-mod"><span>${esc(MENU[mod.kind].name)}:</span>${MENU[mod.kind].styles
      ? MENU[mod.kind].styles.map((st) => `<button class="pos-chip" data-pos="style:${st}">${esc(st)}</button>`).join('')
      : MENU[mod.kind].toppings.map((tp) => `<button class="pos-chip ${mod.toppings.includes(tp) ? 'on' : ''}" data-pos="top:${tp}">${esc(tp)}</button>`).join('') + '<button class="pos-chip go" data-pos="addmod">Add burger</button>'}<button class="pos-chip ghost" data-pos="nomod">✕</button></div>`;
    el.innerHTML = `
      <div class="pos-card">
        <div class="pos-head"><span class="pos-brand">SHORT ORDER · REGISTER</span><span class="pos-x" data-pos="close">✕</span></div>
        <div class="pos-body">
          <div class="pos-guest">
            <div class="pos-name">${esc(c.name)}<small>${size > 1 ? `party of ${size}` : 'table for one'}</small></div>
            <div class="pos-say ${noisy && !c.heard ? 'loud' : ''}">${esc(said)}</div>
            ${!c.heard ? `<button class="btn" data-pos="ask">${noisy ? '📣 Ask again' : '👂 What can I get you?'}</button>` : `<button class="btn ghost" data-pos="ask">🔁 Say that again?</button>`}
          </div>
          <div class="pos-menu">
            <div class="pos-grid">${kinds.map((k) => `<button class="pos-item" data-pos="add:${k}"><b>${esc(MENU[k].name)}</b><span>$${MENU[k].price}</span></button>`).join('')}</div>
            ${modRow}
            <div class="pos-drinks">${Object.keys(DRINKS).map((d) => `<button class="pos-item drink" data-pos="drink:${d}"><b>${d === 'coffee' ? '☕' : '🥤'} ${esc(DRINKS[d].name)}</b><span>$${DRINKS[d].price}</span></button>`).join('')}</div>
          </div>
          <div class="pos-ticket">
            <div class="pos-tk-head">TICKET</div>
            <div class="pos-lines">${P.items.map((it, i) => `<div class="pos-ln"><span>${esc(itemLine(it))}</span><i data-pos="del:${i}">✕</i></div>`).join('') || '<div class="pos-empty">tap the menu</div>'}
              ${P.drinks.map((d, i) => `<div class="pos-ln drink"><span>${esc(DRINKS[d].name)}</span><i data-pos="deld:${i}">✕</i></div>`).join('')}</div>
            <button class="btn big pos-ring" data-pos="ring" ${P.items.length && regOk && c.heard ? '' : 'disabled'}>🧾 Ring it up <span class="kbd">Enter</span></button>
          </div>
        </div>
      </div>`;
    el.querySelectorAll('[data-pos]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.posClick(b.dataset.pos); }));
  }
  posClick(cmd) {
    const P = this.pos; if (!P) return;
    const [k, v] = cmd.split(':');
    if (k === 'close') return this.closePOS();
    if (k === 'ring') return this.posRing();
    if (k === 'ask') { this.onAction({ type: 'takeOrder', cid: P.cid }); return; }
    if (k === 'add') { const m = MENU[v]; if (m.styles || m.toppings) P.mod = { kind: v, toppings: [] }; else P.items.push({ kind: v }); }
    if (k === 'style' && P.mod) { P.items.push({ kind: P.mod.kind, style: v }); P.mod = null; }
    if (k === 'top' && P.mod) { const t = P.mod.toppings; const i = t.indexOf(v); if (i >= 0) t.splice(i, 1); else t.push(v); }
    if (k === 'addmod' && P.mod) { P.items.push({ kind: P.mod.kind, toppings: P.mod.toppings.slice() }); P.mod = null; }
    if (k === 'nomod') P.mod = null;
    if (k === 'drink') P.drinks.push(v);
    if (k === 'del') P.items.splice(Number(v), 1);
    if (k === 'deld') P.drinks.splice(Number(v), 1);
    this.posSig = '';
  }

  // float the prompt beside whatever you're standing at (like a game's "press E" prompt)
  placeMenu(anchor) {
    const el = $('#menu');
    if (!anchor || el.classList.contains('hidden')) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const x = Math.max(12, Math.min(window.innerWidth - w - 12, anchor.x + 34));
    const y = Math.max(70, Math.min(window.innerHeight - h - 12, anchor.y - h / 2));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  receiptHTML(s, rid) {
    const r = receiptText(s, rid);
    if (!r) return '';
    return `<div class="receipt ${r.state}"><div class="hd"><span>SHORT ORDER</span><span>#${String(r.no).padStart(3, '0')}</span></div>
      <div class="tbl">TABLE ${esc(r.table)}</div>${r.lines.map((l) => `<div class="ln${l.sub ? ' sub' : ''}">${esc(l.text)}</div>`).join('')}
      ${r.state !== 'clean' ? `<svg class="grime" viewBox="0 0 100 100" preserveAspectRatio="none">${grimeBlobs(rid, r.grime)}</svg>` : ''}</div>`;
  }

  renderReceipts(s, role, menu, myRecView) {
    const view = $('#receipt-view');
    const rid = menu?.receiptId;
    if (rid) { const html = this.receiptHTML(s, rid); if (view.dataset.sig !== html) { view.innerHTML = html; view.dataset.sig = html; } view.classList.remove('hidden'); }
    else view.classList.add('hidden');
    const held = $('#receipt-held');
    if (myRecView && myRecView !== rid) {
      const html = `<div class="cap">${role === 'cook' ? 'Receipt in hand' : 'Receipt on your tray'}</div>` + this.receiptHTML(s, myRecView);
      if (held.dataset.sig !== html) { held.innerHTML = html; held.dataset.sig = html; }
      held.classList.remove('hidden');
    } else held.classList.add('hidden');
  }

  localToast(text, kind = 'info') {
    const box = $('#toasts');
    const d = document.createElement('div');
    d.className = `toast ${kind}`; d.textContent = text;
    box.prepend(d);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), 4200);
    setTimeout(() => d.remove(), 4900);
  }

  renderToasts(s, role) {
    const box = $('#toasts');
    for (const t of s.toasts) {
      if (this.seenToasts.has(t.id)) continue;
      this.seenToasts.add(t.id);
      if (t.to !== role && t.to !== 'all') continue;
      if (t.kind === 'shake') { this.onShake?.(); continue; }
      const d = document.createElement('div');
      d.className = `toast ${t.kind}`; d.textContent = t.text;
      box.prepend(d);
      while (box.children.length > 4) box.lastChild.remove();
      setTimeout(() => d.classList.add('fade'), 4200);
      setTimeout(() => d.remove(), 4900);
    }
  }

  renderChat(s, role) {
    const log = $('#staff-chat .sc-log');
    let added = false;
    for (const m of s.chat) {
      if (m.id <= this.lastChatId) continue;
      this.lastChatId = m.id;
      const d = document.createElement('div');
      d.className = 'm';
      d.innerHTML = `<b class="${m.from}">${m.from === 'cook' ? '🍳 Cook' : '🧾 Server'}:</b> ${esc(m.text)}`;
      log.appendChild(d);
      if (m.from !== role) added = true;
    }
    if (added) { log.scrollTop = log.scrollHeight; const sc = $('#staff-chat'); sc.classList.remove('flash'); void sc.offsetWidth; sc.classList.add('flash'); }
    else if (log.dataset.n !== String(s.chat.length)) log.scrollTop = log.scrollHeight;
    log.dataset.n = String(s.chat.length);
  }

  renderNpc(s, role) {
    const el = $('#npc');
    const c = role === 'server' && s.npc.cid ? custById(s, s.npc.cid) : null;
    if (!c) { el.classList.add('hidden'); this.npcSig = ''; return; }
    el.classList.remove('hidden');
    const canRing = c.st === 'line' && s.orderLine[0] === c.id;
    const sig = JSON.stringify([c.id, s.npc.lines.length, canRing, c.heard, !!s.noise.length, (s.npc.choices || []).map((o) => o.id)]);
    if (sig === this.npcSig) return;
    this.npcSig = sig;
    $('.npc-name', el).textContent = (c.kind === 'inspector' ? '📋 ' : '💬 ') + c.name + (c.table ? ` · table ${c.table}` : '');
    const log = $('.npc-log', el);
    log.innerHTML = s.npc.lines.map((l) => `<div class="l ${l.who === 'You' ? 'you' : 'them'} ${/CAN'T HEAR|WHAT\?!|SPEAK UP|HUH|SAY AGAIN/.test(l.text) ? 'loud' : ''}">${l.who === 'You' ? '' : `<b>${esc(l.who)}:</b> `}${esc(l.text)}</div>`).join('');
    log.scrollTop = log.scrollHeight;
    const q = $('.npc-quick', el);
    q.innerHTML = '';
    const btn = (label, fn, primary = false, disabled = false) => { const b = document.createElement('button'); b.textContent = label; b.className = primary ? 'primary' : ''; b.disabled = disabled; b.addEventListener('click', fn); q.appendChild(b); };
    if (canRing) btn('🧾 Take their order', () => this.onAction({ type: 'openPOS', cid: c.id }), true);
    // replies depend on what's going on with this customer (see incidents.js → npcChoices)
    for (const o of s.npc.choices || []) btn(o.label, () => this.onAction({ type: 'npcChoice', cid: c.id, choice: o.id }), false);
  }

  // ------------------------------------------------------------------
  showSummary(sum, { isHost, solo, shiftNo }) {
    const el = $('#summary');
    el.classList.remove('hidden');
    const stars = sum.net >= 160 ? 3 : sum.net >= 80 ? 2 : sum.net >= 25 ? 1 : 0;
    $('#sum-title').textContent = `Shift ${shiftNo} over!`;
    $('#sum-body').innerHTML = `
      <div class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <div class="sum-stats"><span>🍽️ ${sum.served} served</span><span>😤 ${sum.walkouts} walkouts</span><span>🤢 ${sum.sick} sick</span></div>
      <div class="sum-grid">
        <div>Sales</div><div class="v">${money(sum.sales)}</div>
        <div>Tips</div><div class="v">${money(sum.tips)}</div>
        ${sum.damages.map((d) => `<div>${esc(d.label)}${d.count > 1 ? ` ×${d.count}` : ''}</div><div class="v neg">−${money(d.amount)}</div>`).join('')}
        <div class="tot">Take-home</div><div class="v tot">${money(sum.net)}</div>
      </div>
      ${sum.lost > 0 ? `<div style="font-size:14px">Sales lost to walkouts: ${money(sum.lost)}</div>` : ''}`;
    $('#btn-next').disabled = !(isHost || solo);
    $('#sum-status').textContent = isHost || solo ? '' : 'Waiting for the host to start the next shift…';
  }
  hideSummary() { $('#summary').classList.add('hidden'); }
}

function grimeBlobs(rid, g) {
  let out = '';
  const n = 3 + Math.floor(g * 8);
  for (let i = 0; i < n; i++) {
    const h = (k) => { let x = Math.sin(rid * 91.7 + i * 13.3 + k * 7.1) * 43758.5453; return x - Math.floor(x); };
    out += `<ellipse cx="${h(1) * 100}" cy="${h(2) * 100}" rx="${8 + h(3) * 22 * g}" ry="${5 + h(4) * 14 * g}" fill="rgba(90,60,25,${0.15 + g * 0.35})"/>`;
  }
  return out;
}
