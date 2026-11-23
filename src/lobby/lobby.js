import { fetchJson } from '../assets/loader.js';

export class Lobby extends EventTarget {
  constructor(endpoint = '/api/rooms.json') {
    super();
    this.endpoint = endpoint;
    this.rooms = [];
    this.pollTimer = null;
    this.inFlightController = null;
    this.active = false;
  }

  async refresh() {
    // Скасовуємо попередній незавершений запит, якщо він ще триває
    this.inFlightController?.abort();
    const manualController = new AbortController();
    this.inFlightController = manualController;

    // Об'єднуємо ручне скасування при виході з лобі та таймаут 3000 мс
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
        return; // Штатне скасування при виході або таймаут
      }
      this.dispatchEvent(new CustomEvent('error', { detail: err.message }));
    } finally {
      if (this.inFlightController === manualController) {
        this.inFlightController = null;
      }
    }
  }

  startPolling(intervalMs = 4000) {
    this.active = true;
    this.refresh();
    this.pollTimer = setInterval(() => {
      if (this.active) this.refresh();
    }, intervalMs);
  }

  // Скасовуємо опитування та поточний fetch, щойно гравець пішов із лобі
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