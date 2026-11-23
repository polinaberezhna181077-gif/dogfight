import { createPrng, type Prng } from '../prng.js';
import { Vector2 } from './vector.js';
import {
  Ship,
  Asteroid,
  Bullet,
  integrateShip,
  BULLET_SPEED,
  FIRE_COOLDOWN
} from './entities.js';
import { circlesOverlap } from './collision.js';
import {
  asEntityId,
  asTick,
  type EntityId,
  type EntitySnapshot,
  type OwnerId,
  type PlayerInputCmd,
  type Tick
} from '../types.js';

export interface SimWorldOptions {
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
  readonly asteroidCount?: number;
}

export class SimWorld {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly prng: Prng;
  tick: Tick = asTick(0);
  private nextEntityNum = 1;
  readonly ships = new Map<OwnerId, Ship>();
  readonly asteroids = new Map<EntityId, Asteroid>();
  readonly bullets = new Map<EntityId, Bullet>();

  constructor(options: SimWorldOptions = {}) {
    this.width = options.width ?? 960;
    this.height = options.height ?? 640;
    this.seed = options.seed ?? 42;
    this.prng = createPrng(this.seed);

    const count = options.asteroidCount ?? 4;
    for (let i = 0; i < count; i++) {
      this.spawnAsteroid();
    }
  }

  private allocId(): EntityId {
    return asEntityId(this.nextEntityNum++);
  }

  spawnAsteroid(): Asteroid {
    const id = this.allocId();
    const angle = this.prng.range(0, Math.PI * 2);
    const speed = this.prng.range(35, 85);
    const ast = new Asteroid({
      id,
      x: this.prng.range(0, this.width),
      y: this.prng.range(0, this.height),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle,
      radius: 22
    });
    this.asteroids.set(id, ast);
    return ast;
  }

  addPlayerShip(ownerId: OwnerId, name: string): Ship {
    const id = this.allocId();
    const ship = new Ship({
      id,
      ownerId,
      name,
      x: this.prng.range(160, this.width - 160),
      y: this.prng.range(140, this.height - 140),
      angle: this.prng.range(0, Math.PI * 2),
      hp: 100
    });
    this.ships.set(ownerId, ship);
    return ship;
  }

  removePlayerShip(ownerId: OwnerId): void {
    this.ships.delete(ownerId);
  }

  applyPlayerInput(ownerId: OwnerId, input: PlayerInputCmd, dt: number): void {
    const ship = this.ships.get(ownerId);
    if (!ship || ship.hp <= 0) return;

    integrateShip(ship, input, dt, { width: this.width, height: this.height });

    if (input.fire && ship.cooldown <= 0) {
      ship.cooldown = FIRE_COOLDOWN;
      const dir = Vector2.fromAngle(ship.angle);
      const id = this.allocId();
      const bullet = new Bullet({
        id,
        ownerId,
        x: ship.x + dir.x * (ship.radius + 6),
        y: ship.y + dir.y * (ship.radius + 6),
        vx: ship.vx + dir.x * BULLET_SPEED,
        vy: ship.vy + dir.y * BULLET_SPEED,
        angle: ship.angle
      });
      this.bullets.set(id, bullet);
    }
  }

  step(dt: number, inputsByOwner: ReadonlyMap<OwnerId, PlayerInputCmd> = new Map()): void {
    this.tick = asTick(this.tick + 1);

    const ownerIds = Array.from(this.ships.keys()).sort((a, b) => a - b);
    for (const ownerId of ownerIds) {
      const inp = inputsByOwner.get(ownerId) ?? { turn: 0, thrust: 0, fire: 0 };
      this.applyPlayerInput(ownerId, inp, dt);
    }

    const bounds = { width: this.width, height: this.height };

    for (const ast of this.asteroids.values()) {
      ast.step(dt, bounds);
    }

    for (const [id, bullet] of this.bullets.entries()) {
      bullet.step(dt, bounds);
      if (bullet.hp <= 0) {
        this.bullets.delete(id);
        continue;
      }

      for (const ship of this.ships.values()) {
        if (ship.ownerId !== bullet.ownerId && ship.hp > 0 && circlesOverlap(bullet, ship)) {
          ship.hp = Math.max(0, ship.hp - 20);
          bullet.hp = 0;
          if (ship.hp === 0) {
            ship.hp = 100;
            ship.x = this.prng.range(160, this.width - 160);
            ship.y = this.prng.range(140, this.height - 140);
            ship.vx = 0;
            ship.vy = 0;
          }
          break;
        }
      }

      if (bullet.hp > 0) {
        for (const [astId, ast] of this.asteroids.entries()) {
          if (circlesOverlap(bullet, ast)) {
            bullet.hp = 0;
            this.asteroids.delete(astId);
            this.spawnAsteroid();
            break;
          }
        }
      }

      if (bullet.hp <= 0) {
        this.bullets.delete(id);
      }
    }
  }

  getEntitiesSnapshot(): EntitySnapshot[] {
    const list: EntitySnapshot[] = [];
    for (const ship of this.ships.values()) list.push(ship.toSnapshot());
    for (const ast of this.asteroids.values()) list.push(ast.toSnapshot());
    for (const bullet of this.bullets.values()) list.push(bullet.toSnapshot());
    return list;
  }

  computeHash(): string {
    let h = 2166136261 >>> 0;
    for (const e of this.getEntitiesSnapshot()) {
      const kindCode = e.kind === 'ship' ? 1 : e.kind === 'asteroid' ? 2 : 3;
      const vals = [e.id, kindCode, Math.round(e.x * 100), Math.round(e.y * 100), Math.round(e.angle * 1000), e.hp];
      for (const v of vals) {
        h ^= v & 0xffff;
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
    return h.toString(16);
  }
} 