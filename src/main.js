import { createLoop } from './loop.js';
import { createInput } from './input.js';
import { setupCanvas } from './render/canvas.js';
import { drawLoadingScreen, drawWorld } from './render/draw.js';
import { Hud } from './render/hud.js';
import { World } from './sim/world.js';
import { Asteroid, Pickup, HomingBehavior } from './sim/entities.js';
import { loadJson, loadAll } from './assets/loader.js';
import { SoundSystem } from './audio.js';
import { Lobby } from './lobby/lobby.js';
import { mountLobbyView } from './lobby/lobbyView.js';

const canvas = document.getElementById('game');
const { ctx, width, height } = setupCanvas(canvas);

const sound = new SoundSystem();

// Розблоковуємо Web Audio при першому жесті користувача
const unlockAudio = () => sound.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

async function boot() {
  let progress = 0;
  let statusLabel = 'Fetching manifest.json...';
  drawLoadingScreen(ctx, width, height, progress, statusLabel);

  try {
    const manifest = await loadJson('/assets/manifest.json');
    const assets = await loadAll(manifest, {
      audioCtx: sound.ctx,
      onProgress: (p, label) => {
        progress = p;
        statusLabel = label;
        drawLoadingScreen(ctx, width, height, progress, statusLabel);
      }
    });

    console.log(`Assets loaded concurrently in ${assets.loadTimeMs}ms`);
    sound.setBuffers(assets.sounds);

    // Показуємо лобі після завершення завантаження ассетів
    const lobby = new Lobby('/api/rooms.json');
    mountLobbyView(lobby);
    lobby.startPolling(4000);

    lobby.addEventListener('joined', (e) => {
      sound.unlock();
      startGame(assets, e.detail);
    });
  } catch (err) {
    console.error('Boot failed:', err);
    drawLoadingScreen(ctx, width, height, progress, statusLabel, err.message);
    canvas.addEventListener('click', () => boot(), { once: true });
  }
}

function startGame(assets, session) {
  const input = createInput(window);
  const world = new World(width, height);
  const hud = new Hud();

  // Підписуємо звук і HUD на події світу (симуляція нічого про них не знає)
  sound.attachToWorld(world);
  hud.attachToWorld(world);

  const arenaCfg = session.room?.arena || assets.arena || {};
  const minAsteroids = arenaCfg.asteroidCount || 4;
  const bgColor = arenaCfg.bgColor || '#11151c';
  const gridColor = arenaCfg.gridColor || '#222b38';

  world.spawnPlayer();

  for (let i = 0; i < minAsteroids; i++) {
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
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < width; i += 50) { ctx.moveTo(i, 0); ctx.lineTo(i, height); }
    for (let i = 0; i < height; i += 50) { ctx.moveTo(0, i); ctx.lineTo(width, i); }
    ctx.stroke();
  }

  const sessionInfo = {
    playerName: session.playerName,
    roomName: session.room.name
  };

  const loop = createLoop({
    step: 1 / 60,
    simulate: (dt) => {
      if (Array.from(world.ofKind('asteroid')).length < minAsteroids) {
        world.spawn(new Asteroid(Math.random() * width, 0));
      }
      world.step(dt, input);
      hud.update(dt);
    },
    render: (alpha) => {
      ctx.clearRect(0, 0, width, height);
      drawBackground();
      drawWorld(ctx, world, alpha, assets);
      hud.draw(ctx, loop.getStats(), world, sessionInfo);
    }
  });

  loop.start();
}

boot();