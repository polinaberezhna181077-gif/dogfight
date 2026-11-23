function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}

function lerpAngle(a, b, alpha) {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * alpha;
}

// Екран завантаження зі справжнім прогрес-баром на канвасі
export function drawLoadingScreen(ctx, width, height, progress, label, errorMsg = null) {
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, width, height);

  const barW = 360;
  const barH = 22;
  const x = (width - barW) / 2;
  const y = height / 2;

  ctx.fillStyle = '#ffffff';
  ctx.font = '18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LOADING ASSETS...', width / 2, y - 30);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, barW, barH);

  ctx.fillStyle = errorMsg ? '#ef4444' : '#38bdf8';
  ctx.fillRect(x + 2, y + 2, Math.max(0, (barW - 4) * progress), barH - 4);

  ctx.font = '13px monospace';
  ctx.fillStyle = errorMsg ? '#f87171' : '#94a3b8';
  const statusText = errorMsg
    ? `Error: ${errorMsg} (Click canvas to Retry)`
    : `${Math.round(progress * 100)}% — ${label}`;
  ctx.fillText(statusText, width / 2, y + 45);
  ctx.textAlign = 'left';
}

function drawSpriteFrame(ctx, assets, frameName, x, y, angle, size) {
  const frame = assets?.frames?.[frameName];
  if (assets?.sheet && frame) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(
      assets.sheet,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      -size / 2,
      -size / 2,
      size,
      size
    );
    ctx.restore();
    return true;
  }
  return false;
}

export function drawShip(ctx, ship, alpha, assets) {
  if (!ship || !ship.alive) return;

  const x = lerp(ship.prevPos.x, ship.pos.x, alpha);
  const y = lerp(ship.prevPos.y, ship.pos.y, alpha);
  const angle = lerpAngle(ship.prevAngle, ship.angle, alpha);

  if (ship.thrusting) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-12, -5);
    ctx.lineTo(-26, 0);
    ctx.lineTo(-12, 5);
    ctx.fillStyle = 'orange';
    ctx.fill();
    ctx.restore();
  }

  const drawn = drawSpriteFrame(ctx, assets, 'ship', x, y, angle, 38);
  if (!drawn) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -10);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.restore();
  }

  if (ship.shield) {
    ctx.strokeStyle = '#3399ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, ship.radius + 7, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawWorld(ctx, world, alpha, assets) {
  for (const e of world) {
    if (!e.alive) continue;

    if (e.kind === 'ship') {
      drawShip(ctx, e, alpha, assets);
    } else if (e.kind === 'bullet') {
      const x = lerp(e.prevPos.x, e.pos.x, alpha);
      const y = lerp(e.prevPos.y, e.pos.y, alpha);
      if (!drawSpriteFrame(ctx, assets, 'bullet', x, y, e.angle, 16)) {
        ctx.fillStyle = e.homing ? '#ff00ff' : '#ffff00';
        ctx.beginPath();
        ctx.arc(x, y, e.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (e.kind === 'asteroid') {
      const x = lerp(e.prevPos.x, e.pos.x, alpha);
      const y = lerp(e.prevPos.y, e.pos.y, alpha);
      if (!drawSpriteFrame(ctx, assets, 'asteroid', x, y, e.angle, e.radius * 2.3)) {
        ctx.strokeStyle = e.homing ? '#ff4444' : '#aaaaaa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, e.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (e.homing) {
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, e.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (e.kind === 'pickup') {
      if (!drawSpriteFrame(ctx, assets, 'pickup', e.pos.x, e.pos.y, 0, 32)) {
        ctx.strokeStyle = e.bonusType === 'shield' ? '#3399ff' : '#ff9900';
        ctx.lineWidth = 2;
        ctx.strokeRect(e.pos.x - 10, e.pos.y - 10, 20, 20);
      }
      ctx.fillStyle = 'white';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(e.bonusType === 'shield' ? 'S' : 'R', e.pos.x - 3, e.pos.y + 4);
    } else if (e.kind === 'explosion') {
      const opacity = Math.max(0, e.ttl / e.maxTtl);
      ctx.fillStyle = `rgba(255, 120, 0, ${opacity})`;
      for (const p of e.particles) {
        ctx.fillRect(p.pos.x, p.pos.y, 3, 3);
      }
    }
  }
}