// Все звуки синтезируются через WebAudio — никаких файлов.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    this.ctx?.resume?.();
  }

  tone(freq, dur, type = 'sine', vol = 0.12, slideTo = null, delay = 0) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.15, freq = 1200) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    f.type = 'bandpass';
    f.frequency.value = freq;
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(f).connect(g).connect(c.destination);
    src.start();
  }

  click() { this.tone(660, 0.07, 'square', 0.06); }
  move() { this.tone(520, 0.06, 'triangle', 0.07, 700); }
  shoot() { this.tone(900, 0.12, 'sawtooth', 0.05, 300); }
  kill() { this.noise(0.12, 0.12, 900); this.tone(330, 0.1, 'square', 0.04, 160); }
  hurt() { this.tone(160, 0.3, 'sawtooth', 0.14, 60); }
  block() { this.tone(1200, 0.08, 'triangle', 0.08); this.tone(1600, 0.1, 'triangle', 0.05, null, 0.05); }
  shieldOn() { this.tone(400, 0.18, 'sine', 0.08, 800); }
  ult() { this.noise(0.5, 0.25, 300); this.tone(200, 0.6, 'sawtooth', 0.1, 1200); }
  warn() { this.tone(880, 0.1, 'square', 0.05); this.tone(880, 0.1, 'square', 0.05, null, 0.15); }
  hint() { this.tone(440, 0.12, 'sine', 0.06, 380); }
  ok() { this.tone(660, 0.1, 'sine', 0.08); this.tone(990, 0.14, 'sine', 0.08, null, 0.08); }
  wave() { [392, 523, 659].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.08, null, i * 0.1)); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.1, null, i * 0.14)); }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, 'sawtooth', 0.07, null, i * 0.18)); }
}
