// Умения, как в Archero: после каждого этажа игрок выбирает 1 из 3.
// apply(stats, hero) меняет характеристики героя. max — сколько раз можно взять.
export const UPGRADES = [
  { id: 'multishot', icon: '🏹', name: 'Двойной выстрел', desc: '+1 стрела в каждой очереди', max: 3, apply: (s) => { s.multishot++; } },
  { id: 'front', icon: '🔱', name: 'Стрелы веером', desc: '+1 стрела вперёд', max: 3, apply: (s) => { s.front++; } },
  { id: 'diag', icon: '✳️', name: 'Диагональ', desc: '+2 стрелы под углом 45°', max: 2, apply: (s) => { s.diag++; } },
  { id: 'ricochet', icon: '↪️', name: 'Рикошет', desc: 'Стрела отскакивает в соседнего врага', max: 3, apply: (s) => { s.ricochet++; } },
  { id: 'pierce', icon: '📌', name: 'Пробивание', desc: 'Стрела пролетает сквозь врага', max: 3, apply: (s) => { s.pierce++; } },
  { id: 'speed', icon: '⚡', name: 'Скорострельность', desc: 'Стреляешь на 25% быстрее', max: 4, apply: (s) => { s.atkCd *= 0.8; } },
  { id: 'damage', icon: '💪', name: 'Сила', desc: 'Урон стрел +40%', max: 5, apply: (s) => { s.dmg *= 1.4; } },
  { id: 'fire', icon: '🔥', name: 'Огненные стрелы', desc: 'Поджигают врага на 3 секунды', max: 1, apply: (s) => { s.fire = true; } },
  { id: 'ice', icon: '❄️', name: 'Ледяные стрелы', desc: 'Замедляют врага вдвое на 2 секунды', max: 1, apply: (s) => { s.ice = true; } },
  { id: 'orbs', icon: '🌀', name: 'Вихрь', desc: '+1 огненный шар кружит вокруг героя', max: 3, apply: (s) => { s.orbs++; } },
  { id: 'vamp', icon: '🩸', name: 'Вампиризм', desc: '+4 здоровья за каждого врага', max: 3, apply: (s) => { s.vamp += 4; } },
  { id: 'hp', icon: '❤️', name: 'Крепость', desc: '+40 к здоровью и полное лечение', max: 5, apply: (s, h) => { s.maxHp += 40; h.hp = s.maxHp; } },
  { id: 'boots', icon: '👟', name: 'Лёгкий шаг', desc: 'Бегаешь на 15% быстрее', max: 3, apply: (s) => { s.speed *= 1.15; } },
];

// Три случайных умения, которые ещё не взяты до максимума.
export function rollUpgrades(taken, n = 3) {
  const pool = UPGRADES.filter((u) => (taken[u.id] ?? 0) < u.max);
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}
