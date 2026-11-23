import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import type { OwnerId, WorldSnapshot } from '@dogfight/shared';
import { Match, type MatchStats } from './match.js';

export interface ArenaConfig {
  readonly asteroidCount: number;
  readonly bgColor: string;
  readonly gridColor: string;
}

export interface RoomPlayer {
  readonly id: string;
  readonly name: string;
  protocol: 'binary' | 'json';
  readonly socket: WebSocket;
  ownerId?: OwnerId;
}

export interface RoomSummary {
  readonly id: string;
  readonly name: string;
  readonly players: number;
  readonly maxPlayers: number;
  readonly arena: ArenaConfig;
  readonly seed: number;
}

export interface RoomRosterEntry {
  readonly id: string;
  readonly ownerId: OwnerId | undefined;
  readonly name: string;
}

export type RoomEventLog =
  | {
      readonly t: number;
      readonly room: string;
      readonly type: 'join';
      readonly playerId: string;
      readonly ownerId: OwnerId;
      readonly name: string;
      readonly count: number;
    }
  | {
      readonly t: number;
      readonly room: string;
      readonly type: 'leave';
      readonly playerId: string;
      readonly name: string;
      readonly count: number;
    }
  | {
      readonly t: number;
      readonly room: string;
      readonly type: 'chat';
      readonly from: string;
      readonly playerId: string;
      readonly text: string;
    };

export interface RoomEvents {
  snapshot: [{ playerId: string; snapObj: WorldSnapshot; toBinary: () => ArrayBuffer }];
  event: [RoomEventLog];
  empty: [{ room: string }];
}

export class Room extends EventEmitter<RoomEvents> {
  readonly id: string;
  readonly name: string;
  readonly maxPlayers: number;
  readonly arena: ArenaConfig;
  readonly players = new Map<string, RoomPlayer>();
  readonly createdAt = Date.now();
  readonly match: Match;

  constructor(params: { id: string; name: string; maxPlayers?: number; arena?: ArenaConfig }) {
    super();
    this.id = params.id;
    this.name = params.name;
    this.maxPlayers = params.maxPlayers ?? 4;
    this.arena = params.arena ?? {
      asteroidCount: 5,
      bgColor: '#11151c',
      gridColor: '#222b38'
    };
    this.match = new Match(this, {
      onBroadcast: (playerId, snapObj, toBinary) => {
        this.emit('snapshot', { playerId, snapObj, toBinary });
      }
    });
  }

  join(player: RoomPlayer): boolean {
    if (this.players.size >= this.maxPlayers) {
      return false;
    }
    this.players.set(player.id, player);
    const ownerId = this.match.addPlayer(player);
    player.ownerId = ownerId;
    this.emit('event', {
      t: Date.now(),
      room: this.id,
      type: 'join',
      playerId: player.id,
      ownerId,
      name: player.name,
      count: this.players.size
    });
    return true;
  }

  leave(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.match.removePlayer(playerId);
    this.players.delete(playerId);
    this.emit('event', {
      t: Date.now(),
      room: this.id,
      type: 'leave',
      playerId,
      name: player.name,
      count: this.players.size
    });
    if (this.players.size === 0) {
      this.match.stop();
      this.emit('empty', { room: this.id });
    }
  }

  chat(player: RoomPlayer, text: string): void {
    this.emit('event', {
      t: Date.now(),
      room: this.id,
      type: 'chat',
      from: player.name,
      playerId: player.id,
      text
    });
  }

  getRoster(): RoomRosterEntry[] {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      ownerId: p.ownerId,
      name: p.name
    }));
  }

  toSummary(): RoomSummary {
    return {
      id: this.id,
      name: this.name,
      players: this.players.size,
      maxPlayers: this.maxPlayers,
      arena: this.arena,
      seed: this.match.seed
    };
  }
}

export interface RoomMatchStats extends MatchStats {
  readonly roomId: string;
  readonly name: string;
  readonly players: number;
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  readonly maxRooms: number;
  readonly maxPlayersPerRoom: number;
  private readonly onRoomCreated: ((room: Room) => void) | null;
  private seq = 1;

  constructor(options: {
    maxRooms?: number;
    maxPlayersPerRoom?: number;
    onRoomCreated?: ((room: Room) => void) | null;
  } = {}) {
    this.maxRooms = options.maxRooms ?? 20;
    this.maxPlayersPerRoom = options.maxPlayersPerRoom ?? 6;
    this.onRoomCreated = options.onRoomCreated ?? null;

    this.createRoom({
      id: 'room-alpha',
      name: 'Alpha Sector (Standard)',
      maxPlayers: this.maxPlayersPerRoom,
      arena: { asteroidCount: 5, bgColor: '#11151c', gridColor: '#222b38' }
    });
    this.createRoom({
      id: 'room-nebula',
      name: 'Meteor Storm (Hardcore)',
      maxPlayers: this.maxPlayersPerRoom,
      arena: { asteroidCount: 9, bgColor: '#1a101c', gridColor: '#361f3a' }
    });
  }

  createRoom(params: { id?: string; name: string; maxPlayers?: number; arena?: ArenaConfig }): Room {
    if (this.rooms.size >= this.maxRooms) {
      throw new Error('Maximum number of rooms reached');
    }
    const roomId = params.id ?? `room-${this.seq++}`;
    if (this.rooms.has(roomId)) {
      throw new Error('Room already exists');
    }
    const room = new Room({
      id: roomId,
      name: params.name,
      maxPlayers: Math.min(params.maxPlayers ?? this.maxPlayersPerRoom, this.maxPlayersPerRoom),
      arena: params.arena
    });
    this.rooms.set(roomId, room);
    if (this.onRoomCreated) {
      this.onRoomCreated(room);
    }
    return room;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  list(): RoomSummary[] {
    return Array.from(this.rooms.values()).map((r) => r.toSummary());
  }

  getAllStats(): RoomMatchStats[] {
    return Array.from(this.rooms.values()).map((r) => ({
      roomId: r.id,
      name: r.name,
      players: r.players.size,
      ...r.match.getStats()
    }));
  }
}