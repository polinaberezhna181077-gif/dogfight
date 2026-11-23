import {
  encodeInputBinary,
  decodeSnapshotBinary
} from '@dogfight/shared';

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
    this.protocolMode = 'binary';

    this.bytesInWindow = 0;
    this.bytesOutWindow = 0;
    this.bytesInPerSec = 0;
    this.bytesOutPerSec = 0;
    this.rttMs = 0;

    setInterval(() => {
      this.bytesInPerSec = this.bytesInWindow;
      this.bytesOutPerSec = this.bytesOutWindow;
      this.bytesInWindow = 0;
      this.bytesOutWindow = 0;
    }, 1000);

    setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', t: performance.now() });
      }
    }, 1000);
  }

  connect() {
    this.shouldReconnect = true;
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.socket = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.dispatchEvent(new Event('open'));

      if (this.lastJoinPayload) {
        this.sendRawJson({ v: 1, ...this.lastJoinPayload });
      }

      while (this.sendQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
        const item = this.sendQueue.shift();
        this.bytesOutWindow += item.byteLength || item.length;
        ws.send(item);
      }
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.bytesInWindow += event.data.byteLength;
        try {
          const snap = decodeSnapshotBinary(event.data);
          this.dispatchEvent(new CustomEvent('snapshot', { detail: snap }));
        } catch (err) {
          console.error('Bad binary snapshot:', err);
        }
        return;
      }

      this.bytesInWindow += event.data.length;
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type === 'pong') {
          this.rttMs = Math.max(0, Math.round(performance.now() - msg.t));
          return;
        }
        if (msg?.type) {
          this.dispatchEvent(new CustomEvent(msg.type, { detail: msg }));
        }
      } catch (err) {
        console.error('Bad WS message:', err);
      }
    };

    ws.onclose = (event) => {
      this.dispatchEvent(new CustomEvent('close', { detail: event }));
      if (!this.shouldReconnect || (event.code >= 4000 && event.code < 4100)) {
        return;
      }
      const delay = Math.min(1000 * Math.pow(2, this.attempt), 10000);
      this.attempt++;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  sendRawJson(obj) {
    const raw = JSON.stringify(obj);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.bytesOutWindow += raw.length;
      this.socket.send(raw);
    } else {
      this.sendQueue.push(raw);
    }
  }

  sendInput(input) {
    if (this.protocolMode === 'binary') {
      const buf = encodeInputBinary(input);
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.bytesOutWindow += buf.byteLength;
        this.socket.send(buf);
      }
    } else {
      this.sendRawJson({ v: 1, type: 'input', ...input });
    }
  }

  send(payload) {
    if (payload.type === 'join') {
      this.lastJoinPayload = payload;
    }
    if (payload.type === 'netcfg' && payload.protocol) {
      this.protocolMode = payload.protocol;
    }
    this.sendRawJson({ v: 1, ...payload });
  }

  close() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }
} 