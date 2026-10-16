// The score framework: section types, a seeded generator, keys and figures, and automatic variation.
// Ported from the chiptune skill reference. The tracks themselves live in tracks.ts.
// Pitches are MIDI numbers (57 is A3, 220 Hz). Times and lengths are in quarter-note beats.

export type Voice = 'p1' | 'p2' | 'tri' | 'nz' | 'bell' | 'air';
export type Nz = 'hat' | 'snare' | 'kick' | 'tick' | 'tock' | 'sweep' | 'rush' | 'stamp';

export interface Ev {
  t: number;
  d: number;
  v: Voice;
  n: number;
  g: number;
  /** Pulse duty: 0 is 12.5%, 1 is 25%, 2 is 50%, 3 is 37.5%. */
  duty?: number;
  /** Glide in semitones across the second half of the note. */
  bend?: number;
  /** Detune in cents. */
  det?: number;
  /** Attack in seconds. */
  a?: number;
  /** Plays only when intensity is at least this. */
  lay?: number;
  /** Plays only when intensity is below this. */
  top?: number;
  nz?: Nz;
  /** FM ratio for the bell. */
  ratio?: number;
  /** Melodic: open to automatic ornaments and displacement. */
  m?: 1;
}

export interface Section {
  beats: number;
  bar: number;
  bpm: number;
  ev: Ev[];
  /** Skip automatic variation and wrong events. */
  still?: boolean;
  tag?: string;
}

export interface Ctx {
  r: Rng;
  /** Sections generated so far on this track. */
  pass: number;
  /** Times this section has been generated before. */
  visit: number;
  int: number;
  spells: number[][];
  bpm: number;
  st: Record<string, number>;
  mem: Record<string, number[]>;
}

export type Gen = (c: Ctx) => Section;

export interface TrackDef {
  bpm: number;
  start: string;
  secs: Record<string, Gen>;
  /** Weighted next sections. A section with no entry ends the track. */
  graph?: Record<string, ReadonlyArray<readonly [string, number]>>;
  next?: (cur: string, c: Ctx) => string | null;
  vary?: number;
  wrong?: number;
  /** Level per voice, multiplied into the engine's base level. */
  mix?: Partial<Record<Voice, number>>;
  echo?: number;
  wobble?: number;
  /** Detune of p2 against p1 in cents. */
  spread?: number;
}

export class Rng {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number { return Math.floor(this.next() * n); }
  pick<T>(a: readonly T[]): T { return a[this.int(a.length)]; }
  chance(p: number): boolean { return this.next() < p; }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  weighted<T>(opts: ReadonlyArray<readonly [T, number]>): T {
    let sum = 0;
    for (const o of opts) sum += Math.max(0, o[1]);
    let x = this.next() * sum;
    for (const o of opts) { x -= Math.max(0, o[1]); if (x < 0) return o[0]; }
    return opts[opts.length - 1][0];
  }
}

export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// Modes as semitone steps from the root.
export const MODE = {
  ion: [0, 2, 4, 5, 7, 9, 11],
  dor: [0, 2, 3, 5, 7, 9, 10],
  phr: [0, 1, 3, 5, 7, 8, 10],
  lyd: [0, 2, 4, 6, 7, 9, 11],
  mix: [0, 2, 4, 5, 7, 9, 10],
  aeo: [0, 2, 3, 5, 7, 8, 10],
  loc: [0, 1, 3, 5, 6, 8, 10],
  hmin: [0, 2, 3, 5, 7, 8, 11],
  pdom: [0, 1, 4, 5, 7, 8, 10],
  whole: [0, 2, 4, 6, 8, 10],
} as const;

export interface Key {
  (d: number): number;
  root: number;
  mode: readonly number[];
}

export function key(root: number, mode: readonly number[]): Key {
  const L = mode.length;
  const f = ((d: number) => {
    const i = Math.round(d);
    const o = Math.floor(i / L);
    return root + mode[i - o * L] + 12 * o;
  }) as Key;
  f.root = root;
  f.mode = mode;
  return f;
}

/** A figure: [scale degree or null for a rest, length in beats, optional semitone alteration]. */
export type Fig = ReadonlyArray<readonly [number | null, number, number?]>;
export type Line = Array<[number | null, number]>;

export function realize(fig: Fig, K: Key, oct = 0): Line {
  return fig.map(([d, len, acc]) => [d === null ? null : K(d) + 12 * oct + (acc ?? 0), len]);
}
export const inv = (f: Fig, axis = 0): Fig => f.map(([d, l, a]) => [d === null ? null : 2 * axis - d, l, a === undefined ? undefined : -a]);
export const retro = (f: Fig): Fig => [...f].reverse();
export const aug = (f: Fig, k: number): Fig => f.map(([d, l, a]) => [d, l * k, a]);
export const shift = (f: Fig, k: number): Fig => f.map(([d, l, a]) => [d === null ? null : d + k, l, a]);
export const figLen = (f: Fig): number => f.reduce((s, x) => s + x[1], 0);
export const notesOf = (f: Fig): Fig => f.filter((x) => x[0] !== null);

export const MEL = { m: 1 } as const;

export class B {
  ev: Ev[] = [];
  beats: number;
  bar: number;
  bpm: number;
  constructor(beats: number, bar = 4, bpm = 90) {
    this.beats = beats;
    this.bar = bar;
    this.bpm = bpm;
  }
  n(v: Voice, t: number, n: number, d: number, g = 0.7, x?: Partial<Ev>): this {
    if (t >= -1e-6 && t < this.beats - 1e-6 && d > 0 && g > 0) this.ev.push({ t, d, v, n, g, ...x });
    return this;
  }
  /** Plays [pitch or null, beats] pairs from t and returns the end time. */
  line(v: Voice, t: number, notes: ReadonlyArray<readonly [number | null, number]>, g = 0.7, x?: Partial<Ev>, leg = 0.92): number {
    for (const [p, len] of notes) { if (p !== null) this.n(v, t, p, len * leg, g, x); t += len; }
    return t;
  }
  fig(v: Voice, t: number, f: Fig, K: Key, oct = 0, g = 0.7, x?: Partial<Ev>, leg = 0.92): number {
    return this.line(v, t, realize(f, K, oct), g, x, leg);
  }
  hit(t: number, kind: Nz, g = 0.5, d = 0.25, x?: Partial<Ev>): this {
    return this.n('nz', t, 60, d, g, { nz: kind, ...x });
  }
  out(extra?: Partial<Section>): Section {
    return { beats: this.beats, bar: this.bar, bpm: this.bpm, ev: this.ev, ...extra };
  }
}

// Automatic variation: ornaments, octave displacement, dropped notes, rhythmic displacement.
export function vary(sec: Section, r: Rng, amt: number): Section {
  if (amt <= 0 || sec.still) return sec;
  const out: Ev[] = [];
  let first = true;
  for (const e of sec.ev) {
    if (!e.m) {
      // Accompaniment varies too, in ways that cannot break the harmony: a dropped note, an octave, a missing hat.
      if (e.v === 'nz') { if ((e.nz === 'hat' || e.nz === 'tick') && r.chance(0.07 * amt)) continue; out.push(e); continue; }
      if (e.d < 1.5 && e.v !== 'tri' && r.chance(0.05 * amt)) continue;
      const x: Ev = { ...e };
      if (e.d < 1.5 && r.chance(0.05 * amt)) x.n += e.v === 'tri' ? (x.n < 40 ? 12 : -12) : x.n < 70 ? 12 : -12;
      out.push(x);
      continue;
    }
    const x: Ev = { ...e, g: e.g * r.range(0.86, 1.05) };
    if (!first && r.chance(0.06 * amt)) continue;
    first = false;
    if (r.chance(0.05 * amt)) x.n += x.n > 74 ? -12 : 12;
    if (r.chance(0.05 * amt) && x.t >= 0.25) x.t -= 0.25;
    else if (r.chance(0.04 * amt) && x.d >= 0.75) { x.t += 0.25; x.d -= 0.25; }
    if (r.chance(0.07 * amt) && x.t >= 0.125 && x.d >= 0.5) {
      out.push({ ...x, t: x.t - 0.125, d: 0.12, g: x.g * 0.7, n: x.n + r.pick([1, 2, 2, -1]) });
    } else if (r.chance(0.04 * amt) && x.d >= 1) {
      const up = r.pick([1, 2]);
      out.push({ ...x, d: 0.12 }, { ...x, t: x.t + 0.125, d: 0.12, n: x.n + up });
      x.t += 0.25; x.d -= 0.25;
    }
    out.push(x);
  }
  return { ...sec, ev: out };
}

// Rare wrong events: a bar in another meter, a sudden tritone, a held bent note, a hole.
export function wrong(sec: Section, r: Rng): Section {
  if (sec.still || !sec.ev.length) return sec;
  const bars = Math.max(1, Math.floor(sec.beats / sec.bar + 1e-6));
  const kind = r.pick(bars > 1 ? ['meter', 'tritone', 'bend', 'hole'] as const : ['tritone', 'bend', 'hole'] as const);
  const k = kind === 'meter' ? 1 + r.int(bars - 1) : r.int(bars);
  const lo = k * sec.bar, hi = lo + sec.bar;
  let ev = sec.ev.map((e) => ({ ...e }));
  let beats = sec.beats;
  if (kind === 'meter') {
    const gap = r.pick([0.5, 1, -0.5]);
    if (gap > 0) {
      for (const e of ev) {
        if (e.t >= lo - 1e-6) e.t += gap;
        else if (e.t + e.d > lo && e.v !== 'nz') e.d += gap;
      }
    } else {
      ev = ev.filter((e) => !(e.t >= lo - 0.5 - 1e-6 && e.t < lo - 1e-6));
      for (const e of ev) if (e.t >= lo - 1e-6) e.t += gap;
    }
    beats += gap;
  } else if (kind === 'tritone') {
    for (const e of ev) if (e.v !== 'nz' && e.t >= lo && e.t < hi) e.n += 6;
  } else if (kind === 'bend') {
    let best: Ev | null = null;
    for (const e of ev) if (e.m && (!best || e.d > best.d)) best = e;
    if (best) { best.bend = r.pick([-1, 1, -2, -0.5]); best.d = Math.max(best.d, 1.5); }
  } else {
    ev = ev.filter((e) => !(e.m && e.t >= lo && e.t < hi));
  }
  return { ...sec, ev, beats, tag: kind };
}

/** Chord roots with seeded substitutions: subs maps a degree to the degrees that may replace it. */
export function prog(r: Rng, base: readonly number[], subs: Record<number, readonly number[]>, p: number): number[] {
  return base.map((d) => (subs[d] && r.chance(p) ? r.pick(subs[d]) : d));
}

/** Tones of the chord on degree d: root, third, fifth, seventh, ninth. */
export function chord(K: Key, d: number, size = 3): number[] {
  const out: number[] = [];
  for (let i = 0; i < size; i++) out.push(K(d + 2 * i));
  return out;
}

/** Folds a pitch into [lo, lo + 12). */
export function fold(n: number, lo: number): number {
  let x = n;
  while (x < lo) x += 12;
  while (x >= lo + 12) x -= 12;
  return x;
}

