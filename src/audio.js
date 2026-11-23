export class SoundSystem {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.buffers = {};
  }

  // Розблоковуємо AudioContext після жесту гравця
  async unlock() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  setBuffers(buffers) {
    this.buffers = buffers || {};
  }

  play(name) {
    const buffer = this.buffers[name];
    if (!buffer || this.ctx.state !== 'running') return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.start(0);
  }

  // Підписка на шину подій світу без імпорту audio у симуляцію
  attachToWorld(world) {
    world.addEventListener('fired', () => this.play('shoot'));
    world.addEventListener('hit', () => this.play('hit'));
    world.addEventListener('exploded', () => this.play('explosion'));
  }
}