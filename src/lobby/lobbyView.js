export function mountLobbyView(lobby) {
  const overlay = document.createElement('div');
  overlay.id = 'lobby-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(10, 14, 20, 0.92);
    display: flex; align-items: center; justify-content: center;
    font-family: monospace; color: #fff; z-index: 10;
  `;

  overlay.innerHTML = `
    <div style="background: #18202c; border: 1px solid #334155; padding: 24px; border-radius: 8px; width: 380px;">
      <h2 style="margin-top: 0; color: #38bdf8;">DOGFIGHT — LOBBY</h2>
      <label style="display: block; margin-bottom: 12px;">
        Pilot Name:
        <input id="pilot-name" type="text" value="Polina" maxlength="16"
          style="width: 100%; box-sizing: border-box; margin-top: 4px; padding: 6px; background: #0f172a; color: #fff; border: 1px solid #475569;" />
      </label>
      <div style="margin-bottom: 8px; color: #94a3b8;">Select Room (auto-refreshing):</div>
      <div id="rooms-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
        <div>Loading rooms...</div>
      </div>
      <div id="lobby-error" style="color: #f87171; font-size: 12px; min-height: 16px;"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const listEl = overlay.querySelector('#rooms-list');
  const nameInput = overlay.querySelector('#pilot-name');
  const errEl = overlay.querySelector('#lobby-error');

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