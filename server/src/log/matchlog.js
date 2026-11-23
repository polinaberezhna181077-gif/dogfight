import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { on } from 'node:events';
import path from 'node:path';

export class JsonLinesTransform extends Transform {
  constructor() {
    super({ writableObjectMode: true });
  }

  _transform(event, _encoding, callback) {
    try {
      callback(null, `${JSON.stringify(event)}\n`);
    } catch (err) {
      callback(err);
    }
  }
}

export async function attachRoomLogger(room, logDir) {
  await mkdir(logDir, { recursive: true });
  const filename = `${room.id}-${Date.now()}.ndjson`;
  const fullPath = path.join(logDir, filename);
  room.logFile = filename;

  const ac = new AbortController();
  const dest = createWriteStream(fullPath, { flags: 'a' });
  const transform = new JsonLinesTransform();

  const eventStream = Readable.from(
    (async function* () {
      try {
        for await (const [event] of on(room, 'event', { signal: ac.signal })) {
          yield event;
        }
      } catch (err) {
        if (err.name !== 'AbortError') throw err;
      }
    })()
  );

  const pipePromise = pipeline(eventStream, transform, dest).catch((err) => {
    if (err.name !== 'AbortError') {
      console.error(`Match log pipeline error for ${room.id}:`, err);
    }
  });

  room.once('empty', () => ac.abort());

  return {
    filename,
    fullPath,
    async close() {
      ac.abort();
      await pipePromise;
    }
  };
} 