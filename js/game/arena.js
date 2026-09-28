import { CONFIG } from '../config.js';
import { ENEMIES, FLOORS, floorSpec } from './waves.js';
import { UPGRADES, rollUpgrades } from './upgrades.js';

const G = CONFIG.game;
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Логика арены в духе Archero. Ничего не знает о камере и жестах — получает команды
// (идти, залп, двигать камеру, ульта, выбрать умение) и отдаёт события для тренера, звука и интерфейса.
// Главное правило: герой стреляет сам, но только когда стоит на месте.
export class Arena {
  constructor() {
    this.WW = G.worldW;
    this.WH = G.worldH;
    this.W = 1280;
    this.H = 720;
    this.cam = { x: 0, y: 0 };
    this.reset();
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this.clampCam();
  }

  // sandbox = true — арена для обучения: без этажей, враги появляются только по команде.
  reset(sandbox = false) {
    this.sandbox = sandbox;
    this.s = {
      atkCd: G.autoCooldown, dmg: 1, multishot: 1, front: 1, diag: 0, ricochet: 0, pierce: 0,
      fire: false, ice: false, orbs: 0, vamp: 0, maxHp: G.heroHp, speed: G.heroSpeed,
    };
    this.hero = {
      x: this.WW / 2, y: this.WH / 2, r: 20, hp: G.heroHp, maxHp: G.heroHp, target: null,
      energy: 0, autoCd: 0.4, abilityCd: 0, dir: { x: 1, y: 0 }, hurtT: 0, walkT: 0, movingT: 0,
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
    this.volley = [];      // отложенные стрелы очереди «Двойного выстрела»
    this.taken = {};       // взятые умения: id → сколько раз
    this.choices = null;   // умения на выбор после этажа
    this.floor = 0;
    this.spec = null;
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
    else this.nextFloor();
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  // Совместимость с интерфейсом: «волна» = этаж.
  get wave() { return this.spec; }
  get waveIdx() { return this.floor - 1; }

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

  stop() {
    this.hero.target = null;
  }

  commandMove(x, y) {
    this.moveTo(x, y);
    this.stats.pinch.ok++;
    this.particles.push({ kind: 'ping', x, y, life: 0.5, max: 0.5 });
  }

  // Способность «Залп»: веер из 7 стрел в сторону курсора.
  shootAt(x, y) {
    const h = this.hero;
    if (h.abilityCd > 0) {
      this.emit('abilityCd', { left: h.abilityCd });
      return false;
    }
    const target = this.nearest({ x, y }, G.aimAssist);
    if (target) ({ x, y } = target);
    const base = Math.atan2(y - h.y, x - h.x);
    h.dir = { x: Math.cos(base), y: Math.sin(base) };
    h.abilityCd = G.abilityCooldown;
    this.shots++;
    for (let i = -3; i <= 3; i++) this.arrow(base + i * 0.13, { dmg: this.s.dmg * 1.5, big: true });
    this.emit('shot');
    return true;
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
        this.damage(e, G.ultDamage * this.s.dmg);
        const k = 90 / Math.max(20, d);
        e.x += (e.x - h.x) * k;
        e.y += (e.y - h.y) * k;
      }
    }
    for (const o of this.orbs) if (dist(o, h) < G.ultRadius) o.dead = true;
    this.emit('ult');
    return true;
  }

  chooseUpgrade(id) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u || this.phase !== 'upgrade') return;
    u.apply(this.s, this.hero);
    this.hero.maxHp = this.s.maxHp;
    this.taken[id] = (this.taken[id] ?? 0) + 1;
    this.choices = null;
    this.texts.push({ x: this.hero.x, y: this.hero.y - 40, text: `${u.icon} ${u.name}`, life: 1.6, color: '#3ddc97' });
    this.nextFloor();
  }

  // ---------- этажи ----------
  nextFloor() {
    this.floor++;
    if (this.floor > FLOORS) {
      this.finish(true);
      return;
    }
    this.spec = floorSpec(this.floor);
    this.phase = 'pause';
    this.phaseT = G.wavePause;
    const boss = this.spec.spawn.filter((t) => ENEMIES[t].boss);
    const rest = this.spec.spawn.filter((t) => !ENEMIES[t].boss).sort(() => Math.random() - 0.5);
    this.queue = [...boss, ...rest];
    this.emit('waveStart', { idx: this.floor - 1, wave: this.spec });
  }

  spawn(type, at) {
    const def = ENEMIES[type];
    let x, y;
    if (at) ({ x, y } = at);
    else {
      const a = Math.random() * Math.PI * 2;
      const r = Math.hypot(this.W, this.H) * 0.45 + rand(20, 120);
      x = clamp(this.hero.x + Math.cos(a) * r, 30, this.WW - 30);
      y = clamp(this.hero.y + Math.sin(a) * r, 30, this.WH - 30);
    }
    const scale = this.spec?.hpScale ?? 1;
    const hp = Math.round(def.hp * scale * (def.boss && this.floor >= 10 ? 1.6 : 1));
    this.enemies.push({
      type, def, x, y, hp, maxHp: hp, r: def.r,
      atk: rand(0.3, def.atkCd), hitT: 0, slamT: 5, summonT: 8, phase: Math.random() * 6,
      burn: 0, burnTick: 0, slow: 0, orbHit: 0, mode: 'walk', modeT: 0, dash: null,
    });
  }

  finish(won) {
    if (this.over) return;
    this.over = true;
    this.won = won;
    if (won) this.score += Math.round(this.hero.hp) * 5;
    this.emit(won ? 'win' : 'lose');
  }

  // ---------- стрельба ----------
  nearest(p, radius, skip) {
    let best = null, bd = radius;
    for (const e of this.enemies) {
      if (e.dead || skip?.has(e)) continue;
      const d = dist(e, p) - e.r;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  arrow(angle, extra = {}) {
    const h = this.hero, s = this.s;
    this.bolts.push({
      x: h.x + Math.cos(angle) * 24, y: h.y + Math.sin(angle) * 24,
      vx: Math.cos(angle) * G.boltSpeed, vy: Math.sin(angle) * G.boltSpeed, life: 1.3,
      dmg: s.dmg, pierce: s.pierce, ricochet: s.ricochet, fire: s.fire, ice: s.ice,
      hitSet: new Set(), ...extra,
    });
  }

  // Одна очередь автоатаки: стрелы вперёд веером + диагональ.
  fireVolley(target) {
    const h = this.hero, s = this.s;
    if (!target || target.dead) target = this.nearest(h, G.autoRange);
    if (!target) return;
    const base = Math.atan2(target.y - h.y, target.x - h.x);
    h.dir = { x: Math.cos(base), y: Math.sin(base) };
    for (let i = 0; i < s.front; i++) this.arrow(base + (i - (s.front - 1) / 2) * 0.12);
    for (let i = 0; i < s.diag; i++) {
      this.arrow(base + Math.PI / 4);
      this.arrow(base - Math.PI / 4);
    }
  }

  // Главная механика Archero: стоишь — стреляешь, двигаешься — нет.
  autoShoot(dt) {
    const h = this.hero;
    for (const v of this.volley) v.t -= dt;
    for (const v of this.volley.filter((v) => v.t <= 0)) this.fireVolley(v.target);
    this.volley = this.volley.filter((v) => v.t > 0);
    h.autoCd -= dt;
    if (h.target || h.autoCd > 0) return;
    const target = this.nearest(h, G.autoRange);
    if (!target) return;
    h.autoCd = this.s.atkCd;
    for (let k = 0; k < this.s.multishot; k++) this.volley.push({ t: k * 0.12, target });
  }

  // ---------- урон ----------
  damage(e, amount, silent = false) {
    e.hp -= amount;
    e.hitT = 0.12;
    if (!silent) this.burst(e.x, e.y, e.def.color, 5);
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      this.kills++;
      this.score += e.def.score;
      const h = this.hero;
      h.energy = Math.min(G.ultCost, h.energy + (e.def.boss ? 0 : G.energyPerKill));
      if (this.s.vamp) h.hp = Math.min(h.maxHp, h.hp + this.s.vamp);
      this.texts.push({ x: e.x, y: e.y - e.r, text: '+' + e.def.score, life: 0.9, color: '#ffd166' });
      this.burst(e.x, e.y, e.def.color, e.def.boss ? 60 : 14);
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
    if (this.phase === 'upgrade') return; // игра стоит, пока игрок выбирает умение
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
        this.spawnT = this.spec.interval;
      }
      if (!this.queue.length && !this.enemies.length) {
        this.score += 100 * this.floor;
        h.hp = Math.min(h.maxHp, h.hp + G.healBetweenWaves);
        this.bolts = [];
        this.orbs = [];
        this.volley = [];
        this.emit('waveClear', { idx: this.floor - 1 });
        if (this.floor >= FLOORS) this.finish(true);
        else {
          this.phase = 'upgrade';
          this.choices = rollUpgrades(this.taken);
          this.emit('chooseUpgrade', { choices: this.choices });
        }
        return;
      }
    }

    this.offscreenT = this.heroOnScreen() ? 0 : this.offscreenT + dt;
    if (this.offscreenT > 2.5) {
      this.offscreenT = -3;
      this.emit('heroOffscreen');
    }

    // Герой
    h.abilityCd = Math.max(0, h.abilityCd - dt);
    h.hurtT = Math.max(0, h.hurtT - dt);
    h.hp = Math.min(h.maxHp, h.hp + G.heroRegen * dt);
    if (h.target) {
      const dx = h.target.x - h.x, dy = h.target.y - h.y;
      const d = Math.hypot(dx, dy);
      const sp = this.s.speed * dt;
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
    // Долго бегает при врагах и не стреляет — подскажем главное правило.
    h.movingT = h.target && this.enemies.length ? h.movingT + dt : Math.min(h.movingT, 0);
    if (h.movingT > 3.5) {
      h.movingT = -6;
      this.emit('notShooting');
    }
    if (this.phase !== 'sandbox') this.autoShoot(dt);

    this.updateEnemies(dt);
    this.updateOrbs(dt);
    this.updateBolts(dt);

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

  updateEnemies(dt) {
    const h = this.hero;
    for (const e of this.enemies) {
      const d = e.def;
      e.hitT = Math.max(0, e.hitT - dt);
      e.orbHit = Math.max(0, e.orbHit - dt);
      if (e.frozen) continue; // учебная мишень
      // Горение и замедление от стрел
      if (e.burn > 0) {
        e.burn -= dt;
        e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.5;
          this.damage(e, 0.4 * this.s.dmg, true);
          this.particles.push({ kind: 'dot', x: e.x, y: e.y - e.r, vx: rand(-20, 20), vy: -60, life: 0.4, max: 0.4, color: '#ff8c42' });
        }
      }
      e.slow = Math.max(0, e.slow - dt);
      const spd = d.speed * (e.slow > 0 ? 0.5 : 1);
      e.atk -= dt;
      e.phase += dt;
      const dx = h.x - e.x, dy = h.y - e.y;
      const len = Math.hypot(dx, dy) || 1;

      if (d.charger) {
        this.updateBoar(e, dx, dy, len, spd, dt);
        continue;
      }
      const want = d.ranged ? len > d.keep : len > e.r + h.r - 4;
      if (want) {
        let mx = dx / len, my = dy / len;
        if (d.zigzag) {
          const w = Math.sin(e.phase * 6) * 0.9;
          mx += -my * w;
          my += (dx / len) * w;
          const m = Math.hypot(mx, my) || 1;
          mx /= m;
          my /= m;
        }
        e.x += mx * spd * dt;
        e.y += my * spd * dt;
      }
      if (d.ranged) {
        if (len < d.keep + 60 && e.atk <= 0) {
          e.atk = d.atkCd;
          const sp = 260;
          this.orbs.push({ x: e.x, y: e.y, vx: (dx / len) * sp, vy: (dy / len) * sp, life: 3, dmg: d.dmg });
          this.emit('orbIncoming');
        }
      } else if (len < e.r + h.r + 4 && e.atk <= 0) {
        e.atk = d.atkCd;
        this.hurt(d.dmg, e.type);
      }
      if (d.boss) {
        const angry = this.floor >= 10;
        e.slamT -= dt;
        e.summonT -= dt;
        if (e.slamT <= 0) {
          e.slamT = angry ? 4 : 5.5;
          this.slams.push({ x: e.x, y: e.y, r: angry ? 220 : 190, t: 0, dur: 1.5, dmg: 25 });
          this.emit('slamWarn');
        }
        if (e.summonT <= 0) {
          e.summonT = 9;
          for (let i = 0; i < 2; i++) this.spawn(angry ? 'bat' : 'wolf', { x: e.x + rand(-60, 60), y: e.y + rand(-60, 60) });
        }
      }
    }
    // Враги не слипаются
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
  }

  // Кабан: подходит → целится (красная линия) → рывок → отдых.
  updateBoar(e, dx, dy, len, spd, dt) {
    const h = this.hero;
    e.modeT -= dt;
    if (e.mode === 'walk') {
      e.x += (dx / len) * spd * dt;
      e.y += (dy / len) * spd * dt;
      if (len < 420 && e.modeT <= 0) {
        e.mode = 'aim';
        e.modeT = 0.9;
        e.dash = { x: dx / len, y: dy / len };
        this.emit('boarAim');
      }
    } else if (e.mode === 'aim') {
      if (e.modeT <= 0) {
        e.mode = 'dash';
        e.modeT = 0.55;
        e.hitDone = false;
      }
    } else if (e.mode === 'dash') {
      e.x += e.dash.x * 720 * dt;
      e.y += e.dash.y * 720 * dt;
      e.x = clamp(e.x, 20, this.WW - 20);
      e.y = clamp(e.y, 20, this.WH - 20);
      if (!e.hitDone && dist(e, h) < e.r + h.r) {
        e.hitDone = true;
        this.hurt(e.def.dmg, 'boar');
      }
      if (e.modeT <= 0) {
        e.mode = 'rest';
        e.modeT = 1.1;
      }
    } else if (e.modeT <= 0) {
      e.mode = 'walk';
      e.modeT = 1.5;
    }
  }

  // Вихрь: шары вращаются вокруг героя и бьют врагов.
  updateOrbs(dt) {
    const n = this.s.orbs;
    if (!n) return;
    const h = this.hero;
    for (let i = 0; i < n; i++) {
      const a = this.time * 3 + (i * Math.PI * 2) / n;
      const p = { x: h.x + Math.cos(a) * 80, y: h.y + Math.sin(a) * 80 };
      for (const e of this.enemies) {
        if (!e.dead && e.orbHit <= 0 && dist(p, e) < e.r + 14) {
          e.orbHit = 0.4;
          this.damage(e, 0.8 * this.s.dmg);
          if (this.s.fire) e.burn = 3;
        }
      }
    }
  }

  updateBolts(dt) {
    for (const b of this.bolts) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      for (const e of this.enemies) {
        if (e.dead || b.hitSet.has(e) || dist(b, e) >= e.r + 6) continue;
        b.hitSet.add(e);
        this.damage(e, b.dmg);
        if (b.fire) e.burn = 3;
        if (b.ice) e.slow = 2;
        if (b.big) {
          if (b.hitSet.size === 1) this.hits++;
          this.stats.shoot.ok++;
        }
        if (b.ricochet > 0) {
          const next = this.nearest(e, 360, b.hitSet);
          if (next) {
            b.ricochet--;
            const dx = next.x - e.x, dy = next.y - e.y, l = Math.hypot(dx, dy) || 1;
            b.x = e.x;
            b.y = e.y;
            b.vx = (dx / l) * G.boltSpeed;
            b.vy = (dy / l) * G.boltSpeed;
            b.life = 0.8;
            break;
          }
        }
        if (b.pierce > 0) {
          b.pierce--;
          continue;
        }
        b.life = 0;
        break;
      }
    }
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
