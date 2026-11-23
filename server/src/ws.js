import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { validateClientMessage, PROTOCOL_VERSION } from './protocol.js';

const MAX_BUFFERED_BYTES = 64 * 1024;
const RATE_LIMIT_MAX = 15; 

function safeSend(socket, payloadObj, { critical = false } = {}) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (!critical && socket.bufferedAmount > MAX_BUFFERED_BYTES) {
    return;
  }
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...payloadObj }));
}

function broadcastRoom(room, payloadObj, options = {}) {
  for (const player of room.players.values()) {
    safeSend(player.socket, payloadObj, options);
  }
}

export function setupWebSocketServer(httpServer, roomManager, config) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: config.maxPayloadBytes
  });

  const heartbeatInterval = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.missedPongs >= 2) {
        socket.terminate();
        continue;
      }
      socket.missedPongs = (socket.missedPongs || 0) + 1;
      socket.ping();
    }
  }, 15_000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (socket) => {
    socket.missedPongs = 0;
    socket.msgCount = 0;
    socket.rateWindowStart = Date.now();
    socket.session = null; 

    socket.on('error', (err) => {
      console.error('WebSocket client error:', err.message);
    });

    socket.on('pong', () => {
      socket.missedPongs = 0;
    });

    const joinTimer = setTimeout(() => {
      if (!socket.session && socket.readyState === WebSocket.OPEN) {
        socket.close(4001, 'Join timeout (5s)');
      }
    }, 5000);

    socket.on('message', (rawData) => {
      const now = Date.now();
      if (now - socket.rateWindowStart >= 1000) {
        socket.rateWindowStart = now;
        socket.msgCount = 0;
      }
      socket.msgCount++;
      if (socket.msgCount > RATE_LIMIT_MAX) {
        socket.close(1008, 'Rate limit exceeded');
        return;
      }

      const parsed = validateClientMessage(rawData.toString('utf8'));
      if (!parsed.ok) {
        socket.close(parsed.code, parsed.reason);
        return;
      }

      const msg = parsed.msg;

      if (msg.type === 'join') {
        if (socket.session) {
          socket.close(1003, 'Already joined');
          return;
        }
        const room = roomManager.get(msg.room);
        if (!room) {
          socket.close(4004, 'Room not found');
          return;
        }

        const player = {
          id: randomUUID().slice(0, 8),
          name: msg.name,
          socket
        };

        if (!room.join(player)) {
          socket.close(4005, 'Room is full');
          return;
        }

        clearTimeout(joinTimer);
        socket.session = { player, room };

        safeSend(
          socket,
          {
            type: 'welcome',
            playerId: player.id,
            room: room.toSummary(),
            players: room.getRoster()
          },
          { critical: true }
        );

        broadcastRoom(
          room,
          {
            type: 'roster',
            players: room.getRoster(),
            systemText: `${player.name} joined the room`
          },
          { critical: true }
        );
        return;
      }

      if (msg.type === 'chat') {
        if (!socket.session) {
          socket.close(1003, 'Must join room before chatting');
          return;
        }
        const { player, room } = socket.session;
        room.chat(player, msg.text);

        broadcastRoom(room, {
          type: 'chat',
          from: player.name,
          playerId: player.id,
          text: msg.text,
          t: Date.now()
        });
      }
    });

    socket.on('close', () => {
      clearTimeout(joinTimer);
      if (socket.session) {
        const { player, room } = socket.session;
        room.leave(player.id);
        broadcastRoom(
          room,
          {
            type: 'roster',
            players: room.getRoster(),
            systemText: `${player.name} left the room`
          },
          { critical: true }
        );
        socket.session = null;
      }
    });
  });

  return wss;
} 