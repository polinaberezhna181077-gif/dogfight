function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}

function lerpAngle(a, b, alpha) {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * alpha;
}

export function drawShip(ctx, ship, alpha) {
  if (!ship || !ship.alive) return;

  const x = lerp(ship.prevPos.x, ship.pos.x, alpha);
  const y = lerp(ship.prevPos.y, ship.pos.y, alpha);
  const angle = lerpAngle(ship.prevAngle, ship.angle, alpha);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(-10, -10);
  ctx.lineTo(-10, 10);
  ctx.closePath();

  ctx.fillStyle = "white";
  ctx.fill();

  if (ship.thrusting) {
    ctx.beginPath();
    ctx.moveTo(-10, -5);
    ctx.lineTo(-25, 0);
    ctx.lineTo(-10, 5);
    ctx.fillStyle = "orange";
    ctx.fill();
  }

  if (ship.shield) {
    ctx.strokeStyle = "#3399ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, ship.radius + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawWorld(ctx, world, alpha) {
  for (const e of world) {
    if (!e.alive) continue;

    if (e.kind === 'ship') {
      drawShip(ctx, e, alpha);
    } else if (e.kind === 'bullet') {
      const x = lerp(e.prevPos.x, e.pos.x, alpha);
      const y = lerp(e.prevPos.y, e.pos.y, alpha);
      ctx.fillStyle = e.homing ? "#ff00ff" : "#ffff00";
      ctx.beginPath();
      ctx.arc(x, y, e.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'asteroid') {
      const x = lerp(e.prevPos.x, e.pos.x, alpha);
      const y = lerp(e.prevPos.y, e.pos.y, alpha);
      ctx.strokeStyle = e.homing ? "#ff4444" : "#aaaaaa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, e.radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.kind === 'pickup') {
      ctx.strokeStyle = e.bonusType === 'shield' ? "#3399ff" : "#ff9900";
      ctx.lineWidth = 2;
      ctx.strokeRect(e.pos.x - 10, e.pos.y - 10, 20, 20);
      ctx.fillStyle = "white";
      ctx.font = "12px monospace";
      ctx.fillText(e.bonusType === 'shield' ? "S" : "R", e.pos.x - 4, e.pos.y + 4);
    } else if (e.kind === 'explosion') {
      const opacity = Math.max(0, e.ttl / e.maxTtl);
      ctx.fillStyle = `rgba(255, 120, 0, ${opacity})`;
      for (const p of e.particles) {
        ctx.fillRect(p.pos.x, p.pos.y, 3, 3);
      }
    }
  }
}

export function drawHud(ctx, stats, world) {
  ctx.fillStyle = "lime";
  ctx.font = "14px monospace";
  ctx.fillText(`FPS: ${stats.fps} | UPS: ${stats.ups} | FrameTime: ${Math.round(stats.frameTime)}ms`, 10, 20);

  const hp = world.playerShip && world.playerShip.alive ? world.playerShip.hp : 0;
  ctx.fillStyle = "white";
  ctx.fillText(`Score: ${world.score} | HP: ${hp}`, 10, 42);

  if (world.playerShip && !world.playerShip.alive) {
    ctx.fillStyle = "#ff5555";
    ctx.fillText(`SHIP DESTROYED! Respawning in ${(2 - world.respawnTimer).toFixed(1)}s...`, 10, 64);
  } else if (world.playerShip) {
    const bonuses = [];
    if (world.playerShip.shield) bonuses.push("SHIELD");
    if (world.playerShip.rapidFireTimer > 0) bonuses.push(`RAPID (${world.playerShip.rapidFireTimer.toFixed(1)}s)`);
    if (bonuses.length > 0) {
      ctx.fillStyle = "#33ccff";
      ctx.fillText(`Active: ${bonuses.join(" + ")}`, 10, 64);
    }
  }

  ctx.fillStyle = "#888";
  ctx.fillText(`Controls: Arrows/WASD - Move | Space - Fire | H - Homing Missile`, 10, world.height - 12);
}