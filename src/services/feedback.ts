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
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') {
    void context.resume();
  }
}

function playTone(frequency: number, durationMs: number, delayMs = 0) {
  const context = getAudioContext();
  if (!context) return;
  const start = context.currentTime + delayMs / 1000;
  const end = start + durationMs / 1000;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

export function feedbackCorrect() {
  primeFeedbackAudio();
  playTone(880, 95);
  vibrate(80);
}

export function feedbackWarning() {
  primeFeedbackAudio();
  playTone(440, 110);
  playTone(330, 130, 140);
  vibrate([120, 80, 120]);
}
