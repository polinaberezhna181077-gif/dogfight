import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { decodeInputBinary } from '@dogfight/shared';
import { validateClientMessage, PROTOCOL_VERSION } from './protocol.js';

const MAX_BUFFERED_BYTES = 64 * 1024;
const RATE_LIMIT_MAX = 60;

export const netSim = {
  delayMs: 0,
  jitterMs: 0,
  dropRate: 0,
  protocol: 'binary'
};

function withNetSim(fn) {
  if (netSim.dropRate > 0 && Math.random() < netSim.dropRate) {
    return;
  }
  const jitter = netSim.jitterMs > 0 ? (Math.random() * 2 - 1) * netSim.jitterMs : 0;
  const totalDelay = Math.max(0, netSim.delayMs + jitter);
  if (totalDelay <= 0) {
    fn();
  } else {
    setTimeout(fn, totalDelay);
  }
}

function safeSendJson(socket, payloadObj, { critical = false } = {}) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (!critical && socket.bufferedAmount > MAX_BUFFERED_BYTES) return;
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...payloadObj }));
}

function safeSendBinary(socket, arrayBuffer) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > MAX_BUFFERED_BYTES) return;
  socket.send(Buffer.from(arrayBuffer), { binary: true });
}

function broadcastRoom(room, payloadObj, options = {}) {
  for (const player of room.players.values()) {
    safeSendJson(player.socket, payloadObj, options);
  }
}

export function setupWebSocketServer(httpServer, roomManager, config) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: config.maxPayloadBytes
  });

  for (const room of roomManager.rooms.values()) {
    attachRoomSnapshotForwarder(room);
  }
  const origCreate = roomManager.createRoom.bind(roomManager);
  roomManager.createRoom = (opts) => {
    const room = origCreate(opts);
    attachRoomSnapshotForwarder(room);
    return room;
  };

  function attachRoomSnapshotForwarder(room) {
    room.on('snapshot', ({ playerId, snapObj, toBinary }) => {
      const player = room.players.get(playerId);
      if (!player) return;
      const mode = player.protocol || netSim.protocol;
      if (mode === 'json') {
        withNetSim(() => safeSendJson(player.socket, snapObj));
      } else {
        const bin = toBinary();
        withNetSim(() => safeSendBinary(player.socket, bin));
      }
    });
  }

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

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url, 'http://localhost');
    const clientProto = url.searchParams.get('proto') === 'json' ? 'json' : 'binary';

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

    socket.on('message', (rawData, isBinary) => {
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

      if (isBinary) {
        if (!socket.session) return;
        try {
          const inp = decodeInputBinary(rawData);
          const { player, room } = socket.session;
          withNetSim(() => room.match.enqueueInput(player.id, inp));
        } catch (err) {
          socket.close(1007, err.message);
        }
        return;
      }

      const parsed = validateClientMessage(rawData.toString('utf8'));
      if (!parsed.ok) {
        socket.close(parsed.code, parsed.reason);
        return;
      }

      const msg = parsed.msg;

      if (msg.type === 'ping') {
        withNetSim(() => safeSendJson(socket, { type: 'pong', t: msg.t }, { critical: true }));
        return;
      }

      if (msg.type === 'input') {
        if (!socket.session) return;
        const { player, room } = socket.session;
        withNetSim(() => room.match.enqueueInput(player.id, msg));
        return;
      }

      if (msg.type === 'netcfg') {
        if (typeof msg.delayMs === 'number') netSim.delayMs = Math.max(0, Math.min(2000, msg.delayMs));
        if (typeof msg.jitterMs === 'number') netSim.jitterMs = Math.max(0, Math.min(1000, msg.jitterMs));
        if (typeof msg.dropRate === 'number') netSim.dropRate = Math.max(0, Math.min(0.9, msg.dropRate));
        if (msg.protocol === 'json' || msg.protocol === 'binary') {
          netSim.protocol = msg.protocol;
          if (socket.session) socket.session.player.protocol = msg.protocol;
        }
        safeSendJson(socket, { type: 'netcfg', ...netSim }, { critical: true });
        return;
      }

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
          protocol: clientProto,
          socket
        };

        if (!room.join(player)) {
          socket.close(4005, 'Room is full');
          return;
        }

        clearTimeout(joinTimer);
        socket.session = { player, room };

        safeSendJson(
          socket,
          {
            type: 'welcome',
            playerId: player.id,
            ownerId: player.ownerId,
            seed: room.match.seed,
            room: room.toSummary(),
            players: room.getRoster(),
            netSim
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