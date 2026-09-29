import { CONFIG } from '../config.js';

const G = CONFIG.game;
const OUTLINE = '#1f2a1c';
const WALL = 44;      // толщина каменной стены по краю карты
const TILE = 100;     // клетка травы
const HERO_SCALE = 1.4;

// Отрисовка арены в духе Archero: зелёная комната с травой, каменные стены,
// мультяшный лучник и враги с обводкой. Земля рисуется один раз в отдельный canvas.
export class ArenaRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.groundCanvas = null;
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
    this.ensureGround(arena?.WW ?? G.worldW, arena?.WH ?? G.worldH);
    ctx.save();
    if (arena?.shake) {
      const s = arena.shake * 10;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    if (!arena) {
      this.menuBackground(t);
    } else {
      ctx.fillStyle = '#244a28';
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.save();
      ctx.translate(-arena.cam.x, -arena.cam.y);
      ctx.drawImage(this.groundCanvas, -this.pad, -this.pad);
      this.slams(arena);
      if (arena.hero.target) this.targetMark(arena.hero.target, t);
      this.aimLine(arena, cursor);
      for (const e of arena.enemies) if (e.mode === 'aim') this.boarLine(e, t);
      for (const e of arena.enemies) this.shadow(e.x, e.y + e.r * 0.85, e.r);
      this.shadow(arena.hero.x, arena.hero.y + 20 * HERO_SCALE, 18 * HERO_SCALE);
      // Сортировка по y — кто ниже на экране, тот рисуется поверх.
      const actors = [...arena.enemies.map((e) => ({ y: e.y, e })), { y: arena.hero.y, hero: true }];
      actors.sort((a, b) => a.y - b.y);
      for (const a of actors) {
        if (a.hero) this.hero(arena.hero, t, arena);
        else this.enemy(a.e, t, arena.hero);
      }
      this.vortex(arena, t);
      for (const o of arena.orbs) this.orb(o, t);
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
      ctx.fillStyle = `rgba(255,60,80,${arena.hero.hurtT * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------- карта ----------
  // Трава, стены, деревья и камни рисуются один раз — дальше только копируется нужный кусок.
  ensureGround(WW, WH) {
    if (this.groundCanvas && this.groundFor === WW + 'x' + WH) return;
    this.groundFor = WW + 'x' + WH;
    const pad = 400; // лес за стенами, чтобы у края карты не было пустоты
    this.pad = pad;
    const c = document.createElement('canvas');
    c.width = WW + pad * 2;
    c.height = WH + pad * 2;
    const g = c.getContext('2d');
    const rnd = mulberry(7);

    // Лес за стенами
    g.fillStyle = '#2d5a2f';
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * c.width, y = rnd() * c.height;
      if (x > pad - 40 && x < pad + WW + 40 && y > pad - 40 && y < pad + WH + 40) continue;
      tree(g, x, y, 40 + rnd() * 30, rnd);
    }

    g.save();
    g.translate(pad, pad);
    // Трава: шахматка двух оттенков
    for (let y = 0; y < WH; y += TILE) {
      for (let x = 0; x < WW; x += TILE) {
        g.fillStyle = ((x + y) / TILE) % 2 ? '#7fcf5c' : '#76c653';
        g.fillRect(x, y, TILE, TILE);
      }
    }
    // Кустики травы и цветы
    for (let i = 0; i < 1400; i++) {
      const x = WALL + rnd() * (WW - WALL * 2), y = WALL + rnd() * (WH - WALL * 2);
      g.strokeStyle = rnd() < 0.5 ? '#5fae45' : '#8fdc6a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 3, y - 7);
      g.moveTo(x, y);
      g.lineTo(x + 1, y - 9);
      g.moveTo(x, y);
      g.lineTo(x + 4, y - 6);
      g.stroke();
    }
    const petals = ['#ffffff', '#ffe066', '#ff8fb1'];
    for (let i = 0; i < 260; i++) {
      const x = WALL + rnd() * (WW - WALL * 2), y = WALL + rnd() * (WH - WALL * 2);
      g.fillStyle = petals[Math.floor(rnd() * petals.length)];
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(x + Math.cos(k * 1.57) * 3, y + Math.sin(k * 1.57) * 3, 2.4, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#f5a623';
      g.beginPath();
      g.arc(x, y, 2, 0, Math.PI * 2);
      g.fill();
    }
    // Пара полянок-тропинок посветлее
    g.fillStyle = 'rgba(226,205,140,0.35)';
    g.beginPath();
    g.ellipse(WW / 2, WH / 2, 260, 170, 0, 0, Math.PI * 2);
    g.fill();

    // Камни у стен
    for (let i = 0; i < 26; i++) {
      const side = Math.floor(rnd() * 4);
      const along = rnd();
      const x = side === 0 ? WALL + 40 + rnd() * 60 : side === 1 ? WW - WALL - 40 - rnd() * 60 : WALL + along * (WW - WALL * 2);
      const y = side === 2 ? WALL + 40 + rnd() * 60 : side === 3 ? WH - WALL - 40 - rnd() * 60 : WALL + along * (WH - WALL * 2);
      rock(g, x, y, 14 + rnd() * 16);
    }
    // Тень от стен на траву
    const shadowGrad = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0,0,0,0.28)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      return gr;
    };
    g.fillStyle = shadowGrad(0, WALL, 0, WALL + 34);
    g.fillRect(WALL, WALL, WW - WALL * 2, 34);
    g.fillStyle = shadowGrad(WALL, 0, WALL + 24, 0);
    g.fillRect(WALL, WALL, 24, WH - WALL * 2);
    g.fillStyle = shadowGrad(WW - WALL, 0, WW - WALL - 24, 0);
    g.fillRect(WW - WALL - 24, WALL, 24, WH - WALL * 2);

    // Каменные стены
    wall(g, 0, 0, WW, WALL);
    wall(g, 0, WH - WALL, WW, WALL);
    wall(g, 0, 0, WALL, WH);
    wall(g, WW - WALL, 0, WALL, WH);
    // Деревья по углам и вдоль стен — рамка комнаты
    for (let x = 90; x < WW; x += 260) {
      tree(g, x + rnd() * 40, -10, 46, rnd);
      tree(g, x + rnd() * 40, WH + 14, 46, rnd);
    }
    for (let y = 150; y < WH; y += 260) {
      tree(g, -12, y + rnd() * 40, 46, rnd);
      tree(g, WW + 12, y + rnd() * 40, 46, rnd);
    }
    g.restore();
    this.groundCanvas = c;
  }

  menuBackground(t) {
    const { ctx, W, H } = this;
    const c = this.groundCanvas;
    const ox = this.pad + 300 + Math.sin(t * 0.05) * 200, oy = this.pad + 250;
    ctx.drawImage(c, ox, oy, W, H, 0, 0, W, H);
    ctx.fillStyle = 'rgba(12,26,14,0.55)';
    ctx.fillRect(0, 0, W, H);
  }

  shadow(x, y, r) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.95, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- герой: мультяшный лучник ----------
  hero(h, t, arena) {
    const { ctx } = this;
    const moving = !!h.target;
    const bob = moving ? Math.abs(Math.sin(h.walkT * 12)) * 3 : Math.sin(t * 3) * 0.8;
    const face = h.dir.x < 0 ? -1 : 1;
    const ang = Math.atan2(h.dir.y, h.dir.x);
    ctx.save();
    ctx.translate(h.x, h.y - bob);
    ctx.scale(HERO_SCALE, HERO_SCALE); // герой крупнее врагов — как в Archero
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = OUTLINE;

    // ножки
    const step = moving ? Math.sin(h.walkT * 12) * 4 : 0;
    ctx.fillStyle = '#5a3a22';
    for (const [dx, s] of [[-6, step], [6, -step]]) {
      ctx.beginPath();
      ctx.ellipse(dx, 17 + s * 0.3 + bob, 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // туловище-курточка
    ctx.fillStyle = '#3f7fe0';
    roundRect(ctx, -11, -2, 22, 20, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(-11, 8, 22, 4); // пояс
    ctx.strokeRect(-11, 8, 22, 4);
    // колчан за спиной
    ctx.save();
    ctx.translate(-face * 10, 0);
    ctx.rotate(face * 0.4);
    ctx.fillStyle = '#a0632f';
    roundRect(ctx, -3.5, -14, 7, 18, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const dx of [-1.5, 1.5]) {
      ctx.beginPath();
      ctx.moveTo(dx, -14);
      ctx.lineTo(dx - 2, -19);
      ctx.lineTo(dx + 2, -19);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // голова — большая, как в Archero
    ctx.fillStyle = '#ffd9b3';
    ctx.beginPath();
    ctx.arc(0, -16, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // зелёный капюшон
    ctx.fillStyle = '#2f9e4f';
    ctx.beginPath();
    ctx.arc(0, -17, 16, Math.PI * 1.02, Math.PI * 1.98);
    ctx.quadraticCurveTo(face * 20, -26, face * 22, -32);
    ctx.quadraticCurveTo(face * 6, -30, -face * 14, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // глаза смотрят туда, куда целится
    const ex = Math.cos(ang) * 3, ey = Math.sin(ang) * 2;
    ctx.fillStyle = '#1b1b1b';
    for (const dx of [-5, 5]) {
      ctx.beginPath();
      ctx.ellipse(dx + ex, -13 + ey, 2.2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,120,120,0.45)';
    for (const dx of [-9, 9]) {
      ctx.beginPath();
      ctx.arc(dx, -8, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // лук в сторону цели
    ctx.save();
    ctx.translate(0, 4);
    ctx.rotate(ang);
    ctx.strokeStyle = '#6b3f1d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(14, 0, 14, -1.25, 1.25);
    ctx.stroke();
    ctx.strokeStyle = '#f2f2f2';
    ctx.lineWidth = 1.2;
    const pull = moving ? 0 : 5 + Math.sin(t * 10) * 1.5;
    ctx.beginPath();
    ctx.moveTo(14 + Math.cos(-1.25) * 14, Math.sin(-1.25) * 14);
    ctx.lineTo(14 - pull, 0);
    ctx.lineTo(14 + Math.cos(1.25) * 14, Math.sin(1.25) * 14);
    ctx.stroke();
    if (!moving) { // стрела на тетиве — герой стоит и стреляет
      ctx.strokeStyle = '#6b4423';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14 - pull, 0);
      ctx.lineTo(32, 0);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();

    this.heroBars(h, arena);
  }

  // Полоска здоровья с числом над головой и полоска ульты под ней — как в Archero.
  heroBars(h, arena) {
    const { ctx } = this;
    const w = 62, x = h.x - w / 2, y = h.y - 30 - 34 * HERO_SCALE;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x - 2, y - 2, w + 4, 11, 4);
    ctx.fill();
    ctx.fillStyle = '#4cd964';
    roundRect(ctx, x, y, (w * Math.max(0, h.hp)) / h.maxHp, 7, 3);
    ctx.fill();
    const pct = h.energy / G.ultCost;
    ctx.fillStyle = pct >= 1 ? '#ff4fd8' : '#b36bff';
    ctx.fillRect(x, y + 10, w * pct, 3);
    ctx.font = '800 12px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.fillStyle = '#fff';
    const txt = String(Math.ceil(h.hp));
    ctx.strokeText(txt, h.x, y - 4);
    ctx.fillText(txt, h.x, y - 4);
  }

  // ---------- враги: мультяшные, с обводкой ----------
  enemy(e, t, hero) {
    const { ctx } = this;
    const d = e.def;
    const hop = e.type === 'bat' ? Math.sin(e.phase * 10) * 4 : Math.abs(Math.sin(e.phase * 8)) * 2;
    ctx.save();
    ctx.translate(e.x, e.y - hop);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = OUTLINE;
    ctx.fillStyle = e.hitT > 0 ? '#ffffff' : d.color;
    const s = e.r;
    ctx.beginPath();
    if (e.type === 'wolf') {
      ctx.moveTo(-s, -s * 0.2);
      ctx.lineTo(-s * 0.75, -s * 1.15);
      ctx.lineTo(-s * 0.25, -s * 0.6);
      ctx.lineTo(s * 0.25, -s * 0.6);
      ctx.lineTo(s * 0.75, -s * 1.15);
      ctx.lineTo(s, -s * 0.2);
      ctx.quadraticCurveTo(s * 1.05, s * 0.9, 0, s);
      ctx.quadraticCurveTo(-s * 1.05, s * 0.9, -s, -s * 0.2);
    } else if (e.type === 'bat') {
      const f = Math.sin(e.phase * 22) * 0.5 + 0.5;
      ctx.moveTo(0, -s * 0.5);
      ctx.quadraticCurveTo(-s * 1.2, -s * (0.7 + f), -s * 2, s * 0.1);
      ctx.quadraticCurveTo(-s * 1, 0, -s * 0.5, s * 0.6);
      ctx.quadraticCurveTo(0, s * 0.8, s * 0.5, s * 0.6);
      ctx.quadraticCurveTo(s * 1, 0, s * 2, s * 0.1);
      ctx.quadraticCurveTo(s * 1.2, -s * (0.7 + f), 0, -s * 0.5);
    } else if (e.type === 'boar') {
      ctx.ellipse(0, 0, s * 1.15, s * 0.9, 0, 0, Math.PI * 2);
    } else if (e.type === 'golem') {
      roundRect(ctx, -s, -s, s * 2, s * 2, 9);
    } else if (e.type === 'shaman') {
      ctx.moveTo(0, -s * 1.35);
      ctx.quadraticCurveTo(s * 0.5, -s * 0.2, s * 1.05, s);
      ctx.lineTo(-s * 1.05, s);
      ctx.quadraticCurveTo(-s * 0.5, -s * 0.2, 0, -s * 1.35);
    } else {
      for (let i = 0; i < 12; i++) {
        const q = (i / 12) * Math.PI * 2 + t * 0.3;
        const r = s * (i % 2 ? 0.8 : 1.05);
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(q) * r, Math.sin(q) * r);
      }
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();

    // детали
    if (e.type === 'boar') {
      ctx.fillStyle = '#fff4dc';
      for (const k of [-1, 1]) { // клыки
        ctx.beginPath();
        ctx.moveTo(k * s * 0.35, s * 0.35);
        ctx.lineTo(k * s * 0.65, s * 0.95);
        ctx.lineTo(k * s * 0.15, s * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (e.type === 'golem') {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, -s * 0.2);
      ctx.lineTo(-s * 0.1, s * 0.3);
      ctx.lineTo(s * 0.5, -s * 0.1);
      ctx.stroke();
      ctx.strokeStyle = OUTLINE;
    } else if (e.type === 'shaman') {
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(0, -s * 1.35, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // статусы
    if (e.slow > 0) {
      ctx.strokeStyle = 'rgba(120,210,255,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, s + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.burn > 0) {
      ctx.fillStyle = `rgba(255,120,40,${0.35 + 0.25 * Math.sin(t * 20)})`;
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fill();
    }

    // глаза смотрят на героя
    const ang = Math.atan2(hero.y - e.y, hero.x - e.x);
    const px = Math.cos(ang) * 1.6, py = Math.sin(ang) * 1.6;
    const ey = e.type === 'shaman' ? -s * 0.1 : e.type === 'bat' ? -s * 0.05 : -s * 0.15;
    const er = Math.max(3, s * 0.2);
    for (const k of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(k * s * 0.33, ey, er, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = d.boss ? '#d6002f' : '#111';
      ctx.beginPath();
      ctx.arc(k * s * 0.33 + px, ey + py, er * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // злые брови
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, ey - er - 3);
    ctx.lineTo(-s * 0.12, ey - er);
    ctx.moveTo(s * 0.55, ey - er - 3);
    ctx.lineTo(s * 0.12, ey - er);
    ctx.stroke();

    if (e.maxHp > 1) {
      const w = Math.max(30, e.r * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(-w / 2 - 1, -e.r - 17, w + 2, 7);
      ctx.fillStyle = d.boss ? '#ff4fd8' : '#ff5a5a';
      ctx.fillRect(-w / 2, -e.r - 16, (w * Math.max(0, e.hp)) / e.maxHp, 5);
    }
    ctx.restore();
  }

  // ---------- снаряды и эффекты ----------
  bolt(b) {
    const { ctx } = this;
    const ang = Math.atan2(b.vy, b.vx);
    const tip = b.fire ? '#ff7a1a' : b.ice ? '#6fd3ff' : b.big ? '#ffd166' : '#d9d9d9';
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ang);
    if (b.fire || b.ice || b.big) {
      ctx.shadowColor = tip;
      ctx.shadowBlur = 12;
    }
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = b.big ? 3.5 : 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = tip;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(4, -4.5);
    ctx.lineTo(4, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff'; // оперение
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(-23, -4);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-23, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  orb(o, t) {
    const { ctx } = this;
    ctx.shadowColor = '#ff4fd8';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#e04cc4';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(o.x, o.y, 9 + Math.sin(t * 20) * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd6f4';
    ctx.beginPath();
    ctx.arc(o.x - 2.5, o.y - 2.5, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  boarLine(e, t) {
    const { ctx } = this;
    const len = 720 * 0.55;
    ctx.save();
    ctx.strokeStyle = `rgba(255,40,60,${0.35 + 0.25 * Math.sin(t * 25)})`;
    ctx.lineWidth = e.r * 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + e.dash.x * len, e.y + e.dash.y * len);
    ctx.stroke();
    ctx.restore();
  }

  vortex(arena, t) {
    const n = arena.s?.orbs;
    if (!n) return;
    const { ctx } = this;
    const h = arena.hero;
    for (let i = 0; i < n; i++) {
      const a = arena.time * 3 + (i * Math.PI * 2) / n;
      const x = h.x + Math.cos(a) * 80, y = h.y + Math.sin(a) * 80;
      ctx.shadowColor = '#ff8c42';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#ff9d3c';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  slams(arena) {
    const { ctx } = this;
    for (const s of arena.slams) {
      const p = Math.min(1, s.t / s.dur);
      if (!s.done) {
        ctx.fillStyle = `rgba(230,30,50,${0.12 + p * 0.18})`;
        ctx.strokeStyle = `rgba(200,0,30,${0.6 + p * 0.4})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(230,30,50,0.25)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * p, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const a = 1 - (s.t - s.dur) / 0.4;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
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
    ctx.shadowColor = '#ff4fd8';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = `rgba(255,79,216,${a})`;
    ctx.lineWidth = 14 * a + 2;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255,255,255,${a * 0.25})`;
    ctx.fill();
  }

  targetMark(p, t) {
    const { ctx } = this;
    const r = 12 + Math.sin(t * 8) * 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  aimLine(arena, cursor) {
    if (!cursor) return;
    const { ctx } = this;
    const h = arena.hero;
    const c = arena.toWorld(cursor);
    ctx.save();
    ctx.setLineDash([6, 10]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    ctx.restore();
  }

  fx(arena) {
    const { ctx } = this;
    for (const p of arena.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'ping') {
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 30 * (1 - a) + 6, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.font = '800 18px Unbounded, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = OUTLINE;
    for (const t of arena.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
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
    ctx.fillStyle = `rgba(255,209,102,${0.8 + 0.2 * Math.sin(t * 8)})`;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-10, -14);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  minimap(arena) {
    const { ctx, W } = this;
    const mw = Math.min(200, W * 0.2), mh = (mw * arena.WH) / arena.WW;
    const x0 = W - mw - 16, y0 = 78;
    const k = mw / arena.WW;
    ctx.fillStyle = 'rgba(40,90,40,0.85)';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.fillRect(x0, y0, mw, mh);
    ctx.strokeRect(x0, y0, mw, mh);
    for (const e of arena.enemies) {
      ctx.fillStyle = e.def.boss ? '#ff4fd8' : '#ff4d4d';
      ctx.fillRect(x0 + e.x * k - 2, y0 + e.y * k - 2, e.def.boss ? 6 : 3, e.def.boss ? 6 : 3);
    }
    ctx.fillStyle = '#4fa3ff';
    ctx.beginPath();
    ctx.arc(x0 + arena.hero.x * k, y0 + arena.hero.y * k, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + arena.cam.x * k, y0 + arena.cam.y * k, arena.W * k, arena.H * k);
  }
}

// ---------- рисовалки для карты ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), h, r);
}

function tree(g, x, y, r, rnd) {
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.ellipse(x + r * 0.2, y + r * 0.35, r, r * 0.6, 0, 0, Math.PI * 2);
  g.fill();
  const shades = ['#2f7d34', '#3a9440', '#46a84b'];
  for (let i = 0; i < 3; i++) {
    g.fillStyle = shades[i];
    g.beginPath();
    g.arc(x + (rnd() - 0.5) * r * 0.3, y - i * r * 0.12, r * (1 - i * 0.22), 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(20,50,20,0.6)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
}

function rock(g, x, y, r) {
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath();
  g.ellipse(x + 3, y + r * 0.5, r, r * 0.45, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#9aa0a8';
  g.strokeStyle = OUTLINE;
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#c3c8cf';
  g.beginPath();
  g.ellipse(x - r * 0.25, y - r * 0.25, r * 0.4, r * 0.25, -0.4, 0, Math.PI * 2);
  g.fill();
}

function wall(g, x, y, w, h) {
  g.fillStyle = '#8d949c';
  g.fillRect(x, y, w, h);
  g.strokeStyle = '#6c737b';
  g.lineWidth = 2;
  const bw = 48, bh = 22;
  for (let yy = y, row = 0; yy < y + h; yy += bh, row++) {
    for (let xx = x - (row % 2 ? bw / 2 : 0); xx < x + w; xx += bw) {
      g.fillStyle = (Math.floor(xx / bw) + row) % 3 ? '#9aa1a9' : '#a7aeb6';
      g.fillRect(Math.max(x, xx) + 1, yy + 1, Math.min(bw, x + w - Math.max(x, xx)) - 2, Math.min(bh, y + h - yy) - 2);
      g.strokeRect(Math.max(x, xx), yy, Math.min(bw, x + w - Math.max(x, xx)), Math.min(bh, y + h - yy));
    }
  }
  g.strokeStyle = OUTLINE;
  g.lineWidth = 3;
  g.strokeRect(x, y, w, h);
}

// Детерминированный генератор случайных чисел: карта одинаковая при каждом запуске.
function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
