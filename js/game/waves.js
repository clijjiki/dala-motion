// Типы врагов и этажи. Меняй баланс здесь — логика игры его не знает.
// Баланс рассчитан на управление жестами: первые этажи мягкие, сложность растёт плавно.
export const ENEMIES = {
  wolf:   { hp: 2,  speed: 90,  r: 16, dmg: 6,  atkCd: 1.0, score: 10, color: '#aab3cc', name: 'Волк' },
  bat:    { hp: 1,  speed: 150, r: 12, dmg: 4,  atkCd: 0.8, score: 8,  color: '#7d5cff', name: 'Летучая мышь', zigzag: true },
  shaman: { hp: 3,  speed: 70,  r: 18, dmg: 8,  atkCd: 3.0, score: 25, color: '#d65db1', name: 'Шаман', ranged: true, keep: 300 },
  boar:   { hp: 5,  speed: 60,  r: 22, dmg: 14, atkCd: 1.2, score: 30, color: '#d98a4a', name: 'Кабан', charger: true },
  golem:  { hp: 9,  speed: 48,  r: 28, dmg: 12, atkCd: 1.6, score: 40, color: '#a89a8c', name: 'Голем' },
  boss:   { hp: 60, speed: 40,  r: 54, dmg: 18, atkCd: 1.8, score: 400, color: '#e0356b', name: 'Жалмауыз', boss: true },
};

export const FLOORS = 10;

// Когда враг появляется впервые — подсказка, как с ним бороться.
const INTRO = {
  1: 'Герой стреляет сам, когда стоит. Щипок 👌 — бежать и уклоняться',
  2: 'Летучие мыши быстрые — стой на месте и дай герою стрелять',
  3: 'Шаманы стреляют розовыми шарами — уходи щипком 👌 в сторону',
  4: 'Кабан показывает красную линию и бросается — отойди с линии!',
  5: 'Босс! Красный круг под ним — удар. Уходи за край круга',
  6: 'Големы крепкие — жми ульту двумя кулаками ✊✊',
  10: 'Финальный босс: он злее и бьёт чаще. Удачи, батыр!',
};

// Состав этажа n (1..10): число врагов растёт, новые типы открываются постепенно.
export function floorSpec(n) {
  const boss = n === 5 || n === 10;
  const pool = ['wolf'];
  if (n >= 2) pool.push('bat');
  if (n >= 3) pool.push('shaman');
  if (n >= 4) pool.push('boar');
  if (n >= 6) pool.push('golem');
  const count = boss ? 4 + n : Math.round(4 + n * 1.6);
  const spawn = [];
  if (boss) spawn.push('boss');
  // Новый тип врага на этаже появляется гарантированно.
  const fresh = { 2: 'bat', 3: 'shaman', 4: 'boar', 6: 'golem' }[n];
  if (fresh) spawn.push(fresh, fresh);
  while (spawn.length < count + (boss ? 1 : 0)) spawn.push(pool[Math.floor(Math.random() * pool.length)]);
  return {
    title: boss ? `Этаж ${n} · Босс` : `Этаж ${n}`,
    tip: INTRO[n] ?? 'Держись подальше от толпы и стреляй стоя',
    interval: boss ? 2 : Math.max(0.55, 1.7 - n * 0.12),
    hpScale: 1 + (n - 1) * 0.12,
    boss,
    spawn,
  };
}
