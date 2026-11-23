import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Ship extends Entity {
  #hp = 100;

  constructor(x, y) {
    super({ x, y, radius: 14, kind: 'ship' });
    this.thrusting = false;
    this.cooldown = 0;
    this.rapidFireTimer = 0;
    this.shield = false;
  }

  get hp() {
    return this.#hp;
  }

  takeDamage(amount) {
    if (this.shield) {
      this.shield = false;
      return;
    }
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp === 0) {
      this.alive = false;
    }
  }

  update(dt, world, input) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.rapidFireTimer > 0) this.rapidFireTimer -= dt;

    const ROTATION_SPEED = Math.PI * 2;
    const THRUST = 300;
    const DRAG = 0.98;

    this.thrusting = false;

    if (input) {
      if (input.isDown('ArrowLeft') || input.isDown('KeyA')) {
        this.angle -= ROTATION_SPEED * dt;
      }
      if (input.isDown('ArrowRight') || input.isDown('KeyD')) {
        this.angle += ROTATION_SPEED * dt;
      }
      if (input.isDown('ArrowUp') || input.isDown('KeyW')) {
        this.thrusting = true;
        const thrustVec = Vector2.fromAngle(this.angle, THRUST * dt);
        this.vel = this.vel.add(thrustVec);
      }
    }

    this.vel = this.vel.scale(DRAG);

    super.update(dt, world);
    this.wrapBounds(world.width, world.height);
  }

  wrapBounds(width, height) {
    if (this.pos.x < 0) {
      this.pos.x += width;
      this.prevPos.x += width;
    } else if (this.pos.x > width) {
      this.pos.x -= width;
      this.prevPos.x -= width;
    }

    if (this.pos.y < 0) {
      this.pos.y += height;
      this.prevPos.y += height;
    } else if (this.pos.y > height) {
      this.pos.y -= height;
      this.prevPos.y -= height;
    }
  }

  fire(world, isHoming = false) {
    if (this.cooldown > 0 || !this.alive) return;

    this.cooldown = this.rapidFireTimer > 0 ? 0.12 : 0.35;

    const nose = this.pos.add(Vector2.fromAngle(this.angle, this.radius + 6));
    const bulletVel = this.vel.add(Vector2.fromAngle(this.angle, 450));

    world.spawnBullet(nose, bulletVel, this.angle, this.id, isHoming);
  }
}