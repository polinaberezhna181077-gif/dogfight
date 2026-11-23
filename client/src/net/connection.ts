import { z } from 'zod';
import {
  PROTOCOL_VERSION,
  asOwnerId,
  decodeSnapshotBinary,
  encodeInputBinary,
  parseSnapshotJson,
  type OwnerId,
  type SequencedInput,
  type WorldSnapshot
} from '@dogfight/shared';
import { Bus } from '../bus.js';

const WelcomeMessageSchema = z.object({
  type: z.literal('welcome'),
  playerId: z.string(),
  ownerId: z.number().int().positive().transform(asOwnerId),
  seed: z.number(),
  room: z.object({
    id: z.string(),
    name: z.string(),
    arena: z.object({
      asteroidCount: z.number().optional(),
      bgColor: z.string().optional(),
      gridColor: z.string().optional()
    }).optional()
  }),
  players: z.array(z.object({
    id: z.string(),
    ownerId: z.number().optional(),
    name: z.string()
  }))
});

const RosterMessageSchema = z.object({
  type: z.literal('roster'),
  players: z.array(z.object({
    id: z.string(),
    ownerId: z.number().optional(),
    name: z.string()
  })),
  systemText: z.string().optional()
});

const ChatBroadcastSchema = z.object({
  type: z.literal('chat'),
  from: z.string(),
  playerId: z.string(),
  text: z.string(),
  t: z.number()
});

export type WelcomePayload = z.infer<typeof WelcomeMessageSchema>;
export type RosterPayload = z.infer<typeof RosterMessageSchema>;
export type ChatPayload = z.infer<typeof ChatBroadcastSchema>;

export type ConnectionEvents = {
  open: undefined;
  close: CloseEvent;
  snapshot: WorldSnapshot;
  welcome: WelcomePayload;
  roster: RosterPayload;
  chat: ChatPayload;
};

export type OutgoingControlMessage =
  | { readonly type: 'join'; readonly room: string; readonly name: string }
  | { readonly type: 'chat'; readonly text: string }
  | { readonly type: 'ping'; readonly t: number }
  | {
      readonly type: 'netcfg';
      readonly delayMs?: number;
      readonly jitterMs?: number;
      readonly dropRate?: number;
      readonly protocol?: 'binary' | 'json';
    };

export class GameConnection extends Bus<ConnectionEvents> {
  readonly url: string;
  private socket: WebSocket | null = null;
  private readonly sendQueue: string[] = [];
  private shouldReconnect = true;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastJoinPayload: { readonly type: 'join'; readonly room: string; readonly name: string } | null = null;
  protocolMode: 'binary' | 'json' = 'binary';

  private bytesInWindow = 0;
  private bytesOutWindow = 0;
  bytesInPerSec = 0;
  bytesOutPerSec = 0;
  rttMs = 0;

  constructor(url: string) {
    super();
    this.url = url;

    setInterval(() => {
      this.bytesInPerSec = this.bytesInWindow;
      this.bytesOutPerSec = this.bytesOutWindow;
      this.bytesInWindow = 0;
      this.bytesOutWindow = 0;
    }, 1000);

    setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', t: performance.now() });
      }
    }, 1000);
  }

  connect(): void {
    this.shouldReconnect = true;
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.socket = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.emit('open', undefined);

      if (this.lastJoinPayload) {
        this.sendRawJson({ v: PROTOCOL_VERSION, ...this.lastJoinPayload });
      }

      while (this.sendQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
        const item = this.sendQueue.shift();
        if (item !== undefined) {
          this.bytesOutWindow += item.length;
          ws.send(item);
        }
      }
    };

    ws.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data instanceof ArrayBuffer) {
        this.bytesInWindow += event.data.byteLength;
        try {
          const snap = decodeSnapshotBinary(event.data);
          this.emit('snapshot', snap);
        } catch (err: unknown) {
          console.error('Bad binary snapshot:', err);
        }
        return;
      }

      if (typeof event.data !== 'string') return;
      this.bytesInWindow += event.data.length;

      try {
        const msg: unknown = JSON.parse(event.data);
        if (typeof msg !== 'object' || msg === null || !('type' in msg)) return;

        const msgType = (msg as { readonly type: unknown }).type;
        if (msgType === 'pong' && 't' in msg && typeof (msg as { t: unknown }).t === 'number') {
          this.rttMs = Math.max(0, Math.round(performance.now() - (msg as { t: number }).t));
          return;
        }
        if (msgType === 'snapshot') {
          const parsedSnap = parseSnapshotJson(msg);
          if (parsedSnap.ok) this.emit('snapshot', parsedSnap.value);
          return;
        }
        if (msgType === 'welcome') {
          const w = WelcomeMessageSchema.safeParse(msg);
          if (w.success) this.emit('welcome', w.data);
          return;
        }
        if (msgType === 'roster') {
          const r = RosterMessageSchema.safeParse(msg);
          if (r.success) this.emit('roster', r.data);
          return;
        }
        if (msgType === 'chat') {
          const c = ChatBroadcastSchema.safeParse(msg);
          if (c.success) this.emit('chat', c.data);
        }
      } catch (err: unknown) {
        console.error('Bad WS message:', err);
      }
    };

    ws.onclose = (event: CloseEvent) => {
      this.emit('close', event);
      if (!this.shouldReconnect || (event.code >= 4000 && event.code < 4100)) {
        return;
      }
      const delay = Math.min(1000 * Math.pow(2, this.attempt), 10000);
      this.attempt++;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private sendRawJson(obj: Record<string, unknown>): void {
    const raw = JSON.stringify(obj);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.bytesOutWindow += raw.length;
      this.socket.send(raw);
    } else {
      this.sendQueue.push(raw);
    }
  }

  sendInput(input: SequencedInput): void {
    if (this.protocolMode === 'binary') {
      const buf = encodeInputBinary(input);
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.bytesOutWindow += buf.byteLength;
        this.socket.send(buf);
      }
    } else {
      this.sendRawJson({ v: PROTOCOL_VERSION, type: 'input', ...input });
    }
  }

  send(payload: OutgoingControlMessage): void {
    if (payload.type === 'join') {
      this.lastJoinPayload = payload;
    }
    if (payload.type === 'netcfg' && payload.protocol) {
      this.protocolMode = payload.protocol;
    }
    this.sendRawJson({ v: PROTOCOL_VERSION, ...payload });
  }

  close(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }
    this.socket?.close();
  }
}