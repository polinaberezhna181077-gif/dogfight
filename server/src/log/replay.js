import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import readline from 'node:readline';
import path from 'node:path';

export async function* readReplayEvents(filePath) {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim()) {
      yield JSON.parse(line);
    }
  }
}

export async function streamReplayToResponse(logDir, replayId, res) {
  const safeName = path.basename(replayId);
  if (!safeName.endsWith('.ndjson')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid replay id' }));
    return;
  }

  const fullPath = path.join(logDir, safeName);
  const readStream = createReadStream(fullPath);

  readStream.on('open', () => {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Transfer-Encoding': 'chunked'
    });
  });

  readStream.on('error', (err) => {
    if (!res.headersSent) {
      const code = err.code === 'ENOENT' ? 404 : 500;
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: code === 404 ? 'Replay not found' : 'Stream error' }));
    }
  });

  await pipeline(readStream, res).catch(() => {});
} 