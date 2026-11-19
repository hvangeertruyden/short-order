// Peer-to-peer networking via PeerJS (WebRTC). The PeerJS public server is
// only used to introduce the two browsers; game data then flows directly.
// Host = authority (runs the sim). Guest sends inputs/actions, gets state.
const PREFIX = 'shortorder-v1-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const makeCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

export class Net {
  constructor({ onConnect, onData, onClose, onError }) {
    this.peer = null; this.conn = null; this.code = null; this.isHost = false;
    Object.assign(this, { onConnect, onData, onClose, onError });
  }

  get connected() { return !!this.conn && this.conn.open; }

  host(onCode, tries = 0) {
    if (typeof Peer === 'undefined') { this.onError?.('PeerJS did not load (are you offline?)'); return; }
    this.isHost = true;
    this.code = makeCode();
    const peer = new Peer(PREFIX + this.code);
    this.peer = peer;
    peer.on('open', () => onCode(this.code));
    peer.on('connection', (conn) => {
      if (this.conn && this.conn.open) { conn.on('open', () => { conn.send({ k: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
      this.bind(conn);
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && tries < 5) { peer.destroy(); this.host(onCode, tries + 1); return; }
      this.onError?.(friendly(err));
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });
  }

  join(code) {
    if (typeof Peer === 'undefined') { this.onError?.('PeerJS did not load (are you offline?)'); return; }
    this.isHost = false;
    this.code = code.toUpperCase().trim();
    const peer = new Peer();
    this.peer = peer;
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + this.code, { reliable: true });
      this.bind(conn);
      setTimeout(() => { if (!this.conn?.open) this.onError?.(`Couldn't reach room ${this.code}. Check the code and that the host is still on the lobby screen.`); }, 9000);
    });
    peer.on('error', (err) => this.onError?.(friendly(err)));
  }

  bind(conn) {
    this.conn = conn;
    conn.on('open', () => this.onConnect?.());
    conn.on('data', (d) => this.onData?.(d));
    conn.on('close', () => { if (this.conn === conn) { this.conn = null; this.onClose?.(); } });
    conn.on('error', () => {});
  }

  send(obj) { if (this.conn?.open) { try { this.conn.send(obj); } catch {} } }

  destroy() { try { this.conn?.close(); this.peer?.destroy(); } catch {} this.conn = null; this.peer = null; }
}

function friendly(err) {
  switch (err?.type) {
    case 'peer-unavailable': return 'No room with that code. Double-check it with your friend.';
    case 'network': case 'server-error': case 'socket-error': return 'Could not reach the matchmaking server. Check your internet connection.';
    case 'browser-incompatible': return 'This browser does not support WebRTC.';
    default: return 'Connection problem: ' + (err?.message || err?.type || 'unknown');
  }
}
