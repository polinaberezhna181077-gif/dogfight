export function circlesOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = (a.radius || 10) + (b.radius || 10);
  return dx * dx + dy * dy <= r * r;
} 