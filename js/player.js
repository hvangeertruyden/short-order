// First-person controls: WASD, drag-to-look, Q/E turning, free cursor.
import { COLLIDERS } from './world.js';

const RADIUS = 0.28;
const SPEED = 3.5;

export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pitch = -0.15;
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0, inside: false };
    this.down = null;
    this.onClick = null;
    this.shake = 0;

    window.addEventListener('keydown', (e) => { if (!isTyping()) this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY, dragging: false };
      canvas.setPointerCapture(e.pointerId);
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    });
    canvas.addEventListener('pointermove', (e) => {
      this.setMouse(e);
      if (!this.down) return;
      const dx = e.clientX - this.down.x, dy = e.clientY - this.down.y;
      if (!this.down.dragging && Math.hypot(dx, dy) > 5) this.down.dragging = true;
      if (this.down.dragging) {
        this.yawDelta = (this.yawDelta || 0) - e.movementX * 0.0045;
        this.pitch = Math.max(-1.0, Math.min(0.55, this.pitch - e.movementY * 0.0035));
        canvas.style.cursor = 'grabbing';
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (this.down && !this.down.dragging && e.button === 0) this.onClick?.();
      this.down = null; canvas.style.cursor = 'default';
    });
    canvas.addEventListener('pointerleave', () => { this.mouse.inside = false; });
  }

  setMouse(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    this.mouse.nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.mouse.ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    this.mouse.inside = true;
  }

  // me = {x, z, yaw}; mutated in place
  update(dt, me, frozen) {
    me.yaw += this.yawDelta || 0; this.yawDelta = 0;
    const turn = (this.keys.has('KeyQ') || this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('KeyE') || this.keys.has('ArrowRight') ? 1 : 0);
    me.yaw += turn * 2.4 * dt;
    if (frozen) return;
    let f = 0, s = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= 1;
    if (this.keys.has('KeyD')) s += 1;
    if (this.keys.has('KeyA')) s -= 1;
    if (!f && !s) return;
    const len = Math.hypot(f, s);
    f /= len; s /= len;
    const sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
    const vx = (-sin * f + cos * s) * SPEED * dt;
    const vz = (-cos * f - sin * s) * SPEED * dt;
    me.x += vx; resolve(me);
    me.z += vz; resolve(me);
  }
}

function resolve(p) {
  for (let it = 0; it < 2; it++) {
    for (const b of COLLIDERS) {
      const cx = Math.max(b.x0, Math.min(p.x, b.x1));
      const cz = Math.max(b.z0, Math.min(p.z, b.z1));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= RADIUS * RADIUS) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * RADIUS; p.z = cz + (dz / d) * RADIUS; }
      else {
        // inside the box: push out the shortest way
        const opts = [[p.x - b.x0, -1, 0], [b.x1 - p.x, 1, 0], [p.z - b.z0, 0, -1], [b.z1 - p.z, 0, 1]].sort((a, c) => a[0] - c[0]);
        const [pen, sx, sz] = opts[0];
        p.x += sx * (pen + RADIUS); p.z += sz * (pen + RADIUS);
      }
    }
  }
  p.x = Math.max(-7.7, Math.min(7.7, p.x));
  p.z = Math.max(-6.7, Math.min(8.7, p.z));
}

export function isTyping() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
}
