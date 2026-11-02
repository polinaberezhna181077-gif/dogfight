export function createLoop({ step = 1 / 60, simulate, render }) {
  let accumulator = 0;
  let last = performance.now();
  let frameId;

  let frames = 0, steps = 0;
  let lastStatTime = performance.now();
  let stats = { fps: 0, ups: 0, frameTime: 0 };

  function frame(now) {
    const dt = now - last;
    stats.frameTime = dt;
    
    accumulator += Math.min(dt / 1000, 0.25);
    last = now;

    while (accumulator >= step) {
      simulate(step);
      accumulator -= step;
      steps++;
    }
    
    render(accumulator / step);
    frames++;

    
    if (now - lastStatTime >= 1000) {
      stats.fps = frames;
      stats.ups = steps;
      frames = 0;
      steps = 0;
      lastStatTime = now;
    }

    frameId = requestAnimationFrame(frame);
  }

  return {
    start: () => { 
      last = performance.now(); 
      frameId = requestAnimationFrame(frame); 
    },
    stop: () => cancelAnimationFrame(frameId),
    getStats: () => stats
  };
} 