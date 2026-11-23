export class Bus<E extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof E, Set<(payload: never) => void>>();

  on<K extends keyof E>(name: K, fn: (payload: E[K]) => void): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    const handler = fn as (payload: never) => void; // Type-safe via K -> E[K] lookup on emit
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const fn of set) {
      (fn as (p: E[K]) => void)(payload); // Guaranteed to match handler registered for key K
    }
  }
}