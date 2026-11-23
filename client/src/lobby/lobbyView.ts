import type { GameConnection } from '../net/connection.js';
import type { Lobby, LobbyRoom } from './lobby.js';

export function mountLobbyView(lobby: Lobby): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(11, 15, 23, 0.94);
    display: flex; align-items: center; justify-content: center;
    font-family: monospace; color: #e2e8f0; z-index: 50;
  `;

  overlay.innerHTML = `
    <div style="width: 440px; background: #111827; border: 1px solid #334155; border-radius: 8px; padding: 20px;">
      <h2 style="margin: 0 0 12px; color: #38bdf8;">DOGFIGHT // LOBBY</h2>
      <div style="margin-bottom: 12px;">
        <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #94a3b8;">Callsign</label>
        <input id="inp-callsign" type="text" maxlength="16" value="Pilot-${Math.floor(100 + Math.random() * 900)}"
          style="width: 100%; box-sizing: border-box; padding: 8px; background: #0f172a; border: 1px solid #334155; color: #fff; font-family: monospace;">
      </div>
      <div style="display: flex; gap: 8px; margin-bottom: 14px;">
        <input id="inp-room-name" type="text" maxlength="24" placeholder="New room name..."
          style="flex: 1; padding: 8px; background: #0f172a; border: 1px solid #334155; color: #fff; font-family: monospace;">
        <button id="btn-create-room" style="padding: 8px 12px; background: #0284c7; border: none; color: #fff; cursor: pointer; font-family: monospace;">Create</button>
      </div>
      <div id="room-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto;"></div>
      <div id="lobby-err" style="color: #f87171; font-size: 12px; margin-top: 8px;"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const callsignInput = overlay.querySelector<HTMLInputElement>('#inp-callsign');
  const roomNameInput = overlay.querySelector<HTMLInputElement>('#inp-room-name');
  const createBtn = overlay.querySelector<HTMLButtonElement>('#btn-create-room');
  const roomListEl = overlay.querySelector<HTMLDivElement>('#room-list');
  const errEl = overlay.querySelector<HTMLDivElement>('#lobby-err');

  function renderRooms(rooms: readonly LobbyRoom[]): void {
    if (!roomListEl) return;
    roomListEl.innerHTML = '';
    for (const room of rooms) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px; background: #0f172a; border: 1px solid #1e293b; border-radius: 6px;
      `;
      const info = document.createElement('span');
      info.textContent = `${room.name} (${room.players}/${room.maxPlayers})`;

      const btn = document.createElement('button');
      btn.textContent = 'Join';
      btn.style.cssText = 'padding: 5px 12px; background: #0f766e; border: none; color: #fff; cursor: pointer; font-family: monospace;';
      btn.onclick = () => {
        lobby.joinRoom(room, callsignInput?.value ?? 'Pilot');
      };

      row.append(info, btn);
      roomListEl.appendChild(row);
    }
  }

  if (createBtn) {
    createBtn.onclick = () => {
      const name = roomNameInput?.value.trim() ?? '';
      if (!name) return;
      if (roomNameInput) roomNameInput.value = '';
      void lobby.createRoom(name);
    };
  }

  lobby.on('rooms', renderRooms);
  lobby.on('error', (msg) => {
    if (errEl) errEl.textContent = msg;
  });
  lobby.on('joined', () => {
    overlay.remove();
  });
}

export function mountRoomChatOverlay(connection: GameConnection, roomName: string): void {
  const box = document.createElement('div');
  box.style.cssText = `
    position: fixed; right: 14px; bottom: 14px; width: 280px;
    background: rgba(15, 23, 42, 0.86); border: 1px solid #334155;
    border-radius: 6px; padding: 10px; font-family: monospace; font-size: 11px; color: #e2e8f0; z-index: 20;
  `;

  box.innerHTML = `
    <div style="color: #38bdf8; font-weight: bold; margin-bottom: 4px;">ROOM: ${roomName}</div>
    <div id="chat-log" style="height: 90px; overflow-y: auto; margin-bottom: 6px; color: #cbd5e1;"></div>
    <form id="chat-form" style="display: flex; gap: 4px;">
      <input id="chat-inp" type="text" maxlength="200" placeholder="Chat..."
        style="flex: 1; padding: 4px; background: #0f172a; border: 1px solid #334155; color: #fff; font-family: monospace; font-size: 11px;">
      <button type="submit" style="padding: 4px 8px; background: #0284c7; border: none; color: #fff; cursor: pointer;">Send</button>
    </form>
  `;

  document.body.appendChild(box);

  const logEl = box.querySelector<HTMLDivElement>('#chat-log');
  const formEl = box.querySelector<HTMLFormElement>('#chat-form');
  const inpEl = box.querySelector<HTMLInputElement>('#chat-inp');

  function appendLine(text: string, color = '#cbd5e1'): void {
    if (!logEl) return;
    const line = document.createElement('div');
    line.style.color = color;
    line.textContent = text;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  connection.on('roster', (data) => {
    if (data.systemText) appendLine(`* ${data.systemText}`, '#94a3b8');
  });

  connection.on('chat', (data) => {
    appendLine(`[${data.from}]: ${data.text}`);
  });

  if (formEl) {
    formEl.onsubmit = (e) => {
      e.preventDefault();
      const text = inpEl?.value.trim() ?? '';
      if (!text) return;
      if (inpEl) inpEl.value = '';
      connection.send({ type: 'chat', text });
    };
  }
}