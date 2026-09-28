// Геометрия кисти поверх 21 точки MediaPipe. Здесь нет жестов — только измерения.
export const H = {
  WRIST: 0,
  THUMB: [1, 2, 3, 4],
  INDEX: [5, 6, 7, 8],
  MIDDLE: [9, 10, 11, 12],
  RING: [13, 14, 15, 16],
  PINKY: [17, 18, 19, 20],
};

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
export const FINGER_RU = {
  thumb: 'большой', index: 'указательный', middle: 'средний', ring: 'безымянный', pinky: 'мизинец',
};

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a, b, t) => a + (b - a) * t;

// Степень разгибания пальца 0..1: насколько кончик дальше от запястья, чем основание.
// Отношение не зависит от масштаба и почти не зависит от поворота кисти в плоскости кадра.
function extension(p, mcp, tip) {
  const r = dist(p[tip], p[H.WRIST]) / Math.max(1, dist(p[mcp], p[H.WRIST]));
  return clamp((r - 1.12) / (1.75 - 1.12), 0, 1);
}

export function analyzeHand(p, frameH) {
  const palm = dist(p[H.WRIST], p[9]);                 // «единица длины»
  const palmWidth = dist(p[5], p[17]);
  const ext = {
    index: extension(p, 5, 8),
    middle: extension(p, 9, 12),
    ring: extension(p, 13, 16),
    pinky: extension(p, 17, 20),
    // Большой палец: насколько кончик отведён от основания мизинца.
    thumb: clamp((dist(p[4], p[17]) / palm - 0.75) / (1.35 - 0.75), 0, 1),
  };
  return {
    palm,
    palmRel: palm / frameH,
    facing: palmWidth / palm,                      // ~0.8 ладонь к камере, <0.4 ребром
    ext,
    pinchIndex: dist(p[4], p[8]) / palm,
    pinchMiddle: dist(p[4], p[12]) / palm,
    anchor: { x: (p[0].x + p[5].x + p[9].x + p[17].x) / 4, y: (p[0].y + p[5].y + p[9].y + p[17].y) / 4 },
  };
}
