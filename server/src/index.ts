import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { RoomManager, type Room } from './rooms.js';
import { MatchLogger } from './log/matchlog.js';
import { setupWebSocketServer } from './ws.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '../../client/dist');
const config = loadConfig();

const logger = new MatchLogger(config.logDir);

const CreateRoomBodySchema = z.object({
  name: z.string().trim().min(1).max(32),
  maxPlayers: z.number().int().min(2).max(16).optional()
});

function attachRoomLogging(room: Room): void {
  room.on('event', (evt) => logger.write(evt));
  room.on('empty', (evt) => logger.write({ t: Date.now(), type: 'room_empty', ...evt }));
}

const roomManager = new RoomManager({
  maxRooms: config.maxRooms,
  maxPlayersPerRoom: config.maxPlayersPerRoom,
  onRoomCreated: attachRoomLogging
});

for (const room of roomManager.rooms.values()) {
  attachRoomLogging(room);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml'
};

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readJsonBody(req: IncomingMessage, maxBytes = 8192): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolvePromise(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { ok: true, uptimeSec: Math.round(process.uptime()) });
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

  if (req.method === 'GET' && pathname === '/api/rooms') {
    sendJson(res, 200, { rooms: roomManager.list() });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/rooms') {
    try {
      const rawBody = await readJsonBody(req);
      const parsed = CreateRoomBodySchema.safeParse(rawBody);
      if (!parsed.success) {
        sendJson(res, 400, { error: 'Invalid room payload' });
        return;
      }
      const room = roomManager.createRoom({
        name: parsed.data.name,
        maxPlayers: parsed.data.maxPlayers
      });
      sendJson(res, 201, { room: room.toSummary() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bad request';
      sendJson(res, 400, { error: msg });
    }
    return;
  }

  if (req.method === 'GET') {
    let relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    relPath = normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = join(PUBLIC_DIR, relPath);

    if (filePath.startsWith(PUBLIC_DIR) && existsSync(filePath) && statSync(filePath).isFile()) {
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      createReadStream(filePath).pipe(res);
      return;
    }
  }

  sendJson(res, 404, { error: 'Not found' });
});

const wss = setupWebSocketServer(server, roomManager, config);

server.listen(config.port, config.host, () => {
  console.log(`Dogfight server listening on http://${config.host}:${config.port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}, shutting down...`);
  for (const client of wss.clients) {
    client.close(1001, 'Server shutting down');
  }
  wss.close();
  server.close();
  await logger.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));