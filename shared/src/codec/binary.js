export const BIN_VERSION = 1;
export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

export function encodeInputBinary(input) {
  const buf = new ArrayBuffer(10);
  const view = new DataView(buf);
  view.setUint8(0, BIN_VERSION);
  view.setUint8(1, MSG_INPUT);
  view.setUint32(2, input.seq >>> 0, true);
  view.setInt8(6, Math.max(-1, Math.min(1, Math.round(input.turn || 0))));
  view.setUint8(7, input.thrust ? 1 : 0);
  view.setUint8(8, input.fire ? 1 : 0);
  view.setUint8(9, 0);
  return buf;
}

export function decodeInputBinary(buffer) {
  const view = buffer instanceof DataView
    ? buffer
    : new DataView(buffer.buffer || buffer, buffer.byteOffset || 0, buffer.byteLength);

  if (view.byteLength < 10) throw new Error('Input packet too short');
  const version = view.getUint8(0);
  const type = view.getUint8(1);
  if (version !== BIN_VERSION || type !== MSG_INPUT) {
    throw new Error(`Invalid input header: v=${version}, type=${type}`);
  }

  return {
    type: 'input',
    seq: view.getUint32(2, true),
    turn: view.getInt8(6),
    thrust: view.getUint8(7),
    fire: view.getUint8(8)
  };
}

export function encodeSnapshotBinary(snap) {
  const entities = snap.entities || [];
  const headerSize = 16;
  const entitySize = 24;
  const buf = new ArrayBuffer(headerSize + entities.length * entitySize);
  const view = new DataView(buf);

  view.setUint8(0, BIN_VERSION);
  view.setUint8(1, MSG_SNAPSHOT);
  view.setUint16(2, entities.length, true);
  view.setUint32(4, snap.tick >>> 0, true);
  view.setUint32(8, snap.lastProcessedSeq >>> 0, true);
  view.setUint32(12, Math.round(snap.serverTime || 0) >>> 0, true);

  let offset = headerSize;
  for (const e of entities) {
    view.setUint16(offset, e.id, true);
    view.setUint8(offset + 2, e.kind);
    view.setUint8(offset + 3, e.ownerId || 0);
    view.setFloat32(offset + 4, e.x, true);
    view.setFloat32(offset + 8, e.y, true);
    view.setFloat32(offset + 12, e.vx || 0, true);
    view.setFloat32(offset + 16, e.vy || 0, true);
    const angleQ = Math.round((((e.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 1000);
    view.setInt16(offset + 20, angleQ, true);
    view.setUint16(offset + 22, Math.max(0, Math.round(e.hp || 0)), true);
    offset += entitySize;
  }

  return buf;
}

export function decodeSnapshotBinary(buffer) {
  const view = buffer instanceof DataView
    ? buffer
    : new DataView(buffer.buffer || buffer, buffer.byteOffset || 0, buffer.byteLength);

  if (view.byteLength < 16) throw new Error('Snapshot packet too short');
  const version = view.getUint8(0);
  const type = view.getUint8(1);
  if (version !== BIN_VERSION || type !== MSG_SNAPSHOT) {
    throw new Error(`Invalid snapshot header: v=${version}, type=${type}`);
  }

  const count = view.getUint16(2, true);
  const tick = view.getUint32(4, true);
  const lastProcessedSeq = view.getUint32(8, true);
  const serverTime = view.getUint32(12, true);

  const entities = [];
  let offset = 16;
  for (let i = 0; i < count; i++) {
    entities.push({
      id: view.getUint16(offset, true),
      kind: view.getUint8(offset + 2),
      ownerId: view.getUint8(offset + 3),
      x: view.getFloat32(offset + 4, true),
      y: view.getFloat32(offset + 8, true),
      vx: view.getFloat32(offset + 12, true),
      vy: view.getFloat32(offset + 16, true),
      angle: view.getInt16(offset + 20, true) / 1000,
      hp: view.getUint16(offset + 22, true)
    });
    offset += 24;
  }

  return {
    type: 'snapshot',
    tick,
    lastProcessedSeq,
    serverTime,
    entities
  };
} 