import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('Optional reader audio and vibration', () => {
  it('does not interrupt tag processing when vibration is denied', async () => {
    vi.stubGlobal('navigator', { vibrate: () => { throw new DOMException('Denied', 'NotAllowedError'); } });
    vi.stubGlobal('window', {});
    const { feedbackCorrect, feedbackWarning } = await import('../src/services/feedback');
    expect(() => feedbackCorrect()).not.toThrow();
    expect(() => feedbackWarning()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('does not reject when audio hardware is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { AudioContext: class { constructor() { throw new Error('Audio unavailable'); } } });
    const { primeFeedbackAudio, feedbackCorrect } = await import('../src/services/feedback');
    expect(() => primeFeedbackAudio()).not.toThrow();
    expect(() => feedbackCorrect()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
