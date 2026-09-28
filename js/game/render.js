import { CONFIG } from '../config.js';

const G = CONFIG.game;

// Отрисовка арены на canvas: ночная степь, орнаментальный круг, герой, враги, эффекты.
export class ArenaRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stars = Array.from({ length: 140 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.3, tw: Math.random() * 6,
    }));
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = this.canvas.clientWidth || innerWidth;
    this.H = this.canvas.clientHeight || innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.onResize?.(this.W, this.H);
  }

  draw(arena, t, cursor) {
    const { ctx, W, H } = this;
    ctx.save();
    if (arena?.shake) {
      const s = arena.shake * 10;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    this.sky(t, arena?.cam);
    if (!arena) {
      this.ornament(W / 2, H / 2, Math.min(W, H) * 0.44, t);
    } else {
      ctx.save();
      ctx.translate(-arena.cam.x, -arena.cam.y);
      this.ground(arena, t);
      this.slams(arena);
      if (arena.hero.target) this.targetMark(arena.hero.target, t);
      this.aimLine(arena, cursor);
      for (const o of arena.orbs) this.orb(o, t);
      for (const e of arena.enemies) if (e.mode === 'aim') this.boarLine(e, t);
      for (const e of arena.enemies) this.enemy(e, t);
      this.hero(arena.hero, t);
      this.vortex(arena, t);
      for (const b of arena.bolts) this.bolt(b);
      for (const n of arena.novas) this.nova(n);
      this.fx(arena);
      ctx.restore();
    }
    ctx.restore();
    if (arena) {
      this.offscreenArrow(arena, t);
      this.minimap(arena);
    }
    if (arena?.hero.hurtT > 0) {
      ctx.fillStyle = `rgba(255,60,80,${arena.hero.hurtT * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Небо со звёздами — чуть смещается вместе с камерой (параллакс).
  sky(t, cam) {
    const { ctx, W, H } = this;
    const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#1d1340');
    g.addColorStop(0.6, '#0d0a24');
    g.addColorStop(1, '#05040f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const ox = cam ? cam.x * 0.15 : 0, oy = cam ? cam.y * 0.15 : 0;
    for (const s of this.stars) {
      const a = 0.35 + 0.35 * Math.sin(t * 1.4 + s.tw);
      ctx.fillStyle = `rgba(210,220,255,${a})`;
      ctx.beginPath();
      ctx.arc((((s.x * W - ox) % W) + W) % W, (((s.y * H - oy) % H) + H) % H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Земля карты: граница, сетка-ориентир, степная трава и орнамент в центре.
  ground(arena, t) {
    const { ctx } = this;
    const { WW, WH } = arena;
    if (!this.deco || this.decoFor !== WW) {
      this.decoFor = WW;
      this.deco = Array.from({ length: 260 }, () => ({ x: Math.random() * WW, y: Math.random() * WH, s: 3 + Math.random() * 5 }));
    }
    ctx.fillStyle = 'rgba(40,30,80,0.25)';
    ctx.fillRect(0, 0, WW, WH);
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= WW; x += 200) { ctx.moveTo(x, 0); ctx.lineTo(x, WH); }
    for (let y = 0; y <= WH; y += 200) { ctx.moveTo(0, y); ctx.lineTo(WW, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(126,224,195,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const d of this.deco) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.s * 0.4, d.y - d.s);
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.s * 0.4, d.y - d.s);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,79,216,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, WW, WH);
    this.ornament(WW / 2, WH / 2, 620, t);
  }

  // Круг с орнаментом «қошқар мүйіз» (бараньи рога, упрощённо) и шаңырақ в центре.
  ornament(cx, cy, R, t) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,209,102,0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.rotate(t * 0.03);
    const n = 16;
    for (let i = 0; i < n; i++) {
      ctx.rotate((Math.PI * 2) / n);
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.66);
      ctx.bezierCurveTo(R * 0.12, -R * 0.72, R * 0.1, -R * 0.86, 0, -R * 0.82);
      ctx.bezierCurveTo(-R * 0.06, -R * 0.8, -R * 0.03, -R * 0.74, R * 0.03, -R * 0.75);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(76,201,240,0.12)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 2; i++) {
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-46, k * 14 * (i + 0.5));
        ctx.lineTo(46, k * 14 * (i + 0.5));
        ctx.moveTo(k * 14 * (i + 0.5), -46);
        ctx.lineTo(k * 14 * (i + 0.5), 46);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Герой за краем экрана — стрелка у края указывает, куда двигать камеру.
  offscreenArrow(arena, t) {
    if (arena.heroOnScreen()) return;
    const { ctx, W, H } = this;
    const h = arena.hero;
    const sx = h.x - arena.cam.x, sy = h.y - arena.cam.y;
    const ang = Math.atan2(sy - H / 2, sx - W / 2);
    const m = 46;
    const x = Math.max(m, Math.min(W - m, sx)), y = Math.max(m + 70, Math.min(H - m - 90, sy));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    this.glow('#ffd166', 18);
    ctx.fillStyle = `rgba(255,209,102,${0.75 + 0.25 * Math.sin(t * 8)})`;
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-10, -14);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  // Мини-карта как в Доте: герой, враги и рамка того, что сейчас видно.
  minimap(arena) {
    const { ctx, W } = this;
    const mw = Math.min(200, W * 0.2), mh = (mw * arena.WH) / arena.WW;
    const x0 = W - mw - 16, y0 = 78;
    const k = mw / arena.WW;
    ctx.fillStyle = 'rgba(8,6,24,0.75)';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.fillRect(x0, y0, mw, mh);
    ctx.strokeRect(x0, y0, mw, mh);
    for (const e of arena.enemies) {
      ctx.fillStyle = e.def.boss ? '#ff4fd8' : '#ff4d6d';
      ctx.fillRect(x0 + e.x * k - 2, y0 + e.y * k - 2, e.def.boss ? 6 : 3, e.def.boss ? 6 : 3);
    }
    ctx.fillStyle = '#3ddc97';
    ctx.beginPath();
    ctx.arc(x0 + arena.hero.x * k, y0 + arena.hero.y * k, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(x0 + arena.cam.x * k, y0 + arena.cam.y * k, arena.W * k, arena.H * k);
  }

  glow(color, blur) {
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = blur;
  }

  hero(h, t) {
    const { ctx } = this;
    const bob = h.target ? Math.sin(h.walkT * 14) * 2 : 0;
    ctx.save();
    ctx.translate(h.x, h.y + bob);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, h.r + 6 - bob, h.r * 0.9, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Плащ-треугольник смотрит по направлению выстрела
    const ang = Math.atan2(h.dir.y, h.dir.x);
    ctx.save();
    ctx.rotate(ang);
    this.glow('#ffd166', 16);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(h.r + 10, 0);
    ctx.lineTo(h.r - 2, -7);
    ctx.lineTo(h.r - 2, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    this.glow('#ffe7a8', 24);
    const g = ctx.createRadialGradient(-5, -6, 2, 0, 0, h.r);
    g.addColorStop(0, '#fff6d8');
    g.addColorStop(1, '#f2a93b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, h.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
    ctx.shadowBlur = 0;

    // Кольцо энергии ульты
    const pct = h.energy / G.ultCost;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = pct >= 1 ? `hsl(${(t * 200) % 360},90%,65%)` : '#ff4fd8';
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r + 7, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
    ctx.stroke();
  }

  enemy(e, t) {
    const { ctx } = this;
    const d = e.def;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, e.r + 4, e.r * 0.9, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    const color = e.hitT > 0 ? '#ffffff' : d.color;
    this.glow(d.color, d.boss ? 30 : 12);
    ctx.fillStyle = color;
    ctx.beginPath();
    if (e.type === 'wolf') {
      // вытянутая голова-капля
      const s = e.r;
      const wob = Math.sin(e.phase * 16) * 2;
      ctx.moveTo(-s, -s * 0.6 + wob);
      ctx.lineTo(-s * 0.4, -s * 1.2);
      ctx.lineTo(0, -s * 0.6);
      ctx.lineTo(s * 0.4, -s * 1.2);
      ctx.lineTo(s, -s * 0.6 - wob);
      ctx.quadraticCurveTo(s * 1.1, s * 0.6, 0, s);
      ctx.quadraticCurveTo(-s * 1.1, s * 0.6, -s, -s * 0.6 + wob);
    } else if (e.type === 'bat') {
      const f = Math.sin(e.phase * 22) * 0.5 + 0.5;
      const s = e.r;
      ctx.moveTo(0, -s * 0.4);
      ctx.quadraticCurveTo(-s * 1.2, -s * (0.6 + f), -s * 1.9, s * 0.2);
      ctx.quadraticCurveTo(-s * 0.9, 0, 0, s * 0.6);
      ctx.quadraticCurveTo(s * 0.9, 0, s * 1.9, s * 0.2);
      ctx.quadraticCurveTo(s * 1.2, -s * (0.6 + f), 0, -s * 0.4);
    } else if (e.type === 'boar') {
      ctx.ellipse(0, 0, e.r * 1.15, e.r * 0.85, 0, 0, Math.PI * 2);
      ctx.moveTo(-e.r * 0.6, e.r * 0.4);
      ctx.lineTo(-e.r * 0.9, e.r * 0.95);
      ctx.lineTo(-e.r * 0.35, e.r * 0.55);
      ctx.moveTo(e.r * 0.6, e.r * 0.4);
      ctx.lineTo(e.r * 0.9, e.r * 0.95);
      ctx.lineTo(e.r * 0.35, e.r * 0.55);
    } else if (e.type === 'golem') {
      ctx.roundRect(-e.r, -e.r, e.r * 2, e.r * 2, 8);
    } else if (e.type === 'shaman') {
      ctx.moveTo(0, -e.r * 1.3);
      ctx.lineTo(e.r, e.r);
      ctx.lineTo(-e.r, e.r);
      ctx.closePath();
    } else {
      for (let i = 0; i < 10; i++) {
        const q = (i / 10) * Math.PI * 2 + t * 0.4;
        const r = e.r * (i % 2 ? 0.78 : 1.05);
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(q) * r, Math.sin(q) * r);
      }
      ctx.closePath();
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    if (e.slow > 0) {
      ctx.strokeStyle = 'rgba(140,220,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.burn > 0) {
      ctx.fillStyle = `rgba(255,120,40,${0.35 + 0.25 * Math.sin(t * 20)})`;
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // глаза
    ctx.fillStyle = d.boss ? '#fff' : '#ff3b5c';
    const ey = e.type === 'shaman' ? 0 : -e.r * 0.15;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(k * e.r * 0.32, ey, Math.max(2, e.r * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }

    if (e.maxHp > 1) {
      const w = e.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-w / 2, -e.r - 14, w, 5);
      ctx.fillStyle = d.boss ? '#ff4fd8' : '#3ddc97';
      ctx.fillRect(-w / 2, -e.r - 14, (w * Math.max(0, e.hp)) / e.maxHp, 5);
    }
    ctx.restore();
  }

  bolt(b) {
    const { ctx } = this;
    const color = b.fire ? '#ff8c42' : b.ice ? '#8cdcff' : b.big ? '#ffd166' : '#fff3c4';
    const ang = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ang);
    this.glow(color, b.big ? 18 : 10);
    ctx.strokeStyle = color;
    ctx.lineWidth = b.big ? 4 : 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(4, 0);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(2, -5);
    ctx.lineTo(2, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  // Кабан целится: красная линия будущего рывка.
  boarLine(e, t) {
    const { ctx } = this;
    const len = 720 * 0.55;
    ctx.save();
    ctx.strokeStyle = `rgba(255,60,90,${0.5 + 0.4 * Math.sin(t * 25)})`;
    ctx.lineWidth = e.r * 1.6;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + e.dash.x * len, e.y + e.dash.y * len);
    ctx.stroke();
    ctx.restore();
  }

  // Умение «Вихрь»: шары вокруг героя.
  vortex(arena, t) {
    const n = arena.s?.orbs;
    if (!n) return;
    const { ctx } = this;
    const h = arena.hero;
    for (let i = 0; i < n; i++) {
      const a = arena.time * 3 + (i * Math.PI * 2) / n;
      this.glow('#ff8c42', 18);
      ctx.fillStyle = '#ffb36b';
      ctx.beginPath();
      ctx.arc(h.x + Math.cos(a) * 80, h.y + Math.sin(a) * 80, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  orb(o, t) {
    const { ctx } = this;
    this.glow('#7ee0c3', 20);
    ctx.fillStyle = '#b6ffe9';
    ctx.beginPath();
    ctx.arc(o.x, o.y, 8 + Math.sin(t * 20) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  slams(arena) {
    const { ctx } = this;
    for (const s of arena.slams) {
      const p = Math.min(1, s.t / s.dur);
      if (!s.done) {
        ctx.fillStyle = `rgba(255,60,90,${0.08 + p * 0.18})`;
        ctx.strokeStyle = `rgba(255,60,90,${0.5 + p * 0.5})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,60,90,0.25)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * p, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const a = 1 - (s.t - s.dur) / 0.4;
        ctx.strokeStyle = `rgba(255,79,216,${a})`;
        ctx.lineWidth = 8 * a;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (1 + (1 - a) * 0.3), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  nova(n) {
    const { ctx } = this;
    const a = n.life / 0.5;
    this.glow('#ff4fd8', 30);
    ctx.strokeStyle = `rgba(255,79,216,${a})`;
    ctx.lineWidth = 14 * a + 2;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  targetMark(p, t) {
    const { ctx } = this;
    const r = 12 + Math.sin(t * 8) * 2;
    ctx.strokeStyle = 'rgba(61,220,151,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  aimLine(arena, cursor) {
    if (!cursor) return;
    const { ctx } = this;
    const h = arena.hero;
    cursor = arena.toWorld(cursor);
    ctx.save();
    ctx.setLineDash([6, 10]);
    ctx.strokeStyle = 'rgba(255,209,102,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(cursor.x, cursor.y);
    ctx.stroke();
    ctx.restore();
  }

  fx(arena) {
    const { ctx } = this;
    for (const p of arena.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'ping') {
        ctx.strokeStyle = `rgba(61,220,151,${a})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 30 * (1 - a) + 6, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.font = '700 18px Unbounded, sans-serif';
    ctx.textAlign = 'center';
    for (const t of arena.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
