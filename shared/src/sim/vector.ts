export interface Vec2Like {
  readonly x: number;
  readonly y: number;
}

export class Vector2 implements Vec2Like {
  readonly x: number;
  readonly y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  add(v: Vec2Like): Vector2 {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub(v: Vec2Like): Vector2 {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  scale(s: number): Vector2 {
    return new Vector2(this.x * s, this.y * s);
  }

  length(): number {
    return Math.hypot(this.x, this.y);
  }

  static fromAngle(angle: number): Vector2 {
    return new Vector2(Math.cos(angle), Math.sin(angle));
  }
} 