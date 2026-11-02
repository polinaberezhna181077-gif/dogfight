export function createInput(target) {
  const down = new Set();     
  const pressed = new Set();  

  target.addEventListener("keydown", (e) => {
    
    if (!down.has(e.code)) {
      pressed.add(e.code);
    }
    down.add(e.code);
  });

  target.addEventListener("keyup", (e) => {
    down.delete(e.code);
  });

  return {
    isDown: (code) => down.has(code),
    justPressed: (code) => {
      if (pressed.has(code)) {
        pressed.delete(code); 
        return true;
      }
      return false;
    }
  };
} 