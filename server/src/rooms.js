import { EventEmitter } from 'node:events';

export class Room extends EventEmitter {
  constructor({ id, name, maxPlayers = 6, arena }) {
    super();
    this.id = id;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.arena = arena || { asteroidCount: 4, bgColor: '#11151c', gridColor: '#222b38' };
    this.players = new Map(); // playerId -> { id, name, socket }
    this.logFile = null;
  }

  getRoster() {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
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
      logFile: this.logFile
    };
  }

  recordEvent(type, payload = {}) {
    this.emit('event', {
      t: Date.now(),
      room: this.id,
      type,
      ...payload
    });
  }

  join(player) {
    if (this.players.size >= this.maxPlayers) {
      return false;
    }
    this.players.set(player.id, player);
    this.emit('join', player);
    this.recordEvent('join', { playerId: player.id, name: player.name });
    return true;
  }

  leave(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.emit('leave', player);
    this.recordEvent('leave', { playerId: player.id, name: player.name });

    if (this.players.size === 0) {
      this.emit('empty');
    }
  }

  chat(player, text) {
    this.emit('chat', { player, text });
    this.recordEvent('chat', { playerId: player.id, name: player.name, text });
  }
}

export class RoomManager {
  constructor({ maxRooms = 20, maxPlayersPerRoom = 6, onRoomCreated } = {}) {
    this.rooms = new Map();
    this.maxRooms = maxRooms;
    this.maxPlayersPerRoom = maxPlayersPerRoom;
    this.onRoomCreated = onRoomCreated;

    this.createRoom({
      id: 'room-alpha',
      name: 'Alpha Sector (Standard)',
      maxPlayers: 4,
      arena: { asteroidCount: 4, bgColor: '#11151c', gridColor: '#222b38' },
      persistent: true
    });
    this.createRoom({
      id: 'room-meteor',
      name: 'Meteor Storm (Hardcore)',
      maxPlayers: 4,
      arena: { asteroidCount: 9, bgColor: '#1c1115', gridColor: '#382229' },
      persistent: true
    });
  }

  list() {
    return Array.from(this.rooms.values()).map((r) => r.toSummary());
  }

  get(id) {
    return this.rooms.get(id);
  }

  createRoom({ id, name, maxPlayers, arena, persistent = false }) {
    if (this.rooms.size >= this.maxRooms) {
      throw new Error('Server room limit reached');
    }
    const roomId = id || `room-${Date.now().toString(36)}`;
    const room = new Room({
      id: roomId,
      name: name || roomId,
      maxPlayers: Math.min(Number(maxPlayers) || this.maxPlayersPerRoom, this.maxPlayersPerRoom),
      arena
    });

    if (!persistent) {
      room.once('empty', () => {
        this.rooms.delete(room.id);
      });
    }

    this.rooms.set(room.id, room);
    this.onRoomCreated?.(room);
    return room;
  }
}