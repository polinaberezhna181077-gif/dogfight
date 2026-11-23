import { z } from 'zod';
import { Bus } from '../bus.js';

const RoomItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  players: z.number(),
  maxPlayers: z.number(),
  arena: z.object({
    asteroidCount: z.number(),
    bgColor: z.string(),
    gridColor: z.string()
  }).optional(),
  seed: z.number().optional()
});

const RoomsResponseSchema = z.object({
  rooms: z.array(RoomItemSchema)
});

const CreateRoomResponseSchema = z.object({
  room: RoomItemSchema
});

export type LobbyRoom = z.infer<typeof RoomItemSchema>;

export interface JoinedSession {
  readonly room: LobbyRoom;
  readonly playerName: string;
}

export type LobbyEvents = {
  rooms: readonly LobbyRoom[];
  joined: JoinedSession;
  error: string;
};

export class Lobby extends Bus<LobbyEvents> {
  readonly apiBase: string;
  rooms: readonly LobbyRoom[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(apiBase = '/api/rooms') {
    super();
    this.apiBase = apiBase;
  }

  async refresh(): Promise<void> {
    try {
      const res = await fetch(this.apiBase);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      const parsed = RoomsResponseSchema.parse(json);
      this.rooms = parsed.rooms;
      this.emit('rooms', this.rooms);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load rooms';
      this.emit('error', msg);
    }
  }

  async createRoom(name: string): Promise<LobbyRoom | null> {
    try {
      const res = await fetch(this.apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      const parsed = CreateRoomResponseSchema.parse(json);
      await this.refresh();
      return parsed.room;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create room';
      this.emit('error', msg);
      return null;
    }
  }

  joinRoom(room: LobbyRoom, playerName: string): void {
    this.stopPolling();
    this.emit('joined', { room, playerName: playerName.trim() || 'Pilot' });
  }

  startPolling(intervalMs = 3000): void {
    void this.refresh();
    this.pollTimer = setInterval(() => {
      void this.refresh();
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}