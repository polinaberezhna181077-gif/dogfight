export const PROTOCOL_VERSION = 1;

export function validateClientMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return { ok: false, code: 1007, reason: 'Invalid JSON' };
  }

  if (!msg || typeof msg !== 'object') {
    return { ok: false, code: 1003, reason: 'Message must be an object' };
  }

  if (msg.v !== undefined && msg.v !== PROTOCOL_VERSION) {
    return { ok: false, code: 1002, reason: `Unsupported protocol version: ${msg.v}` };
  }

  if (msg.type === 'join') {
    if (typeof msg.room !== 'string' || !msg.room.trim() || msg.room.length > 32) {
      return { ok: false, code: 1003, reason: 'Invalid room id' };
    }
    if (typeof msg.name !== 'string' || !msg.name.trim() || msg.name.length > 20) {
      return { ok: false, code: 1003, reason: 'Invalid player name' };
    }
    return {
      ok: true,
      msg: {
        type: 'join',
        room: msg.room.trim(),
        name: msg.name.trim()
      }
    };
  }

  if (msg.type === 'chat') {
    if (typeof msg.text !== 'string' || !msg.text.trim() || msg.text.length > 200) {
      return { ok: false, code: 1003, reason: 'Invalid chat text' };
    }
    return {
      ok: true,
      msg: {
        type: 'chat',
        text: msg.text.trim()
      }
    };
  }

  return { ok: false, code: 1003, reason: `Unknown message type: ${String(msg.type)}` };
}