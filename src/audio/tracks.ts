// The score of ElipsusVenum: leitmotifs as scale-degree figures, and every track as a small seeded generator.
// Pitches are MIDI numbers. Times and lengths are in quarter-note beats. See Notes/music.md for the design.
import { B, MODE, chord, fold, key, prog, type Ctx, type Fig, type Key, type Section, type TrackDef } from './score-core.ts';

// ---------------------------------------------------------------- leitmotifs

/** Your Best Friend: a bouncy major figure whose last note is a raised fourth, friendly and slightly wrong. */
export const YBF: Fig = [[0, 0.5], [2, 0.5], [4, 0.5], [4, 0.5], [5, 0.5], [4, 0.5], [3, 1, 1]];
/** Blue: a herald's rise, then a bow down a step. Loyalty. */
export const BLUE: Fig = [[0, 0.5], [3, 0.5], [4, 1], [3, 0.5], [2, 1.5]];
/** Doctor Pistachio: his question from the earlier game, 1, flat 3, 2, 5. It ends open on the fifth. */
export const PIST_Q: Fig = [[0, 0.5], [2, 0.5], [1, 0.5], [4, 1.5]];
/** The answer the question never gets until the two of them escape. */
export const PIST_A: Fig = [[3, 0.5], [2, 0.5], [1, 0.5], [0, 2]];
/** The King: a slow chorale Blue hears when he is Blessed. Chord roots in degrees. */
export const KING = [0, 3, 4, 0] as const;

const fig = (b: B, v: 'p1' | 'p2' | 'bell' | 'air', t: number, f: Fig, K: Key, oct: number, g: number, x = {}) =>
  b.fig(v, t, f, K, oct, g, { m: 1, ...x });

// ---------------------------------------------------------------- shared generators

function bassLine(b: B, K: Key, roots: number[], per: number, g: number, style: 'pulse' | 'walk' | 'drone', lo = 36): void {
  roots.forEach((d, i) => {
    const t = i * per;
    const root = fold(K(d), lo);
    if (style === 'drone') b.n('tri', t, root, per * 0.98, g);
    else if (style === 'pulse') for (let k = 0; k < per * 2; k++) b.n('tri', t + k * 0.5, k % 4 === 3 ? root + 12 : root, 0.42, g);
    else {
      const tones = chord(K, d, 3).map((p) => fold(p, lo));
      for (let k = 0; k < per; k++) b.n('tri', t + k, tones[k % tones.length], 0.9, g);
    }
  });
}

function pads(b: B, K: Key, roots: number[], per: number, g: number, lay?: number): void {
  roots.forEach((d, i) => {
    const tones = chord(K, d, 3).map((p) => fold(p, 60));
    b.n('air', i * per, tones[0], per * 0.95, g, { a: 0.3, lay });
    b.n('bell', i * per, tones[2] + 12, Math.min(per, 2.5), g * 0.5, { lay });
  });
}

function arp(b: B, K: Key, roots: number[], per: number, g: number, step = 0.5, lay?: number, top?: number): void {
  roots.forEach((d, i) => {
    const tones = chord(K, d, 4).map((p) => fold(p, 64));
    const n = Math.round(per / step);
    for (let k = 0; k < n; k++) b.n('p2', i * per + k * step, tones[[0, 1, 2, 3, 2, 1][k % 6]], step * 0.7, g * (k % 4 === 0 ? 1 : 0.7), { duty: 0, lay, top });
  });
}

function drums(b: B, bars: number, kind: 'march' | 'drive' | 'soft' | 'half', g: number, lay = 0): void {
  for (let bar = 0; bar < bars; bar++) {
    const t = bar * 4;
    if (kind === 'soft') {
      b.hit(t, 'tock', g * 0.5, 0.1, { lay });
      b.hit(t + 2.5, 'tick', g * 0.35, 0.05, { lay });
      continue;
    }
    if (kind === 'half') {
      b.hit(t, 'kick', g, 0.25, { lay });
      b.hit(t + 2, 'snare', g * 0.8, 0.25, { lay });
      continue;
    }
    b.hit(t, 'kick', g, 0.25, { lay });
    b.hit(t + 2, 'snare', g * 0.8, 0.25, { lay });
    if (kind === 'drive') {
      b.hit(t + 1.5, 'kick', g * 0.7, 0.25, { lay });
      b.hit(t + 3.5, 'snare', g * 0.4, 0.2, { lay: Math.max(lay, 0.5) });
    } else b.hit(t + 3, 'kick', g * 0.6, 0.25, { lay });
    for (let k = 0; k < 8; k++) b.hit(t + k * 0.5, 'hat', g * (k % 2 ? 0.25 : 0.4), 0.05, { lay: Math.max(lay, k % 2 ? 0.3 : 0) });
  }
}

/** A region track: bass, pads, an arpeggio that thickens with intensity, and the motifs passed in wandering above. */
function regionTrack(opts: { K: Key; bpm: number; motifs: Fig[]; roots: number[]; alt: number[]; gloom?: number }): TrackDef {
  const { K, bpm, motifs, roots, alt } = opts;
  const gloom = opts.gloom ?? 0;
  return {
    bpm, start: 'walk', vary: 0.6, wrong: 0.05, echo: 0.4,
    graph: { walk: [['walk', 3], ['look', 2], ['hush', gloom]], look: [['walk', 3], ['look', 1]], hush: [['walk', 1]] },
    secs: {
      walk: (c: Ctx) => {
        const b = new B(16, 4, bpm);
        const rs = prog(c.r, roots, { 0: [5], 3: [1], 4: [2] }, 0.3);
        bassLine(b, K, rs, 4, 0.5, c.visit % 2 ? 'walk' : 'drone');
        pads(b, K, rs, 4, 0.18);
        arp(b, K, rs, 4, 0.12, 0.5, 0.35);
        const m = motifs[c.r.int(motifs.length)];
        const at = c.r.pick([0, 4, 8]);
        fig(b, 'p1', at, m, K, 1, 0.42, { duty: c.r.pick([1, 2]) });
        if (c.r.chance(0.5)) fig(b, 'p1', at + 8, motifs[(c.pass + 1) % motifs.length], K, 1, 0.36, { duty: 1 });
        drums(b, 4, 'soft', 0.5, 0.2);
        return b.out();
      },
      look: (c: Ctx) => {
        const b = new B(16, 4, bpm);
        bassLine(b, K, alt, 8, 0.4, 'drone');
        for (let k = 0; k < 6; k++) b.n('bell', k * 2.5 + c.r.int(2) * 0.5, fold(K(c.r.pick([0, 2, 4, 6])), 72), 2, 0.22);
        pads(b, K, alt, 8, 0.14);
        return b.out();
      },
      hush: () => {
        const b = new B(8, 4, bpm);
        b.n('air', 0, fold(K(0), 57), 7.5, 0.18, { a: 1 });
        return b.out({ still: true });
      },
    },
  };
}

/** A fight: driving bass and drums, a riff from a motif, and layers that arrive as the scale leans toward a loss. */
function fightTrack(opts: { K: Key; bpm: number; riff: Fig; counter: Fig; roots: number[]; heavy?: boolean }): TrackDef {
  const { K, bpm, riff, counter, roots } = opts;
  return {
    bpm, start: 'drive', vary: 0.5, wrong: 0.03, echo: 0.25,
    graph: { drive: [['drive', 2], ['clash', 2]], clash: [['drive', 2], ['break', 1]], break: [['drive', 1]] },
    secs: {
      drive: (c: Ctx) => {
        const b = new B(16, 4, bpm);
        const rs = prog(c.r, roots, { 0: [5], 3: [5], 4: [6] }, 0.25);
        bassLine(b, K, rs, 4, 0.55, 'pulse', 33);
        drums(b, 4, opts.heavy ? 'drive' : 'march', 0.6);
        for (let k = 0; k < 4; k++) fig(b, 'p1', k * 4, riff, K, 1, 0.4, { duty: 2 });
        fig(b, 'p2', 8, counter, K, 1, 0.3, { duty: 1, lay: 0.45 });
        arp(b, K, rs, 4, 0.1, 0.25, 0.7);
        return b.out();
      },
      clash: (c: Ctx) => {
        const b = new B(16, 4, bpm);
        const rs = prog(c.r, roots, { 0: [3] }, 0.3).reverse();
        bassLine(b, K, rs, 4, 0.55, 'walk', 33);
        drums(b, 4, 'drive', 0.6);
        fig(b, 'p1', 0, counter, K, 1, 0.42, { duty: 2 });
        fig(b, 'p1', 8, riff, K, 2, 0.36, { duty: 1 });
        pads(b, K, rs, 4, 0.12, 0.55);
        return b.out();
      },
      break: () => {
        const b = new B(8, 4, bpm);
        drums(b, 2, 'half', 0.5);
        b.n('tri', 0, fold(K(0), 33), 7.5, 0.5);
        b.n('bell', 4, fold(K(4), 72), 3.5, 0.25);
        return b.out();
      },
    },
  };
}

// ---------------------------------------------------------------- tracks

const C = key(60, MODE.ion);
const D_DOR = key(62, MODE.dor);
const FS_AEO = key(66, MODE.aeo);
const BB_PHR = key(58, MODE.phr);
const A_AEO = key(57, MODE.aeo);
const E_PHR = key(64, MODE.phr);

const title: TrackDef = {
  bpm: 76, start: 'intro', vary: 0.3, wrong: 0.06, echo: 0.55,
  graph: { intro: [['duo', 1]], duo: [['duo', 4], ['intro', 1]] },
  secs: {
    intro: (c: Ctx) => {
      const b = new B(16, 4, 76);
      const rs = [[0, 3, 4, 0], [0, 5, 3, 4], [5, 3, 0, 4]][c.visit % 3];
      bassLine(b, C, rs, 4, 0.45, 'drone');
      b.fig('bell', 0, YBF.map(([d, l, a]) => [d, l * 2, a] as const), C, 1, 0.35);
      pads(b, C, rs, 4, 0.15);
      if (c.pass > 0) arp(b, C, [0, 3, 4, 0], 4, 0.1, 0.5);
      return b.out({ still: true });
    },
    duo: (c: Ctx) => {
      const b = new B(16, 4, 76);
      bassLine(b, C, [5, 3, 0, 4], 4, 0.45, 'walk');
      fig(b, 'p1', 0, BLUE, C, 1, 0.42, { duty: 2 });
      fig(b, 'p2', 4, PIST_Q, key(69, MODE.aeo), 0, 0.36, { duty: 1, bend: c.r.pick([0, 0.5]), det: 8 });
      fig(b, 'p1', 8, BLUE, C, 1, 0.38, { duty: 2 });
      fig(b, 'p2', 12, PIST_Q, key(69, MODE.aeo), 0, 0.34, { duty: 1, det: 10 });
      pads(b, C, [5, 3, 0, 4], 4, 0.14);
      drums(b, 4, 'soft', 0.4);
      return b.out();
    },
  },
};

const map1 = regionTrack({ K: D_DOR, bpm: 84, motifs: [YBF, BLUE, PIST_Q], roots: [0, 3, 4, 0], alt: [0, 6] });
const map2 = regionTrack({ K: FS_AEO, bpm: 80, motifs: [YBF, PIST_Q], roots: [0, 5, 3, 4], alt: [0, 5], gloom: 1 });
const map3 = regionTrack({ K: BB_PHR, bpm: 72, motifs: [YBF, BLUE], roots: [0, 1, 0, 6], alt: [0, 1], gloom: 2 });

const battle = fightTrack({ K: A_AEO, bpm: 132, riff: [[0, 0.5], [0, 0.5], [3, 0.5], [4, 0.5], [2, 1], [0, 1]], counter: PIST_Q, roots: [0, 5, 3, 4] });
const elite = fightTrack({ K: E_PHR, bpm: 140, riff: [[0, 0.5], [1, 0.5], [0, 0.5], [4, 0.5], [3, 1], [1, 1]], counter: BLUE, roots: [0, 1, 6, 0], heavy: true });

/** Sir Tutorial explains: each phrase plays, then plays again at half speed, as if for someone at the back. */
const bossTutorial: TrackDef = {
  bpm: 120, start: 'lesson', vary: 0.3, wrong: 0.02, echo: 0.3,
  graph: { lesson: [['quiz', 1]], quiz: [['lesson', 1]] },
  secs: {
    lesson: (c: Ctx) => {
      const K = key(55, MODE.ion);
      const b = new B(16, 4, 120);
      bassLine(b, K, [0, 4, 0, 4], 4, 0.5, 'pulse', 31);
      drums(b, 4, 'march', 0.55);
      const phrase = c.r.pick([YBF, BLUE]);
      fig(b, 'p1', 0, phrase, K, 1, 0.42, { duty: 2 });
      fig(b, 'p1', 8, phrase.map(([d, l, a]) => [d, l * 2, a] as const), K, 1, 0.38, { duty: 1 });
      return b.out();
    },
    quiz: (c: Ctx) => {
      const K = key(55, MODE.ion);
      const b = new B(16, 4, 120);
      bassLine(b, K, [5, 3, 4, 4], 4, 0.5, 'walk', 31);
      drums(b, 4, 'drive', 0.55, 0);
      arp(b, K, [5, 3, 4, 4], 4, 0.12, 0.25, 0.3);
      fig(b, 'p2', 4, PIST_Q, K, 1, 0.34, { duty: 1, lay: 0.4 });
      if (c.int > 0.6) fig(b, 'p1', 12, [[4, 1], [null, 1]], K, 1, 0.4);
      return b.out();
    },
  },
};

/** The Copycat copies: its melody is doubled by a second voice that runs a little fast and drifts out of line. */
const bossCopycat: TrackDef = {
  bpm: 126, start: 'copy', vary: 0.4, wrong: 0.05, echo: 0.3,
  graph: { copy: [['copy', 2], ['mirror', 1]], mirror: [['copy', 1]] },
  secs: {
    copy: (c: Ctx) => {
      const K = key(61, MODE.aeo);
      const b = new B(16, 4, 126);
      bassLine(b, K, [0, 5, 6, 4], 4, 0.55, 'pulse', 37);
      drums(b, 4, 'drive', 0.55);
      const m: Fig = c.r.pick([BLUE, PIST_Q, YBF]);
      const drift = 0.125 * (1 + (c.visit % 3));
      for (let k = 0; k < 4; k++) {
        fig(b, 'p1', k * 4, m, K, 1, 0.4, { duty: 2 });
        fig(b, 'p2', k * 4 + drift, m.map(([d, l, a]) => [d, l * 0.94, a] as const), K, 1, 0.28, { duty: 0, det: 14 });
      }
      return b.out();
    },
    mirror: (c: Ctx) => {
      const K = key(61, MODE.aeo);
      const b = new B(16, 4, 126);
      bassLine(b, K, [0, 0, 5, 5], 4, 0.5, 'drone', 37);
      drums(b, 4, 'half', 0.5);
      const m = c.r.pick([BLUE, PIST_Q]);
      fig(b, 'p1', 0, m, K, 1, 0.4, { duty: 2 });
      fig(b, 'p2', 0, m.map(([d, l, a]) => [d === null ? null : -d, l, a] as const), K, 2, 0.3, { duty: 1 });
      return b.out();
    },
  },
};

/** Your Best Friend makes up rules: his theme is kept in memory and one note of it is rewritten every pass. */
const bossYbf: TrackDef = {
  bpm: 112, start: 'rule', vary: 0.2, wrong: 0.08, echo: 0.35,
  graph: { rule: [['rule', 3], ['plea', 1]], plea: [['rule', 1]] },
  secs: {
    rule: (c: Ctx) => {
      const K = C;
      const b = new B(16, 4, 112);
      if (!c.mem.theme) c.mem.theme = YBF.map(([d]) => d ?? 0);
      const theme = c.mem.theme;
      const i = c.r.int(theme.length);
      theme[i] += c.r.pick([-2, -1, 1, 2, 3]);
      const f: Fig = YBF.map(([, l, a], k) => [theme[k], l, a] as const);
      bassLine(b, K, [0, 5, 3, 4], 4, 0.55, 'pulse', 36);
      drums(b, 4, 'drive', 0.55);
      for (let k = 0; k < 4; k += 2) fig(b, 'p1', k * 4, f, K, 1, 0.42, { duty: 2 });
      fig(b, 'p2', 4, BLUE, K, 1, 0.32, { duty: 1, lay: 0.35 });
      fig(b, 'p2', 12, PIST_Q, K, 1, 0.32, { duty: 1, lay: 0.6, bend: 0.5 });
      return b.out();
    },
    plea: () => {
      const K = C;
      const b = new B(16, 4, 92);
      bassLine(b, K, [0, 3, 4, 0], 4, 0.4, 'drone', 36);
      b.fig('bell', 0, YBF.map(([d, l, a]) => [d, l * 2, a] as const), K, 1, 0.3);
      pads(b, K, [0, 3, 4, 0], 4, 0.15);
      return b.out({ still: true });
    },
  },
};

const rest: TrackDef = {
  bpm: 66, start: 'fire', vary: 0.5, wrong: 0.02, echo: 0.6,
  graph: { fire: [['fire', 1]] },
  secs: {
    fire: (c: Ctx) => {
      const K = key(62, MODE.ion);
      const b = new B(16, 4, 66);
      bassLine(b, K, [0, 4, 5, 3], 4, 0.35, 'drone');
      arp(b, K, [0, 4, 5, 3], 4, 0.1, 1);
      if (c.r.chance(0.5)) b.fig('bell', 8, BLUE, K, 1, 0.24);
      for (let k = 0; k < 8; k++) if (c.r.chance(0.4)) b.hit(k * 2 + c.r.next(), 'tick', 0.12, 0.03);
      return b.out();
    },
  },
};

const shop: TrackDef = {
  bpm: 100, start: 'counter', vary: 0.5, wrong: 0.04, echo: 0.25,
  graph: { counter: [['counter', 1]] },
  secs: {
    counter: (c: Ctx) => {
      const K = key(65, MODE.mix);
      const b = new B(16, 4, 100);
      bassLine(b, K, [0, 6, 3, 4], 4, 0.45, 'walk', 41);
      drums(b, 4, 'soft', 0.5);
      fig(b, 'p1', c.r.pick([0, 8]), YBF, K, 1, 0.38, { duty: 1 });
      arp(b, K, [0, 6, 3, 4], 4, 0.1, 0.5);
      return b.out();
    },
  },
};

const event: TrackDef = {
  bpm: 70, start: 'what', vary: 0.6, wrong: 0.08, echo: 0.6,
  graph: { what: [['what', 1]] },
  secs: {
    what: (c: Ctx) => {
      const K = key(64, MODE.dor);
      const b = new B(16, 4, 70);
      bassLine(b, K, [0, 1, 0, 6], 4, 0.4, 'drone');
      for (let k = 0; k < 5; k++) b.n('bell', k * 3 + c.r.int(3) * 0.5, fold(K(c.r.pick([0, 2, 4, 5])), 71), 2.5, 0.2);
      if (c.r.chance(0.6)) b.fig('air', 6, PIST_Q, K, 0, 0.3);
      return b.out();
    },
  },
};

const gameover: TrackDef = {
  bpm: 60, start: 'fall', vary: 0, wrong: 0, echo: 0.6,
  graph: { fall: [['end', 1]] },
  secs: {
    fall: () => {
      const b = new B(16, 4, 60);
      for (let k = 0; k < 3; k++) b.fig('p1', k * 4, YBF.map(([d, l, a]) => [d === null ? null : d - 2 * k, l, a] as const), A_AEO, 1, 0.36 - k * 0.08, { duty: 1 });
      b.n('tri', 0, 45, 15, 0.45);
      return b.out({ still: true });
    },
    end: () => {
      const b = new B(6, 3, 60);
      b.n('bell', 0, 69, 5, 0.25);
      b.n('air', 0, 57, 5.5, 0.2, { a: 0.5 });
      return b.out({ still: true });
    },
  },
};

/** The escape. Pistachio's question finally gets its answer, and Blue's bow becomes the King's chorale. */
const victory: TrackDef = {
  bpm: 90, start: 'free', vary: 0.3, wrong: 0, echo: 0.5,
  graph: { free: [['after', 1]], after: [['after', 3], ['free', 1]] },
  secs: {
    free: () => {
      const K = C;
      const b = new B(16, 4, 90);
      bassLine(b, K, [...KING], 4, 0.45, 'walk');
      fig(b, 'p2', 0, PIST_Q, key(69, MODE.aeo), 0, 0.38, { duty: 1, det: 8 });
      fig(b, 'p2', 2, PIST_A, key(69, MODE.aeo), 0, 0.38, { duty: 1 });
      fig(b, 'p1', 8, BLUE, K, 1, 0.42, { duty: 2 });
      KING.forEach((d, i) => chord(K, d, 3).forEach((p) => b.n('bell', i * 4, fold(p, 64), 3.5, 0.18)));
      drums(b, 4, 'soft', 0.4);
      return b.out({ still: true });
    },
    after: (c: Ctx) => {
      const K = C;
      const b = new B(16, 4, 90);
      const rs = prog(c.r, [...KING], { 0: [5], 3: [1] }, 0.4);
      bassLine(b, K, rs, 4, 0.4, c.visit % 2 ? 'walk' : 'drone');
      arp(b, K, rs, 4, 0.12, 0.5);
      fig(b, 'p1', c.r.pick([0, 8]), c.r.pick([BLUE, YBF]), K, 1, 0.36, { duty: 2 });
      pads(b, K, rs, 4, 0.14);
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
    const b = new B(6, 4, 120);
    b.fig('p1', 0, [[0, 0.5], [2, 0.5], [4, 0.5], [7, 2]], C, 1, 0.45, { duty: 2 });
    b.n('tri', 0, 48, 3.5, 0.5);
    return b.out({ still: true });
  },
  lose: () => {
    const b = new B(6, 4, 80);
    b.fig('p1', 0, [[4, 1], [3, 1], [1, 1], [0, 2]], A_AEO, 1, 0.4, { duty: 1 });
    b.n('tri', 0, 45, 5, 0.45);
    return b.out({ still: true });
  },
  candle: () => {
    const b = new B(4, 4, 90);
    b.n('air', 0, 64, 3, 0.4, { bend: -2 });
    b.n('bell', 0, 76, 2.5, 0.25);
    return b.out({ still: true });
  },
  coin: () => {
    const b = new B(3, 4, 140);
    for (let k = 0; k < 6; k++) b.n('p1', k * 0.25, k % 2 ? 84 : 88, 0.2, 0.25, { duty: 0 });
    b.n('bell', 1.75, 91, 1.2, 0.3);
    return b.out({ still: true });
  },
  relic: () => {
    const b = new B(4, 4, 110);
    b.n('bell', 0, 72, 2, 0.3);
    b.n('bell', 0.5, 79, 2, 0.28);
    b.n('bell', 1, 84, 2.5, 0.26);
    return b.out({ still: true });
  },
  blessed: () => {
    const b = new B(8, 4, 70);
    KING.forEach((d, i) => chord(C, d, 3).forEach((p) => b.n('bell', i * 1.5, fold(p, 67), 2, 0.22)));
    b.n('air', 0, 60, 6.5, 0.3, { a: 0.4 });
    return b.out({ still: true });
  },
};
