import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

// === КОМПОЗИЦІЯ: поведінка самонаведення ===
export class HomingBehavior {
  constructor(targetKind, turnRate = 4, speed = 350) {
    this.targetKind = targetKind;
    this.turnRate = turnRate;
    this.speed = speed;
  }

  update(entity, dt, world) {
    let closest = null;
    let minDist = Infinity;

    for (const other of world.ofKind(this.targetKind)) {
      if (!other.alive || other.id === entity.ownerId) continue;
      const dist = other.pos.sub(entity.pos).length();
      if (dist < minDist) {
        minDist = dist;
        closest = other;
      }
    }

    if (closest) {
      const desired = closest.pos.sub(entity.pos).normalize().scale(this.speed);
      const steer = desired.sub(entity.vel).scale(this.turnRate * dt);
      entity.vel = entity.vel.add(steer).normalize().scale(this.speed);
      entity.angle = Math.atan2(entity.vel.y, entity.vel.x);
    }
  }
}

// === КУЛЯ (з TTL) ===
export class Bullet extends Entity {
  constructor(pos, vel, angle, ownerId) {
    super({ x: pos.x, y: pos.y, vx: vel.x, vy: vel.y, angle, radius: 3, kind: 'bullet' });
    this.ownerId = ownerId;
    this.ttl = 1.6;
  }

  update(dt, world) {
    this.ttl -= dt;
    if (this.ttl <= 0) {
      this.alive = false;
      return;
    }
    super.update(dt, world);
  }
}

// === АСТЕРОЇД ===
export class Asteroid extends Entity {
  constructor(x, y, radius = 24) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 70;
    const vel = Vector2.fromAngle(angle, speed);
    super({ x, y, vx: vel.x, vy: vel.y, angle, radius, kind: 'asteroid' });
    this.spin = (Math.random() - 0.5) * 2;
  }

  update(dt, world) {
    super.update(dt, world);
    this.angle += this.spin * dt;

    if (this.pos.x < this.radius) {
      this.pos.x = this.radius;
      this.vel.x *= -1;
    } else if (this.pos.x > world.width - this.radius) {
      this.pos.x = world.width - this.radius;
      this.vel.x *= -1;
    }

    if (this.pos.y < this.radius) {
      this.pos.y = this.radius;
      this.vel.y *= -1;
    } else if (this.pos.y > world.height - this.radius) {
      this.pos.y = world.height - this.radius;
      this.vel.y *= -1;
    }
  }
}

// === ПИКАП (Бонус: стоїть на місці, колізиться, не корабель) ===
export class Pickup extends Entity {
  constructor(x, y, bonusType = 'shield') {
    super({ x, y, vx: 0, vy: 0, radius: 13, kind: 'pickup' });
    this.bonusType = bonusType; // 'shield' або 'rapid'
  }
}

// === ВИБУХ (Частинки) ===
export class Explosion extends Entity {
  constructor(x, y) {
    super({ x, y, radius: 1, kind: 'explosion' });
    this.ttl = 0.5;
    this.maxTtl = 0.5;
    this.particles = Array.from({ length: 16 }, () => {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 140;
      return {
        pos: new Vector2(x, y),
        vel: Vector2.fromAngle(a, s)
      };
    });
  }

  update(dt) {
    this.ttl -= dt;
    if (this.ttl <= 0) {
      this.alive = false;
      return;
    }
    for (const p of this.particles) {
      p.pos = p.pos.add(p.vel.scale(dt));
    }
  }
}