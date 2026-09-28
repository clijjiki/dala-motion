import { CONFIG } from '../config.js';

// Курсор-рука для интерфейса: наведение + щипок = клик, либо удержание (dwell) как запасной вариант.
// Любая кнопка с атрибутом data-hand становится «нажимаемой рукой».
export class HandPointer {
  constructor(el) {
    this.el = el;
    this.hover = null;
    this.hoverT = 0;
    this.enabled = true;
    this.lostT = 0;
  }

  update({ x, y, visible, pose, clicked, pinch = 0 }, dt) {
    const el = this.el;
    el.style.setProperty('--p', pinch);
    // Рука на миг пропала (быстрое движение) — не прячем курсор сразу, а плавно гасим.
    this.lostT = visible ? 0 : this.lostT + dt;
    el.hidden = this.lostT > 0.6;
    el.style.opacity = visible ? 1 : Math.max(0.15, 1 - this.lostT / 0.6);
    el.style.transform = `translate(${x}px, ${y}px)`;
    if (visible) el.dataset.pose = pose || 'open';
    if (!visible || !this.enabled) {
      this.setHover(null);
      return;
    }
    const hit = document.elementFromPoint(x, y)?.closest('[data-hand]');
    const target = hit && !hit.disabled && hit.offsetParent !== null ? hit : null;
    this.setHover(target);
    if (!target) return;

    if (clicked) {
      this.press(target);
      return;
    }
    this.hoverT += dt;
    const p = Math.max(0, this.hoverT / CONFIG.cursor.dwell);
    target.style.setProperty('--dwell', Math.min(1, p));
    if (p >= 1) this.press(target);
  }

  setHover(target) {
    if (target === this.hover) return;
    this.hover?.classList.remove('hand-hover');
    this.hover?.style.setProperty('--dwell', 0);
    this.hover = target;
    this.hoverT = 0;
    target?.classList.add('hand-hover');
  }

  press(target) {
    this.hoverT = -0.8; // пауза, чтобы не нажать дважды
    target.style.setProperty('--dwell', 0);
    target.classList.add('hand-press');
    setTimeout(() => target.classList.remove('hand-press'), 250);
    target.click();
  }
}
