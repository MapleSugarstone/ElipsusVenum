/** Four uint32 words of generator state, stored inside the game state so it is hashed and replayed. */
export type Rng = [number, number, number, number];

export function seedRng(seed: number): Rng {
  let s = seed >>> 0;
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    words.push((z ^ (z >>> 16)) >>> 0);
  }
  const r = words as Rng;
  for (let i = 0; i < 12; i++) nextU32(r);
  return r;
}

export function nextU32(r: Rng): number {
  const a = r[0], b = r[1], c = r[2], d = r[3];
  const t = (((a + b) >>> 0) + d) >>> 0;
  r[0] = (b ^ (b >>> 9)) >>> 0;
  r[1] = (c + (c << 3)) >>> 0;
  const rc = ((c << 21) | (c >>> 11)) >>> 0;
  r[2] = (rc + t) >>> 0;
  r[3] = (d + 1) >>> 0;
  return t;
}

/** Integer in [0, n). Multiplying a uint32 by a small integer and dividing by 2^32 is exact in doubles. */
export function randInt(r: Rng, n: number): number {
  if (n <= 1) return 0;
  return Math.floor((nextU32(r) * n) / 4294967296);
}

export function pick<T>(r: Rng, items: readonly T[]): T {
  return items[randInt(r, items.length)];
}

export function shuffle<T>(r: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(r, i + 1);
    const t = items[i];
    items[i] = items[j];
    items[j] = t;
  }
  return items;
}

/** Derives an independent seed from a parent seed and a label, for sub-streams such as map generation. */
export function deriveSeed(seed: number, label: string): number {
  let h = (seed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
