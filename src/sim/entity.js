import { Vector2 } from './vector.js';

export class Entity {
  static #nextId = 1;
  #id = Entity.#nextId++;

  constructor({ x = 0, y = 0, vx = 0, vy = 0, angle = 0, radius = 10, kind = 'entity' } = {}) {
    this.pos = new Vector2(x, y);
    this.prevPos = new Vector2(x, y);
    this.vel = new Vector2(vx, vy);
    this.angle = angle;
    this.prevAngle = angle;
    this.radius = radius;
    this.kind = kind;
    this.alive = true;

    // Поле для композиції (поведінка самонаведення)
    this.homing = null;
  }

  get id() {
    return this.#id;
  }

  savePrevState() {
    this.prevPos = new Vector2(this.pos.x, this.pos.y);
    this.prevAngle = this.angle;
  }

  update(dt, world) {
    this.savePrevState();

    // Якщо до сутності прикріплений компонент самонаведення (Композиція!)
    if (this.homing) {
      this.homing.update(this, dt, world);
    }

    this.pos = this.pos.add(this.vel.scale(dt));
  }
}