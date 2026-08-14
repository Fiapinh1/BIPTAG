export function vibrate(pattern: number | number[]) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

export function feedbackCorrect() {
  vibrate(80);
}

export function feedbackWarning() {
  vibrate([120, 80, 120]);
}
