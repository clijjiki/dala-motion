import { CONFIG } from '../config.js';
import { UPGRADES } from '../game/upgrades.js';

const UP = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

const $ = (s) => document.querySelector(s);
const G = CONFIG.game;

export class Hud {
  constructor() {
    this.hp = $('#hpFill');
    this.energy = $('#energyFill');
    this.score = $('#score');
    this.wave = $('#waveLabel');
    this.skills = $('#skills');
    this.cards = {};
    for (const el of document.querySelectorAll('.gcard')) this.cards[el.dataset.g] = el;
    this.toastEl = $('#toast');
    this.toastTimer = null;
    this.bannerEl = $('#banner');
  }

  update(arena, gstate) {
    if (arena) {
      const h = arena.hero;
      this.hp.style.width = (h.hp / h.maxHp) * 100 + '%';
      this.energy.style.width = (h.energy / G.ultCost) * 100 + '%';
      this.energy.parentElement.classList.toggle('ready', h.energy >= G.ultCost);
      this.score.textContent = arena.score;
      this.wave.textContent = `${Math.max(1, arena.floor)}/10`;
      const icons = Object.entries(arena.taken ?? {}).map(([id, n]) => (UP[id]?.icon ?? '') + (n > 1 ? '×' + n : '')).join(' ');
      if (icons !== this.lastIcons) { this.lastIcons = icons; this.skills.textContent = icons; }
    }
    const pr = gstate?.progress ?? {};
    const active = {
      pinch: gstate?.pinchHeld, shoot: gstate?.shootHeld, fist: gstate?.fist && !gstate?.twoFists, ult: gstate?.twoFists,
    };
    for (const [k, el] of Object.entries(this.cards)) {
      el.style.setProperty('--p', pr[k] ?? 0);
      el.classList.toggle('on', !!active[k]);
    }
  }

  flash(gesture) {
    const el = this.cards[gesture];
    if (!el) return;
    el.classList.remove('fire');
    void el.offsetWidth;
    el.classList.add('fire');
  }

  toast(hint) {
    const el = this.toastEl;
    el.querySelector('.toast-icon').textContent = hint.icon ?? '⚠️';
    el.querySelector('.toast-text').textContent = hint.text;
    el.className = 'toast show ' + (hint.kind ?? 'warn');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), hint.kind === 'danger' ? 3400 : 2800);
  }

  banner(text) {
    this.bannerEl.textContent = text ?? '';
    this.bannerEl.classList.toggle('show', !!text);
  }
}
