// One Euro Filter (Casiez et al., 2012): сильно сглаживает, когда рука стоит,
// и почти не добавляет задержки, когда рука двигается быстро.
class LowPass {
  constructor() { this.y = null; }
  filter(x, a) {
    this.y = this.y === null ? x : this.y + a * (x - this.y);
    return this.y;
  }
}

const alpha = (cutoff, dt) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  constructor({ minCutoff = 1, beta = 0.5, dCutoff = 1 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }
  reset() {
    this.x = new LowPass();
    this.dx = new LowPass();
    this.lastT = null;
    this.lastX = null;
  }
  filter(value, t) {
    if (this.lastT === null) {
      this.lastT = t;
      this.lastX = value;
      this.dx.filter(0, 1);
      return this.x.filter(value, 1);
    }
    const dt = Math.max(1e-3, t - this.lastT);
    this.lastT = t;
    const d = (value - this.lastX) / dt;
    this.lastX = value;
    const edx = this.dx.filter(d, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alpha(cutoff, dt));
  }
}
