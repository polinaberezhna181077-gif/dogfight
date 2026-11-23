import {
  KIND_SHIP,
  KIND_ASTEROID,
  KIND_BULLET,
  Ship,
  Bullet,
  integrateShip,
  BULLET_SPEED,
  FIRE_COOLDOWN,
  Vector2
} from '@dogfight/shared';
import { createInput } from './input.js';
import { setupCanvas } from './render/canvas.js';
import { drawLoadingScreen } from './render/draw.js';
import { loadJson, loadAll } from './assets/loader.js';
import { SoundSystem } from './audio.js';
import { Lobby } from './lobby/lobby.js';
import { mountLobbyView, mountRoomChatOverlay } from './lobby/lobbyView.js';
import { GameConnection } from './net/connection.js';
import { Netgraph, mountNetControls } from './render/netgraph.js';

const canvas = document.getElementById('game');
const { ctx, width, height } = setupCanvas(canvas);
const sound = new SoundSystem();

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

    sound.setBuffers(assets.sounds);

    const lobby = new Lobby('/api/rooms');
    mountLobbyView(lobby);
    lobby.startPolling(3000);

    lobby.addEventListener('joined', (e) => {
      sound.unlock();
      startMultiplayerGame(assets, e.detail);
    });
  } catch (err) {
    console.error('Boot failed:', err);
    drawLoadingScreen(ctx, width, height, progress, statusLabel, err.message);
  }
}

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function startMultiplayerGame(assets, session) {
  const netState = {
    protocol: 'binary',
    predictionEnabled: true,
    interpDelayMs: 70
  };

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const connection = new GameConnection(`${wsProto}//${window.location.host}/ws?proto=binary`);
  mountRoomChatOverlay(connection, session.room.name);
  mountNetControls(connection, netState);

  const netgraph = new Netgraph();
  const input = createInput(window);
  const bounds = { width: 960, height: 640 };

  let myOwnerId = null;
  let localShip = new Ship({ id: 0, ownerId: 0, x: width / 2, y: height / 2 });
  let smoothOffsetX = 0;
  let smoothOffsetY = 0;
  let lastCorrectionPx = 0;

  let inputSeq = 0;
  const pendingInputs = [];
  const localBullets = [];
  const snapshotBuffer = [];
  let latestTick = 0;
  let lastSnapshotTime = performance.now();

  connection.addEventListener('welcome', (e) => {
    myOwnerId = e.detail.ownerId;
    localShip.ownerId = myOwnerId;
  });

  connection.addEventListener('snapshot', (e) => {
    const snap = e.detail;
    latestTick = snap.tick;
    lastSnapshotTime = performance.now();

    snapshotBuffer.push({ recvTime: lastSnapshotTime, snap });
    if (snapshotBuffer.length > 30) snapshotBuffer.shift();

    const authMe = snap.entities.find((ent) => ent.kind === KIND_SHIP && ent.ownerId === myOwnerId);
    if (!authMe) return;

    while (pendingInputs.length > 0 && pendingInputs[0].seq <= snap.lastProcessedSeq) {
      pendingInputs.shift();
    }

    if (!netState.predictionEnabled) {
      lastCorrectionPx = Math.hypot(authMe.x - localShip.x, authMe.y - localShip.y);
      localShip = Ship.fromSnapshot(authMe);
      smoothOffsetX = 0;
      smoothOffsetY = 0;
      return;
    }

    const prevX = localShip.x;
    const prevY = localShip.y;

    const reconciled = Ship.fromSnapshot(authMe);
    for (const inp of pendingInputs) {
      integrateShip(reconciled, inp, 1 / 30, bounds);
    }

    const errX = prevX - reconciled.x;
    const errY = prevY - reconciled.y;
    lastCorrectionPx = Math.hypot(errX, errY);

    if (lastCorrectionPx < 120) {
      smoothOffsetX += errX;
      smoothOffsetY += errY;
    } else {
      smoothOffsetX = 0;
      smoothOffsetY = 0;
    }

    localShip = reconciled;
  });

  connection.connect();
  connection.send({
    type: 'join',
    room: session.room.id,
    name: session.playerName
  });

  const SIM_DT = 1 / 30;
  let accumulator = 0;
  let lastFrame = performance.now();

  function sampleInput() {
    const turn = (input.isDown('ArrowRight') || input.isDown('KeyD') ? 1 : 0)
      - (input.isDown('ArrowLeft') || input.isDown('KeyA') ? 1 : 0);
    const thrust = (input.isDown('ArrowUp') || input.isDown('KeyW')) ? 1 : 0;
    const fire = input.isDown('Space') ? 1 : 0;
    return { turn, thrust, fire };
  }

  function stepClientSim(dt) {
    const raw = sampleInput();
    inputSeq++;
    const cmd = { seq: inputSeq, ...raw };
    connection.sendInput(cmd);

    if (netState.predictionEnabled && myOwnerId !== null) {
      pendingInputs.push(cmd);
      integrateShip(localShip, cmd, dt, bounds);

      if (cmd.fire && localShip.cooldown <= 0) {
        localShip.cooldown = FIRE_COOLDOWN;
        const dir = Vector2.fromAngle(localShip.angle);
        localBullets.push(new Bullet({
          id: -inputSeq,
          ownerId: myOwnerId,
          x: localShip.x + dir.x * (localShip.radius + 6),
          y: localShip.y + dir.y * (localShip.radius + 6),
          vx: localShip.vx + dir.x * BULLET_SPEED,
          vy: localShip.vy + dir.y * BULLET_SPEED,
          angle: localShip.angle,
          ttl: 0.35
        }));
      }
    }

    for (let i = localBullets.length - 1; i >= 0; i--) {
      localBullets[i].step(dt, bounds);
      if (localBullets[i].hp <= 0) localBullets.splice(i, 1);
    }

    const decay = Math.exp(-dt / 0.1);
    smoothOffsetX *= decay;
    smoothOffsetY *= decay;
  }

  function getInterpolatedEntities() {
    if (snapshotBuffer.length === 0) return [];
    const renderTime = performance.now() - netState.interpDelayMs;

    let older = snapshotBuffer[0];
    let newer = snapshotBuffer[snapshotBuffer.length - 1];

    for (let i = 0; i < snapshotBuffer.length - 1; i++) {
      if (snapshotBuffer[i].recvTime <= renderTime && snapshotBuffer[i + 1].recvTime >= renderTime) {
        older = snapshotBuffer[i];
        newer = snapshotBuffer[i + 1];
        break;
      }
    }

    const span = Math.max(1, newer.recvTime - older.recvTime);
    const alpha = Math.max(0, Math.min(1, (renderTime - older.recvTime) / span));

    const olderMap = new Map(older.snap.entities.map((e) => [e.id, e]));
    const result = [];

    for (const curr of newer.snap.entities) {
      if (curr.kind === KIND_SHIP && curr.ownerId === myOwnerId) continue;
      const prev = olderMap.get(curr.id);
      if (!prev || Math.hypot(curr.x - prev.x, curr.y - prev.y) > 200) {
        result.push(curr);
      } else {
        result.push({
          ...curr,
          x: prev.x + (curr.x - prev.x) * alpha,
          y: prev.y + (curr.y - prev.y) * alpha,
          angle: lerpAngle(prev.angle, curr.angle, alpha)
        });
      }
    }
    return result;
  }

  function drawShip(ship, color) {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);
    ctx.strokeStyle = color;
    ctx.fillStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    accumulator += dt;

    while (accumulator >= SIM_DT) {
      stepClientSim(SIM_DT);
      accumulator -= SIM_DT;
    }

    const arenaCfg = session.room?.arena || {};
    ctx.fillStyle = arenaCfg.bgColor || '#11151c';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = arenaCfg.gridColor || '#222b38';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < width; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = 0; y < height; y += 50) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();

    const remoteEntities = getInterpolatedEntities();
    for (const ent of remoteEntities) {
      if (ent.kind === KIND_ASTEROID) {
        ctx.save();
        ctx.translate(ent.x, ent.y);
        ctx.rotate(ent.angle);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (ent.kind === KIND_SHIP) {
        drawShip(ent, '#f43f5e');
      } else if (ent.kind === KIND_BULLET) {
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.arc(ent.x, ent.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const b of localBullets) {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (myOwnerId !== null) {
      drawShip({
        x: localShip.x + smoothOffsetX,
        y: localShip.y + smoothOffsetY,
        angle: localShip.angle
      }, '#38bdf8');
    }

    netgraph.pushSample(connection.rttMs, lastCorrectionPx);
    netgraph.draw(ctx, {
      protocol: netState.protocol,
      tick: latestTick,
      rttMs: connection.rttMs,
      snapshotAgeMs: Math.round(now - lastSnapshotTime),
      bytesIn: connection.bytesInPerSec,
      bytesOut: connection.bytesOutPerSec,
      pendingInputs: pendingInputs.length,
      interpDelayMs: netState.interpDelayMs,
      correctionPx: lastCorrectionPx,
      predictionEnabled: netState.predictionEnabled
    });

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot(); 