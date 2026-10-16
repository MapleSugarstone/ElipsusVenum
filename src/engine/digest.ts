/** FNV-1a over a string, as two 32-bit halves with different offsets, printed as 16 hex digits. */
export function fnv(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ch, 0x01000193 + 0x1000) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function digest(state: unknown): string {
  return fnv(JSON.stringify(state));
}
