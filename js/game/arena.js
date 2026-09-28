import { CONFIG } from '../config.js';
import { ENEMIES, WAVES } from './waves.js';

const G = CONFIG.game;
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Логика арены. Ничего не знает о камере и жестах — получает команды
// (идти, способность, двигать камеру, ульта) и отдаёт события для тренера, звука и интерфейса.
// Карта больше экрана, как в Доте: камеру двигает игрок (кулак).
export class Arena {
  constructor() {
    this.WW = G.worldW;
    this.WH = G.worldH;
    this.W = 1280;
    this.H = 720;
    this.cam = { x: 0, y: 0 };
    this.reset();
  }

  // Размер экрана (видимой части карты).
  resize(W, H) {
    this.W = W;
    this.H = H;
    this.clampCam();
  }

  // sandbox = true — арена для обучения: без волн, враги появляются только по команде.
  reset(sandbox = false) {
    this.sandbox = sandbox;
    this.hero = {
      x: this.WW / 2, y: this.WH / 2, r: 20, hp: G.heroHp, target: null,
      energy: 0, cd: 0, autoCd: 0, dir: { x: 1, y: 0 }, hurtT: 0, walkT: 0,
    };
    this.centerCam();
    this.enemies = [];
    this.bolts = [];
    this.orbs = [];
    this.slams = [];
    this.particles = [];
    this.texts = [];
    this.novas = [];
    this.events = [];
    this.waveIdx = -1;
    this.phase = 'pause';
    this.phaseT = 0;
    this.queue = [];
    this.spawnT = 0;
    this.time = 0;
    this.score = 0;
    this.kills = 0;
    this.shots = 0;
    this.hits = 0;
    this.shake = 0;
    this.offscreenT = 0;
    this.over = false;
    this.won = false;
    this.stats = {
      pinch: { ok: 0, err: 0 }, shoot: { ok: 0, err: 0 },
      fist: { ok: 0, err: 0 }, ult: { ok: 0, err: 0 },
    };
    if (sandbox) this.phase = 'sandbox';
    else this.nextWave();
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  get wave() {
    return WAVES[this.waveIdx];
  }

  // ---------- камера ----------
  clampCam() {
    this.cam.x = clamp(this.cam.x, 0, Math.max(0, this.WW - this.W));
    this.cam.y = clamp(this.cam.y, 0, Math.max(0, this.WH - this.H));
  }

  centerCam() {
    this.cam.x = this.hero.x - this.W / 2;
    this.cam.y = this.hero.y - this.H / 2;
    this.clampCam();
  }

  // Джойстик-камера: v — вектор [-1..1] от кулака.
  panCamera(v, dt) {
    if (!v || (!v.x && !v.y)) return;
    this.cam.x += v.x * G.camSpeed * dt;
    this.cam.y += v.y * G.camSpeed * dt;
    this.clampCam();
  }

  toWorld(p) {
    return { x: p.x + this.cam.x, y: p.y + this.cam.y };
  }

  heroOnScreen() {
    const h = this.hero, c = this.cam;
    return h.x > c.x && h.x < c.x + this.W && h.y > c.y && h.y < c.y + this.H;
  }

  // ---------- команды игрока (координаты мира) ----------
  moveTo(x, y) {
    this.hero.target = { x: clamp(x, 20, this.WW - 20), y: clamp(y, 20, this.WH - 20) };
  }

  commandMove(x, y) {
    this.moveTo(x, y);
    this.stats.pinch.ok++;
    this.particles.push({ kind: 'ping', x, y, life: 0.5, max: 0.5 });
  }

  shootAt(x, y) {
    const h = this.hero;
    if (h.cd > 0) return false;
    // Помощь в прицеливании: жестом точно не наведёшься, поэтому бьём врага, ближайшего к курсору.
    const target = this.nearest({ x, y }, G.aimAssist);
    if (target) ({ x, y } = target);
    let dx = x - h.x, dy = y - h.y;
    const len = Math.hypot(dx, dy);
    if (len < 12) ({ x: dx, y: dy } = h.dir);
    else { dx /= len; dy /= len; }
    h.dir = { x: dx, y: dy };
    h.cd = G.boltCooldown;
    this.shots++;
    this.bolts.push({ x: h.x + dx * 26, y: h.y + dy * 26, vx: dx * G.boltSpeed, vy: dy * G.boltSpeed, life: 1.1,
      dmg: G.boltDamage, pierce: G.boltPierce, hitSet: new Set() });
    this.emit('shot');
    return true;
  }

  nearest(p, radius) {
    let best = null, bd = radius;
    for (const e of this.enemies) {
      const d = dist(e, p) - e.r;
      if (!e.dead && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // Автоатака: маленький снаряд в ближайшего врага в радиусе.
  autoAttack(dt) {
    const h = this.hero;
    h.autoCd -= dt;
    if (h.autoCd > 0) return;
    const e = this.nearest(h, G.autoRange);
    if (!e) return;
    h.autoCd = G.autoCooldown;
    const dx = e.x - h.x, dy = e.y - h.y, len = Math.hypot(dx, dy) || 1;
    this.bolts.push({ x: h.x, y: h.y, vx: (dx / len) * 700, vy: (dy / len) * 700, life: 0.8,
      dmg: G.autoDamage, pierce: 1, hitSet: new Set(), auto: true });
  }

  ult() {
    const h = this.hero;
    if (h.energy < G.ultCost) {
      this.emit('ultNotReady', { pct: Math.round((h.energy / G.ultCost) * 100) });
      return false;
    }
    h.energy = 0;
    this.stats.ult.ok++;
    this.novas.push({ x: h.x, y: h.y, r: 0, life: 0.5 });
    this.shake = 1;
    for (const e of this.enemies) {
      const d = dist(e, h);
      if (d < G.ultRadius + e.r) {
        this.damage(e, G.ultDamage);
        const k = 90 / Math.max(20, d);
        e.x += (e.x - h.x) * k;
        e.y += (e.y - h.y) * k;
      }
    }
    for (const o of this.orbs) if (dist(o, h) < G.ultRadius) o.dead = true;
    this.emit('ult');
    return true;
  }

  // ---------- волны ----------
  nextWave() {
    this.waveIdx++;
    if (this.waveIdx >= WAVES.length) {
      this.finish(true);
      return;
    }
    this.phase = 'pause';
    this.phaseT = G.wavePause;
    this.queue = [];
    for (const [type, n] of this.wave.spawn) for (let i = 0; i < n; i++) this.queue.push(type);
    const boss = this.queue.filter((t) => ENEMIES[t].boss);
    const rest = this.queue.filter((t) => !ENEMIES[t].boss).sort(() => Math.random() - 0.5);
    this.queue = [...boss, ...rest];
    this.emit('waveStart', { idx: this.waveIdx, wave: this.wave });
  }

  // Враги выходят из темноты вокруг героя — за пределами экрана, но недалеко.
  spawn(type, at) {
    const def = ENEMIES[type];
    let x, y;
    if (at) ({ x, y } = at);
    else {
      const a = Math.random() * Math.PI * 2;
      const r = Math.hypot(this.W, this.H) * 0.5 + rand(40, 160);
      x = clamp(this.hero.x + Math.cos(a) * r, 30, this.WW - 30);
      y = clamp(this.hero.y + Math.sin(a) * r, 30, this.WH - 30);
    }
    this.enemies.push({
      type, def, x, y, hp: def.hp, maxHp: def.hp, r: def.r,
      atk: rand(0.3, def.atkCd), hitT: 0, slamT: 5, summonT: 8, phase: Math.random() * 6,
    });
  }

  finish(won) {
    if (this.over) return;
    this.over = true;
    this.won = won;
    if (won) this.score += Math.round(this.hero.hp) * 5;
    this.emit(won ? 'win' : 'lose');
  }

  // ---------- урон ----------
  damage(e, amount) {
    e.hp -= amount;
    e.hitT = 0.15;
    this.burst(e.x, e.y, e.def.color, 6);
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      this.kills++;
      this.score += e.def.score;
      this.hero.energy = Math.min(G.ultCost, this.hero.energy + (e.def.boss ? 0 : G.energyPerKill));
      this.texts.push({ x: e.x, y: e.y - e.r, text: '+' + e.def.score, life: 0.9, color: '#ffd166' });
      this.burst(e.x, e.y, e.def.color, e.def.boss ? 60 : 16);
      this.emit('kill', { enemy: e.type });
    }
  }

  hurt(amount, source) {
    const h = this.hero;
    h.hp -= amount;
    h.hurtT = 0.35;
    this.shake = Math.min(1, this.shake + 0.5);
    this.texts.push({ x: h.x, y: h.y - 30, text: '-' + Math.round(amount), life: 0.8, color: '#ff5d5d' });
    this.emit('hurt', { source, amount, onScreen: this.heroOnScreen() });
    if (h.hp <= 0) {
      h.hp = 0;
      this.finish(false);
    }
  }

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(60, 260);
      this.particles.push({ kind: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), max: 0.7, color });
    }
  }

  // ---------- кадр ----------
  update(dt) {
    if (this.over) {
      this.updateFx(dt);
      return;
    }
    this.time += dt;
    const h = this.hero;

    if (this.phase === 'pause') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = 'fight';
        this.spawnT = 0;
      }
    } else if (this.phase === 'fight') {
      this.spawnT -= dt;
      if (this.queue.length && this.spawnT <= 0) {
        this.spawn(this.queue.shift());
        this.spawnT = this.wave.interval;
      }
      if (!this.queue.length && !this.enemies.length) {
        this.score += 100 * (this.waveIdx + 1);
        h.hp = Math.min(G.heroHp, h.hp + G.healBetweenWaves);
        this.emit('waveClear', { idx: this.waveIdx });
        this.nextWave();
      }
    }

    // Герой убежал за экран — подскажем подвинуть камеру.
    this.offscreenT = this.heroOnScreen() ? 0 : this.offscreenT + dt;
    if (this.offscreenT > 2.5) {
      this.offscreenT = -3;
      this.emit('heroOffscreen');
    }

    // Герой
    h.cd = Math.max(0, h.cd - dt);
    h.hurtT = Math.max(0, h.hurtT - dt);
    h.hp = Math.min(G.heroHp, h.hp + G.heroRegen * dt);
    if (this.phase !== 'sandbox') this.autoAttack(dt);
    if (h.target) {
      const dx = h.target.x - h.x, dy = h.target.y - h.y;
      const d = Math.hypot(dx, dy);
      const sp = G.heroSpeed * dt;
      if (d <= sp) {
        h.x = h.target.x;
        h.y = h.target.y;
        h.target = null;
      } else {
        h.x += (dx / d) * sp;
        h.y += (dy / d) * sp;
        h.walkT += dt;
      }
    }

    // Враги
    for (const e of this.enemies) {
      const d = e.def;
      e.hitT = Math.max(0, e.hitT - dt);
      if (e.frozen) continue; // учебная мишень
      e.atk -= dt;
      e.phase += dt;
      const dx = h.x - e.x, dy = h.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const want = d.ranged ? len > d.keep : len > e.r + h.r - 4;
      if (want) {
        e.x += (dx / len) * d.speed * dt;
        e.y += (dy / len) * d.speed * dt;
      }
      if (d.ranged) {
        if (len < d.keep + 60 && e.atk <= 0) {
          e.atk = d.atkCd;
          const sp = 280;
          this.orbs.push({ x: e.x, y: e.y, vx: (dx / len) * sp, vy: (dy / len) * sp, life: 3, dmg: d.dmg });
          this.emit('orbIncoming');
        }
      } else if (len < e.r + h.r + 4 && e.atk <= 0) {
        e.atk = d.atkCd;
        this.hurt(d.dmg, e.type);
      }
      if (d.boss) {
        e.slamT -= dt;
        e.summonT -= dt;
        if (e.slamT <= 0) {
          e.slamT = 5.5;
          this.slams.push({ x: e.x, y: e.y, r: 190, t: 0, dur: 1.5, dmg: 30 });
          this.emit('slamWarn');
        }
        if (e.summonT <= 0) {
          e.summonT = 9;
          for (let i = 0; i < 2; i++) this.spawn('wolf', { x: e.x + rand(-60, 60), y: e.y + rand(-60, 60) });
        }
      }
    }
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i], b = this.enemies[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const min = a.r + b.r;
        if (d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
    }

    for (const b of this.bolts) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      for (const e of this.enemies) {
        if (!e.dead && !b.hitSet.has(e) && dist(b, e) < e.r + 6) {
          b.hitSet.add(e);
          this.damage(e, b.dmg);
          if (!b.auto) {
            if (b.hitSet.size === 1) this.hits++;
            this.stats.shoot.ok++;
          }
          if (b.hitSet.size >= b.pierce) {
            b.life = 0;
            break;
          }
        }
      }
    }

    for (const o of this.orbs) {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.life -= dt;
      if (dist(o, h) < h.r + 8) {
        o.dead = true;
        this.hurt(o.dmg, 'orb');
      }
    }

    for (const s of this.slams) {
      s.t += dt;
      if (!s.done && s.t >= s.dur) {
        s.done = true;
        this.shake = 1;
        this.burst(s.x, s.y, '#ff4fd8', 30);
        if (dist(s, h) < s.r) this.hurt(s.dmg, 'slam');
        else this.emit('slamDodged');
      }
    }

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.bolts = this.bolts.filter((b) => b.life > 0);
    this.orbs = this.orbs.filter((o) => !o.dead && o.life > 0);
    this.slams = this.slams.filter((s) => s.t < s.dur + 0.4);
    this.updateFx(dt);
  }

  updateFx(dt) {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.kind === 'dot') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
      }
    }
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 40 * dt;
    }
    for (const n of this.novas) {
      n.life -= dt;
      n.r = G.ultRadius * (1 - n.life / 0.5);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.texts = this.texts.filter((t) => t.life > 0);
    this.novas = this.novas.filter((n) => n.life > 0);
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}
