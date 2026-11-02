import { createLoop } from './loop.js';
import { createInput } from './input.js';
import { integrate } from './sim/ship.js';
import { wrapBounds } from './sim/arena.js';
import { setupCanvas } from './render/canvas.js';
import { drawShip, drawHud } from './render/draw.js';


const canvas = document.getElementById('game');
const { ctx, width, height } = setupCanvas(canvas);

const input = createInput(window);


const ship = {
  x: width / 2, y: height / 2,
  prevX: width / 2, prevY: height / 2,
  vx: 0, vy: 0,
  angle: 0, prevAngle: 0,
  thrusting: false
};


function drawBackground() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < width; i += 50) { ctx.moveTo(i, 0); ctx.lineTo(i, height); }
  for (let i = 0; i < height; i += 50) { ctx.moveTo(0, i); ctx.lineTo(width, i); }
  ctx.stroke();
}


const loop = createLoop({
  step: 1 / 60,
  simulate: (dt) => {
    ship.thrusting = input.isDown('ArrowUp');
    integrate(ship, input, dt);
    wrapBounds(ship, width, height);
  },
  render: (alpha) => {
    ctx.clearRect(0, 0, width, height);
    drawBackground();
    drawShip(ctx, ship, alpha);
    drawHud(ctx, loop.getStats());
  }
});

loop.start(); 