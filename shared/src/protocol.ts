import { z } from 'zod';
import {
  asEntityId,
  asOwnerId,
  asSeq,
  asTick,
  type EntitySnapshot,
  type WorldSnapshot
} from './types.js';

export const PROTOCOL_VERSION = 1 as const;

const TurnSchema = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
const BitSchema = z.union([z.literal(0), z.literal(1)]);

export const JoinMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('join'),
  room: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(16)
});

export const ChatMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('chat'),
  text: z.string().trim().min(1).max(200)
});

export const InputMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('input'),
  seq: z.number().int().nonnegative().transform(asSeq),
  turn: TurnSchema,
  thrust: BitSchema,
  fire: BitSchema
});

export const PingMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('ping'),
  t: z.number().finite()
});

export const NetCfgMessageSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal('netcfg'),
  delayMs: z.number().min(0).max(2000).optional(),
  jitterMs: z.number().min(0).max(1000).optional(),
  dropRate: z.number().min(0).max(0.9).optional(),
  protocol: z.enum(['binary', 'json']).optional()
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  ChatMessageSchema,
  InputMessageSchema,
  PingMessageSchema,
  NetCfgMessageSchema
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type JoinMessage = z.infer<typeof JoinMessageSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type InputMessage = z.infer<typeof InputMessageSchema>;
export type PingMessage = z.infer<typeof PingMessageSchema>;
export type NetCfgMessage = z.infer<typeof NetCfgMessageSchema>;

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: number; readonly reason: string };

export function parseClientMessage(raw: unknown): ParseResult<ClientMessage> {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, code: 1007, reason: 'Invalid JSON' };
    }
  }

  const parsed = ClientMessageSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const reason = issue ? `${issue.path.join('.') || 'msg'}: ${issue.message}` : 'Invalid message';
    return { ok: false, code: 1003, reason };
  }

  return { ok: true, value: parsed.data };
}

export const EntitySnapshotSchema = z.object({
  id: z.number().int().positive().transform(asEntityId),
  kind: z.enum(['ship', 'asteroid', 'bullet']),
  ownerId: z.number().int().nonnegative().transform(asOwnerId),
  x: z.number().finite(),
  y: z.number().finite(),
  vx: z.number().finite(),
  vy: z.number().finite(),
  angle: z.number().finite(),
  hp: z.number().int().nonnegative()
});

export const SnapshotJsonSchema = z.object({
  v: z.literal(PROTOCOL_VERSION).optional(),
  type: z.literal('snapshot'),
  tick: z.number().int().nonnegative().transform(asTick),
  lastProcessedSeq: z.number().int().nonnegative().transform(asSeq),
  serverTime: z.number().finite(),
  entities: z.array(EntitySnapshotSchema)
});

export function parseSnapshotJson(raw: unknown): ParseResult<WorldSnapshot> {
  const parsed = SnapshotJsonSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: 1007, reason: 'Invalid JSON snapshot' };
  }
  const entities: EntitySnapshot[] = parsed.data.entities.map((e) => ({
    id: e.id,
    kind: e.kind,
    ownerId: e.ownerId,
    x: e.x,
    y: e.y,
    vx: e.vx,
    vy: e.vy,
    angle: e.angle,
    hp: e.hp
  }));
  return {
    ok: true,
    value: {
      type: 'snapshot',
      tick: parsed.data.tick,
      lastProcessedSeq: parsed.data.lastProcessedSeq,
      serverTime: parsed.data.serverTime,
      entities
    }
  };
}