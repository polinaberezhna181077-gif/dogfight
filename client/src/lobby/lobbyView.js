export function mountLobbyView(lobby) {
  const overlay = document.createElement('div');
  overlay.id = 'lobby-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(10, 14, 20, 0.92);
    display: flex; align-items: center; justify-content: center;
    font-family: monospace; color: #fff; z-index: 10;
  `;

  overlay.innerHTML = `
    <div style="background: #18202c; border: 1px solid #334155; padding: 24px; border-radius: 8px; width: 410px;">
      <h2 style="margin-top: 0; color: #38bdf8;">DOGFIGHT — MULTIPLAYER LOBBY</h2>
      <label style="display: block; margin-bottom: 12px;">
        Pilot Name:
        <input id="pilot-name" type="text" value="Polina" maxlength="16"
          style="width: 100%; box-sizing: border-box; margin-top: 4px; padding: 6px; background: #0f172a; color: #fff; border: 1px solid #475569;" />
      </label>
      <div style="display: flex; gap: 6px; margin-bottom: 14px;">
        <input id="new-room-name" type="text" placeholder="New room name..." maxlength="24"
          style="flex: 1; padding: 6px; background: #0f172a; color: #fff; border: 1px solid #475569;" />
        <button id="create-room-btn" style="padding: 6px 12px; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-family: monospace;">
          + Create
        </button>
      </div>
      <div style="margin-bottom: 8px; color: #94a3b8;">Active Rooms:</div>
      <div id="rooms-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
        <div>Loading rooms from server...</div>
      </div>
      <div id="lobby-error" style="color: #f87171; font-size: 12px; min-height: 16px;"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const listEl = overlay.querySelector('#rooms-list');
  const nameInput = overlay.querySelector('#pilot-name');
  const newRoomInput = overlay.querySelector('#new-room-name');
  const createBtn = overlay.querySelector('#create-room-btn');
  const errEl = overlay.querySelector('#lobby-error');

  createBtn.onclick = async () => {
    const title = newRoomInput.value.trim();
    if (!title) return;
    try {
      errEl.textContent = '';
      await lobby.createRoom(title);
      newRoomInput.value = '';
    } catch (err) {
      errEl.textContent = err.message;
    }
  };

  lobby.addEventListener('roomsChanged', (e) => {
    errEl.textContent = '';
    listEl.innerHTML = '';
    for (const room of e.detail) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px; background: #1e293b; color: #f8fafc;
        border: 1px solid #38bdf8; border-radius: 4px; cursor: pointer; font-family: monospace;
      `;
      btn.innerHTML = `
        <span>${room.name}</span>
        <span style="color: #38bdf8;">[${room.players}/${room.maxPlayers}] Join →</span>
      `;
      btn.onclick = () => lobby.join(room.id, nameInput.value);
      listEl.appendChild(btn);
    }
  });

  lobby.addEventListener('error', (e) => {
    errEl.textContent = `Room fetch error: ${e.detail}`;
  });

  lobby.addEventListener('joined', () => {
    overlay.remove();
  });

  return overlay;
}

// Віджет списку гравців у кімнаті та чату поверх канвасу
export function mountRoomChatOverlay(connection, roomName) {
  const box = document.createElement('div');
  box.style.cssText = `
    position: fixed; right: 16px; bottom: 16px; width: 320px;
    background: rgba(15, 23, 42, 0.85); border: 1px solid #334155;
    border-radius: 6px; padding: 10px; font-family: monospace; color: #f8fafc; z-index: 20;
  `;

  box.innerHTML = `
    <div style="font-size: 12px; color: #38bdf8; margin-bottom: 6px; display: flex; justify-content: space-between;">
      <span>Room: ${roomName}</span>
      <span id="roster-count">Players: 1</span>
    </div>
    <div id="roster-list" style="font-size: 11px; color: #94a3b8; margin-bottom: 6px;"></div>
    <div id="chat-log" style="height: 110px; overflow-y: auto; background: #090d16; padding: 6px; font-size: 12px; border: 1px solid #1e293b; margin-bottom: 6px;"></div>
    <form id="chat-form" style="display: flex; gap: 4px;">
      <input id="chat-input" type="text" placeholder="Type message (Enter)..." maxlength="200"
        style="flex: 1; padding: 4px 6px; background: #0f172a; color: #fff; border: 1px solid #475569; font-family: monospace;" />
      <button type="submit" style="padding: 4px 10px; background: #0284c7; color: #fff; border: none; cursor: pointer; font-family: monospace;">Send</button>
    </form>
  `;

  document.body.appendChild(box);

  const rosterCount = box.querySelector('#roster-count');
  const rosterList = box.querySelector('#roster-list');
  const chatLog = box.querySelector('#chat-log');
  const chatForm = box.querySelector('#chat-form');
  const chatInput = box.querySelector('#chat-input');

  function appendLine(text, color = '#e2e8f0') {
    const line = document.createElement('div');
    line.style.color = color;
    line.style.marginBottom = '2px';
    line.textContent = text;
    chatLog.appendChild(line);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function updateRoster(players) {
    rosterCount.textContent = `Players: ${players.length}`;
    rosterList.textContent = `Online: ${players.map((p) => p.name).join(', ')}`;
  }

  connection.addEventListener('welcome', (e) => {
    updateRoster(e.detail.players);
    appendLine(`Connected as ${e.detail.playerId}`, '#38bdf8');
  });

  connection.addEventListener('roster', (e) => {
    updateRoster(e.detail.players);
    if (e.detail.systemText) {
      appendLine(`* ${e.detail.systemText}`, '#facc15');
    }
  });

  connection.addEventListener('chat', (e) => {
    appendLine(`${e.detail.from}: ${e.detail.text}`);
  });

  connection.addEventListener('close', (e) => {
    appendLine(`* Disconnected (code ${e.detail.code}). Reconnecting...`, '#f87171');
  });

  chatForm.onsubmit = (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    connection.send({ type: 'chat', text });
    chatInput.value = '';
  };

  // Не перехоплювати Space / H під час набору тексту в чаті
  chatInput.addEventListener('keydown', (e) => e.stopPropagation());
} 