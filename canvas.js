export function setupCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  

  const dpr = window.devicePixelRatio || 1;
  
  
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  
 
  ctx.scale(dpr, dpr);
  
  return { ctx, width, height };
} 