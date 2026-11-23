import { performance } from 'node:perf_hooks';
import {
  SimWorld,
  encodeSnapshotBinary
} from '@dogfight/shared';

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
export const TICK_MS = 1000 / TICK_RATE;

export class Match {
  constructor(room, { onBroadcast } = {}) {
    this.room = room;
    this.onBroadcast = onBroadcast;
    this.seed = (Math.floor(Math.random() * 0xffffff) + 1) >>> 0;
    this.world = new SimWorld({
      width: 960,
      height: 640,
      seed: this.seed,
      asteroidCount: room.arena?.asteroidCount || 5
    });

    this.nextOwnerId = 1;
    this.playerOwnerIds = new Map();
    this.ownerPlayerIds = new Map();
    this.inputQueues = new Map();
    this.lastProcessedSeq = new Map();
    this.lastInputs = new Map();

    this.running = false;
    this.timer = null;
    this.nextTickTarget = 0;
    this.lastTickDurationMs = 0;
    this.lastTickJitterMs = 0;
  }

  addPlayer(player) {
    const ownerId = this.nextOwnerId++;
    this.playerOwnerIds.set(player.id, ownerId);
    this.ownerPlayerIds.set(ownerId, player.id);
    this.inputQueues.set(ownerId, []);
    this.lastProcessedSeq.set(ownerId, 0);
    this.lastInputs.set(ownerId, { turn: 0, thrust: 0, fire: 0 });
    this.world.addPlayerShip(ownerId, player.name);

    if (!this.running) {
      this.start();
    }
    return ownerId;
  }

  removePlayer(playerId) {
    const ownerId = this.playerOwnerIds.get(playerId);
    if (ownerId === undefined) return;
    this.world.removePlayerShip(ownerId);
    this.playerOwnerIds.delete(playerId);
    this.ownerPlayerIds.delete(ownerId);
    this.inputQueues.delete(ownerId);
    this.lastProcessedSeq.delete(ownerId);
    this.lastInputs.delete(ownerId);

    if (this.playerOwnerIds.size === 0) {
      this.stop();
    }
  }

  enqueueInput(playerId, input) {
    const ownerId = this.playerOwnerIds.get(playerId);
    if (ownerId === undefined) return;

    const turn = Number(input.turn);
    if (!Number.isFinite(turn) || turn < -1 || turn > 1) return;

    const clean = {
      seq: (input.seq >>> 0),
      turn: Math.round(turn),
      thrust: input.thrust ? 1 : 0,
      fire: input.fire ? 1 : 0
    };

    const queue = this.inputQueues.get(ownerId);
    if (queue && queue.length < 32) {
      queue.push(clean);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.nextTickTarget = performance.now() + TICK_MS;
    this.scheduleNext();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  scheduleNext() {
    if (!this.running) return;
    const delay = Math.max(0, this.nextTickTarget - performance.now());
    this.timer = setTimeout(() => this.tick(), delay);
  }

  tick() {
    if (!this.running) return;
    const start = performance.now();
    this.lastTickJitterMs = Math.round((start - this.nextTickTarget) * 100) / 100;

    const stepInputs = new Map();
    for (const [ownerId, queue] of this.inputQueues.entries()) {
      if (queue.length > 0) {
        const nextInp = queue.shift();
        this.lastInputs.set(ownerId, nextInp);
        if (nextInp.seq > (this.lastProcessedSeq.get(ownerId) || 0)) {
          this.lastProcessedSeq.set(ownerId, nextInp.seq);
        }
        stepInputs.set(ownerId, nextInp);
      } else {
        const prev = this.lastInputs.get(ownerId) || { turn: 0, thrust: 0, fire: 0 };
        stepInputs.set(ownerId, { ...prev, fire: 0 });
      }
    }

    this.world.step(TICK_DT, stepInputs);

    const entities = this.world.getEntitiesSnapshot();
    const serverTime = Math.round(performance.now());

    if (this.onBroadcast) {
      for (const [playerId, ownerId] of this.playerOwnerIds.entries()) {
        const snapObj = {
          type: 'snapshot',
          tick: this.world.tick,
          lastProcessedSeq: this.lastProcessedSeq.get(ownerId) || 0,
          serverTime,
          entities
        };
        this.onBroadcast(playerId, snapObj, () => encodeSnapshotBinary(snapObj));
      }
    }

    this.lastTickDurationMs = Math.round((performance.now() - start) * 100) / 100;
    this.nextTickTarget += TICK_MS;
    if (this.nextTickTarget < performance.now()) {
      this.nextTickTarget = performance.now() + TICK_MS;
    }
    this.scheduleNext();
  }

  getStats() {
    return {
      tick: this.world.tick,
      tickRate: TICK_RATE,
      tickDurationMs: this.lastTickDurationMs,
      tickJitterMs: this.lastTickJitterMs,
      entities: this.world.ships.size + this.world.asteroids.size + this.world.bullets.size
    };
  }
} 