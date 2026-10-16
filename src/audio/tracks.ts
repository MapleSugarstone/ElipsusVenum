// The score of ElipsusVenum: leitmotifs as scale-degree figures, and every track as a small seeded generator.
// Pitches are MIDI numbers. Times and lengths are in quarter-note beats. See Notes/music.md for the design.
// Places are slow: a drone, strings that change chord every two bars, an arpeggio an echo behind, and a bell that asks.
// Fights are where the band drives.
import { B, MODE, aug, chord, fold, key, type Ctx, type Fig, type Key, type Section, type TrackDef, type Voice } from './score-core.ts';

// ---------------------------------------------------------------- leitmotifs

/** Your Best Friend: a bouncy major figure whose last note is a raised fourth, friendly and slightly wrong. */
export const YBF: Fig = [[0, 0.5], [2, 0.5], [4, 0.5], [4, 0.5], [5, 0.5], [4, 0.5], [3, 1, 1]];
/** Blue: a herald's rise, then a bow down a step. Loyalty. */
export const BLUE: Fig = [[0, 0.5], [3, 0.5], [4, 1], [3, 0.5], [2, 1.5]];
/** Doctor Pistachio: his question, 1, flat 3, 2, 5. It ends open on the fifth. */
export const PIST_Q: Fig = [[0, 0.5], [2, 0.5], [1, 0.5], [4, 1.5]];
/** The answer the question never gets until the two of them escape. */
export const PIST_A: Fig = [[3, 0.5], [2, 0.5], [1, 0.5], [0, 2]];
/** The King: a slow chorale Blue hears when he is Blessed. Chord roots in degrees. */
export const KING = [0, 3, 4, 0] as const;

// ---------------------------------------------------------------- harmony

/** Chord shapes in semitones above the root. The ninths and raised elevenths stretch ordinary chords. */
const SH = {
  m9: [0, 3, 7, 10, 14], madd9: [0, 3, 7, 14], m11: [0, 3, 7, 10, 17], maj9: [0, 4, 7, 11, 14], maj7s11: [0, 4, 7, 11, 18],
  add9: [0, 4, 7, 14], sus4: [0, 5, 7, 10], dom7b9: [0, 4, 7, 10, 13], maj: [0, 4, 7], min: [0, 3, 7], sus2: [0, 2, 7, 14],
} as const;
type Shape = keyof typeof SH;
/** A chord: its root in semitones above the key's root, and its shape. */
type Ch = readonly [number, Shape];

const rootOf = (K: Key, c: Ch, lo: number) => fold(K.root + c[0], lo);
/** Close voicing above `lo`. Five-note shapes leave their root to the bass. */
function tones(K: Key, c: Ch, lo = 52): number[] {
  const base = rootOf(K, c, lo);
  const all = SH[c[1]].map((s) => base + s);
  return all.length >= 5 ? all.slice(1) : all;
}

// ---------------------------------------------------------------- parts

type X = Record<string, unknown>;
const fig = (b: B, v: Voice, t: number, f: Fig, K: Key, oct: number, g: number, x: X = {}, leg = 0.98) =>
  b.fig(v, t, f, K, oct, g, { m: 1, ...x }, leg);

function strings(b: B, K: Key, t: number, c: Ch, d: number, g: number, x: X = {}): void {
  for (const n of tones(K, c, 53)) b.n('pad', t, n, d, g, x);
}

function brass(b: B, K: Key, t: number, c: Ch, d: number, g: number, x: X = {}): void {
  for (const n of tones(K, c, 50).slice(0, 4)) b.n('brass', t, n, d, g, x);
}

function choir(b: B, K: Key, t: number, c: Ch, d: number, g: number, ah = 0, x: X = {}): void {
  for (const n of tones(K, c, 55).slice(0, 4)) b.n('choir', t, n, d, g, { ah, ...x });
}

function sub(b: B, K: Key, t: number, c: Ch, d: number, g: number, x: X = {}): void {
  b.n('sub', t, rootOf(K, c, 33), d, g, x);
}

/** An arpeggio over the chord: `pat` indexes the chord's tones from the bottom, two octaves deep. */
function arpeggio(b: B, K: Key, t: number, c: Ch, d: number, step: number, g: number, pat: readonly number[] = [0, 1, 2, 3, 2, 1], x: X = {}): void {
  const base = rootOf(K, c, 57);
  const sh = SH[c[1]];
  const ladder = [...sh, ...sh.map((s) => s + 12)].sort((a, z) => a - z).map((s) => base + s);
  const n = Math.round(d / step);
  for (let k = 0; k < n; k++) b.n('arp', t + k * step, ladder[pat[k % pat.length] % ladder.length], step * 0.8, g * (k % 4 === 0 ? 1 : 0.72), x);
}

/** The machine's pulse: root eighths with the octave on every fourth step. */
function pulseBass(b: B, K: Key, t: number, c: Ch, d: number, g: number, step = 0.5, x: X = {}): void {
  const r = rootOf(K, c, 33);
  for (let k = 0; k < Math.round(d / step); k++) b.n('bass', t + k * step, k % 4 === 3 ? r + 12 : r, step * 0.8, g * (k % 2 ? 0.8 : 1), x);
}

function drums(b: B, bars: number, kind: 'taiko' | 'drive' | 'half', g: number): void {
  for (let bar = 0; bar < bars; bar++) {
    const t = bar * 4;
    b.hit(t, 'taiko', g, 0.5);
    if (kind === 'half') continue;
    b.hit(t + 2.5, 'taiko', g * 0.75, 0.5);
    b.hit(t, 'kick', g * 0.7, 0.25, { lay: 0.2 });
    b.hit(t + 1, 'snare', g * 0.55, 0.25, { lay: 0.55 });
    b.hit(t + 3, 'snare', g * 0.55, 0.25, { lay: 0.55 });
    if (kind === 'drive') {
      b.hit(t + 2, 'kick', g * 0.6, 0.25, { lay: 0.35 });
      for (let k = 0; k < 8; k++) b.hit(t + k * 0.5, 'tick', g * (k % 2 ? 0.25 : 0.4), 0.05, { lay: 0.4, pan: k % 2 ? 0.3 : -0.2 });
    }
  }
}

/** Geiger ticks scattered across `beats`, about `n` of them. */
function ticks(b: B, c: Ctx, beats: number, n: number, g: number, x: X = {}): void {
  for (let k = 0; k < n; k++) b.hit(c.r.next() * beats, 'tick', g * c.r.range(0.5, 1), 0.04, { pan: c.r.range(-0.7, 0.7), ...x });
}

// ---------------------------------------------------------------- places

/**
 * A place: a drone, a drift where the bell asks one of the motifs, and a walk where strings change chord every two bars
 * under an arpeggio and the warm lead. Darker acts add a hush with the chord a half step above the tonic.
 */
function region(o: { K: Key; bpm: number; chords: readonly Ch[]; motifs: Fig[]; gloom?: number; level?: number }): TrackDef {
  const { K, bpm, chords, motifs } = o;
  const gloom = o.gloom ?? 0;
  return {
    bpm, start: 'drift', vary: 0.5, wrong: 0.04, echo: 0.6, verb: 1, level: o.level ?? 0.7,
    graph: { drift: [['walk', 3], ['drift', 1]], walk: [['walk', 2], ['drift', 2], ['hush', gloom]], hush: [['drift', 1], ['walk', 1]] },
    secs: {
      drift: (c: Ctx) => {
        const b = new B(32, 4, bpm);
        b.n('drone', 0, fold(K.root, 38), 32, 0.5);
        b.n('sub', 0, fold(K.root, 33), 32, 0.32, { a: 4 });
        b.hit(0, 'hiss', 0.16, 32, { a: 4 });
        const m = motifs[(c.pass + c.visit) % motifs.length];
        fig(b, 'bell', 6, m, K, 1, 0.34, { pan: -0.2 });
        // One note answers, and it answers nothing.
        b.n('glass', 18 + c.r.int(4), fold(K(c.r.pick([4, 6])), 76), 3, 0.24, { pan: 0.4 });
        if (c.r.chance(0.4)) b.n('arp', 24, fold(K(0), 64), 1, 0.12);
        return b.out();
      },
      walk: (c: Ctx) => {
        const b = new B(32, 4, bpm);
        const cs = c.visit % 2 ? [...chords.slice(2), ...chords.slice(0, 2)] : chords;
        b.n('drone', 0, fold(K.root, 38), 32, 0.32);
        cs.forEach((ch, i) => {
          const t = i * 8;
          strings(b, K, t, ch, 8, 0.32);
          sub(b, K, t, ch, 8, 0.4);
          arpeggio(b, K, t, ch, 8, 0.5, 0.26, c.r.pick([[0, 1, 2, 3, 2, 1], [0, 2, 1, 3, 4, 3, 2, 1], [0, 1, 2, 3, 4, 5, 4, 3]]));
        });
        const m = motifs[c.r.int(motifs.length)];
        fig(b, 'lead', 8 + c.r.pick([0, 1]), aug(m, 2), K, 0, 0.36);
        if (c.r.chance(0.6)) fig(b, 'bell', 24, m, K, 1, 0.28, { pan: 0.3 });
        if (c.r.chance(0.25)) b.hit(16 + c.r.int(8), 'scan', 0.12, 4, { n: fold(K.root, 60) });
        return b.out();
      },
      hush: (c: Ctx) => {
        const b = new B(16, 4, bpm);
        b.n('drone', 0, fold(K.root, 38), 16, 0.45);
        b.n('drone', 0, fold(K.root + 1, 38), 16, 0.22, { a: 5 });
        choir(b, K, 2, [1, 'maj'], 12, 0.2, 0);
        b.n('glass', 9, fold(K(4), 79), 3, 0.2);
        ticks(b, c, 16, 10, 0.18);
        return b.out();
      },
    },
  };
}

// ---------------------------------------------------------------- fights

/**
 * A fight, where the band drives: pulse bass in eighths, taiko on one and three-and, the cold lead's riff, and the warm
 * lead answering with a motif. Brass, snare, choir, and blips arrive as the scale leans toward a loss.
 */
function fight(o: { K: Key; bpm: number; chords: readonly Ch[]; riff: Fig; counter: Fig; heavy?: boolean }): TrackDef {
  const { K, bpm, chords, riff, counter } = o;
  const heavy = !!o.heavy;
  return {
    bpm, start: 'intro', vary: 0.45, wrong: 0.03, echo: 0.45, verb: 0.75, level: 0.8,
    graph: { intro: [['a', 1]], a: [['a', 2], ['b', 2]], b: [['a', 2], ['break', 1]], break: [['a', 1]] },
    secs: {
      intro: () => {
        const b = new B(8, 4, bpm);
        b.n('drone', 0, fold(K.root, 38), 8, 0.4, { a: 1 });
        sub(b, K, 0, chords[0], 8, 0.4);
        arpeggio(b, K, 4, chords[0], 4, 0.25, 0.22, [0, 1, 2, 3], { cut: 900 });
        b.hit(6, 'swell', 0.2, 2);
        return b.out({ still: true });
      },
      a: (c: Ctx) => {
        const b = new B(16, 4, bpm);
        chords.forEach((ch, i) => {
          const t = i * 4;
          pulseBass(b, K, t, ch, 4, 0.5);
          sub(b, K, t, ch, 4, 0.3);
          arpeggio(b, K, t, ch, 4, 0.25, 0.2, [0, 1, 2, 3, 4, 3, 2, 1], { lay: 0.3 });
          brass(b, K, t, ch, heavy ? 1 : 0.75, heavy ? 0.36 : 0.28, { lay: heavy ? 0.3 : 0.5 });
          choir(b, K, t, ch, 3.8, 0.24, 1, { lay: 0.75 });
        });
        drums(b, 4, heavy || c.int > 0.5 ? 'drive' : 'taiko', 0.55);
        fig(b, 'cold', 0, riff, K, 0, 0.34, {}, 0.9);
        fig(b, 'cold', 8, riff, K, 0, 0.32, {}, 0.9);
        fig(b, 'lead', 4, counter, K, 1, 0.3, { lay: 0.25 });
        if (c.int > 0.85) for (let k = 0; k < 16; k++) b.n('blip', k + c.r.int(2) * 0.5, fold(K(c.r.int(5) * 2) + 24, 84), 0.2, 0.2, { pan: c.r.range(-0.8, 0.8) });
        return b.out();
      },
      b: (c: Ctx) => {
        const b = new B(16, 4, bpm);
        const climb = [0, 2, 4, 5, 7, 8, 10, 12];
        chords.forEach((ch, i) => {
          const t = i * 4;
          for (let k = 0; k < 8; k++) b.n('bass', t + k * 0.5, rootOf(K, ch, 33) + (k > 3 ? climb[k - 4] % 12 : 0), 0.4, 0.48);
          strings(b, K, t, ch, 4, 0.24);
          brass(b, K, t, ch, 1.5, 0.3, { lay: 0.4 });
          choir(b, K, t, ch, 3.8, 0.26, 1, { lay: 0.6 });
        });
        drums(b, 4, 'drive', 0.55);
        // The leads trade one-bar phrases, then the cold one follows an eighth behind.
        fig(b, 'lead', 0, counter, K, 1, 0.32);
        fig(b, 'cold', 4, riff, K, 0, 0.3, {}, 0.9);
        fig(b, 'lead', 8, counter, K, 1, 0.32);
        fig(b, 'cold', 8.5, counter, K, 0, 0.24, { lay: 0.5 }, 0.9);
        ticks(b, c, 16, 12, 0.2, { lay: 0.6 });
        // The last beat is silent.
        b.ev = b.ev.filter((e) => e.t < 15 || e.v === 'drone');
        return b.out();
      },
      break: (c: Ctx) => {
        const b = new B(16, 4, bpm);
        b.n('drone', 0, fold(K.root, 38), 16, 0.45, { a: 0.5 });
        choir(b, K, 0, chords[0], 8, 0.26, 0);
        choir(b, K, 8, chords[2], 8, 0.26, 0.4);
        sub(b, K, 0, chords[0], 16, 0.36);
        fig(b, 'bell', 2, aug(PIST_Q, 2), K, 1, 0.32);
        // Nothing answers except two notes far off.
        b.n('glass', 12, fold(K(4), 79), 1, 0.16, { pan: 0.7, det: -9 });
        b.n('glass', 13, fold(K(3) + 1, 79), 2, 0.14, { pan: 0.7, det: -9 });
        drums(b, 4, 'half', 0.4);
        if (c.int > 0.4) arpeggio(b, K, 12, chords[0], 4, 0.25, 0.18, [0, 1, 2, 3], { cut: 1200 });
        return b.out();
      },
    },
  };
}

// ---------------------------------------------------------------- tracks

const E_AEO = key(64, MODE.aeo);
const D_DOR = key(62, MODE.dor);
const FS_AEO = key(66, MODE.aeo);
const BB_PHR = key(58, MODE.phr);
const A_AEO = key(57, MODE.aeo);
const E_PHR = key(64, MODE.phr);
const C_ION = key(60, MODE.ion);
const G_ION = key(55, MODE.ion);
const CS_AEO = key(61, MODE.aeo);
const D_LYD = key(62, MODE.lyd);
const F_LYD = key(65, MODE.lyd);
const E_DOR = key(64, MODE.dor);

const TITLE_CH: readonly Ch[] = [[0, 'm9'], [8, 'maj7s11'], [5, 'm9'], [1, 'maj7s11']];

const title: TrackDef = {
  bpm: 64, start: 'drift', vary: 0.3, wrong: 0.04, echo: 0.65, level: 0.75,
  graph: { drift: [['walk', 1]], walk: [['walk', 3], ['drift', 1]] },
  secs: {
    drift: (c: Ctx) => {
      const b = new B(16, 4, 64);
      b.n('drone', 0, 40, 16, 0.5, { a: 4 });
      b.n('sub', 0, 40, 16, 0.3, { a: 4 });
      b.hit(0, 'hiss', 0.16, 16, { a: 3 });
      // Your Best Friend's theme at half speed, far off on the cold bell. Later visits hear Pistachio's question instead.
      const theme = c.visit % 2 ? PIST_Q : YBF;
      fig(b, 'glass', 2 + (c.visit % 3) * 2, aug(theme, 2), E_AEO, 1, 0.24, { pan: c.visit % 2 ? -0.35 : 0.35 });
      return b.out({ still: true });
    },
    walk: (c: Ctx) => {
      const b = new B(32, 4, 64);
      b.n('drone', 0, 40, 32, 0.3);
      TITLE_CH.forEach((ch, i) => {
        strings(b, E_AEO, i * 8, ch, 8, 0.3);
        sub(b, E_AEO, i * 8, ch, 8, 0.38);
        arpeggio(b, E_AEO, i * 8, ch, 8, 0.5, 0.22);
      });
      fig(b, 'bell', 4, PIST_Q, E_AEO, 1, 0.32);
      fig(b, 'lead', 16, aug(BLUE, 2), E_AEO, 0, 0.34);
      if (c.visit % 2) for (const [k, n] of YBF.entries()) if (n[0] !== null) b.n('blip', 28 + k * 0.5, E_AEO(n[0]) + 24 + (n[2] ?? 0), 0.3, 0.16);
      return b.out();
    },
  },
};

const map1 = region({ K: D_DOR, bpm: 66, chords: [[0, 'm9'], [5, 'add9'], [3, 'maj9'], [10, 'add9']], motifs: [YBF, BLUE, PIST_Q] });
const map2 = region({ K: FS_AEO, bpm: 60, chords: [[0, 'm9'], [8, 'maj7s11'], [5, 'm9'], [1, 'maj7s11']], motifs: [PIST_Q, BLUE], gloom: 1 });
const map3 = region({ K: BB_PHR, bpm: 56, chords: [[0, 'madd9'], [1, 'maj7s11'], [8, 'maj9'], [7, 'dom7b9']], motifs: [YBF, PIST_Q], gloom: 2, level: 0.8 });

const battle = fight({ K: A_AEO, bpm: 100, chords: [[0, 'madd9'], [8, 'maj9'], [5, 'm9'], [7, 'sus4']], riff: [[0, 0.5], [0, 0.5], [3, 0.5], [4, 0.5], [2, 1], [0, 1]], counter: PIST_Q });
const elite = fight({ K: E_PHR, bpm: 108, chords: [[0, 'madd9'], [1, 'maj7s11'], [8, 'maj9'], [7, 'dom7b9']], riff: [[0, 0.5], [1, 0.5], [0, 0.5], [4, 0.5], [3, 1], [1, 1]], counter: BLUE, heavy: true });

/** Sir Tutorial explains: each phrase plays, then plays again at half speed on the brass, for someone at the back. */
const bossTutorial: TrackDef = {
  bpm: 96, start: 'lesson', vary: 0.3, wrong: 0.02, echo: 0.4, verb: 0.8, level: 0.8,
  graph: { lesson: [['quiz', 1]], quiz: [['lesson', 1]] },
  secs: {
    lesson: (c: Ctx) => {
      const b = new B(16, 4, 96);
      const cs: Ch[] = [[0, 'maj9'], [5, 'add9'], [7, 'sus4'], [0, 'add9']];
      cs.forEach((ch, i) => { pulseBass(b, G_ION, i * 4, ch, 4, 0.48); sub(b, G_ION, i * 4, ch, 4, 0.3); choir(b, G_ION, i * 4, ch, 3.8, 0.2, 1, { lay: 0.5 }); });
      drums(b, 4, 'taiko', 0.55);
      const phrase = c.r.pick([YBF, BLUE]);
      fig(b, 'lead', 0, phrase, G_ION, 0, 0.36);
      fig(b, 'brass', 8, aug(phrase, 2), G_ION, -1, 0.3, {}, 0.95);
      return b.out();
    },
    quiz: (c: Ctx) => {
      const b = new B(16, 4, 96);
      const cs: Ch[] = [[9, 'm9'], [5, 'maj7s11'], [7, 'sus4'], [7, 'dom7b9']];
      cs.forEach((ch, i) => { pulseBass(b, G_ION, i * 4, ch, 4, 0.48); strings(b, G_ION, i * 4, ch, 4, 0.24); arpeggio(b, G_ION, i * 4, ch, 4, 0.25, 0.2, [0, 1, 2, 3], { lay: 0.3 }); });
      drums(b, 4, 'drive', 0.55);
      fig(b, 'bell', 4, PIST_Q, G_ION, 1, 0.3, { lay: 0.4 });
      if (c.int > 0.6) fig(b, 'cold', 12, [[4, 1], [null, 1]], G_ION, 0, 0.32);
      return b.out();
    },
  },
};

/** The copy carries every note of the motif plus a flat sixth and a raised fourth, so its answer never resolves. */
const copyOf = (f: Fig): Fig => [...f.slice(0, -1), [5, 0.5, -1], [3, 0.5, 1], [f[f.length - 1][0], f[f.length - 1][1]]];

/** The Copycat copies: the warm lead states a motif, and the cold lead copies it a sixteenth late and 9 cents flat. */
const bossCopycat: TrackDef = {
  bpm: 96, start: 'copy', vary: 0.35, wrong: 0.05, echo: 0.45, verb: 0.8, level: 0.8,
  graph: { copy: [['copy', 2], ['mirror', 1]], mirror: [['copy', 1], ['gap', 1]], gap: [['copy', 1]] },
  secs: {
    copy: (c: Ctx) => {
      const b = new B(16, 4, 96);
      const cs: Ch[] = [[0, 'madd9'], [8, 'maj9'], [5, 'm9'], [7, 'dom7b9']];
      cs.forEach((ch, i) => { pulseBass(b, CS_AEO, i * 4, ch, 4, 0.5); sub(b, CS_AEO, i * 4, ch, 4, 0.3); brass(b, CS_AEO, i * 4, ch, 0.75, 0.28, { lay: 0.45 }); });
      drums(b, 4, c.int > 0.4 ? 'drive' : 'taiko', 0.55);
      const m: Fig = c.r.pick([BLUE, PIST_Q, YBF]);
      const late = 0.25 * (1 + (c.visit % 3) * 0.5);
      fig(b, 'lead', 0, m, CS_AEO, 0, 0.34);
      fig(b, 'cold', late, copyOf(m), CS_AEO, 0, 0.28, { det: -9 }, 0.9);
      fig(b, 'lead', 8, m, CS_AEO, 0, 0.34);
      fig(b, 'cold', 8 + late, copyOf(m), CS_AEO, 1, 0.26, { det: -9 }, 0.9);
      return b.out();
    },
    mirror: (c: Ctx) => {
      const b = new B(16, 4, 96);
      const cs: Ch[] = [[0, 'madd9'], [0, 'madd9'], [9, 'maj7s11'], [7, 'dom7b9']];
      cs.forEach((ch, i) => { pulseBass(b, CS_AEO, i * 4, ch, 4, 0.5); strings(b, CS_AEO, i * 4, ch, 4, 0.24); choir(b, CS_AEO, i * 4, ch, 3.8, 0.22, 0.6, { lay: 0.5 }); });
      drums(b, 4, 'drive', 0.55);
      const m = c.r.pick([BLUE, PIST_Q]);
      // A canon an eighth apart, the copy upside down.
      fig(b, 'lead', 0, m, CS_AEO, 0, 0.34);
      fig(b, 'cold', 0.5, m.map(([d, l, a]) => [d === null ? null : -d, l, a] as const), CS_AEO, 1, 0.26, { det: -9 }, 0.9);
      fig(b, 'lead', 8, m, CS_AEO, 1, 0.32);
      return b.out();
    },
    gap: () => {
      const b = new B(8, 4, 96);
      b.n('drone', 0, fold(61, 38), 8, 0.45, { a: 0.3 });
      choir(b, CS_AEO, 0, [0, 'madd9'], 8, 0.24, 0);
      b.n('glass', 4, fold(CS_AEO(5) - 1, 76), 1, 0.2, { pan: 0.7, det: -9 });
      b.n('glass', 5, fold(CS_AEO(3) + 1, 76), 2, 0.18, { pan: 0.7, det: -9 });
      return b.out({ still: true });
    },
  },
};

/** Your Best Friend makes up rules: his theme is kept in memory and one note of it is rewritten every pass. */
const bossYbf: TrackDef = {
  bpm: 104, start: 'rule', vary: 0.2, wrong: 0.08, echo: 0.45, verb: 0.8, level: 0.8,
  graph: { rule: [['rule', 3], ['plea', 1]], plea: [['rule', 1]] },
  secs: {
    rule: (c: Ctx) => {
      const b = new B(16, 4, 104);
      if (!c.mem.theme) c.mem.theme = YBF.map(([d]) => d ?? 0);
      const theme = c.mem.theme;
      theme[c.r.int(theme.length)] += c.r.pick([-2, -1, 1, 2, 3]);
      const f: Fig = YBF.map(([, l, a], k) => [theme[k], l, a] as const);
      const cs: Ch[] = [[0, 'add9'], [9, 'm9'], [5, 'maj7s11'], [7, 'sus4']];
      cs.forEach((ch, i) => {
        pulseBass(b, C_ION, i * 4, ch, 4, 0.5);
        sub(b, C_ION, i * 4, ch, 4, 0.3);
        brass(b, C_ION, i * 4, ch, 1, 0.3, { lay: 0.3 });
        arpeggio(b, C_ION, i * 4, ch, 4, 0.25, 0.18, [0, 1, 2, 3, 4, 3, 2, 1], { lay: 0.5 });
        choir(b, C_ION, i * 4, ch, 3.8, 0.22, 1, { lay: 0.7 });
      });
      drums(b, 4, 'drive', 0.55);
      fig(b, 'cold', 0, f, C_ION, 0, 0.34, {}, 0.9);
      fig(b, 'cold', 8, f, C_ION, 0, 0.32, {}, 0.9);
      fig(b, 'lead', 4, BLUE, C_ION, 0, 0.3, { lay: 0.35 });
      fig(b, 'bell', 12, PIST_Q, C_ION, 1, 0.3, { lay: 0.6 });
      return b.out();
    },
    plea: () => {
      const b = new B(16, 4, 80);
      b.n('drone', 0, 36, 16, 0.45, { a: 1 });
      choir(b, C_ION, 0, [0, 'add9'], 8, 0.24, 0);
      choir(b, C_ION, 8, [1, 'maj'], 8, 0.22, 0.3);
      fig(b, 'bell', 0, aug(YBF, 2), C_ION, 1, 0.3);
      return b.out({ still: true });
    },
  },
};

const rest: TrackDef = {
  bpm: 54, start: 'fire', vary: 0.4, wrong: 0.02, echo: 0.7, level: 0.72,
  graph: { fire: [['fire', 2], ['embers', 1]], embers: [['fire', 1]] },
  secs: {
    fire: (c: Ctx) => {
      const b = new B(32, 4, 54);
      const cs: Ch[] = [[0, 'maj9'], [7, 'add9'], [4, 'm9'], [6, 'sus2']];
      b.n('drone', 0, 38, 32, 0.4);
      b.hit(0, 'hiss', 0.12, 32, { a: 3 });
      cs.forEach((ch, i) => { choir(b, D_LYD, i * 8, ch, 8, 0.2, 0); sub(b, D_LYD, i * 8, ch, 8, 0.32); });
      fig(b, 'bell', 6 + c.r.int(3), aug(BLUE, 2), D_LYD, 1, 0.28);
      if (c.r.chance(0.5)) fig(b, 'glass', 22, PIST_Q, D_LYD, 1, 0.2, { pan: 0.4 });
      return b.out();
    },
    embers: (c: Ctx) => {
      const b = new B(16, 4, 54);
      b.n('drone', 0, 38, 16, 0.42);
      for (let k = 0; k < 6; k++) b.n('bell', k * 2.5 + c.r.int(2), fold(D_LYD(c.r.pick([0, 2, 4, 6, 8])), 74), 2, 0.2, { pan: c.r.range(-0.5, 0.5) });
      return b.out();
    },
  },
};

/** The shop: an electric piano of ratio-one bells, and Your Best Friend's theme on the blips as the sales pitch. */
const shop: TrackDef = {
  bpm: 84, start: 'counter', vary: 0.5, wrong: 0.04, echo: 0.4, verb: 0.7,
  graph: { counter: [['counter', 1]] },
  secs: {
    counter: (c: Ctx) => {
      const b = new B(16, 4, 84);
      const cs: Ch[] = [[0, 'maj9'], [2, 'add9'], [9, 'm9'], [7, 'sus4']];
      cs.forEach((ch, i) => {
        for (const n of tones(F_LYD, ch, 53).slice(0, 4)) b.n('bell', i * 4, n, 3, 0.16, { ratio: 1 });
        for (const n of tones(F_LYD, ch, 53).slice(0, 4)) b.n('bell', i * 4 + 2.5, n, 1, 0.1, { ratio: 1 });
        b.n('sub', i * 4, rootOf(F_LYD, ch, 33), 1.5, 0.36);
        b.n('sub', i * 4 + 2, rootOf(F_LYD, ch, 33) + 7, 1.5, 0.3);
      });
      for (let k = 0; k < 8; k++) b.hit(k * 2 + 1, 'tick', 0.2, 0.05);
      const at = c.r.pick([0, 8]);
      for (const [k, n] of YBF.entries()) if (n[0] !== null) b.n('blip', at + k * 0.5, F_LYD(n[0]) + 12 + (n[2] ?? 0), 0.4, 0.24, { m: 1 });
      return b.out();
    },
  },
};

/** Events drift: cold bells in the dark, a beam passing, and the cold lead asking Pistachio's question slightly wrong. */
const event: TrackDef = {
  bpm: 60, start: 'what', vary: 0.6, wrong: 0.08, echo: 0.7, level: 0.8,
  graph: { what: [['what', 2], ['beam', 1]], beam: [['what', 1]] },
  secs: {
    what: (c: Ctx) => {
      const b = new B(16, 4, 60);
      b.n('drone', 0, 40, 16, 0.45);
      b.n('sub', 0, 40, 16, 0.26, { a: 3 });
      for (let k = 0; k < 5; k++) b.n('glass', k * 3 + c.r.int(3) * 0.5, fold(E_DOR(c.r.pick([0, 2, 4, 5, 8])), 74), 2.5, 0.2, { pan: c.r.range(-0.6, 0.6) });
      if (c.r.chance(0.6)) fig(b, 'cold', 6, PIST_Q, E_DOR, 0, 0.26, { bend: c.r.pick([0, -0.5]) });
      return b.out();
    },
    beam: (c: Ctx) => {
      const b = new B(16, 4, 60);
      b.n('drone', 0, 40, 16, 0.45);
      b.n('drone', 4, 41, 12, 0.18, { a: 4 });
      b.hit(2, 'scan', 0.16, 6, { n: 64 });
      choir(b, E_DOR, 8, [1, 'maj'], 8, 0.16, 0);
      ticks(b, c, 16, 8, 0.15);
      return b.out();
    },
  },
};

const gameover: TrackDef = {
  bpm: 56, start: 'fall', vary: 0, wrong: 0, echo: 0.6, level: 0.8,
  graph: { fall: [['end', 1]] },
  secs: {
    fall: () => {
      const b = new B(16, 4, 56);
      const cs: Ch[] = [[0, 'm9'], [8, 'maj7s11'], [5, 'm9'], [1, 'maj7s11']];
      b.n('drone', 0, 45, 16, 0.45, { a: 1 });
      cs.forEach((ch, i) => { choir(b, A_AEO, i * 4, ch, 4, 0.22, 0.5); sub(b, A_AEO, i * 4, ch, 4, 0.32); });
      for (let k = 0; k < 3; k++) fig(b, 'lead', k * 4 + 1, YBF.map(([d, l, a]) => [d === null ? null : d - 2 * k, l, a] as const), A_AEO, 0, 0.32 - k * 0.06);
      return b.out({ still: true });
    },
    end: () => {
      const b = new B(8, 4, 56);
      b.n('bell', 0, 69, 6, 0.24);
      choir(b, A_AEO, 0, [0, 'min'], 7, 0.2, 0);
      b.n('drone', 0, 45, 7, 0.35, { a: 0.1 });
      return b.out({ still: true });
    },
  },
};

/** The escape. Pistachio's question finally gets its answer, and Blue's bow becomes the King's chorale. */
const victory: TrackDef = {
  bpm: 76, start: 'free', vary: 0.3, wrong: 0, echo: 0.55, level: 0.85,
  graph: { free: [['after', 1]], after: [['after', 3], ['free', 1]] },
  secs: {
    free: () => {
      const b = new B(32, 4, 76);
      b.n('drone', 0, 36, 32, 0.4, { a: 2 });
      fig(b, 'bell', 0, PIST_Q, key(69, MODE.aeo), 0, 0.32);
      // The answer resolves at last, over a major chord on the same root.
      fig(b, 'lead', 4, PIST_A, key(69, MODE.ion), 0, 0.36);
      fig(b, 'brass', 10, aug(BLUE, 2), C_ION, -1, 0.3, {}, 0.95);
      KING.forEach((d, i) => {
        const t = 16 + i * 4;
        for (const p of chord(C_ION, d, 3)) { b.n('choir', t, fold(p, 60), 3.9, 0.22, { ah: 1 }); b.n('brass', t, fold(p, 52), 3.5, 0.22); }
        b.n('sub', t, fold(C_ION(d), 33), 4, 0.4);
      });
      drums(b, 4, 'half', 0.4);
      return b.out({ still: true });
    },
    after: (c: Ctx) => {
      const b = new B(32, 4, 76);
      const cs: Ch[] = [[0, 'maj9'], [5, 'add9'], [9, 'm9'], [7, 'sus4']];
      cs.forEach((ch, i) => { strings(b, C_ION, i * 8, ch, 8, 0.28); sub(b, C_ION, i * 8, ch, 8, 0.36); arpeggio(b, C_ION, i * 8, ch, 8, 0.5, 0.2); });
      fig(b, 'lead', c.r.pick([4, 12]), aug(c.r.pick([BLUE, PIST_A]), 2), C_ION, 0, 0.32);
      fig(b, 'bell', 24, YBF, C_ION, 1, 0.24);
      return b.out();
    },
  },
};

export const TRACK_DEFS = {
  title, map1, map2, map3, battle, elite, boss_tutorial: bossTutorial, boss_copycat: bossCopycat, boss_ybf: bossYbf,
  rest, shop, event, gameover, victory,
};

// ---------------------------------------------------------------- stingers

export const STINGER_DEFS: Record<string, () => Section> = {
  win: () => {
    const b = new B(8, 4, 100);
    brass(b, C_ION, 0, [0, 'add9'], 3, 0.32);
    fig(b, 'bell', 0, [[0, 0.5], [2, 0.5], [4, 0.5], [7, 2]], C_ION, 1, 0.34);
    b.n('sub', 0, 36, 3, 0.4);
    return b.out({ still: true });
  },
  lose: () => {
    const b = new B(8, 4, 76);
    b.hit(0, 'boom', 0.5, 1);
    fig(b, 'glass', 0.5, [[4, 1], [3, 1], [1, 1], [0, 2]], A_AEO, 1, 0.28, { pan: 0.3 });
    b.n('drone', 0, 33, 5, 0.4, { a: 0.05 });
    return b.out({ still: true });
  },
  candle: () => {
    const b = new B(4, 4, 90);
    b.n('glass', 0, 79, 2, 0.26, { bend: -2 });
    b.n('glass', 0.75, 74, 2, 0.2);
    b.n('sub', 0, 40, 2.5, 0.3, { a: 0.4 });
    return b.out({ still: true });
  },
  coin: () => {
    const b = new B(3, 4, 140);
    b.n('blip', 0, 84, 0.2, 0.3);
    b.n('blip', 0.25, 88, 0.2, 0.28);
    b.n('bell', 0.5, 91, 1.5, 0.3);
    return b.out({ still: true });
  },
  relic: () => {
    const b = new B(4, 4, 110);
    [72, 76, 79, 83].forEach((n, i) => b.n('glass', i * 0.33, n, 2, 0.26 - i * 0.02, { pan: -0.4 + i * 0.27 }));
    return b.out({ still: true });
  },
  blessed: () => {
    const b = new B(8, 4, 84);
    KING.forEach((d, i) => chord(C_ION, d, 3).forEach((p) => b.n('choir', i * 1.5, fold(p, 60), 1.6, 0.24, { ah: 1, a: 0.15 })));
    b.n('bell', 0, 84, 3, 0.28);
    b.n('sub', 0, 36, 6, 0.36);
    return b.out({ still: true });
  },
};
