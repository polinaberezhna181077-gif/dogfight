export class GameConnection extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.socket = null;
    this.sendQueue = [];
    this.shouldReconnect = true;
    this.attempt = 0;
    this.reconnectTimer = null;
    this.lastJoinPayload = null;
  }

  connect() {
    this.shouldReconnect = true;
    const ws = new WebSocket(this.url);
    this.socket = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.dispatchEvent(new Event('open'));

      // Якщо це реконект після розриву — повторно заходимо в ту саму кімнату
      if (this.lastJoinPayload) {
        ws.send(JSON.stringify({ v: 1, ...this.lastJoinPayload }));
      }

      // Відправляємо накопичену чергу повідомлень
      while (this.sendQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(this.sendQueue.shift());
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg && msg.type) {
          this.dispatchEvent(new CustomEvent(msg.type, { detail: msg }));
        }
      } catch (err) {
        console.error('Bad WS message:', err);
      }
    };

    ws.onclose = (event) => {
      this.dispatchEvent(new CustomEvent('close', { detail: event }));
      // Не перепідключаємося при навмисному виході або помилці протоколу (4000-4099)
      if (!this.shouldReconnect || (event.code >= 4000 && event.code < 4100)) {
        return;
      }
      const delay = Math.min(1000 * Math.pow(2, this.attempt), 10000);
      this.attempt++;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };

    ws.onerror = () => {
      // Подія close спрацює автоматично слідом
    };
  }

  send(payload) {
    if (payload.type === 'join') {
      this.lastJoinPayload = payload;
    }
    const raw = JSON.stringify({ v: 1, ...payload });
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(raw);
    } else {
      this.sendQueue.push(raw);
    }
  }

  close() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }
} 