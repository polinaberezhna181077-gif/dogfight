import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SimWorld,
  encodeInputBinary,
  decodeInputBinary,
  encodeSnapshotBinary,
  decodeSnapshotBinary,
  KIND_SHIP
} from '../src/index.js';

test('deterministic simulation produces identical hash for identical inputs', () => {
  const worldA = new SimWorld({ width: 960, height: 640, seed: 777, asteroidCount: 5 });
  const worldB = new SimWorld({ width: 960, height: 640, seed: 777, asteroidCount: 5 });

  worldA.addPlayerShip(1, 'Alpha');
  worldB.addPlayerShip(1, 'Alpha');

  const dt = 1 / 30;
  for (let tick = 0; tick < 300; tick++) {
    const inp = new Map([[1, {
      turn: tick % 40 < 20 ? 1 : -1,
      thrust: tick % 3 === 0 ? 1 : 0,
      fire: tick % 25 === 0 ? 1 : 0
    }]]);
    worldA.step(dt, inp);
    worldB.step(dt, inp);
  }

  assert.equal(worldA.computeHash(), worldB.computeHash());
});

test('binary codec round-trip preserves input and snapshot within quantization tolerance', () => {
  const input = { type: 'input', seq: 42, turn: -1, thrust: 1, fire: 1 };
  const decodedInput = decodeInputBinary(encodeInputBinary(input));
  assert.deepEqual(decodedInput, input);

  const snap = {
    type: 'snapshot',
    tick: 120,
    lastProcessedSeq: 42,
    serverTime: 987654,
    entities: [
      { id: 1, kind: KIND_SHIP, ownerId: 2, x: 123.5, y: 456.25, vx: -12.5, vy: 34.75, angle: 1.571, hp: 80 }
    ]
  };
  const decodedSnap = decodeSnapshotBinary(encodeSnapshotBinary(snap));
  assert.equal(decodedSnap.tick, snap.tick);
  assert.equal(decodedSnap.lastProcessedSeq, snap.lastProcessedSeq);
  assert.equal(decodedSnap.entities.length, 1);
  assert.ok(Math.abs(decodedSnap.entities[0].angle - snap.entities[0].angle) < 0.002);
}); 