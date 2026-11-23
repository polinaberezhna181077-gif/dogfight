import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { randomUUID } from 'node:crypto';
import {
  PROTOCOL_VERSION,
  assertNever,
  decodeInputBinary,
  parseClientMessage
} from '@dogfight/shared';
import type { ServerConfig } from './config.js';
import type { Room, RoomManager, RoomPlayer } from './rooms.js';

const MAX_BUFFERED_BYTES = 64 * 1024;
const RATE_LIMIT_MAX = 60;

export interface NetSimState {
  delayMs: number;
  jitterMs: number;
  dropRate: number;
  protocol: 'binary' | 'json';
}

export const netSim: NetSimState = {
  delayMs: 0,
  jitterMs: 0,
  dropRate: 0,
  protocol: 'binary'
};

interface ClientSocketState {
  missedPongs: number;
  msgCount: number;
  rateWindowStart: number;
  session: { player: RoomPlayer; room: Room } | null;
}

const socketStates = new WeakMap<WebSocket, ClientSocketState>();

function withNetSim(fn: () => void): void {
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

function safeSendJson(
  socket: WebSocket,
  payloadObj: Record<string, unknown>,
  options: { critical?: boolean } = {}
): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (!options.critical && socket.bufferedAmount > MAX_BUFFERED_BYTES) return;
  socket.send(JSON.stringify({ v: PROTOCOL_VERSION, ...payloadObj }));
}

function safeSendBinary(socket: WebSocket, arrayBuffer: ArrayBuffer): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > MAX_BUFFERED_BYTES) return;
  socket.send(Buffer.from(arrayBuffer), { binary: true });
}

function broadcastRoom(
  room: Room,
  payloadObj: Record<string, unknown>,
  options: { critical?: boolean } = {}
): void {
  for (const player of room.players.values()) {
    safeSendJson(player.socket, payloadObj, options);
  }
}

function rawDataToUint8Array(raw: RawData): Uint8Array {
  if (Buffer.isBuffer(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  if (raw instanceof ArrayBuffer) {
    return new Uint8Array(raw);
  }
  const merged = Buffer.concat(raw);
  return new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength);
}

export function setupWebSocketServer(
  httpServer: HttpServer,
  roomManager: RoomManager,
  config: ServerConfig
): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: config.maxPayloadBytes
  });

  function attachRoomSnapshotForwarder(room: Room): void {
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

  for (const room of roomManager.rooms.values()) {
    attachRoomSnapshotForwarder(room);
  }
  const origCreate = roomManager.createRoom.bind(roomManager);
  roomManager.createRoom = (opts) => {
    const room = origCreate(opts);
    attachRoomSnapshotForwarder(room);
    return room;
  };

  const heartbeatInterval = setInterval(() => {
    for (const socket of wss.clients) {
      const st = socketStates.get(socket);
      if (!st) continue;
      if (st.missedPongs >= 2) {
        socket.terminate();
        continue;
      }
      st.missedPongs++;
      socket.ping();
    }
  }, 15_000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '/ws', 'http://localhost');
    const clientProto: 'binary' | 'json' =
      url.searchParams.get('proto') === 'json' ? 'json' : 'binary';

    const state: ClientSocketState = {
      missedPongs: 0,
      msgCount: 0,
      rateWindowStart: Date.now(),
      session: null
    };
    socketStates.set(socket, state);

    socket.on('error', (err: Error) => {
      console.error('WebSocket client error:', err.message);
    });

    socket.on('pong', () => {
      state.missedPongs = 0;
    });

    const joinTimer = setTimeout(() => {
      if (!state.session && socket.readyState === WebSocket.OPEN) {
        socket.close(4001, 'Join timeout (5s)');
      }
    }, 5000);

    socket.on('message', (rawData: RawData, isBinary: boolean) => {
      const now = Date.now();
      if (now - state.rateWindowStart >= 1000) {
        state.rateWindowStart = now;
        state.msgCount = 0;
      }
      state.msgCount++;
      if (state.msgCount > RATE_LIMIT_MAX) {
        socket.close(1008, 'Rate limit exceeded');
        return;
      }

      if (isBinary) {
        if (!state.session) return;
        try {
          const inp = decodeInputBinary(rawDataToUint8Array(rawData));
          const { player, room } = state.session;
          withNetSim(() => room.match.enqueueInput(player.id, inp));
        } catch (err: unknown) {
          const reason = err instanceof Error ? err.message : 'Invalid binary input';
          console.warn('Binary decode failed:', reason);
          socket.close(1007, reason);
        }
        return;
      }

      const parsed = parseClientMessage(rawData.toString('utf8'));
      if (!parsed.ok) {
        console.warn('Invalid client JSON message:', parsed.reason);
        socket.close(parsed.code, parsed.reason);
        return;
      }

      const msg = parsed.value;
      switch (msg.type) {
        case 'ping': {
          withNetSim(() => safeSendJson(socket, { type: 'pong', t: msg.t }, { critical: true }));
          return;
        }
        case 'input': {
          if (!state.session) return;
          const { player, room } = state.session;
          withNetSim(() => room.match.enqueueInput(player.id, msg));
          return;
        }
        case 'netcfg': {
          if (msg.delayMs !== undefined) netSim.delayMs = msg.delayMs;
          if (msg.jitterMs !== undefined) netSim.jitterMs = msg.jitterMs;
          if (msg.dropRate !== undefined) netSim.dropRate = msg.dropRate;
          if (msg.protocol !== undefined) {
            netSim.protocol = msg.protocol;
            if (state.session) state.session.player.protocol = msg.protocol;
          }
          safeSendJson(socket, { type: 'netcfg', ...netSim }, { critical: true });
          return;
        }
        case 'join': {
          if (state.session) {
            socket.close(1003, 'Already joined');
            return;
          }
          const room = roomManager.get(msg.room);
          if (!room) {
            socket.close(4004, 'Room not found');
            return;
          }

          const player: RoomPlayer = {
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
          state.session = { player, room };

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
        case 'chat': {
          if (!state.session) {
            socket.close(1003, 'Must join room before chatting');
            return;
          }
          const { player, room } = state.session;
          room.chat(player, msg.text);

          broadcastRoom(room, {
            type: 'chat',
            from: player.name,
            playerId: player.id,
            text: msg.text,
            t: Date.now()
          });
          return;
        }
        default: {
          assertNever(msg);
        }
      }
    });

    socket.on('close', () => {
      clearTimeout(joinTimer);
      if (state.session) {
        const { player, room } = state.session;
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
        state.session = null;
      }
    });
  });

  return wss;
}