// Клиент моста к Dota 2 (bridge/dota_bridge.py). Браузер распознаёт жесты,
// а мост на этом компьютере двигает настоящую мышь и нажимает клавиши.
// Движения курсора склеиваются: пока летит один запрос, копится только последнее положение.
export class DotaBridge {
  constructor(url = 'http://127.0.0.1:8765') {
    this.url = url;
    this.connected = false;
    this.paused = false;
    this.queue = [];
    this.pendingMove = null;
    this.inflight = false;
    this.sent = 0;
  }

  async ping() {
    try {
      const r = await fetch(this.url + '/status', { cache: 'no-store' });
      const j = await r.json();
      this.connected = true;
      this.paused = j.paused;
      this.screen = j.screen;
    } catch {
      this.connected = false;
    }
    return this.connected;
  }

  move(x, y) {
    this.pendingMove = { t: 'move', x, y };
    this.flush();
  }

  send(cmd) {
    this.queue.push(cmd);
    this.flush();
  }

  flush() {
    if (this.inflight) return;
    const batch = [];
    if (this.pendingMove) batch.push(this.pendingMove);
    batch.push(...this.queue);
    this.pendingMove = null;
    this.queue = [];
    if (!batch.length) return;
    this.inflight = true;
    fetch(this.url + '/cmd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    })
      .then((r) => r.json())
      .then((j) => {
        this.connected = true;
        this.paused = j.paused;
        this.sent += batch.length;
      })
      .catch(() => { this.connected = false; })
      .finally(() => {
        this.inflight = false;
        if (this.queue.length || this.pendingMove) this.flush();
      });
  }
}
