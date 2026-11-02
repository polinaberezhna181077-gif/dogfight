export function integrate(ship, input, dt) {
  
  ship.prevX = ship.x;
  ship.prevY = ship.y;
  ship.prevAngle = ship.angle;

  
  const ROTATION_SPEED = Math.PI * 2; 
  const THRUST = 300;                 
  const DRAG = 0.98;                  

  
  if (input.isDown('ArrowLeft')) {
    ship.angle -= ROTATION_SPEED * dt;
  }
  if (input.isDown('ArrowRight')) {
    ship.angle += ROTATION_SPEED * dt;
  }

  
  if (input.isDown('ArrowUp')) {
    
    ship.vx += Math.cos(ship.angle) * THRUST * dt;
    ship.vy += Math.sin(ship.angle) * THRUST * dt;
  }

  
  ship.vx *= DRAG;
  ship.vy *= DRAG;

  
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
} 