export class Netgraph {
  constructor() {
    this.rttHistory = [];
    this.corrHistory = [];
    this.maxSamples = 60;
  }

  pushSample(rttMs, correctionPx) {
    this.rttHistory.push(rttMs);
    this.corrHistory.push(correctionPx);
    if (this.rttHistory.length > this.maxSamples) this.rttHistory.shift();
    if (this.corrHistory.length > this.maxSamples) this.corrHistory.shift();
  }

  draw(ctx, stats) {
    const x = 14;
    const y = 14;
    const w = 270;
    const h = 152;

    ctx.save();
    ctx.fillStyle = 'rgba(10, 15, 26, 0.84)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`NETGRAPH (${stats.protocol.toUpperCase()}) | Tick #${stats.tick}`, x + 10, y + 18);

    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`RTT: ${stats.rttMs} ms | Snap age: ${stats.snapshotAgeMs} ms`, x + 10, y + 36);
    ctx.fillText(`In: ${(stats.bytesIn / 1024).toFixed(2)} KB/s | Out: ${(stats.bytesOut / 1024).toFixed(2)} KB/s`, x + 10, y + 54);
    ctx.fillText(`Pending inputs: ${stats.pendingInputs} | Interp: ${stats.interpDelayMs} ms`, x + 10, y + 72);
    ctx.fillText(`Reconcile err: ${stats.correctionPx.toFixed(2)} px | Pred: ${stats.predictionEnabled ? 'ON' : 'OFF'}`, x + 10, y + 90);

    const gx = x + 10;
    const gy = y + 142;
    const gw = w - 20;
    const gh = 40;

    ctx.strokeStyle = '#1e293b';
    ctx.strokeRect(gx, gy - gh, gw, gh);

    if (this.corrHistory.length > 1) {
      ctx.strokeStyle = '#facc15';
      ctx.beginPath();
      for (let i = 0; i < this.corrHistory.length; i++) {
        const px = gx + (i / (this.maxSamples - 1)) * gw;
        const val = Math.min(40, this.corrHistory[i]);
        const py = gy - (val / 40) * gh;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    ctx.restore();
  }
}

export function mountNetControls(connection, state) {
  const panel = document.createElement('div');
  panel.style.cssText = `
    position: fixed; left: 14px; bottom: 14px; width: 270px;
    background: rgba(15, 23, 42, 0.86); border: 1px solid #334155;
    border-radius: 6px; padding: 10px; font-family: monospace; font-size: 11px; color: #e2e8f0; z-index: 20;
  `;

  panel.innerHTML = `
    <div style="color: #38bdf8; margin-bottom: 6px; font-weight: bold;">NETLAB CONTROLS</div>
    <label style="display: flex; justify-content: space-between; margin-bottom: 4px;">
      <span>Delay: <b id="lbl-delay">0</b> ms</span>
      <input id="rng-delay" type="range" min="0" max="300" step="10" value="0" style="width: 120px;">
    </label>
    <label style="display: flex; justify-content: space-between; margin-bottom: 4px;">
      <span>Jitter: <b id="lbl-jitter">0</b> ms</span>
      <input id="rng-jitter" type="range" min="0" max="100" step="5" value="0" style="width: 120px;">
    </label>
    <label style="display: flex; justify-content: space-between; margin-bottom: 4px;">
      <span>Drop: <b id="lbl-drop">0</b> %</span>
      <input id="rng-drop" type="range" min="0" max="20" step="1" value="0" style="width: 120px;">
    </label>
    <label style="display: flex; justify-content: space-between; margin-bottom: 6px;">
      <span>Interp delay: <b id="lbl-interp">70</b> ms</span>
      <input id="rng-interp" type="range" min="0" max="250" step="10" value="70" style="width: 120px;">
    </label>
    <div style="display: flex; gap: 6px;">
      <button id="btn-pred" style="flex: 1; padding: 4px; background: #0284c7; color: #fff; border: none; cursor: pointer; font-family: monospace;">Pred: ON</button>
      <button id="btn-proto" style="flex: 1; padding: 4px; background: #0f766e; color: #fff; border: none; cursor: pointer; font-family: monospace;">Proto: BIN</button>
    </div>
  `;

  document.body.appendChild(panel);

  const rngDelay = panel.querySelector('#rng-delay');
  const rngJitter = panel.querySelector('#rng-jitter');
  const rngDrop = panel.querySelector('#rng-drop');
  const rngInterp = panel.querySelector('#rng-interp');
  const btnPred = panel.querySelector('#btn-pred');
  const btnProto = panel.querySelector('#btn-proto');

  function sendNetCfg() {
    const delayMs = Number(rngDelay.value);
    const jitterMs = Number(rngJitter.value);
    const dropRate = Number(rngDrop.value) / 100;
    panel.querySelector('#lbl-delay').textContent = delayMs;
    panel.querySelector('#lbl-jitter').textContent = jitterMs;
    panel.querySelector('#lbl-drop').textContent = rngDrop.value;
    connection.send({ type: 'netcfg', delayMs, jitterMs, dropRate, protocol: state.protocol });
  }

  rngDelay.oninput = sendNetCfg;
  rngJitter.oninput = sendNetCfg;
  rngDrop.oninput = sendNetCfg;

  rngInterp.oninput = () => {
    state.interpDelayMs = Number(rngInterp.value);
    panel.querySelector('#lbl-interp').textContent = state.interpDelayMs;
  };

  btnPred.onclick = () => {
    state.predictionEnabled = !state.predictionEnabled;
    btnPred.textContent = `Pred: ${state.predictionEnabled ? 'ON' : 'OFF'}`;
    btnPred.style.background = state.predictionEnabled ? '#0284c7' : '#475569';
  };

  btnProto.onclick = () => {
    state.protocol = state.protocol === 'binary' ? 'json' : 'binary';
    btnProto.textContent = `Proto: ${state.protocol === 'binary' ? 'BIN' : 'JSON'}`;
    sendNetCfg();
  };
} 