import { Vector2 } from './vector.js';

export const KIND_SHIP = 1;
export const KIND_ASTEROID = 2;
export const KIND_BULLET = 3;

export const SHIP_TURN_SPEED = 3.6;
export const SHIP_THRUST = 240;
export const SHIP_DRAG = 0.985;
export const SHIP_RADIUS = 14;
export const BULLET_SPEED = 460;
export const BULLET_TTL = 1.4;
export const FIRE_COOLDOWN = 0.22;

export function wrapCoord(val, max) {
  if (val < 0) return val + max;
  if (val >= max) return val - max;
  return val;
}

export function integrateShip(ship, input, dt, bounds = { width: 960, height: 640 }) {
  const turn = Math.max(-1, Math.min(1, Number(input.turn) || 0));
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
  constructor({ id, ownerId = 0, name = 'Pilot', x = 480, y = 320, vx = 0, vy = 0, angle = 0, hp = 100, cooldown = 0 }) {
    this.id = id;
    this.kind = KIND_SHIP;
    this.ownerId = ownerId;
    this.name = name;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.angle = angle;
    this.hp = hp;
    this.radius = SHIP_RADIUS;
    this.cooldown = cooldown;
  }

  toSnapshot() {
    return {
      id: this.id,
      kind: KIND_SHIP,
      ownerId: this.ownerId,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      angle: this.angle,
      hp: this.hp
    };
  }

  static fromSnapshot(s) {
    return new Ship(s);
  }
}

export class Asteroid {
  constructor({ id, x, y, vx, vy, angle = 0, radius = 22 }) {
    this.id = id;
    this.kind = KIND_ASTEROID;
    this.ownerId = 0;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.angle = angle;
    this.radius = radius;
    this.hp = 30;
  }

  step(dt, bounds) {
    this.x = wrapCoord(this.x + this.vx * dt, bounds.width);
    this.y = wrapCoord(this.y + this.vy * dt, bounds.height);
    this.angle += 0.6 * dt;
  }

  toSnapshot() {
    return {
      id: this.id,
      kind: KIND_ASTEROID,
      ownerId: 0,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      angle: this.angle,
      hp: this.hp
    };
  }

  static fromSnapshot(s) {
    return new Asteroid(s);
  }
}

export class Bullet {
  constructor({ id, ownerId, x, y, vx, vy, angle = 0, ttl = BULLET_TTL }) {
    this.id = id;
    this.kind = KIND_BULLET;
    this.ownerId = ownerId;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.angle = angle;
    this.radius = 4;
    this.ttl = ttl;
    this.hp = 1;
  }

  step(dt, bounds) {
    this.x = wrapCoord(this.x + this.vx * dt, bounds.width);
    this.y = wrapCoord(this.y + this.vy * dt, bounds.height);
    this.ttl -= dt;
    if (this.ttl <= 0) this.hp = 0;
  }

  toSnapshot() {
    return {
      id: this.id,
      kind: KIND_BULLET,
      ownerId: this.ownerId,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      angle: this.angle,
      hp: this.hp
    };
  }

  static fromSnapshot(s) {
    return new Bullet(s);
  }
} 