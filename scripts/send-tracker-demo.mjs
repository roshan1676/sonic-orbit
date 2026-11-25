import dgram from 'node:dgram';
const port = Number(process.env.HEADTRACK_PORT || 4243), sender = dgram.createSocket('udp4');
console.log(`SYNTHETIC diagnostic, not measured head motion. Sending a full turn to 127.0.0.1:${port} for 12 seconds. Enable External orientation in the player first.`);
const started = performance.now();
const timer = setInterval(() => {
  const elapsed = (performance.now()-started)/1000;
  if (elapsed >= 12) { clearInterval(timer); sender.close(); console.log('Synthetic diagnostic finished.'); return; }
  const yaw = elapsed < 2 ? 0 : Math.min(360, (elapsed-2)*36);
  const packet = Buffer.alloc(48); packet.writeDoubleLE(yaw,24);
  sender.send(packet,port,'127.0.0.1');
},16);
