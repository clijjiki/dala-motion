import { CONFIG } from '../config.js';
import { FINGER_RU } from './handmath.js';

const C = CONFIG.hand;
const HOLD = 1.0;

// Калибровка: пользователь показывает раскрытую ладонь там, где ему удобно держать руку.
// Запоминаем центр и размер ладони — под них подстраивается активная зона курсора.
export class Calibrator {
  constructor() {
    this.reset();
  }

  reset() {
    this.since = null;
    this.progress = 0;
    this.issue = null;
  }

  check(s, W, H) {
    if (!s?.present) return 'Покажи руку в камеру — раскрытой ладонью к экрану';
    const a = s.a;
    if (a.palmRel < C.minPalm) return 'Поднеси руку ближе к камере';
    if (a.palmRel > C.maxPalm) return 'Отодвинь руку от камеры — пальцы должны помещаться в кадр';
    if (a.facing < 0.55) return 'Разверни ладонь к камере — сейчас она стоит ребром';
    const bent = ['index', 'middle', 'ring', 'pinky'].filter((f) => a.ext[f] < 0.55);
    if (bent.length) return `Раскрой ладонь полностью — согнут ${bent.map((f) => FINGER_RU[f]).join(', ')}`;
    const x = a.anchor.x / W, y = a.anchor.y / H;
    if (x < 0.18 || x > 0.82 || y < 0.15 || y > 0.85) return 'Держи руку ближе к центру кадра';
    return null;
  }

  update(s, t, W, H) {
    this.issue = this.check(s, W, H);
    if (this.issue) {
      this.since = null;
      this.progress = 0;
      return null;
    }
    this.since ??= t;
    this.progress = Math.min(1, (t - this.since) / HOLD);
    if (this.progress >= 1) return { anchor: s.pts[8], palm: s.a.palm };
    return null;
  }
}
