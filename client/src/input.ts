export interface InputController {
  isDown(code: string): boolean;
  destroy(): void;
}

export function createInput(target: Window = window): InputController {
  const keys = new Set<string>();

  const onKeyDown = (e: KeyboardEvent): void => {
    keys.add(e.code);
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    keys.delete(e.code);
  };

  const onBlur = (): void => {
    keys.clear();
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  return {
    isDown(code: string): boolean {
      return keys.has(code);
    },
    destroy(): void {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    }
  };
}