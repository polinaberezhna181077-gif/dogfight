import {
  asEntityId,
  asOwnerId,
  asSeq,
  asTick,
  assertNever,
  type EntitySnapshot,
  type SequencedInput,
  type WorldSnapshot
} from '../types.js';
import { parseSnapshotJson } from '../protocol.js';

export const BIN_VERSION = 1 as const;
export const MSG_INPUT = 1 as const;
export const MSG_SNAPSHOT = 2 as const;

const KIND_CODE_SHIP = 1;
const KIND_CODE_ASTEROID = 2;
const KIND_CODE_BULLET = 3;

export interface SnapshotCodec {
  readonly name: 'binary' | 'json';
  encode(snap: WorldSnapshot): ArrayBuffer | string;
  decode(payload: ArrayBuffer | string): WorldSnapshot;
}

export function encodeInputBinary(input: SequencedInput): ArrayBuffer {
  const buf = new ArrayBuffer(10);
  const view = new DataView(buf);
  view.setUint8(0, BIN_VERSION);
  view.setUint8(1, MSG_INPUT);
  view.setUint32(2, input.seq >>> 0, true);
  view.setInt8(6, Math.max(-1, Math.min(1, Math.round(input.turn))));
  view.setUint8(7, input.thrust ? 1 : 0);
  view.setUint8(8, input.fire ? 1 : 0);
  view.setUint8(9, 0);
  return buf;
}

export function decodeInputBinary(buffer: ArrayBuffer | Uint8Array): SequencedInput {
  const view = buffer instanceof Uint8Array
    ? new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new DataView(buffer);

  if (view.byteLength < 10) {
    throw new RangeError(`Input packet too short: ${view.byteLength} < 10`);
  }
  const version = view.getUint8(0);
  const type = view.getUint8(1);
  if (version !== BIN_VERSION || type !== MSG_INPUT) {
    throw new Error(`Invalid input header: v=${version}, type=${type}`);
  }

  const rawTurn = view.getInt8(6);
  const rawThrust = view.getUint8(7);
  const rawFire = view.getUint8(8);

  if (rawTurn !== -1 && rawTurn !== 0 && rawTurn !== 1) {
    throw new RangeError(`Turn out of range: ${rawTurn}`);
  }
  if ((rawThrust !== 0 && rawThrust !== 1) || (rawFire !== 0 && rawFire !== 1)) {
    throw new RangeError('Thrust/fire must be 0 or 1');
  }

  return {
    seq: asSeq(view.getUint32(2, true)),
    turn: rawTurn,
    thrust: rawThrust,
    fire: rawFire
  };
}

function encodeKind(kind: EntitySnapshot['kind']): number {
  switch (kind) {
    case 'ship':
      return KIND_CODE_SHIP;
    case 'asteroid':
      return KIND_CODE_ASTEROID;
    case 'bullet':
      return KIND_CODE_BULLET;
    default:
      return assertNever(kind);
  }
}

function decodeKind(code: number): EntitySnapshot['kind'] {
  switch (code) {
    case KIND_CODE_SHIP:
      return 'ship';
    case KIND_CODE_ASTEROID:
      return 'asteroid';
    case KIND_CODE_BULLET:
      return 'bullet';
    default:
      throw new RangeError(`Unknown entity kind code: ${code}`);
  }
}

export function encodeSnapshotBinary(snap: WorldSnapshot): ArrayBuffer {
  const entities = snap.entities;
  const headerSize = 16;
  const entitySize = 24;
  const buf = new ArrayBuffer(headerSize + entities.length * entitySize);
  const view = new DataView(buf);

  view.setUint8(0, BIN_VERSION);
  view.setUint8(1, MSG_SNAPSHOT);
  view.setUint16(2, entities.length, true);
  view.setUint32(4, snap.tick >>> 0, true);
  view.setUint32(8, snap.lastProcessedSeq >>> 0, true);
  view.setUint32(12, Math.round(snap.serverTime) >>> 0, true);

  let offset = headerSize;
  for (const e of entities) {
    view.setUint16(offset, e.id, true);
    view.setUint8(offset + 2, encodeKind(e.kind));
    view.setUint8(offset + 3, e.ownerId);
    view.setFloat32(offset + 4, e.x, true);
    view.setFloat32(offset + 8, e.y, true);
    view.setFloat32(offset + 12, e.vx, true);
    view.setFloat32(offset + 16, e.vy, true);
    const angleQ = Math.round((((e.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 1000);
    view.setInt16(offset + 20, angleQ, true);
    view.setUint16(offset + 22, Math.max(0, Math.round(e.hp)), true);
    offset += entitySize;
  }

  return buf;
}

export function decodeSnapshotBinary(buffer: ArrayBuffer | Uint8Array): WorldSnapshot {
  const view = buffer instanceof Uint8Array
    ? new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new DataView(buffer);

  if (view.byteLength < 16) {
    throw new RangeError(`Snapshot packet too short: ${view.byteLength} < 16`);
  }
  const version = view.getUint8(0);
  const type = view.getUint8(1);
  if (version !== BIN_VERSION || type !== MSG_SNAPSHOT) {
    throw new Error(`Invalid snapshot header: v=${version}, type=${type}`);
  }

  const count = view.getUint16(2, true);
  const expectedBytes = 16 + count * 24;
  if (view.byteLength < expectedBytes) {
    throw new RangeError(`Snapshot truncated: ${view.byteLength} < ${expectedBytes}`);
  }

  const tick = asTick(view.getUint32(4, true));
  const lastProcessedSeq = asSeq(view.getUint32(8, true));
  const serverTime = view.getUint32(12, true);

  const entities: EntitySnapshot[] = [];
  let offset = 16;
  for (let i = 0; i < count; i++) {
    const id = asEntityId(view.getUint16(offset, true));
    const kind = decodeKind(view.getUint8(offset + 2));
    const ownerId = asOwnerId(view.getUint8(offset + 3));
    const x = view.getFloat32(offset + 4, true);
    const y = view.getFloat32(offset + 8, true);
    const vx = view.getFloat32(offset + 12, true);
    const vy = view.getFloat32(offset + 16, true);
    const angle = view.getInt16(offset + 20, true) / 1000;
    const hp = view.getUint16(offset + 22, true);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new RangeError('Non-finite entity coordinates');
    }

    entities.push({ id, kind, ownerId, x, y, vx, vy, angle, hp });
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

export const BinarySnapshotCodec: SnapshotCodec = {
  name: 'binary',
  encode(snap: WorldSnapshot): ArrayBuffer {
    return encodeSnapshotBinary(snap);
  },
  decode(payload: ArrayBuffer | string): WorldSnapshot {
    if (typeof payload === 'string') {
      throw new TypeError('Binary codec requires ArrayBuffer');
    }
    return decodeSnapshotBinary(payload);
  }
};

export const JsonSnapshotCodec: SnapshotCodec = {
  name: 'json',
  encode(snap: WorldSnapshot): string {
    return JSON.stringify({ v: 1, ...snap });
  },
  decode(payload: ArrayBuffer | string): WorldSnapshot {
    if (typeof payload !== 'string') {
      throw new TypeError('JSON codec requires string');
    }
    const raw: unknown = JSON.parse(payload);
    const parsed = parseSnapshotJson(raw);
    if (!parsed.ok) {
      throw new Error(parsed.reason);
    }
    return parsed.value;
  }
};