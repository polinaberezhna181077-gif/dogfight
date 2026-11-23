import { z } from 'zod';

const ServerConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  MAX_ROOMS: z.coerce.number().int().min(1).max(100).default(20),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(2).max(16).default(6),
  MAX_PAYLOAD_BYTES: z.coerce.number().int().min(256).max(65536).default(4096),
  LOG_DIR: z.string().min(1).default('./logs')
});

export type ServerConfig = {
  readonly port: number;
  readonly host: string;
  readonly maxRooms: number;
  readonly maxPlayersPerRoom: number;
  readonly maxPayloadBytes: number;
  readonly logDir: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = ServerConfigSchema.parse(env);
  return {
    port: parsed.PORT,
    host: parsed.HOST,
    maxRooms: parsed.MAX_ROOMS,
    maxPlayersPerRoom: parsed.MAX_PLAYERS_PER_ROOM,
    maxPayloadBytes: parsed.MAX_PAYLOAD_BYTES,
    logDir: parsed.LOG_DIR
  };
}