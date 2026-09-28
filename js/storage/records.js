// Таблица рекордов и прогресс игрока — localStorage этого браузера.
const KEY = 'dala-arena.v1';

const ADJ = ['Быстрый', 'Смелый', 'Тихий', 'Звёздный', 'Степной', 'Ловкий', 'Огненный', 'Мудрый'];
const NOUN = ['Барс', 'Беркут', 'Тулпар', 'Сокол', 'Батыр', 'Волк', 'Архар', 'Кулан'];

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

function save(d) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* приватный режим — просто не сохраняем */
  }
}

export function profile() {
  const d = load();
  d.top ??= [];
  d.history ??= [];
  if (!d.name) {
    d.name = `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`;
    save(d);
  }
  return d;
}

export function setTutorialDone() {
  const d = profile();
  d.tutorialDone = true;
  save(d);
}

export function addRun(run) {
  const d = profile();
  const entry = { ...run, name: d.name, date: Date.now() };
  d.top.push(entry);
  d.top.sort((a, b) => b.score - a.score);
  d.top = d.top.slice(0, 10);
  d.history.push({ score: run.score, date: entry.date });
  d.history = d.history.slice(-12);
  const prevBest = d.best ?? 0;
  d.best = Math.max(prevBest, run.score);
  save(d);
  return { rank: d.top.indexOf(entry) + 1, isBest: run.score > prevBest, prevBest, top: d.top, history: d.history };
}
