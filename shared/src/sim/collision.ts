export interface CircleBody {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export function circlesOverlap(a: CircleBody, b: CircleBody): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy <= r * r;
} 