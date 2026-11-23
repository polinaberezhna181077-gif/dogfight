import { createPrng } from '../prng.js';
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

export class SimWorld {
  constructor({ width = 960, height = 640, seed = 42, asteroidCount = 4 } = {}) {
    this.width = width;
    this.height = height;
    this.seed = seed;
    this.prng = createPrng(seed);
    this.tick = 0;
    this.nextEntityId = 1;
    this.ships = new Map();     // ownerId -> Ship
    this.asteroids = new Map(); // id -> Asteroid
    this.bullets = new Map();   // id -> Bullet

    for (let i = 0; i < asteroidCount; i++) {
      this.spawnAsteroid();
    }
  }

  spawnAsteroid() {
    const id = this.nextEntityId++;
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

  addPlayerShip(ownerId, name) {
    const id = this.nextEntityId++;
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

  removePlayerShip(ownerId) {
    this.ships.delete(ownerId);
  }

  applyPlayerInput(ownerId, input, dt) {
    const ship = this.ships.get(ownerId);
    if (!ship || ship.hp <= 0) return;

    integrateShip(ship, input, dt, { width: this.width, height: this.height });

    if (input.fire && ship.cooldown <= 0) {
      ship.cooldown = FIRE_COOLDOWN;
      const dir = Vector2.fromAngle(ship.angle);
      const id = this.nextEntityId++;
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

  step(dt, inputsByOwner = new Map()) {
    this.tick++;

    const ownerIds = Array.from(this.ships.keys()).sort((a, b) => a - b);
    for (const ownerId of ownerIds) {
      const inp = inputsByOwner.get(ownerId) || { turn: 0, thrust: 0, fire: 0 };
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

  getEntitiesSnapshot() {
    const list = [];
    for (const ship of this.ships.values()) list.push(ship.toSnapshot());
    for (const ast of this.asteroids.values()) list.push(ast.toSnapshot());
    for (const bullet of this.bullets.values()) list.push(bullet.toSnapshot());
    return list;
  }

  computeHash() {
    let h = 2166136261 >>> 0;
    for (const e of this.getEntitiesSnapshot()) {
      const vals = [e.id, e.kind, Math.round(e.x * 100), Math.round(e.y * 100), Math.round(e.angle * 1000), e.hp];
      for (const v of vals) {
        h ^= v & 0xffff;
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
    return h.toString(16);
  }
} 