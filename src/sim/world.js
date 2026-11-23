import { Ship } from './ship.js';
import { Bullet, Asteroid, Pickup, Explosion, HomingBehavior } from './entities.js';
import { detectCollisions } from './collision.js';

export class World {
  #entities = new Map();

  constructor(width, height) {
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
      // Композиція: прикріплюємо самонаведення на найближчий астероїд
      bullet.homing = new HomingBehavior('asteroid', 5, 450);
    }
    this.spawn(bullet);
  }

  spawnPlayer() {
    let x = this.width / 2;
    let y = this.height / 2;

    // Шукаємо безпечну точку подалі від астероїдів
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
    // 1. Респаун корабля через 2 секунди після знищення
    if (this.playerShip && !this.playerShip.alive) {
      this.respawnTimer += dt;
      if (this.respawnTimer >= 2.0) {
        this.respawnTimer = 0;
        this.spawnPlayer();
      }
    }

    // 2. Оновлення всіх живих сутностей
    for (const e of this) {
      if (e.alive) {
        e.update(dt, this, e === this.playerShip ? input : null);
      }
    }

    // 3. Обробка колізій
    for (const [a, b] of detectCollisions(this)) {
      this.resolveCollision(a, b);
    }

    // 4. Sweep: безпечне видалення мертвих сутностей наприкінці кроку
    for (const [id, e] of this.#entities) {
      if (!e.alive) {
        this.#entities.delete(id);
      }
    }
  }

  resolveCollision(a, b) {
    // Куля влучила в астероїд
    if ((a.kind === 'bullet' && b.kind === 'asteroid') || (b.kind === 'bullet' && a.kind === 'asteroid')) {
      const bullet = a.kind === 'bullet' ? a : b;
      const asteroid = a.kind === 'asteroid' ? a : b;

      bullet.alive = false;
      asteroid.alive = false;
      this.score += 100;
      this.spawn(new Explosion(asteroid.pos.x, asteroid.pos.y));

      // 35% шанс випадання бонусу (pickup)
      if (Math.random() < 0.35) {
        const bonus = Math.random() < 0.5 ? 'shield' : 'rapid';
        this.spawn(new Pickup(asteroid.pos.x, asteroid.pos.y, bonus));
      }
    }

    // Корабель зіткнувся з астероїдом
    if ((a.kind === 'ship' && b.kind === 'asteroid') || (b.kind === 'ship' && a.kind === 'asteroid')) {
      const ship = a.kind === 'ship' ? a : b;
      const asteroid = a.kind === 'asteroid' ? a : b;

      asteroid.alive = false;
      ship.takeDamage(50);
      this.spawn(new Explosion(asteroid.pos.x, asteroid.pos.y));

      if (!ship.alive) {
        this.spawn(new Explosion(ship.pos.x, ship.pos.y));
      }
    }

    // Корабель підібрав пикап
    if ((a.kind === 'ship' && b.kind === 'pickup') || (b.kind === 'ship' && a.kind === 'pickup')) {
      const ship = a.kind === 'ship' ? a : b;
      const pickup = a.kind === 'pickup' ? a : b;

      pickup.alive = false;
      if (pickup.bonusType === 'shield') ship.shield = true;
      if (pickup.bonusType === 'rapid') ship.rapidFireTimer = 5.0;
    }
  }
}