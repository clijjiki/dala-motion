import { CONFIG } from './config.js';
import { startCamera, cameraErrorText } from './vision/camera.js';
import { HandRecognizer } from './gestures/recognizer.js';
import { CursorMapper } from './gestures/cursor.js';
import { Calibrator } from './gestures/calibration.js';
import { Coach } from './gestures/coach.js';
import { Arena } from './game/arena.js';
import { ArenaRenderer } from './game/render.js';
import { ENEMIES } from './game/waves.js';
import { CamView } from './ui/camview.js';
import { HandPointer } from './ui/pointer.js';
import { Hud } from './ui/hud.js';
import { Sfx } from './audio/sfx.js';
import { profile, addRun, setTutorialDone } from './storage/records.js';
import { InputSim } from './dev/sim.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const SIM = params.has('sim');
let DEBUG = params.has('debug');

// ---------- модули ----------
const video = $('#video');
const renderer = new ArenaRenderer($('#arena'));
const arena = new Arena();
renderer.onResize = (W, H) => arena.resize(W, H);
arena.resize(renderer.W, renderer.H);
const camView = new CamView($('#cam'));
const pointer = new HandPointer($('#pointer'));
const hud = new Hud();
const sfx = new Sfx();
const recognizer = new HandRecognizer();
const cursor = new CursorMapper();
const calibrator = new Calibrator();
const sim = SIM ? new InputSim() : null;

let tracker = null;
let gs = null;                     // последнее состояние жестов
let cursorPx = { x: innerWidth / 2, y: innerHeight / 2 };
let lastVideoTime = -1;
let nowT = 0;

const coach = new Coach((h) => {
  hud.toast(h);
  camView.setFocus(h.focus, nowT);
  if (h.kind !== 'good') sfx.hint();
  if ((screenName === 'play' || screenName === 'tutorial') && arena.stats[h.gesture]) arena.stats[h.gesture].err++;
});

// ---------- ввод ----------
function readInput(now) {
  const t = now / 1000;
  if (SIM) {
    gs = sim.read(t);
    if (!gs.fist) cursorPx = { x: sim.x, y: sim.y };
    return true;
  }
  if (!tracker || video.readyState < 2 || video.currentTime === lastVideoTime) return false;
  lastVideoTime = video.currentTime;
  const hands = tracker.detect(video, now);
  gs = recognizer.update(hands, t);
  const p = cursor.update(gs, video.videoWidth, video.videoHeight, t);
  cursorPx = { x: p.x * innerWidth, y: p.y * innerHeight };
  return true;
}

function stableCursorPx(t) {
  if (SIM) return cursorPx;
  const p = cursor.stablePos(t);
  return { x: p.x * innerWidth, y: p.y * innerHeight };
}

const quiet = (s) => (s ? { ...s, events: [], hints: [] } : null);

// Жесты → команды арене. Общая функция для обучения и игры.
function applyGameInput(input, t, dt) {
  if (!input?.present) return;
  const aim = arena.toWorld(cursorPx);
  for (const ev of input.events) {
    if (ev === 'pinch') {
      const p = arena.toWorld(stableCursorPx(t));
      arena.commandMove(p.x, p.y);
      sfx.move();
      hud.flash('pinch');
    } else if (ev === 'shoot') {
      if (arena.shootAt(aim.x, aim.y)) hud.flash('shoot');
    } else if (ev === 'ult') {
      if (arena.ult()) hud.flash('ult');
    } else if (ev === 'panStart') {
      arena.stats.fist.ok++;
      hud.flash('fist');
    }
  }
  // Держишь щипок — герой идёт за курсором (как зажатая правая кнопка в MOBA).
  if (input.pinchHeld) arena.moveTo(aim.x, aim.y);
  if (input.shootHeld) arena.shootAt(aim.x, aim.y);
  if (input.pan) arena.panCamera(input.pan, dt);
  for (const h of input.hints) coach.offer(h, t);
}

// Игровые события → звук, тренер, интерфейс. Вторая половина режима «ошибка»:
// объясняем, ПОЧЕМУ получил урон и какой жест помог бы.
const PINCH = ['thumb', 'index'];
const FIST = ['index', 'middle', 'ring', 'pinky'];
function handleArenaEvents(t) {
  for (const ev of arena.drainEvents()) {
    switch (ev.type) {
      case 'shot':
        sfx.shoot();
        if (arena.shots >= 8 && arena.hits / arena.shots < 0.25) {
          coach.offer({ id: 'aim', gesture: 'shoot', icon: '🎯', focus: ['index'],
            text: 'Много промахов: сначала наведи палец-курсор на врага, потом своди средний с большим' }, t);
        }
        break;
      case 'kill':
        sfx.kill();
        break;
      case 'hurt':
        sfx.hurt();
        if (!ev.onScreen) {
          arena.stats.fist.err++;
          coach.force({ id: 'hurt_offscreen', gesture: 'fist', kind: 'danger', icon: '👀', focus: FIST,
            text: 'Тебя бьют за краем экрана! Сожми кулак ✊ и сдвинь руку к жёлтой стрелке — камера поедет к герою' }, t);
        } else if (ev.source === 'orb') {
          arena.stats.pinch.err++;
          coach.force({ id: 'hurt_orb', gesture: 'pinch', kind: 'danger', icon: '💥', focus: PINCH,
            text: 'Попал снаряд шамана! Розовые шары летят по прямой — отойди щипком 👌 в сторону' }, t);
        } else if (ev.source === 'boar') {
          arena.stats.pinch.err++;
          coach.force({ id: 'hurt_boar', gesture: 'pinch', kind: 'danger', icon: '🐗', focus: PINCH,
            text: 'Кабан протаранил! Когда видишь красную линию — уходи щипком 👌 вбок, а не назад' }, t);
        } else if (ev.source === 'slam') {
          arena.stats.pinch.err++;
          coach.force({ id: 'hurt_slam', gesture: 'pinch', kind: 'danger', icon: '💥', focus: PINCH,
            text: 'Удар босса! Когда под ним красный круг — щипком 👌 уйди за край круга' }, t);
        } else {
          const who = ENEMIES[ev.source]?.name ?? 'Враг';
          coach.force({ id: 'hurt_melee', gesture: 'pinch', kind: 'danger', icon: '🩸', focus: PINCH,
            text: `${who} кусает! Отойди щипком 👌 или бей способностью 🤏 (средний к большому)` }, t);
        }
        break;
      case 'orbIncoming':
        coach.offer({ id: 'orb_warn', gesture: 'pinch', kind: 'info', icon: '🟢', focus: PINCH,
          text: 'Летит снаряд — сделай шаг в сторону щипком 👌' }, t);
        break;
      case 'slamWarn':
        sfx.warn();
        coach.force({ id: 'slam_warn', gesture: 'pinch', kind: 'info', icon: '⭕',
          text: 'Красный круг — удар через секунду! Уходи щипком 👌 за его край' }, t);
        break;
      case 'slamDodged':
        coach.offer({ id: 'slam_ok', kind: 'good', icon: '✨', text: 'Увернулся от удара босса!' }, t);
        break;
      case 'heroOffscreen':
        coach.offer({ id: 'hero_offscreen', gesture: 'fist', icon: '🧭', focus: FIST,
          text: 'Герой за краем экрана — сожми кулак ✊ и веди руку к жёлтой стрелке' }, t);
        break;
      case 'chooseUpgrade':
        sfx.win();
        setScreen('upgrade');
        return;
      case 'abilityCd':
        coach.offer({ id: 'ability_cd', gesture: 'shoot', icon: '⏳',
          text: `Залп перезаряжается — ещё ${ev.left.toFixed(1)} с. Пока стой на месте: герой стреляет сам` }, t);
        break;
      case 'notShooting':
        arena.stats.pinch.err++;
        coach.offer({ id: 'not_shooting', gesture: 'pinch', icon: '🏹', focus: PINCH,
          text: 'Герой стреляет только стоя! Разведи пальцы 👌 — он остановится и начнёт стрелять' }, t);
        break;
      case 'boarAim':
        coach.offer({ id: 'boar_warn', gesture: 'pinch', kind: 'info', icon: '🐗',
          text: 'Кабан целится — красная линия! Щипком 👌 уйди с неё в сторону' }, t);
        break;
      case 'ultNotReady':
        arena.stats.ult.err++;
        coach.offer({ id: 'ult_not_ready', gesture: 'ult', icon: '✊✊',
          text: `Два кулака распознаны, но ульта заряжена на ${ev.pct}% — побеждай врагов, чтобы накопить энергию` }, t);
        break;
      case 'ult':
        sfx.ult();
        break;
      case 'waveStart':
        sfx.wave();
        showWaveTitle(ev.wave.title, ev.wave.tip);
        break;
      case 'waveClear':
        coach.offer({ id: 'wave_clear', kind: 'good', icon: '🏆', text: `Этаж ${ev.idx + 1} пройден! +${CONFIG.game.healBetweenWaves} здоровья` }, t);
        break;
      case 'win':
        sfx.win();
        setTimeout(() => setScreen('results'), 1200);
        break;
      case 'lose':
        sfx.lose();
        setTimeout(() => setScreen('results'), 1200);
        break;
    }
  }
}

let waveTitleTimer = null;
function showWaveTitle(title, tip) {
  const el = $('#waveTitle');
  el.querySelector('b').textContent = title;
  el.querySelector('span').textContent = tip;
  el.classList.add('show');
  clearTimeout(waveTitleTimer);
  waveTitleTimer = setTimeout(() => el.classList.remove('show'), CONFIG.game.wavePause * 1000);
}

// ---------- экраны ----------
let screenName = null;
let screen = null;

function setScreen(name, arg) {
  screen?.exit?.();
  screenName = name;
  screen = SCREENS[name];
  document.body.dataset.screen = name;
  hud.banner(null);
  screen.enter?.(arg);
}

function renderRecords(el, top, highlight) {
  if (!top.length) {
    el.innerHTML = '<h3>Рекорды арены</h3><p class="hint-line">Пока пусто — стань первым!</p>';
    return;
  }
  const rows = top.slice(0, 5).map((r, i) =>
    `<tr class="${r === highlight ? 'me' : ''}"><td>${i + 1}</td><td>${escapeHtml(r.name)}</td><td>этаж ${r.wave}</td><td>${r.score}</td></tr>`).join('');
  el.innerHTML = `<h3>Рекорды арены</h3><table>${rows}</table>`;
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TUTORIAL = [
  {
    icon: '☝️', title: 'Курсор',
    text: 'Покажи указательный палец и води им — курсор повторяет движение. Наведи его на жёлтый круг.',
    setup(s) {
      s.target = { x: innerWidth * (0.3 + Math.random() * 0.4), y: innerHeight * (0.45 + Math.random() * 0.2) };
      const el = $('#tutTarget');
      el.style.left = s.target.x + 'px';
      el.style.top = s.target.y + 'px';
      el.className = 'show';
      s.hover = 0;
    },
    check(s, input, dt) {
      const inside = Math.hypot(cursorPx.x - s.target.x, cursorPx.y - s.target.y) < 55;
      s.hover = inside ? s.hover + dt : Math.max(0, s.hover - dt);
      $('#tutTarget').classList.toggle('hit', inside);
      return s.hover / 0.6;
    },
    done() { $('#tutTarget').className = ''; },
  },
  {
    icon: '👌', title: 'Идти',
    text: 'Сведи большой и указательный пальцы — герой пойдёт к курсору, как по правому клику. Сделай так 2 раза.',
    setup(s) { s.n = 0; },
    check(s, input) {
      if (input?.events.includes('pinch')) s.n++;
      return s.n / 2;
    },
  },
  {
    icon: '✊', title: 'Камера',
    text: 'Сожми кулак и сдвинь его в сторону — камера поедет туда, как джойстик. Разожми, чтобы остановить.',
    setup(s) { s.start = { ...arena.cam }; },
    check(s) { return Math.hypot(arena.cam.x - s.start.x, arena.cam.y - s.start.y) / 350; },
    done() { arena.centerCam(); },
  },
  {
    icon: '🤏', title: 'Залп',
    text: 'Коснись большим пальцем СРЕДНЕГО — веер стрел полетит к курсору. Победи волка-мишень. В бою герой ещё и сам стреляет, когда стоит.',
    setup() {
      const h = arena.hero;
      arena.spawn('wolf', { x: h.x + 260, y: h.y });
      const w = arena.enemies[arena.enemies.length - 1];
      w.frozen = true;
      w.hp = w.maxHp = 2;
    },
    check() { return arena.kills >= 1 ? 1 : arena.enemies[0] ? (2 - arena.enemies[0].hp) / 2 : 0; },
  },
  {
    icon: '✊✊', title: 'Ульта',
    text: 'Сожми в кулак ОБЕ руки — мощная волна вокруг героя. Энергия уже заряжена!',
    setup() { arena.hero.energy = CONFIG.game.ultCost; },
    check(s, input) { return input?.events.includes('ult') ? 1 : 0; },
  },
];

const SCREENS = {
  intro: {
    enter() {},
  },

  calibrate: {
    enter() {
      calibrator.reset();
      if (SIM) setTimeout(() => setScreen('menu'), 50);
    },
    update(dt, t, input, fresh) {
      if (!fresh || SIM) return;
      const res = calibrator.update(gs, t, video.videoWidth, video.videoHeight);
      $('#calibRing').style.setProperty('--p', calibrator.progress);
      $('#calibIssue').textContent = calibrator.issue ?? 'Отлично, держи…';
      if (res) {
        cursor.calibrate(res.anchor, res.palm, video.videoWidth, video.videoHeight);
        sfx.ok();
        setScreen('menu');
      }
    },
  },

  menu: {
    enter() {
      const p = profile();
      $('#playerName').textContent = p.name;
      renderRecords($('#menuRecords'), p.top);
      pointer.enabled = true;
    },
    update(dt, t, input) {
      pointer.update({ ...cursorPx, visible: !!gs?.present, pose: gs?.pose, pinch: gs?.progress?.pinch ?? 0, clicked: input?.events.includes('pinch') }, dt);
      hud.banner(!SIM && !gs?.present ? '☝️ Покажи руку в камеру, чтобы управлять меню' : null);
      for (const h of input?.hints ?? []) if (h.gesture === 'any' || h.gesture === 'pinch') coach.offer(h, t);
    },
  },

  tutorial: {
    enter() {
      arena.reset(true);
      arena.hero.y += arena.H * 0.18; // ниже карточки с заданием
      arena.centerCam();
      coach.reset();
      this.i = -1;
      this.wait = 0;
      this.next();
    },
    next() {
      this.i++;
      if (this.i >= TUTORIAL.length) {
        setTutorialDone();
        setScreen('countdown');
        return;
      }
      const step = TUTORIAL[this.i];
      this.s = {};
      step.setup?.(this.s);
      $('#tutStep').textContent = `ШАГ ${this.i + 1} / ${TUTORIAL.length}`;
      $('#tutIcon').textContent = step.icon;
      $('#tutTitle').textContent = step.title;
      $('#tutText').textContent = step.text;
      $('#tutFill').style.width = '0%';
      $('.tut').classList.remove('done');
    },
    update(dt, t, input) {
      pointer.update({ ...cursorPx, visible: !!gs?.present, pose: gs?.pose, pinch: gs?.progress?.pinch ?? 0, clicked: false }, dt);
      applyGameInput(input, t, dt);
      arena.update(dt);
      arena.drainEvents().forEach((e) => {
        if (e.type === 'shot') sfx.shoot();
        if (e.type === 'kill') sfx.kill();
        if (e.type === 'ult') sfx.ult();
      });
      hud.update(arena, gs);
      hud.banner(!SIM && !gs?.present ? '☝️ Покажи руку в камеру' : null);
      if (this.wait > 0) {
        this.wait -= dt;
        if (this.wait <= 0) this.next();
        return;
      }
      const step = TUTORIAL[this.i];
      const p = Math.min(1, step.check(this.s, input, dt));
      $('#tutFill').style.width = p * 100 + '%';
      if (p >= 1) {
        step.done?.();
        sfx.ok();
        $('.tut').classList.add('done');
        $('#tutIcon').textContent = '✅';
        this.wait = 0.9;
      }
    },
    exit() { $('#tutTarget').className = ''; },
  },

  countdown: {
    enter() {
      arena.reset(false);
      arena.drainEvents();
      coach.reset();
      this.left = 3;
      this.shown = null;
    },
    update(dt) {
      this.left -= dt;
      const n = Math.ceil(this.left);
      if (n !== this.shown && n > 0) {
        this.shown = n;
        $('#countNum').textContent = n;
        sfx.click();
      }
      hud.update(arena, gs);
      if (this.left <= 0) setScreen('play');
    },
  },

  play: {
    enter(resume) {
      this.lost = 0;
      if (!resume) arena.events.push({ type: 'waveStart', idx: 0, wave: arena.wave });
      pointer.enabled = false;
    },
    update(dt, t, input) {
      pointer.update({ ...cursorPx, visible: !!gs?.present, pose: gs?.pose, pinch: gs?.progress?.pinch ?? 0, clicked: false }, dt);
      this.lost = gs?.present ? 0 : this.lost + dt;
      if (this.lost > 1.0) {
        hud.banner('⏸ Пауза — рука пропала из кадра. Покажи руку камере, и игра продолжится');
        return;
      }
      hud.banner(null);
      applyGameInput(input, t, dt);
      arena.update(dt);
      handleArenaEvents(t);
      hud.update(arena, gs);
    },
    exit() { pointer.enabled = true; },
  },

  upgrade: {
    enter() {
      $('#upgKicker').textContent = `Этаж ${arena.floor} пройден!`;
      $('#upgCards').innerHTML = arena.choices.map((u) => {
        const lvl = arena.taken[u.id] ?? 0;
        return `<button class="btn upg-card" data-hand data-id="${u.id}"><em>${u.icon}</em><b>${u.name}</b><small>${u.desc}</small>`
          + `<span class="lvl">${lvl ? `уровень ${lvl} → ${lvl + 1}` : 'новое'}</span></button>`;
      }).join('');
      for (const b of document.querySelectorAll('.upg-card')) {
        b.addEventListener('click', () => {
          sfx.ok();
          arena.chooseUpgrade(b.dataset.id);
          setScreen('play', true);
        });
      }
      pointer.enabled = true;
      this.wait = 0.9; // сначала осмотреться: случайный щипок или наведение не выберут карточку
    },
    update(dt, t, input) {
      this.wait -= dt;
      pointer.enabled = this.wait <= 0;
      pointer.update({ ...cursorPx, visible: !!gs?.present, pose: gs?.pose, pinch: gs?.progress?.pinch ?? 0, clicked: input?.events.includes('pinch') }, dt);
      hud.update(arena, gs);
    },
  },

  results: {
    enter() {
      const a = arena;
      const acc = a.shots ? Math.round((a.hits / a.shots) * 100) : 0;
      const run = { score: a.score, wave: Math.min(10, a.floor), won: a.won, kills: a.kills };
      const rec = addRun(run);
      $('#resTitle').textContent = a.won ? '🏆 Победа! Шаңырақ защищён' : '💀 Поражение';
      $('#resScore').textContent = a.score;
      $('#resBest').textContent = rec.isBest ? '🔥 Новый личный рекорд!' : `Лучший результат: ${rec.prevBest}`;
      const s = a.stats;
      const cell = (label, value) => `<div><small>${label}</small><b>${value}</b></div>`;
      $('#resGrid').innerHTML = [
        cell('Этаж', `${run.wave}/10`),
        cell('Побеждено', a.kills),
        cell('Умений', Object.values(a.taken).reduce((x, y) => x + y, 0)),
        cell('Время', Math.round(a.time) + ' c'),
        cell('👌 Шагов', s.pinch.ok),
        cell('🤏 Попаданий', s.shoot.ok),
        cell('✊ Камера', s.fist.ok),
        cell('✊✊ Ульт', s.ult.ok),
      ].join('');
      const top = coach.topMistakes(3).filter((m) => m.kind !== 'good' && m.kind !== 'info');
      $('#resMistakes').innerHTML = top.length
        ? top.map((m) => `<li><span>${m.icon ?? '⚠️'}</span>${escapeHtml(m.text)}<b>×${m.count}</b></li>`).join('')
        : '<li class="clean"><span>✨</span>Чистая техника — ни одной подсказки тренера!</li>';
      renderRecords($('#resRecords'), rec.top, rec.top[rec.rank - 1]);
      const max = Math.max(...rec.history.map((h) => h.score), 1);
      $('#resHistory').innerHTML = rec.history.map((h) => `<i style="height:${(h.score / max) * 100}%" title="${h.score}"></i>`).join('');
      pointer.enabled = true;
    },
    update(dt, t, input) {
      pointer.update({ ...cursorPx, visible: !!gs?.present, pose: gs?.pose, pinch: gs?.progress?.pinch ?? 0, clicked: input?.events.includes('pinch') }, dt);
    },
  },
};

// ---------- кнопки (работают и рукой, и мышью) ----------
$('#startBtn').addEventListener('click', start);
$('#playBtn').addEventListener('click', () => { sfx.click(); setScreen(profile().tutorialDone ? 'countdown' : 'tutorial'); });
$('#tutorialBtn').addEventListener('click', () => { sfx.click(); setScreen('tutorial'); });
$('#recalBtn').addEventListener('click', () => { sfx.click(); setScreen('calibrate'); });
$('#skipBtn').addEventListener('click', () => { sfx.click(); setTutorialDone(); setScreen('countdown'); });
$('#againBtn').addEventListener('click', () => { sfx.click(); setScreen('countdown'); });
$('#menuBtn').addEventListener('click', () => { sfx.click(); setScreen('menu'); });
addEventListener('keydown', (e) => {
  if (e.code === 'KeyD' && e.shiftKey) {
    DEBUG = !DEBUG;
    $('#debug').hidden = !DEBUG;
  }
});

async function start() {
  const btn = $('#startBtn');
  const status = $('#introStatus');
  btn.disabled = true;
  status.className = 'status';
  sfx.unlock();
  if (SIM) {
    setScreen('menu');
    return;
  }
  try {
    status.textContent = 'Запрашиваю доступ к камере…';
    await startCamera(video);
  } catch (err) {
    status.textContent = cameraErrorText(err);
    status.className = 'status error';
    btn.disabled = false;
    return;
  }
  try {
    status.textContent = 'Загружаю модель распознавания руки (~8 МБ)…';
    const { createHandTracker } = await import('./vision/hands.js');
    tracker = await createHandTracker();
  } catch (err) {
    console.error(err);
    status.textContent = 'Не удалось загрузить модель распознавания. Проверь интернет и нажми ещё раз.';
    status.className = 'status error';
    btn.disabled = false;
    return;
  }
  setScreen('calibrate');
}

// ---------- главный цикл ----------
let lastFrame = 0;
function step(now) {
  const t = now / 1000;
  if (t - lastFrame < 0.008) return;
  const dt = Math.min(0.05, t - (lastFrame || t));
  lastFrame = t;
  nowT = t;

  const fresh = readInput(now);
  const input = fresh ? gs : quiet(gs);
  screen?.update?.(dt, t, input, fresh);

  if (document.hidden) return; // не рисуем то, что никто не видит
  if (!SIM && tracker) camView.draw(video, gs, cursor.boxRect(video.videoWidth, video.videoHeight), t);
  const showArena = ['tutorial', 'countdown', 'play', 'upgrade', 'results'].includes(screenName);
  renderer.draw(showArena ? arena : null, t, screenName === 'play' || screenName === 'tutorial' ? cursorPx : null);

  if (DEBUG && gs?.a) {
    const a = gs.a;
    const f = (v) => v.toFixed(2);
    $('#debug').textContent = [
      `pose      ${gs.pose}   hands ${gs.handsCount}   twoFists ${gs.twoFists}`,
      `pinchIdx  ${f(a.pinchIndex)}   pinchMid ${f(a.pinchMiddle)}`,
      `ext  i ${f(a.ext.index)} m ${f(a.ext.middle)} r ${f(a.ext.ring)} p ${f(a.ext.pinky)} t ${f(a.ext.thumb)}`,
      `facing ${f(a.facing)}   palm ${f(a.palmRel)}   pan ${gs.pan ? f(gs.pan.x) + ',' + f(gs.pan.y) : '—'}`,
    ].join('\n');
  }
}

function rafLoop(now) {
  requestAnimationFrame(rafLoop);
  step(now);
}
$('#debug').hidden = !DEBUG;
if (DEBUG || SIM) window.__dala = { arena, coach, setScreen, renderer }; // доступ из консоли для отладки
if (SIM) {
  $('#startBtn').textContent = 'Старт (режим мыши)';
  $('#camWrap').style.visibility = 'hidden';
}
setScreen('intro');
requestAnimationFrame(rafLoop);
