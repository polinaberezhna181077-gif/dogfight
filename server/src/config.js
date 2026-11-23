import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..', '..');

function parsePort(raw, fallback) {
  const port = Number(raw ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT in environment: "${raw}"`);
  }
  return port;
}

export const config = Object.freeze({
  port: parsePort(process.env.PORT, 3000),
  host: process.env.HOST || '127.0.0.1',
  logDir: path.resolve(rootDir, process.env.LOG_DIR || 'server/logs'),
  clientDistDir: path.resolve(rootDir, 'client/dist'),
  maxRooms: Number(process.env.MAX_ROOMS || 20),
  maxPlayersPerRoom: Number(process.env.MAX_PLAYERS_PER_ROOM || 6),
  maxPayloadBytes: 4096
});