import { fetchJson } from '../assets/loader.js';

export class Lobby extends EventTarget {
  constructor(endpoint = '/api/rooms') {
    super();
    this.endpoint = endpoint;
    this.rooms = [];
    this.pollTimer = null;
    this.inFlightController = null;
    this.active = false;
  }

  async refresh() {
    this.inFlightController?.abort();
    const manualController = new AbortController();
    this.inFlightController = manualController;

    const signal = AbortSignal.any([
      manualController.signal,
      AbortSignal.timeout(3000)
    ]);

    try {
      const data = await fetchJson(this.endpoint, { signal });
      if (!this.active) return;
      this.rooms = data;
      this.dispatchEvent(new CustomEvent('roomsChanged', { detail: this.rooms }));
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        return;
      }
      this.dispatchEvent(new CustomEvent('error', { detail: err.message }));
    } finally {
      if (this.inFlightController === manualController) {
        this.inFlightController = null;
      }
    }
  }

  async createRoom(name) {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, maxPlayers: 6 })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const created = await res.json();
    await this.refresh();
    return created;
  }

  startPolling(intervalMs = 3000) {
    this.active = true;
    this.refresh();
    this.pollTimer = setInterval(() => {
      if (this.active) this.refresh();
    }, intervalMs);
  }

  leave() {
    this.active = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.inFlightController?.abort();
  }

  join(roomId, playerName) {
    const room = this.rooms.find((r) => r.id === roomId) || this.rooms[0];
    if (!room) return;
    this.leave();
    this.dispatchEvent(
      new CustomEvent('joined', {
        detail: {
          playerName: playerName.trim() || 'Pilot',
          room
        }
      })
    );
  }
} 