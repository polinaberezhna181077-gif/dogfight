import { Ship } from './ship.js';
import { Bullet, Asteroid, Pickup, Explosion, HomingBehavior } from './entities.js';
import { detectCollisions } from './collision.js';

export class World extends EventTarget {
  #entities = new Map();

  constructor(width, height) {
    super();
    this.width = width;
    this.height = height;
    this.score = 0;
    this.respawnTimer = 0;
    this.playerShip = null;
  }

  spawn(entity) {
    this.#entities.set(entity.id, entity);
    return entity;
  }

  despawn(id) {
    const e = this.#entities.get(id);
    if (e) e.alive = false;
  }

  get(id) {
    return this.#entities.get(id);
  }

  *[Symbol.iterator]() {
    yield* this.#entities.values();
  }

  *ofKind(kind) {
    for (const e of this) {
      if (e.kind === kind) yield e;
    }
  }

  spawnBullet(pos, vel, angle, ownerId, isHoming = false) {
    const bullet = new Bullet(pos, vel, angle, ownerId);
    if (isHoming) {
      bullet.homing = new HomingBehavior('asteroid', 5, 450);
    }
    this.spawn(bullet);
    this.dispatchEvent(new CustomEvent('fired', { detail: { bullet } }));
  }

  spawnPlayer() {
    let x = this.width / 2;
    let y = this.height / 2;

    for (let attempt = 0; attempt < 15; attempt++) {
      const rx = 80 + Math.random() * (this.width - 160);
      const ry = 80 + Math.random() * (this.height - 160);
      let safe = true;

      for (const ast of this.ofKind('asteroid')) {
        if (Math.hypot(ast.pos.x - rx, ast.pos.y - ry) < 120) {
          safe = false;
          break;
        }
      }

      if (safe) {
        x = rx;
        y = ry;
        break;
      }
    }

    this.playerShip = this.spawn(new Ship(x, y));
  }

  step(dt, input) {
    if (this.playerShip && !this.playerShip.alive) {
      this.respawnTimer += dt;
      if (this.respawnTimer >= 2.0) {
        this.respawnTimer = 0;
        this.spawnPlayer();
      }
    }

    for (const e of this) {
      if (e.alive) {
        e.update(dt, this, e === this.playerShip ? input : null);
      }
    }

    for (const [a, b] of detectCollisions(this)) {
      this.resolveCollision(a, b);
    }

    for (const [id, e] of this.#entities) {
      if (!e.alive) {
        this.#entities.delete(id);
      }
    }
  }

  resolveCollision(a, b) {
    if ((a.kind === 'bullet' && b.kind === 'asteroid') || (b.kind === 'bullet' && a.kind === 'asteroid')) {
      const bullet = a.kind === 'bullet' ? a : b;
      const asteroid = a.kind === 'asteroid' ? a : b;

      bullet.alive = false;
      asteroid.alive = false;
      this.score += 100;
      this.spawn(new Explosion(asteroid.pos.x, asteroid.pos.y));

      this.dispatchEvent(new CustomEvent('exploded', { detail: { pos: asteroid.pos } }));
      this.dispatchEvent(new CustomEvent('scoreChanged', { detail: { score: this.score } }));

      if (Math.random() < 0.35) {
        const bonus = Math.random() < 0.5 ? 'shield' : 'rapid';
        this.spawn(new Pickup(asteroid.pos.x, asteroid.pos.y, bonus));
      }
    }

    if ((a.kind === 'ship' && b.kind === 'asteroid') || (b.kind === 'ship' && a.kind === 'asteroid')) {
      const ship = a.kind === 'ship' ? a : b;
      const asteroid = a.kind === 'asteroid' ? a : b;

      asteroid.alive = false;
      ship.takeDamage(50);
      this.spawn(new Explosion(asteroid.pos.x, asteroid.pos.y));

      this.dispatchEvent(new CustomEvent('hit', { detail: { hp: ship.hp } }));

      if (!ship.alive) {
        this.spawn(new Explosion(ship.pos.x, ship.pos.y));
        this.dispatchEvent(new CustomEvent('exploded', { detail: { pos: ship.pos } }));
      }
    }

    if ((a.kind === 'ship' && b.kind === 'pickup') || (b.kind === 'ship' && a.kind === 'pickup')) {
      const ship = a.kind === 'ship' ? a : b;
      const pickup = a.kind === 'pickup' ? a : b;

      pickup.alive = false;
      if (pickup.bonusType === 'shield') ship.shield = true;
      if (pickup.bonusType === 'rapid') ship.rapidFireTimer = 5.0;
    }
  }
}