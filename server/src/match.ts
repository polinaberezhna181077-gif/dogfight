import { performance } from 'node:perf_hooks';
import {
  SimWorld,
  asOwnerId,
  asSeq,
  encodeSnapshotBinary,
  type OwnerId,
  type PlayerInputCmd,
  type Seq,
  type SequencedInput,
  type WorldSnapshot
} from '@dogfight/shared';
import type { Room } from './rooms.js';

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
export const TICK_MS = 1000 / TICK_RATE;

export interface MatchPlayerRef {
  readonly id: string;
  readonly name: string;
}

export interface MatchStats {
  readonly tick: number;
  readonly tickRate: number;
  readonly tickDurationMs: number;
  readonly tickJitterMs: number;
  readonly entities: number;
}

export type SnapshotBroadcastFn = (
  playerId: string,
  snapObj: WorldSnapshot,
  toBinary: () => ArrayBuffer
) => void;

export class Match {
  readonly room: Room;
  private readonly onBroadcast: SnapshotBroadcastFn | undefined;
  readonly seed: number;
  readonly world: SimWorld;

  private nextOwnerNum = 1;
  private readonly playerOwnerIds = new Map<string, OwnerId>();
  private readonly ownerPlayerIds = new Map<OwnerId, string>();
  private readonly inputQueues = new Map<OwnerId, SequencedInput[]>();
  private readonly lastProcessedSeq = new Map<OwnerId, Seq>();
  private readonly lastInputs = new Map<OwnerId, PlayerInputCmd>();

  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private nextTickTarget = 0;
  private lastTickDurationMs = 0;
  private lastTickJitterMs = 0;

  constructor(room: Room, options: { onBroadcast?: SnapshotBroadcastFn } = {}) {
    this.room = room;
    this.onBroadcast = options.onBroadcast;
    this.seed = (Math.floor(Math.random() * 0xffffff) + 1) >>> 0;
    this.world = new SimWorld({
      width: 960,
      height: 640,
      seed: this.seed,
      asteroidCount: room.arena.asteroidCount
    });
  }

  addPlayer(player: MatchPlayerRef): OwnerId {
    const ownerId = asOwnerId(this.nextOwnerNum++);
    this.playerOwnerIds.set(player.id, ownerId);
    this.ownerPlayerIds.set(ownerId, player.id);
    this.inputQueues.set(ownerId, []);
    this.lastProcessedSeq.set(ownerId, asSeq(0));
    this.lastInputs.set(ownerId, { turn: 0, thrust: 0, fire: 0 });
    this.world.addPlayerShip(ownerId, player.name);

    if (!this.running) {
      this.start();
    }
    return ownerId;
  }

  removePlayer(playerId: string): void {
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

  enqueueInput(playerId: string, input: SequencedInput): void {
    const ownerId = this.playerOwnerIds.get(playerId);
    if (ownerId === undefined) return;

    const queue = this.inputQueues.get(ownerId);
    if (queue && queue.length < 32) {
      queue.push(input);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.nextTickTarget = performance.now() + TICK_MS;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    if (!this.running) return;
    const delay = Math.max(0, this.nextTickTarget - performance.now());
    this.timer = setTimeout(() => this.tick(), delay);
  }

  private tick(): void {
    if (!this.running) return;
    const start = performance.now();
    this.lastTickJitterMs = Math.round((start - this.nextTickTarget) * 100) / 100;

    const stepInputs = new Map<OwnerId, PlayerInputCmd>();
    for (const [ownerId, queue] of this.inputQueues.entries()) {
      const nextInp = queue.shift();
      if (nextInp !== undefined) {
        this.lastInputs.set(ownerId, nextInp);
        const prevSeq = this.lastProcessedSeq.get(ownerId) ?? asSeq(0);
        if (nextInp.seq > prevSeq) {
          this.lastProcessedSeq.set(ownerId, nextInp.seq);
        }
        stepInputs.set(ownerId, nextInp);
      } else {
        const prev = this.lastInputs.get(ownerId) ?? { turn: 0, thrust: 0, fire: 0 };
        stepInputs.set(ownerId, { ...prev, fire: 0 });
      }
    }

    this.world.step(TICK_DT, stepInputs);

    const entities = this.world.getEntitiesSnapshot();
    const serverTime = Math.round(performance.now());

    if (this.onBroadcast) {
      for (const [playerId, ownerId] of this.playerOwnerIds.entries()) {
        const snapObj: WorldSnapshot = {
          type: 'snapshot',
          tick: this.world.tick,
          lastProcessedSeq: this.lastProcessedSeq.get(ownerId) ?? asSeq(0),
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

  getStats(): MatchStats {
    return {
      tick: this.world.tick,
      tickRate: TICK_RATE,
      tickDurationMs: this.lastTickDurationMs,
      tickJitterMs: this.lastTickJitterMs,
      entities: this.world.ships.size + this.world.asteroids.size + this.world.bullets.size
    };
  }
}