export function vibrate(pattern: number | number[]) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (!audioContext) {
    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    audioContext = new AudioContextCtor();
  }
  return audioContext;
}

export function primeFeedbackAudio() {
  void ensureAudioContext();
}

function playTone(frequency: number, durationMs: number, delayMs = 0) {
  void ensureAudioContext().then((context) => {
    if (!context) return;
    const start = context.currentTime + 0.02 + delayMs / 1000;
    const end = start + durationMs / 1000;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.32, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.03);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  });
}

async function ensureAudioContext() {
  const context = getAudioContext();
  if (!context) return null;
  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch {
      return null;
    }
  }
  return context;
}

export function feedbackCorrect() {
  primeFeedbackAudio();
  playTone(1040, 140);
  vibrate(120);
}

export function feedbackWarning() {
  primeFeedbackAudio();
  playTone(520, 130);
  playTone(390, 150, 160);
  vibrate([120, 80, 120]);
}
