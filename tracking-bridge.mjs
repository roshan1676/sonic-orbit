import dgram from 'node:dgram';
import { eulerQuaternion } from './public/orientation.js';

// OpenTrack UDP: six little-endian doubles, XYZ centimeters then yaw/pitch/roll degrees.
// Translation is intentionally ignored. Only orientation is consumed.
export function decodeTrackingPacket(packet) {
  if (packet.length !== 48) return null;
  const values = Array.from({ length: 6 }, (_, i) => packet.readDoubleLE(i * 8));
  if (!values.every(Number.isFinite) || values.slice(3).some(v => Math.abs(v) > 36000)) return null;
  const [yaw, pitch, roll] = values.slice(3).map(degrees => degrees * Math.PI / 180);
  return { yaw, pitch, roll, quaternion: eulerQuaternion(yaw, pitch, roll) };
}

export class TrackingBridge {
  constructor(port = 4243) { this.port = port; this.clients = new Set(); this.latest = null; this.sequence = 0; }
  async start() {
    if (this.socket) return this.status();
    const socket = dgram.createSocket('udp4'); this.socket = socket;
    try {
      await new Promise((resolve, reject) => { socket.once('error', reject); socket.bind(this.port, '127.0.0.1', () => { socket.removeListener('error', reject); resolve(); }); });
    } catch (error) { this.socket = null; try { socket.close(); } catch {} throw new Error(error.code === 'EADDRINUSE' ? `UDP port ${this.port} is busy. Close the other receiver or change HEADTRACK_PORT.` : error.message); }
    this.boundPort = socket.address().port;
    socket.on('message', (packet, remote) => {
      if (remote.address !== '127.0.0.1') return;
      const pose = decodeTrackingPacket(packet); if (pose) this.latest = { ...pose, receivedAt: Date.now(), sequence: ++this.sequence };
    });
    socket.on('error', () => { this.stop(); });
    this.timer = setInterval(() => {
      const now = Date.now();
      if (this.latest?.sequence === this.sentSequence && now - (this.lastSent || 0) < 750) return;
      this.sentSequence = this.latest?.sequence; this.lastSent = now;
      const message = `data: ${JSON.stringify({ ...this.status(), pose: this.latest })}\n\n`;
      for (const client of this.clients) {
        if (!client.writableNeedDrain && !client.destroyed) client.write(message);
      }
    }, 16);
    this.timer.unref(); return this.status();
  }
  status() { return { enabled: Boolean(this.socket), port: this.boundPort || this.port, ageMs: this.latest ? Date.now() - this.latest.receivedAt : null }; }
  subscribe(req, res) {
    if (!this.socket) { res.writeHead(409); res.end('Start the local tracker input first.'); return; }
    if (this.clients.size >= 4) { res.writeHead(429); res.end('Too many tracker viewers.'); return; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`data: ${JSON.stringify({ ...this.status(), pose: this.latest })}\n\n`); this.clients.add(res);
    req.on('close', () => { this.clients.delete(res); if (this.clients.size === 0) { this.idleTimer = setTimeout(() => { if (!this.clients.size) this.stop(); }, 3000); this.idleTimer.unref(); } });
  }
  stop() {
    clearInterval(this.timer); clearTimeout(this.idleTimer);
    const socket = this.socket; this.socket = null; this.latest = null; this.sentSequence = null;
    try { socket?.close(); } catch {}
    for (const client of this.clients) client.end(); this.clients.clear();
  }
}
