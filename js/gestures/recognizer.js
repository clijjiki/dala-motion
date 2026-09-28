import { CONFIG } from '../config.js';
import { analyzeHand, FINGER_RU, clamp, dist } from './handmath.js';

const C = CONFIG.hand;

const cm = (ratio) => Math.max(0.5, Math.round(ratio * C.palmCm * 2) / 2);
const listRu = (names) => names.map((n) => FINGER_RU[n]).join(' и ');
const isFist = (a) => a.ext.index < 0.25 && a.ext.middle < C.curled && a.ext.ring < C.curled && a.ext.pinky < C.curled;

/**
 * Собственная логика распознавания жестов (правила поверх точек кисти).
 * Раскладка «как в Доте»:
 *   указательный палец — курсор, большой+указательный — идти (ПКМ),
 *   кулак + движение руки — камера (джойстик), большой+средний — способность,
 *   два кулака — ульта.
 * Каждый кадр отдаёт события, удерживаемые состояния, прогресс жестов 0..1
 * и подсказки режима «ошибка»: что именно не так и как исправить.
 */
export class HandRecognizer {
  constructor() {
    this.reset();
  }

  reset() {
    this.pinchHeld = false;
    this.shootHeld = false;
    this.panning = false;
    this.panOrigin = null;
    this.ultArmed = true;
    this.primaryAnchor = null;
    this.timers = new Map();
    this.state = null;
  }

  // Сколько секунд подряд выполняется условие.
  hold(key, cond, t) {
    if (!cond) {
      this.timers.delete(key);
      return 0;
    }
    if (!this.timers.has(key)) this.timers.set(key, t);
    return t - this.timers.get(key);
  }

  // Основная рука — та, что ближе к прошлому положению основной руки.
  pickPrimary(list) {
    if (list.length < 2 || !this.primaryAnchor) return [list[0], list[1] ?? null];
    const [a, b] = list;
    return dist(a.a.anchor, this.primaryAnchor) <= dist(b.a.anchor, this.primaryAnchor) ? [a, b] : [b, a];
  }

  update(hands, t) {
    const out = {
      present: false, t, events: [], hints: [],
      pinchHeld: false, shootHeld: false, fist: false, pan: null, twoFists: false, handsCount: 0,
      pose: 'none', progress: { pinch: 0, shoot: 0, fist: 0, ult: 0 },
      a: null, pts: null, a2: null, pts2: null, point: null,
    };
    this.state = out;

    if (!hands?.length) {
      if (this.pinchHeld) out.events.push('pinchUp');
      if (this.panning) out.events.push('panEnd');
      this.pinchHeld = this.shootHeld = this.panning = false;
      this.timers.clear();
      this.primaryAnchor = null;
      return out;
    }

    const list = hands.map((h) => ({ h, a: analyzeHand(h.pts, h.H) }));
    const [P, S] = this.pickPrimary(list);
    const a = P.a;
    this.primaryAnchor = a.anchor;
    out.present = true;
    out.handsCount = list.length;
    out.a = a;
    out.pts = P.h.pts;
    out.a2 = S?.a ?? null;
    out.pts2 = S?.h.pts ?? null;
    const e = a.ext;

    // ---------- классификация позы основной руки ----------
    const fist = isFist(a);
    const fist2 = S ? isFist(S.a) : false;
    const ambiguous = a.pinchIndex < C.pinchNear && a.pinchMiddle < C.pinchNear
      && Math.abs(a.pinchIndex - a.pinchMiddle) < 0.12;
    const pinchLimit = this.pinchHeld ? C.pinchOff : C.pinchOn;
    const shootLimit = this.shootHeld ? C.pinchOff : C.pinchOn;
    const isPinch = !fist && e.index >= 0.2 && a.pinchIndex < pinchLimit && a.pinchMiddle > a.pinchIndex + 0.1;
    const isShoot = !fist && !isPinch && a.pinchMiddle < shootLimit && a.pinchIndex > a.pinchMiddle + 0.1;

    out.pose = fist ? 'fist' : isPinch ? 'pinch' : isShoot ? 'shoot' : 'open';
    // Курсор — точка между кончиками большого и указательного: при щипке пальцы
    // сходятся именно в неё, поэтому курсор не прыгает. В кулаке курсор замирает.
    const p4 = P.h.pts[4], p8 = P.h.pts[8];
    out.point = fist ? null : { x: (p4.x + p8.x) / 2, y: (p4.y + p8.y) / 2 };

    // ---------- два кулака → ульта ----------
    const twoT = this.hold('two', fist && fist2, t);
    out.twoFists = fist && fist2;
    if (twoT >= C.fistHold && this.ultArmed) {
      out.events.push('ult');
      this.ultArmed = false;
    }
    if (!(fist && fist2)) this.ultArmed = true;
    out.progress.ult = out.twoFists ? 1 : fist || fist2 ? 0.5 : 0;

    // ---------- щипок (указательный) → идти ----------
    if (isPinch && !this.pinchHeld) out.events.push('pinch');
    if (!isPinch && this.pinchHeld) out.events.push('pinchUp');
    this.pinchHeld = isPinch;
    out.pinchHeld = isPinch;
    out.progress.pinch = clamp((C.pinchNear - a.pinchIndex) / (C.pinchNear - C.pinchOn), 0, 1);

    // ---------- щипок (средний) → способность ----------
    if (isShoot && !this.shootHeld) out.events.push('shoot');
    this.shootHeld = isShoot;
    out.shootHeld = isShoot;
    out.progress.shoot = clamp((C.pinchNear - a.pinchMiddle) / (C.pinchNear - C.pinchOn), 0, 1);

    // ---------- кулак → камера-джойстик ----------
    const fistT = this.hold('fist', fist && !fist2, t);
    const pan = fistT >= C.fistHold;
    if (pan && !this.panning) {
      this.panOrigin = { ...a.anchor };
      out.events.push('panStart');
    }
    if (!pan && this.panning) out.events.push('panEnd');
    this.panning = pan;
    out.fist = fist;
    if (pan) {
      const k = a.palm * C.panRange;
      const dz = (v) => (Math.abs(v) < C.panDeadzone ? 0 : (v - Math.sign(v) * C.panDeadzone) / (1 - C.panDeadzone));
      out.pan = {
        x: dz(clamp((a.anchor.x - this.panOrigin.x) / k, -1, 1)),
        y: dz(clamp((a.anchor.y - this.panOrigin.y) / k, -1, 1)),
      };
    }
    const curl4 = [e.index, e.middle, e.ring, e.pinky].map((v) => 1 - v);
    out.progress.fist = clamp(Math.min(...curl4) / (1 - C.curled), 0, 1);

    this.detectMistakes(out, a, S?.a ?? null, { fist, fist2, ambiguous, isPinch, isShoot }, t, P.h);
    return out;
  }

  // ---------- РЕЖИМ «ОШИБКА» ----------
  // Ловим «почти жесты» и объясняем, что конкретно исправить.
  detectMistakes(out, a, a2, f, t, hand) {
    const e = a.ext;
    const d = C.hintDelay;
    const hint = (id, gesture, text, focus, icon = '⚠️') => out.hints.push({ id, gesture, text, focus, icon });

    if (this.hold('edgeOn', a.facing < C.edgeOnRatio, t) > 0.8) {
      hint('edge_on', 'any', 'Разверни ладонь к камере — рука стоит ребром и пальцы перекрывают друг друга', ['palm'], '🖐');
    }
    if (this.hold('far', a.palmRel < C.minPalm, t) > 0.8) {
      hint('too_far', 'any', 'Поднеси руку ближе к камере — сейчас она слишком маленькая в кадре', ['palm'], '🔍');
    }
    if (this.hold('near', a.palmRel > C.maxPalm, t) > 0.8) {
      hint('too_near', 'any', 'Отодвинь руку от камеры — пальцы выходят за кадр', ['palm'], '↔️');
    }
    const { x, y } = a.anchor;
    const edge = x < hand.W * 0.06 || x > hand.W * 0.94 || y < hand.H * 0.06 || y > hand.H * 0.94;
    if (this.hold('edge', edge, t) > 0.6) {
      hint('frame_edge', 'any', 'Рука у края кадра — верни её ближе к центру, иначе камера её потеряет', ['palm'], '🎯');
    }

    // Ульта: одна рука в кулаке, вторая в кадре, но раскрыта.
    if (a2 && (f.fist !== f.fist2)) {
      const openHand = f.fist ? a2 : a;
      const open = ['index', 'middle', 'ring', 'pinky'].filter((n) => openHand.ext[n] > 0.5);
      if (this.hold('halfUlt', open.length > 0 && open.length < 4, t) > d) {
        hint('ult_half', 'ult', `Для ульты сожми в кулак ОБЕ руки — у второй руки разогнут ${listRu(open)}`, [], '✊✊');
      }
    } else this.timers.delete('halfUlt');

    // Большой палец между двумя пальцами — непонятно, шаг это или способность.
    if (this.hold('ambiguous', f.ambiguous && !f.fist, t) > d * 0.8) {
      hint('pinch_ambiguous', 'pinch',
        'Большой палец касается сразу указательного и среднего. Чтобы идти — только к указательному, для способности — только к среднему',
        ['thumb', 'index', 'middle']);
      return;
    }

    const nearPinch = !f.isPinch && !f.fist && e.index >= 0.2
      && a.pinchIndex >= C.pinchOn && a.pinchIndex < C.pinchNear && a.pinchMiddle > a.pinchIndex + 0.1;
    if (this.hold('nearPinch', nearPinch, t) > d) {
      hint('pinch_gap', 'pinch',
        `Сомкни большой и указательный до касания — между ними ещё ~${cm(a.pinchIndex - C.pinchOn)} см`,
        ['thumb', 'index'], '👌');
    }

    const nearShoot = !f.isShoot && !f.fist
      && a.pinchMiddle >= C.pinchOn && a.pinchMiddle < C.pinchNear && a.pinchIndex > a.pinchMiddle + 0.1;
    if (this.hold('nearShoot', nearShoot, t) > d) {
      hint('shoot_gap', 'shoot',
        `Дотянись большим пальцем до СРЕДНЕГО — осталось ~${cm(a.pinchMiddle - C.pinchOn)} см`,
        ['thumb', 'middle'], '🤏');
    }

    // Недособранный кулак. Не путаем с указкой (разогнут только указательный — это курсор)
    // и со щипками.
    const four = ['index', 'middle', 'ring', 'pinky'];
    const curled = four.filter((n) => e[n] < C.curled);
    const open = four.filter((n) => e[n] > 0.5);
    const pointing = open.length === 1 && open[0] === 'index';
    const nearAnyPinch = a.pinchIndex < C.pinchNear || a.pinchMiddle < C.pinchNear;
    const partialFist = curled.length >= 2 && open.length >= 1 && !pointing && !nearAnyPinch;
    if (this.hold('partialFist', partialFist, t) > d) {
      const verb = open.length > 1 ? 'разогнуты' : 'разогнут';
      hint('fist_open', 'fist', `Кулак не собран: ${verb} ${listRu(open)} — сожми ${open.length > 1 ? 'их' : 'его'}, чтобы двигать камеру`, open, '✊');
    }
  }
}
