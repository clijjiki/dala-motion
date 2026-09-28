// Все пороги и настройки в одном месте — удобно подкручивать командой.
export const CONFIG = {
  vision: {
    wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    model: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    minDetection: 0.5,
    minTracking: 0.35,     // ниже = рука реже «теряется» при быстром движении
  },

  // Геометрия руки. Все расстояния нормированы на размер ладони
  // (запястье → основание среднего пальца), поэтому не зависят от дистанции до камеры.
  hand: {
    palmCm: 9,            // средний реальный размер ладони, для подсказок «ещё N см»
    pinchOn: 0.30,        // щипок срабатывает
    pinchOff: 0.58,       // щипок отпущен (гистерезис): держится, пока пальцы не развёл заметно
    pinchNear: 0.56,      // «почти щипок» — зона для подсказок режима ошибки
    extended: 0.62,       // палец разогнут
    curled: 0.32,         // палец согнут
    fistHold: 0.15,       // сек удержания кулака до включения камеры / ульты
    panRange: 1.1,        // насколько (в ладонях) сдвинуть кулак для полной скорости камеры
    panDeadzone: 0.2,     // мёртвая зона джойстика-камеры
    edgeOnRatio: 0.42,    // ширина/длина ладони ниже — рука повёрнута ребром
    minPalm: 0.07,        // доля высоты кадра — рука слишком далеко
    maxPalm: 0.38,        // рука слишком близко
    hintDelay: 0.55,      // сколько держать «почти жест», прежде чем подсказать
  },

  cursor: {
    minCutoff: 1.1,       // One Euro filter
    beta: 0.9,
    dCutoff: 1.0,
    fullFrame: true,      // курсор работает по всему кадру камеры
    frameMargin: 0.08,    // поля по краям: у самого края камера теряет руку
    boxScale: 5.2,        // (если fullFrame = false) ширина зоны = размер ладони × boxScale
    clickLookback: 0.09,  // сек: клик берёт позицию курсора ДО начала щипка (гасит дрожание)
    dwell: 1.4,           // сек наведения на кнопку = клик (запасной способ)
  },

  coach: {
    sameHintCooldown: 4.5,
    anyHintGap: 1.6,
  },

  game: {
    heroHp: 100,
    heroSpeed: 300,
    boltSpeed: 820,
    boltCooldown: 0.32,
    boltDamage: 1,
    worldW: 2600,         // карта больше экрана — камеру двигает кулак
    worldH: 1700,
    camSpeed: 950,        // пикс/с при полном отклонении кулака
    ultCost: 100,
    ultRadius: 300,
    ultDamage: 6,
    energyPerKill: 14,
    wavePause: 3.5,
    healBetweenWaves: 20,
  },
};
