// Типы врагов и сценарий волн. Меняй баланс здесь — логика игры его не знает.
// Баланс рассчитан на управление жестами: первые волны мягкие, сложность растёт плавно.
export const ENEMIES = {
  wolf:   { hp: 2,  speed: 95,  r: 16, dmg: 5,  atkCd: 1.0, score: 10, color: '#9aa4c7', name: 'Волк' },
  golem:  { hp: 8,  speed: 50,  r: 28, dmg: 12, atkCd: 1.6, score: 40, color: '#c98b5b', name: 'Голем' },
  shaman: { hp: 3,  speed: 70,  r: 18, dmg: 8,  atkCd: 3.0, score: 25, color: '#7ee0c3', name: 'Шаман', ranged: true, keep: 300 },
  boss:   { hp: 70, speed: 40,  r: 54, dmg: 18, atkCd: 1.8, score: 400, color: '#ff4fd8', name: 'Жалмауыз', boss: true },
};

// spawn: [тип, количество]; interval — секунды между появлениями.
export const WAVES = [
  { title: 'Волна 1 · Волки',    interval: 1.8, spawn: [['wolf', 5]],
    tip: 'Герой бьёт сам. Щипок 👌 — идти, средний + большой 🤏 — способность' },
  { title: 'Волна 2 · Шаманы',   interval: 1.4, spawn: [['wolf', 6], ['shaman', 2]],
    tip: 'Шаманы стреляют зелёными шарами — отходи щипком 👌 в сторону' },
  { title: 'Волна 3 · Големы',   interval: 1.2, spawn: [['wolf', 7], ['golem', 2], ['shaman', 2]],
    tip: 'Големы крепкие — копи энергию и жми ульту: два кулака ✊✊' },
  { title: 'Волна 4 · Стая',     interval: 0.9, spawn: [['wolf', 10], ['golem', 3], ['shaman', 3]],
    tip: 'Не стой на месте — уходи щипком от окружения' },
  { title: 'Волна 5 · Жалмауыз', interval: 2.2, spawn: [['boss', 1], ['wolf', 8], ['shaman', 2]],
    tip: 'Красный круг под боссом — удар! Уходи щипком 👌 за его край' },
];
