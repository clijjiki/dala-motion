// Режим разработчика (?sim): мышь и клавиатура вместо камеры — чтобы команда
// могла отлаживать игру, не сидя перед камерой.
//   мышь — курсор, ЛКМ (держать) — щипок/идти, ПКМ или E — способность,
//   F (держать) + движение мыши — кулак/камера, R — два кулака/ульта.
export class InputSim {
  constructor() {
    this.x = innerWidth / 2;
    this.y = innerHeight / 2;
    this.lmb = false;
    this.fist = false;
    this.fistOrigin = null;
    this.queue = [];
    addEventListener('mousemove', (e) => { this.x = e.clientX; this.y = e.clientY; });
    addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.lmb = true; this.queue.push('pinch'); }
      if (e.button === 2) this.queue.push('shoot');
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) { this.lmb = false; this.queue.push('pinchUp'); } });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyF') { this.fist = true; this.fistOrigin = { x: this.x, y: this.y }; this.queue.push('panStart'); }
      if (e.code === 'KeyE') this.queue.push('shoot');
      if (e.code === 'KeyR') this.queue.push('ult');
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'KeyF') { this.fist = false; this.queue.push('panEnd'); }
    });
  }

  read(t) {
    const events = this.queue;
    this.queue = [];
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const pan = this.fist ? { x: clamp((this.x - this.fistOrigin.x) / 150), y: clamp((this.y - this.fistOrigin.y) / 150) } : null;
    return {
      present: true, t, events, hints: [],
      pinchHeld: this.lmb, shootHeld: false, fist: this.fist, pan, twoFists: false,
      pose: this.fist ? 'fist' : this.lmb ? 'pinch' : 'open',
      progress: { pinch: this.lmb ? 1 : 0, shoot: 0, fist: this.fist ? 1 : 0, ult: 0 },
      sim: true,
    };
  }
}
