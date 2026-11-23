const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

// تخزين الغرف: كل غرفة تحتوي على الأجهزة المتصلة بها
const rooms = new Map();

function broadcastDeviceList(roomCode) {
  if (!rooms.has(roomCode)) return;
  const targets = [];
  for (const client of rooms.get(roomCode)) {
    if (client.role === 'target' && client.readyState === WebSocket.OPEN) {
      targets.push({ id: client.deviceId, name: client.deviceName });
    }
  }
  const payload = JSON.stringify({ type: 'device_list', devices: targets });
  for (const client of rooms.get(roomCode)) {
    if (client.role === 'controller' && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (msg.type === 'join' && msg.code) {
        ws.roomCode = msg.code;
        ws.role = msg.role || 'target';
        ws.deviceId = msg.deviceId || Math.random().toString(36).substring(2, 9);
        ws.deviceName = msg.deviceName || 'Android Device';

        if (!rooms.has(ws.roomCode)) rooms.set(ws.roomCode, new Set());
        rooms.get(ws.roomCode).add(ws);

        ws.send(JSON.stringify({ type: 'joined', id: ws.deviceId }));
        broadcastDeviceList(ws.roomCode);
        return;
      }

      // توجيه الأمر لجهاز محدد (targetId) أو لكل الأجهزة في الغرفة
      if (ws.roomCode && rooms.has(ws.roomCode)) {
        for (const client of rooms.get(ws.roomCode)) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            if (!msg.targetId || client.deviceId === msg.targetId || client.role === 'controller') {
              client.send(data.toString());
            }
          }
        }
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    if (ws.roomCode && rooms.has(ws.roomCode)) {
      rooms.get(ws.roomCode).delete(ws);
      broadcastDeviceList(ws.roomCode);
      if (rooms.get(ws.roomCode).size === 0) rooms.delete(ws.roomCode);
    }
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

console.log('Multi-Device Relay Server running on port ' + port);
