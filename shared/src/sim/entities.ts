import { Vector2 } from './vector.js';
import {
  asEntityId,
  asOwnerId,
  type AsteroidSnapshot,
  type BulletSnapshot,
  type EntityId,
  type OwnerId,
  type PlayerInputCmd,
  type ShipSnapshot
} from '../types.js';

export const SHIP_TURN_SPEED = 3.6;
export const SHIP_THRUST = 240;
export const SHIP_DRAG = 0.985;
export const SHIP_RADIUS = 14;
export const BULLET_SPEED = 460;
export const BULLET_TTL = 1.4;
export const FIRE_COOLDOWN = 0.22;

export interface Bounds {
  readonly width: number;
  readonly height: number;
}

export function wrapCoord(val: number, max: number): number {
  if (val < 0) return val + max;
  if (val >= max) return val - max;
  return val;
}

export function integrateShip(
  ship: Ship,
  input: PlayerInputCmd,
  dt: number,
  bounds: Bounds = { width: 960, height: 640 }
): void {
  const turn = Math.max(-1, Math.min(1, input.turn));
  const thrust = input.thrust ? 1 : 0;

  ship.angle += turn * SHIP_TURN_SPEED * dt;
  if (thrust > 0) {
    const dir = Vector2.fromAngle(ship.angle);
    ship.vx += dir.x * SHIP_THRUST * dt;
    ship.vy += dir.y * SHIP_THRUST * dt;
  }

  ship.vx *= SHIP_DRAG;
  ship.vy *= SHIP_DRAG;
  ship.x = wrapCoord(ship.x + ship.vx * dt, bounds.width);
  ship.y = wrapCoord(ship.y + ship.vy * dt, bounds.height);

  if (ship.cooldown > 0) {
    ship.cooldown = Math.max(0, ship.cooldown - dt);
  }
}

export class Ship {
  readonly id: EntityId;
  readonly kind = 'ship' as const;
  ownerId: OwnerId;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  readonly radius = SHIP_RADIUS;
  cooldown: number;

  constructor(params: {
    id: EntityId;
    ownerId?: OwnerId;
    name?: string;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    angle?: number;
    hp?: number;
    cooldown?: number;
  }) {
    this.id = params.id;
    this.ownerId = params.ownerId ?? asOwnerId(0);
    this.name = params.name ?? 'Pilot';
    this.x = params.x ?? 480;
    this.y = params.y ?? 320;
    this.vx = params.vx ?? 0;
    this.vy = params.vy ?? 0;
    this.angle = params.angle ?? 0;
    this.hp = params.hp ?? 100;
    this.cooldown = params.cooldown ?? 0;
  }

  toSnapshot(): ShipSnapshot {
    return {
      id: this.id,
      kind: 'ship',
      ownerId: this.ownerId,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      angle: this.angle,
      hp: this.hp
    };
  }

  static fromSnapshot(s: ShipSnapshot): Ship {
    return new Ship(s);
  }
}

export class Asteroid {
  readonly id: EntityId;
  readonly kind = 'asteroid' as const;
  readonly ownerId = asOwnerId(0);
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  readonly radius: number;
  hp: number;

  constructor(params: {
    id: EntityId;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle?: number;
    radius?: number;
    hp?: number;
  }) {
    this.id = params.id;
    this.x = params.x;
    this.y = params.y;
    this.vx = params.vx;
    this.vy = params.vy;
    this.angle = params.angle ?? 0;
    this.radius = params.radius ?? 22;
    this.hp = params.hp ?? 30;
  }

  step(dt: number, bounds: Bounds): void {
    this.x = wrapCoord(this.x + this.vx * dt, bounds.width);
    this.y = wrapCoord(this.y + this.vy * dt, bounds.height);
    this.angle += 0.6 * dt;
  }

  toSnapshot(): AsteroidSnapshot {
    return {
      id: this.id,
      kind: 'asteroid',
      ownerId: this.ownerId,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      angle: this.angle,
      hp: this.hp
    };
  }

  static fromSnapshot(s: AsteroidSnapshot): Asteroid {
    return new Asteroid(s);
  }
}

export class Bullet {
  readonly id: EntityId;
  readonly kind = 'bullet' as const;
  readonly ownerId: OwnerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  readonly radius = 4;
  ttl: number;
  hp: number;

  constructor(params: {
    id: EntityId;
    ownerId: OwnerId;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle?: number;
    ttl?: number;
    hp?: number;
  }) {
    this.id = params.id;
    this.ownerId = params.ownerId;
    this.x = params.x;
    this.y = params.y;
    this.vx = params.vx;
    this.vy = params.vy;
    this.angle = params.angle ?? 0;
    this.ttl = params.ttl ?? BULLET_TTL;
    this.hp = params.hp ?? 1;
  }

  step(dt: number, bounds: Bounds): void {
    this.x = wrapCoord(this.x + this.vx * dt, bounds.width);
    this.y = wrapCoord(this.y + this.vy * dt, bounds.height);
    this.ttl -= dt;
    if (this.ttl <= 0) this.hp = 0;
  }

  toSnapshot(): BulletSnapshot {
    return {
      id: this.id,
      kind: 'bullet',
      ownerId: this.ownerId,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      angle: this.angle,
      hp: this.hp
    };
  }

  static fromSnapshot(s: BulletSnapshot): Bullet {
    return new Bullet(s);
  }
} 