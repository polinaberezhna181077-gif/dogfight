export class Hud {
  constructor() {
    this.lastPopup = '';
    this.popupTimer = 0;
  }

  // Підписка на події світу без імпорту HUD у симуляцію
  attachToWorld(world) {
    world.addEventListener('scoreChanged', (e) => {
      this.lastPopup = `+100! (Total: ${e.detail.score})`;
      this.popupTimer = 1.5;
    });
  }

  update(dt) {
    if (this.popupTimer > 0) {
      this.popupTimer = Math.max(0, this.popupTimer - dt);
    }
  }

  draw(ctx, stats, world, sessionInfo) {
    ctx.fillStyle = 'lime';
    ctx.font = '14px monospace';
    ctx.fillText(`FPS: ${stats.fps} | UPS: ${stats.ups} | FrameTime: ${Math.round(stats.frameTime)}ms`, 10, 20);

    const hp = world.playerShip && world.playerShip.alive ? world.playerShip.hp : 0;
    const pilot = sessionInfo?.playerName || 'Pilot';
    const room = sessionInfo?.roomName || 'Local';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`Pilot: ${pilot} | Room: ${room}`, 10, 42);

    ctx.fillStyle = 'white';
    ctx.fillText(`Score: ${world.score} | HP: ${hp}`, 10, 64);

    if (this.popupTimer > 0) {
      ctx.fillStyle = '#facc15';
      ctx.fillText(this.lastPopup, 210, 64);
    }

    if (world.playerShip && !world.playerShip.alive) {
      ctx.fillStyle = '#ff5555';
      ctx.fillText(`SHIP DESTROYED! Respawning in ${(2 - world.respawnTimer).toFixed(1)}s...`, 10, 86);
    } else if (world.playerShip) {
      const bonuses = [];
      if (world.playerShip.shield) bonuses.push('SHIELD');
      if (world.playerShip.rapidFireTimer > 0) bonuses.push(`RAPID (${world.playerShip.rapidFireTimer.toFixed(1)}s)`);
      if (bonuses.length > 0) {
        ctx.fillStyle = '#33ccff';
        ctx.fillText(`Active: ${bonuses.join(' + ')}`, 10, 86);
      }
    }

    ctx.fillStyle = '#888';
    ctx.fillText('Controls: Arrows/WASD - Move | Space - Fire | H - Homing Missile', 10, world.height - 12);
  }
}