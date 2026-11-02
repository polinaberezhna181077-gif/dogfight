
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
  const x = lerp(ship.prevX, ship.x, alpha);
  const y = lerp(ship.prevY, ship.y, alpha);
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

  ctx.restore();
}


export function drawHud(ctx, stats) {
  ctx.fillStyle = "lime";
  ctx.font = "14px monospace";
  ctx.fillText(`FPS: ${stats.fps} | UPS: ${stats.ups} | FrameTime: ${Math.round(stats.frameTime)}ms`, 10, 20);
} 