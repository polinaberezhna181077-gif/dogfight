import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SimWorld,
  asEntityId,
  asOwnerId,
  asSeq,
  asTick,
  encodeInputBinary,
  decodeInputBinary,
  encodeSnapshotBinary,
  decodeSnapshotBinary,
  type PlayerInputCmd,
  type WorldSnapshot
} from '@dogfight/shared';

test('deterministic simulation produces identical hash for identical inputs', () => {
  const worldA = new SimWorld({ width: 960, height: 640, seed: 777, asteroidCount: 5 });
  const worldB = new SimWorld({ width: 960, height: 640, seed: 777, asteroidCount: 5 });

  const owner = asOwnerId(1);
  worldA.addPlayerShip(owner, 'Alpha');
  worldB.addPlayerShip(owner, 'Alpha');

  const dt = 1 / 30;
  for (let tick = 0; tick < 300; tick++) {
    const cmd: PlayerInputCmd = {
      turn: tick % 40 < 20 ? 1 : -1,
      thrust: tick % 3 === 0 ? 1 : 0,
      fire: tick % 25 === 0 ? 1 : 0
    };
    const inp = new Map<typeof owner, PlayerInputCmd>([[owner, cmd]]);
    worldA.step(dt, inp);
    worldB.step(dt, inp);
  }

  assert.equal(worldA.computeHash(), worldB.computeHash());
});

test('binary codec round-trip preserves input and snapshot within quantization tolerance', () => {
  const input = { seq: asSeq(42), turn: -1 as const, thrust: 1 as const, fire: 1 as const };
  const decodedInput = decodeInputBinary(encodeInputBinary(input));
  assert.deepEqual(decodedInput, input);

  const snap: WorldSnapshot = {
    type: 'snapshot',
    tick: asTick(120),
    lastProcessedSeq: asSeq(42),
    serverTime: 987654,
    entities: [
      {
        id: asEntityId(1),
        kind: 'ship',
        ownerId: asOwnerId(2),
        x: 123.5,
        y: 456.25,
        vx: -12.5,
        vy: 34.75,
        angle: 1.571,
        hp: 80
      }
    ]
  };
  const decodedSnap = decodeSnapshotBinary(encodeSnapshotBinary(snap));
  assert.equal(decodedSnap.tick, snap.tick);
  assert.equal(decodedSnap.lastProcessedSeq, snap.lastProcessedSeq);
  assert.equal(decodedSnap.entities.length, 1);
  const first = decodedSnap.entities[0];
  assert.ok(first !== undefined);
  assert.ok(Math.abs(first.angle - 1.571) < 0.002);
});