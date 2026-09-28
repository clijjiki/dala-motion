// Голосовые подсказки тренера через встроенный синтез речи браузера.
export class Voice {
  constructor() {
    this.enabled = true;
    this.voice = null;
    this.supported = 'speechSynthesis' in window;
    if (this.supported) {
      const pick = () => {
        const all = speechSynthesis.getVoices();
        this.voice = all.find((v) => v.lang?.toLowerCase().startsWith('ru')) ?? null;
      };
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }

  say(text) {
    if (!this.enabled || !this.supported || !this.voice) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = this.voice;
    u.lang = this.voice.lang;
    u.rate = 1.12;
    speechSynthesis.speak(u);
  }

  stop() {
    if (this.supported) speechSynthesis.cancel();
  }
}
