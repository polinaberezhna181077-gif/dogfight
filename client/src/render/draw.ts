export function drawLoadingScreen(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  statusLabel: string,
  errorText?: string
): void {
  ctx.fillStyle = '#0b0f17';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('DOGFIGHT // LOADING', width / 2, height / 2 - 40);

  const barW = 320;
  const barH = 14;
  const bx = (width - barW) / 2;
  const by = height / 2 - 12;

  ctx.strokeStyle = '#334155';
  ctx.strokeRect(bx, by, barW, barH);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(bx + 2, by + 2, (barW - 4) * Math.max(0, Math.min(1, progress)), barH - 4);

  ctx.font = '13px monospace';
  ctx.fillStyle = errorText ? '#f87171' : '#94a3b8';
  ctx.fillText(errorText ?? statusLabel, width / 2, by + 38);
  ctx.textAlign = 'left';
}