import { createLoop } from './loop.js';
import { createInput } from './input.js';
import { setupCanvas } from './render/canvas.js';
import { drawWorld, drawHud } from './render/draw.js';
import { World } from './sim/world.js';
import { Asteroid, Pickup, HomingBehavior } from './sim/entities.js';

const canvas = document.getElementById('game');
const { ctx, width, height } = setupCanvas(canvas);

const input = createInput(window);
const world = new World(width, height);

world.spawnPlayer();

for (let i = 0; i < 4; i++) {
  world.spawn(new Asteroid(Math.random() * width, Math.random() * height));
}

const homingAst = new Asteroid(60, 60, 20);
homingAst.homing = new HomingBehavior('ship', 1.8, 95);
world.spawn(homingAst);

world.spawn(new Pickup(width * 0.25, height * 0.3, 'rapid'));

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    world.playerShip?.fire(world, false);
  }
  if (e.code === 'KeyH') {
    world.playerShip?.fire(world, true); 
  }
});

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
    if (Array.from(world.ofKind('asteroid')).length < 4) {
      world.spawn(new Asteroid(Math.random() * width, 0));
    }

    world.step(dt, input);
  },
  render: (alpha) => {
    ctx.clearRect(0, 0, width, height);
    drawBackground();
    drawWorld(ctx, world, alpha);
    drawHud(ctx, loop.getStats(), world);
  }
});

loop.start();