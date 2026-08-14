export function generateId(): string {
  // Prefer built-in randomUUID when available
  try {
    if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
      return (crypto as any).randomUUID();
    }
  } catch (e) {
    // ignore and fall through to other strategies
  }

  // Use crypto.getRandomValues to build an RFC4122 v4 UUID when available
  if (typeof crypto !== 'undefined' && typeof (crypto as any).getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    (crypto as any).getRandomValues(bytes);
    // Per RFC4122 v4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex: string = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return (
      hex.substring(0, 8) +
      '-' +
      hex.substring(8, 12) +
      '-' +
      hex.substring(12, 16) +
      '-' +
      hex.substring(16, 20) +
      '-' +
      hex.substring(20)
    );
  }

  // Last resort: Math.random fallback (less secure)
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}
