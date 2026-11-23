import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';

export class MatchLogger {
  private readonly stream: WriteStream;

  constructor(logDir: string, filename = 'matches.ndjson') {
    mkdirSync(logDir, { recursive: true });
    this.stream = createWriteStream(join(logDir, filename), { flags: 'a' });
    this.stream.on('error', (err: Error) => {
      console.error('MatchLogger stream error:', err.message);
    });
  }

  write(record: Record<string, unknown>): void {
    const line = `${JSON.stringify(record)}\n`;
    if (!this.stream.write(line)) {
      this.stream.once('drain', () => {});
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.stream.end(() => resolve());
    });
  }
}