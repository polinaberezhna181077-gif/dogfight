import { EventEmitter } from 'node:events';
import { Match } from './match.js';

export class Room extends EventEmitter {
  constructor({ id, name, maxPlayers = 4, arena = null }) {
    super();
    this.id = id;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.arena = arena || {
      asteroidCount: 5,
      bgColor: '#11151c',
      gridColor: '#222b38'
    };
    this.players = new Map();
    this.createdAt = Date.now();
    this.match = new Match(this, {
      onBroadcast: (playerId, snapObj, toBinary) => {
        this.emit('snapshot', { playerId, snapObj, toBinary });
      }
    });
  }

  join(player) {
    if (this.players.size >= this.maxPlayers) {
      return false;
    }
    this.players.set(player.id, player);
    player.ownerId = this.match.addPlayer(player);
    this.emit('event', {
      t: Date.now(),
      room: this.id,
      type: 'join',
      playerId: player.id,
      ownerId: player.ownerId,
      name: player.name,
      count: this.players.size
    });
    return true;
  }

  leave(playerId) {
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

  chat(player, text) {
    this.emit('event', {
      t: Date.now(),
      room: this.id,
      type: 'chat',
      from: player.name,
      playerId: player.id,
      text
    });
  }

  getRoster() {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      ownerId: p.ownerId,
      name: p.name
    }));
  }

  toSummary() {
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

export class RoomManager {
  constructor({ maxRooms = 20, maxPlayersPerRoom = 6, onRoomCreated = null } = {}) {
    this.rooms = new Map();
    this.maxRooms = maxRooms;
    this.maxPlayersPerRoom = maxPlayersPerRoom;
    this.onRoomCreated = onRoomCreated;
    this.seq = 1;

    this.createRoom({
      id: 'room-alpha',
      name: 'Alpha Sector (Standard)',
      maxPlayers: maxPlayersPerRoom,
      arena: { asteroidCount: 5, bgColor: '#11151c', gridColor: '#222b38' }
    });
    this.createRoom({
      id: 'room-nebula',
      name: 'Meteor Storm (Hardcore)',
      maxPlayers: maxPlayersPerRoom,
      arena: { asteroidCount: 9, bgColor: '#1a101c', gridColor: '#361f3a' }
    });
  }

  createRoom({ id, name, maxPlayers, arena }) {
    if (this.rooms.size >= this.maxRooms) {
      throw new Error('Maximum number of rooms reached');
    }
    const roomId = id || `room-${this.seq++}`;
    if (this.rooms.has(roomId)) {
      throw new Error('Room already exists');
    }
    const room = new Room({
      id: roomId,
      name,
      maxPlayers: Math.min(maxPlayers || this.maxPlayersPerRoom, this.maxPlayersPerRoom),
      arena
    });
    this.rooms.set(roomId, room);
    if (this.onRoomCreated) {
      this.onRoomCreated(room);
    }
    return room;
  }

  get(roomId) {
    return this.rooms.get(roomId);
  }

  list() {
    return Array.from(this.rooms.values()).map((r) => r.toSummary());
  }

  getAllStats() {
    return Array.from(this.rooms.values()).map((r) => ({
      roomId: r.id,
      name: r.name,
      players: r.players.size,
      ...r.match.getStats()
    }));
  }
} 