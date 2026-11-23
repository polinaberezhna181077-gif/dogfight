export interface CanvasSetup {
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
}

export function setupCanvas(
  canvas: HTMLCanvasElement,
  logicalWidth = 960,
  logicalHeight = 640
): CanvasSetup {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = logicalWidth * dpr;
  canvas.height = logicalHeight * dpr;
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context is not available');
  }
  ctx.scale(dpr, dpr);

  return { ctx, width: logicalWidth, height: logicalHeight };
}