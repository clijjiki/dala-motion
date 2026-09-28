import { H } from '../gestures/handmath.js';

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
const FINGER_PTS = {
  thumb: H.THUMB, index: H.INDEX, middle: H.MIDDLE, ring: H.RING, pinky: H.PINKY,
  palm: [0, 5, 9, 13, 17],
};
// Цвет кончика каждого пальца — как в роликах с управлением руками.
const TIPS = [
  { i: 4, color: '#2f6bff' },   // большой — синий
  { i: 8, color: '#39e639' },   // указательный — зелёный
  { i: 12, color: '#ff2d2d' },  // средний — красный
  { i: 16, color: '#19e3d0' },  // безымянный — бирюзовый
  { i: 20, color: '#b44dff' },  // мизинец — фиолетовый
];
const TIP_SET = new Set(TIPS.map((t) => t.i));
const POSE_LABEL = { pinch: '👌 идти', shoot: '🤏 способность', fist: '✊ камера', open: '☝️ курсор' };

// Мини-экран камеры: зеркальное видео, обведённая рука с цветными кончиками пальцев,
// активная зона курсора и красная подсветка пальцев, на которые указывает подсказка «ошибки».
export class CamView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.focus = null;
    this.focusUntil = 0;
  }

  setFocus(fingers, t, dur = 2.2) {
    this.focus = fingers?.length ? new Set(fingers) : null;
    this.focusUntil = t + dur;
  }

  draw(video, state, box, t) {
    const { canvas, ctx } = this;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth;
    const ch = Math.round((cw * vh) / vw);
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.height = ch + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = cw / vw;

    ctx.save();
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, cw, ch);
    ctx.restore();

    if (box) {
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = 'rgba(255,209,102,0.7)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(box.x * s, box.y * s, box.w * s, box.h * s);
      ctx.setLineDash([]);
    }

    if (!state?.present) return;
    const bad = t < this.focusUntil ? this.focus : null;
    if (state.pts2) this.hand(state.pts2, s, null, cw, 0.75);
    this.hand(state.pts, s, bad, cw, 1);

    // подпись текущего жеста
    const label = state.twoFists ? '✊✊ УЛЬТА' : POSE_LABEL[state.pose];
    if (label) {
      ctx.font = '800 13px Manrope, sans-serif';
      const w = ctx.measureText(label).width + 16;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(cw - w - 8, 8, w, 24);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, cw - w, 25);
    }
  }

  hand(pts, s, bad, cw, alpha) {
    const { ctx } = this;
    const p = pts.map((q) => ({ x: q.x * s, y: q.y * s }));
    const badPts = new Set();
    if (bad) for (const f of bad) for (const i of FINGER_PTS[f] ?? []) badPts.add(i);
    const r = Math.max(4, cw / 55);
    ctx.globalAlpha = alpha;

    // контур руки — тонкие белые линии
    ctx.lineCap = 'round';
    for (const [a, b] of BONES) {
      const isBad = badPts.has(a) && badPts.has(b);
      ctx.strokeStyle = isBad ? '#ff4d6d' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = isBad ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(p[a].x, p[a].y);
      ctx.lineTo(p[b].x, p[b].y);
      ctx.stroke();
    }
    // суставы — маленькие красные точки
    for (let i = 0; i < p.length; i++) {
      if (TIP_SET.has(i)) continue;
      ctx.fillStyle = '#ff2d55';
      ctx.beginPath();
      ctx.arc(p[i].x, p[i].y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    // кончики пальцев — крупные цветные кружки
    for (const { i, color } of TIPS) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p[i].x, p[i].y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (badPts.has(i)) {
        ctx.strokeStyle = '#ff4d6d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p[i].x, p[i].y, r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
