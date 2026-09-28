// Типы врагов и сценарий волн. Меняй баланс здесь — логика игры его не знает.
export const ENEMIES = {
  wolf:   { hp: 1,  speed: 135, r: 16, dmg: 9,  atkCd: 0.8, score: 10, color: '#9aa4c7', name: 'Волк' },
  golem:  { hp: 6,  speed: 55,  r: 28, dmg: 18, atkCd: 1.4, score: 40, color: '#c98b5b', name: 'Голем' },
  shaman: { hp: 2,  speed: 80,  r: 18, dmg: 12, atkCd: 2.4, score: 25, color: '#7ee0c3', name: 'Шаман', ranged: true, keep: 280 },
  boss:   { hp: 60, speed: 45,  r: 54, dmg: 25, atkCd: 1.6, score: 400, color: '#ff4fd8', name: 'Жалмауыз', boss: true },
};

// spawn: [тип, количество]; interval — секунды между появлениями.
export const WAVES = [
  { title: 'Волна 1 · Волки',    interval: 1.0, spawn: [['wolf', 8]],
    tip: 'Щипок 👌 — идти, средний + большой 🤏 — стрелять' },
  { title: 'Волна 2 · Шаманы',   interval: 0.9, spawn: [['wolf', 8], ['shaman', 3]],
    tip: 'Шаманы стреляют издалека — сожми кулак ✊, чтобы поднять щит' },
  { title: 'Волна 3 · Големы',   interval: 0.8, spawn: [['wolf', 10], ['golem', 3], ['shaman', 3]],
    tip: 'Големы крепкие — копи энергию и жми ульту ✌️' },
  { title: 'Волна 4 · Стая',     interval: 0.6, spawn: [['wolf', 14], ['golem', 4], ['shaman', 4]],
    tip: 'Не стой на месте — уходи щипком от окружения' },
  { title: 'Волна 5 · Жалмауыз', interval: 1.8, spawn: [['boss', 1], ['wolf', 10], ['shaman', 2]],
    tip: 'Красный круг под боссом — удар! Уйди из круга или держи щит ✊' },
];
