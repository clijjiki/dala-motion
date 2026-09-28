import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { CONFIG } from '../config.js';

const V = CONFIG.vision;

// Обёртка над MediaPipe HandLandmarker: до двух рук (два кулака = ульта), GPU с откатом на CPU.
export async function createHandTracker() {
  const fileset = await FilesetResolver.forVisionTasks(V.wasm);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: V.model, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: V.minDetection,
    minHandPresenceConfidence: V.minDetection,
    minTrackingConfidence: V.minTracking,
  });

  let landmarker;
  try {
    landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'));
  } catch (e) {
    console.warn('GPU delegate недоступен, переключаюсь на CPU', e);
    landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'));
  }

  let lastTs = 0;
  return {
    // Массив рук: 21 точка в пикселях кадра, зеркально (как в зеркале).
    detect(video, nowMs) {
      const ts = Math.max(nowMs, lastTs + 1);
      lastTs = ts;
      const res = landmarker.detectForVideo(video, ts);
      const W = video.videoWidth, H = video.videoHeight;
      return (res.landmarks ?? []).map((lms) => ({
        W, H,
        pts: lms.map((l) => ({ x: (1 - l.x) * W, y: l.y * H, z: l.z * W })),
      }));
    },
  };
}
