export async function startCamera(video) {
  if (!window.isSecureContext) {
    throw Object.assign(new Error('insecure'), { name: 'InsecureContext' });
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function cameraErrorText(err) {
  switch (err?.name) {
    case 'NotAllowedError':
      return 'Доступ к камере запрещён. Нажми на значок камеры в адресной строке, разреши доступ и обнови страницу.';
    case 'NotFoundError':
      return 'Камера не найдена. Подключи веб-камеру и обнови страницу.';
    case 'NotReadableError':
      return 'Камера занята другим приложением (Zoom, Teams, OBS?). Закрой его и обнови страницу.';
    case 'InsecureContext':
      return 'Камера работает только по https:// или на localhost. Открой деплой-ссылку или запусти локальный сервер.';
    case 'NotSupportedError':
      return 'Этот браузер не поддерживает камеру. Открой проект в Chrome, Edge или Safari.';
    default:
      return 'Не удалось включить камеру: ' + (err?.message || err);
  }
}
