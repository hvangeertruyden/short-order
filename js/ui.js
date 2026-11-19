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
  frame(s, role, { menu, far, solo, myRecView }) {
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

    this.renderMenu(menu, far);
    this.renderReceipts(s, role, menu, myRecView);
    this.renderToasts(s, role);
    this.renderChat(s, role);
    this.renderNpc(s, role);
  }

  renderMenu(menu, far) {
    const el = $('#menu');
    if (!menu) { el.classList.add('hidden'); this.menuSig = ''; this.currentActions = []; return; }
    const sig = JSON.stringify([menu.key, menu.title, menu.info, menu.actions.map((a) => [a.label, a.disabled, a.why]), far]);
    if (sig === this.menuSig) return;
    this.menuSig = sig;
    el.classList.remove('hidden');
    el.classList.toggle('far', far);
    $('.m-title', el).textContent = menu.title;
    $('.m-info', el).innerHTML = menu.info.map((t) => `<div>${esc(t)}</div>`).join('');
    const box = $('.m-actions', el);
    box.innerHTML = '';
    this.currentActions = far ? [] : menu.actions;
    menu.actions.forEach((a, i) => {
      const b = document.createElement('button');
      b.disabled = a.disabled || far || !a.a;
      b.innerHTML = `<span class="n">${i + 1}</span>${esc(a.label)}`;
      b.addEventListener('click', (e) => { e.stopPropagation(); if (!b.disabled) this.onAction(a.a); });
      box.appendChild(b);
    });
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
    if (canRing) {
      btn(c.heard ? '🧾 Ring it up' : '📝 Take order', () => this.onAction(c.heard ? { type: 'ringUp', cid: c.id } : { type: 'takeOrder', cid: c.id }), true);
    }
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
