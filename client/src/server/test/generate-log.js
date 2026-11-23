import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { config } from '../src/config.js';

await mkdir(config.logDir, { recursive: true });
const outPath = path.join(config.logDir, 'benchmark-200mb.ndjson');

const targetBytes = 200 * 1024 * 1024; // 200 MB
let written = 0;
let seq = 0;

const source = Readable.from(
  (function* () {
    while (written < targetBytes) {
      const line = `${JSON.stringify({
        t: Date.now(),
        room: 'room-alpha',
        type: 'chat',
        seq: seq++,
        text: 'Telemetry and chat payload line for backpressure stream benchmark test'
      })}\n`;
      written += Buffer.byteLength(line);
      yield line;
    }
  })()
);

console.log('Generating ~200 MB NDJSON log...');
await pipeline(source, createWriteStream(outPath));
console.log(`Done: ${outPath} (${Math.round(written / 1024 / 1024)} MB)`); 