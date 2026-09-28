import { CONFIG } from '../config.js';

const C = CONFIG.coach;

// Тренер: решает, какую подсказку показать и когда, чтобы не засыпать игрока сообщениями,
// и собирает статистику ошибок для итогового экрана.
export class Coach {
  constructor(onHint) {
    this.onHint = onHint;
    this.reset();
  }

  reset() {
    this.lastById = new Map();
    this.lastAny = -Infinity;
    this.counts = new Map();
  }

  offer(hint, t) {
    const prev = this.lastById.get(hint.id) ?? -Infinity;
    if (t - prev < C.sameHintCooldown || t - this.lastAny < C.anyHintGap) return false;
    this.show(hint, t);
    return true;
  }

  // Важное игровое событие (получил урон) — показываем сразу.
  force(hint, t) {
    const prev = this.lastById.get(hint.id) ?? -Infinity;
    if (t - prev < 1.2) return false;
    this.show(hint, t);
    return true;
  }

  show(hint, t) {
    this.lastById.set(hint.id, t);
    this.lastAny = t;
    const c = this.counts.get(hint.id) ?? { ...hint, count: 0 };
    c.count++;
    c.text = hint.text;
    this.counts.set(hint.id, c);
    this.onHint(hint);
  }

  topMistakes(n = 3) {
    return [...this.counts.values()].sort((a, b) => b.count - a.count).slice(0, n);
  }
}
