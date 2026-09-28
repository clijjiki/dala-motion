import { CONFIG } from '../config.js';
import { OneEuro } from '../vision/filters.js';
import { clamp } from './handmath.js';

const C = CONFIG.cursor;

/**
 * Превращает кончик указательного пальца в курсор на экране.
 * - One Euro Filter: курсор не дрожит, когда палец стоит, и не отстаёт, когда палец движется.
 * - Активная зона кадра подстраивается под размер ладони (близко/далеко от камеры)
 *   и центрируется там, где пользователь показал руку при калибровке — не нужно тянуться к краям.
 * - Клик берёт позицию курсора ~90 мс назад — до того, как пальцы начали сводиться
 *   (при щипке кончик пальца смещается, и без этого клик «уезжал» бы).
 */
export class CursorMapper {
  constructor() {
    this.fx = new OneEuro(C);
    this.fy = new OneEuro(C);
    const full = 1 - C.frameMargin * 2;
    this.box = { cx: 0.5, cy: 0.5, w: full, h: full };
    this.history = [];
    this.pos = { x: 0.5, y: 0.5 };
    this.visible = false;
    this.freezeUntil = 0;
  }

  calibrate(anchor, palm, W, H) {
    this.fx.reset();
    this.fy.reset();
    if (C.fullFrame) return; // весь кадр — зону не сужаем
    const w = clamp((palm * C.boxScale) / W, 0.3, 0.75);
    const h = clamp(w * (W / H) * 0.62, 0.3, 0.75);
    this.box = {
      cx: clamp(anchor.x / W, w / 2, 1 - w / 2),
      cy: clamp(anchor.y / H, h / 2, 1 - h / 2),
      w, h,
    };
    this.fx.reset();
    this.fy.reset();
  }

  update(state, W, H, t) {
    if (!state?.present) {
      this.visible = false;
      return this.pos;
    }
    this.visible = true;
    if (!state.point) return this.pos; // кулак — курсор стоит на месте
    if (state.events?.includes('pinch')) {
      this.pos = { x: this.stablePos(t).x, y: this.stablePos(t).y };
      this.freezeUntil = t + C.clickFreeze;
    }
    if (t < this.freezeUntil) return this.pos; // клик: курсор замер
    const { cx, cy, w, h } = this.box;
    const nx = clamp((state.point.x / W - (cx - w / 2)) / w, 0, 1);
    const ny = clamp((state.point.y / H - (cy - h / 2)) / h, 0, 1);
    this.pos = { x: clamp(this.fx.filter(nx, t), 0, 1), y: clamp(this.fy.filter(ny, t), 0, 1) };
    this.history.push({ t, ...this.pos });
    while (this.history.length > 20) this.history.shift();
    return this.pos;
  }

  // Позиция на момент, когда щипок только начинался.
  stablePos(t) {
    const target = t - C.clickLookback;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].t <= target) return this.history[i];
    }
    return this.pos;
  }

  // Активная зона в координатах кадра — рисуем её на мини-камере.
  boxRect(W, H) {
    const { cx, cy, w, h } = this.box;
    return { x: (cx - w / 2) * W, y: (cy - h / 2) * H, w: w * W, h: h * H };
  }
}
