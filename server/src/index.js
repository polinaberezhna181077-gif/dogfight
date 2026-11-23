import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { RoomManager } from './rooms.js';
import { attachRoomLogger } from './log/matchlog.js';
import { streamReplayToResponse } from './log/replay.js';
import { setupWebSocketServer } from './ws.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml'
};

const roomLoggers = new Map();

const roomManager = new RoomManager({
  maxRooms: config.maxRooms,
  maxPlayersPerRoom: config.maxPlayersPerRoom,
  onRoomCreated: (room) => {
    attachRoomLogger(room, config.logDir)
      .then((logger) => {
        roomLoggers.set(room.id, logger);
        room.once('empty', () => roomLoggers.delete(room.id));
      })
      .catch((err) => console.error('Failed to attach room logger:', err));
  }
});

function readJsonBody(req, maxBytes = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.includes('..')) {
    sendJson(res, 403, { error: 'Forbidden path' });
    return;
  }

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      uptimeSec: Math.round(process.uptime()),
      rssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
      rooms: roomManager.rooms.size
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/stats') {
    sendJson(res, 200, {
      uptimeSec: Math.round(process.uptime()),
      rssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
      matches: roomManager.getAllStats()
    });
    return;
  }
  if (req.method === 'GET' && (pathname === '/api/rooms' || pathname === '/api/rooms.json')) {
    sendJson(res, 200, roomManager.list());
    return;
  }

  if (req.method === 'POST' && pathname === '/api/rooms') {
    try {
      const body = await readJsonBody(req, 4096);
      if (!body.name || typeof body.name !== 'string' || body.name.trim().length > 32) {
        sendJson(res, 400, { error: 'Room name is required (max 32 chars)' });
        return;
      }
      const room = roomManager.createRoom({
        name: body.name.trim(),
        maxPlayers: body.maxPlayers || 4,
        arena: body.arena
      });
      sendJson(res, 201, room.toSummary());
    } catch (err) {
      sendJson(res, err.statusCode || 400, { error: err.message });
    }
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/replays/')) {
    const replayId = pathname.slice('/api/replays/'.length);
    await streamReplayToResponse(config.logDir, replayId, res);
    return;
  }

  if (req.method === 'GET') {
    const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(config.clientDistDir, relPath);

    if (!filePath.startsWith(config.clientDistDir)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }

    if (existsSync(filePath)) {
      const info = await stat(filePath);
      if (info.isFile()) {
        const ext = path.extname(filePath);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Content-Length': info.size
        });
        createReadStream(filePath).pipe(res);
        return;
      }
    }
  }

  sendJson(res, 404, { error: 'Not Found' });
});

const wss = setupWebSocketServer(server, roomManager, config);

server.listen(config.port, config.host, () => {
  console.log(`Dogfight server listening on http://${config.host}:${config.port}`);
  console.log(`Match logs directory: ${config.logDir}`);
});

async function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close();
  for (const client of wss.clients) {
    client.close(1001, 'Server shutting down');
  }
  await Promise.allSettled(Array.from(roomLoggers.values()).map((l) => l.close()));
  console.log('Logs flushed and sockets closed. Exiting with code 0.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM')); 