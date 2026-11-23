export const PROTOCOL_VERSION = 1;

export function validateClientMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return { ok: false, code: 1007, reason: 'Invalid JSON' };
  }

  if (typeof msg !== 'object' || msg === null) {
    return { ok: false, code: 1003, reason: 'Message must be a JSON object' };
  }

  if (msg.v !== PROTOCOL_VERSION) {
    return { ok: false, code: 1003, reason: `Unsupported protocol version: ${msg.v}` };
  }

  if (msg.type === 'join') {
    if (typeof msg.room !== 'string' || !msg.room.trim()) {
      return { ok: false, code: 1003, reason: 'Invalid room id' };
    }
    if (typeof msg.name !== 'string') {
      return { ok: false, code: 1003, reason: 'Invalid player name' };
    }
    const cleanName = msg.name.trim().slice(0, 16);
    if (!cleanName) {
      return { ok: false, code: 1003, reason: 'Player name cannot be empty' };
    }
    return { ok: true, msg: { type: 'join', room: msg.room.trim(), name: cleanName } };
  }

  if (msg.type === 'chat') {
    if (typeof msg.text !== 'string') {
      return { ok: false, code: 1003, reason: 'Chat text must be a string' };
    }
    const cleanText = msg.text.trim().slice(0, 200);
    if (!cleanText) {
      return { ok: false, code: 1003, reason: 'Chat message cannot be empty' };
    }
    return { ok: true, msg: { type: 'chat', text: cleanText } };
  }

  if (msg.type === 'input') {
    return { ok: true, msg };
  }

  if (msg.type === 'ping' || msg.type === 'netcfg') {
    return { ok: true, msg };
  }

  return { ok: false, code: 1003, reason: `Unknown message type: ${msg.type}` };
} 