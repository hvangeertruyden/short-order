// Third-person controls: WASD/arrows move across the screen; you face where you walk.
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

  // me = {x, z, yaw}; mutated in place. Third person: WASD moves along the screen
  // (W = away from the camera = north), and you turn to face where you're going.
  update(dt, me, frozen) {
    this.yawDelta = 0;
    if (frozen) return;
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (!x && !z) return;
    const len = Math.hypot(x, z);
    x /= len; z /= len;
    me.x += x * SPEED * dt; resolve(me);
    me.z += z * SPEED * dt; resolve(me);
    // face the direction of travel (smoothly, the short way round)
    const want = Math.atan2(-x, -z);
    let d = want - me.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    me.yaw += d * Math.min(1, dt * 14);
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
