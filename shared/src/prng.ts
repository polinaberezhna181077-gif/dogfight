export interface Prng {
  next(): number;
  range(min: number, max: number): number;
  getState(): number;
  setState(s: number): void;
}

export function createPrng(seed = 12345): Prng {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(min: number, max: number): number {
      return min + this.next() * (max - min);
    },
    getState(): number {
      return state >>> 0;
    },
    setState(s: number): void {
      state = s >>> 0;
    }
  };
} 