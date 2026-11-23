export function* detectCollisions(world) {
  const entities = Array.from(world);

  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    if (!a.alive || a.kind === 'explosion') continue;

    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];
      if (!b.alive || b.kind === 'explosion') continue;

      const dist = a.pos.sub(b.pos).length();
      if (dist < a.radius + b.radius) {
        yield [a, b];
      }
    }
  }
}