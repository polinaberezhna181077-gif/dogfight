export class SoundSystem {
  readonly ctx: AudioContext | null;
  private buffers: Readonly<Record<string, AudioBuffer>> = {};

  constructor() {
    const AudioCtx = window.AudioContext;
    this.ctx = AudioCtx ? new AudioCtx() : null;
  }

  unlock(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  setBuffers(buffers: Readonly<Record<string, AudioBuffer>>): void {
    this.buffers = buffers;
  }

  play(name: string): void {
    const buf = this.buffers[name];
    if (!this.ctx || !buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.start();
  }
}