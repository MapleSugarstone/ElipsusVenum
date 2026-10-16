// The void behind every screen: dithered fog at a quarter of the window's resolution, and small puddles of other
// realities floating in it. Each puddle paints its own little world with a few colors and dissolves into the void
// through an ordered dither. Edges boil a few times a second, like clay between frames.

import { ART, grid } from './grid.ts';

export const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Picks from a ramp by a 0 to 1 value, dithering between neighbors so only ramp colors appear. */
export function ramp(colors: RGB[], v: number, th: number): RGB {
  const x = Math.max(0, Math.min(0.9999, v)) * (colors.length - 1);
  const i = Math.floor(x);
  return colors[Math.min(colors.length - 1, i + (x - i > th ? 1 : 0))];
}

// ---------------------------------------------------------------- noise

function hash2(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x: number, y: number, s = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------------------------------------------------------------- genres

/** A painter returns a color for local coordinates u and v in -1..1, at time t, with the pixel's dither threshold. */
type Painter = (u: number, v: number, t: number, th: number, seed: number) => RGB;

const R = (...hs: string[]) => hs.map(hex);
/** Fog ramps in hue order around a loop, so the fog can shift through them like mother-of-pearl. */
const OPAL = [
  R('#060801', '#150a14', '#2c1529', '#4c2644', '#7e4f70'),
  R('#060801', '#0e0a1c', '#1f1739', '#372b60', '#625092'),
  R('#060801', '#08131a', '#102a33', '#1d4652', '#3a7682'),
  R('#060801', '#0a1410', '#15291f', '#264535', '#4b7860'),
  R('#060801', '#13110a', '#29251a', '#45402e', '#78705a'),
  R('#060801', '#150c09', '#2c1a13', '#4c3024', '#7e5844'),
];

export const GENRES: Record<string, Painter> = {
  meadow(u, v, _t, th) {
    const horizon = 0.15 + 0.12 * Math.sin(u * 3.1);
    if (v < horizon) {
      if (Math.abs(u - 0.05) < 0.16 && v > horizon - 0.38 && (v > horizon - 0.3 || Math.floor((u + 1) * 18) % 2 === 0)) return hex('#2b1f3d');
      return ramp(R('#3cc8ff', '#8ff3ff', '#e9ffd9'), (v + 1) / (horizon + 1), th);
    }
    return ramp(R('#1d5a24', '#37a83a', '#9be33a', '#e8ff6a'), 1 - (v - horizon) * 0.9 + 0.15 * Math.sin(u * 9), th);
  },
  neon(u, v, t, th) {
    if (v < 0) {
      const d = Math.hypot(u, v + 0.05);
      if (d < 0.45 && Math.floor((v + 1) * 20) % 3 !== 0) return ramp(R('#ff2fa6', '#ffb02e', '#fff36b'), 1 - (v + 0.45) / 0.45, th);
      return ramp(R('#12021f', '#2a0640', '#4b0b5e'), (v + 1) * 0.8, th);
    }
    const z = 1 / (v + 0.06);
    const gx = Math.abs(((u * z * 0.7) % 1) + 1) % 1;
    const gz = (z * 0.6 + t * 0.6) % 1;
    if (gx < 0.08 || gz < 0.1) return hex('#ff2fa6');
    return hex('#12021f');
  },
  desert(u, v, _t, th) {
    if (Math.abs(u + 0.35) < 0.05 && v > -0.25 && v < 0.5) return hex('#1f3d1b');
    if (Math.abs(u + 0.35) < 0.2 && Math.abs(v + 0.05) < 0.04 && Math.abs(u + 0.35) > 0.04) return hex('#1f3d1b');
    if (Math.hypot(u - 0.35, v + 0.45) < 0.22) return hex('#fff36b');
    if (v < 0.25 + 0.08 * Math.sin(u * 4)) return ramp(R('#ff5a1f', '#ff9b2e', '#ffd36b'), (v + 1) / 1.3, th);
    return ramp(R('#a8541c', '#d98a3a', '#f5c16b'), 1 - (v - 0.25) + 0.2 * Math.sin(u * 7 + v * 3), th);
  },
  ocean(u, v, t, th) {
    if (Math.hypot(u + 0.4, v + 0.5) < 0.16) return hex('#e9ffd9');
    if (v < -0.05) return ramp(R('#050a24', '#0d1e4a', '#1d3a7a'), (v + 1) * 0.9, th);
    const w = Math.sin(u * 14 + t * 2 + v * 20) * 0.5 + 0.5;
    return ramp(R('#0a1838', '#1a3a78', '#3cc8ff', '#e9ffd9'), w * (0.35 + v * 0.4), th);
  },
  office(u, v, _t, th) {
    if (u > -0.45 && u < 0.25 && v > -0.6 && v < 0.05) {
      if (Math.abs(u + 0.1) < 0.03 || Math.abs(v + 0.28) < 0.03) return hex('#d9d2bd');
      return ramp(R('#2f8fd8', '#8fd8ff'), (v + 0.6) / 0.65, th);
    }
    if (v > 0.35) return ramp(R('#4a3b28', '#6e5a3c'), (u + 1) / 2, th);
    return ramp(R('#b8ae86', '#d9cfa3', '#efe6bf'), 0.6 + 0.3 * vnoise(u * 4, v * 4, 3), th);
  },
  space(u, v, _t, th, seed) {
    const p = Math.hypot(u - 0.15, v - 0.1);
    if (Math.abs((v - 0.1) * 3.2 - (u - 0.15) * 0.8) < 0.07 && p < 0.75 && p > 0.42) return hex('#d0beff');
    if (p < 0.4) return ramp(R('#2a1f45', '#6b3fa0', '#c86bff', '#ffd0ff'), 1 - Math.hypot(u + 0.1, v - 0.05) * 1.6, th);
    return hash2(Math.floor(u * 40), Math.floor(v * 40), seed) > 0.97 ? hex('#ebf1e4') : hex('#030406');
  },
  crayon(u, v, t, th) {
    const sun = Math.hypot(u - 0.4, v + 0.45);
    const ray = Math.abs(Math.sin(Math.atan2(v + 0.45, u - 0.4) * 6 + t));
    if (sun < 0.18 || (sun < 0.32 && ray > 0.92)) return hex('#ffd800');
    if (Math.abs(u + 0.3) < 0.03 && v > -0.1 && v < 0.35) return hex('#141414');
    if (Math.hypot(u + 0.3, v + 0.2) < 0.1 && Math.hypot(u + 0.3, v + 0.2) > 0.06) return hex('#141414');
    if (v > 0.45 && hash2(Math.floor(u * 30), Math.floor(v * 12), 9) > 0.35) return hex('#34c22e');
    return th > 0.97 ? hex('#cfc6a8') : hex('#f4efe0');
  },
  forest(u, v, t, th, seed) {
    const trunk = Math.abs(((u * 3 + 10) % 1) - 0.5) < 0.09 + 0.04 * Math.sin(v * 5);
    if (Math.abs(u - 0.05) < 0.1 && Math.abs(v - 0.05) < 0.03 && Math.abs(u - 0.05) > 0.04 && Math.sin(t * 0.7 + seed) > -0.6) return hex('#ff2a1f');
    if (trunk) return ramp(R('#020302', '#0c140a'), (v + 1) / 2, th);
    return ramp(R('#020302', '#0b1a0e', '#173826', '#2f5e3d'), 0.6 - v * 0.4 + 0.25 * vnoise(u * 3, v * 3 + t * 0.2, 4), th);
  },
  flesh(u, v, t, th) {
    const n = vnoise(u * 5 + t * 0.15, v * 5, 7);
    if (Math.abs(n - 0.5) < 0.035) return hex('#3a0613');
    return ramp(R('#6b0f24', '#c23a4f', '#ff7a8a', '#ffd0d6'), n * 0.9 + 0.1 * Math.sin(t * 2), th);
  },
  glitch(u, v, t, _th, seed) {
    const bx = Math.floor((u + 1) * 6);
    const by = Math.floor((v + 1) * 9);
    const step = Math.floor(t * 2);
    const h = hash2(bx + step, by, seed);
    const cols = R('#00ff9c', '#d0beff', '#ff2fa6', '#060801', '#d4ba00');
    if (h > 0.55) return cols[Math.floor(hash2(bx, by + step, seed + 1) * cols.length)];
    return hash2(Math.floor((u + 1) * 40), Math.floor((v + 1) * 40) + step, seed) > 0.5 ? hex('#0e1105') : hex('#16190d');
  },
  snow(u, v, t, th, seed) {
    const flake = hash2(Math.floor((u + 1) * 24), Math.floor((v + 1) * 24 - t * 3), seed);
    if (flake > 0.94) return hex('#ffffff');
    if (v > 0.3) return ramp(R('#a8b4c8', '#dfe8f5', '#ffffff'), 0.7 - (v - 0.3) * 0.5, th);
    return ramp(R('#3d4658', '#6e7a90', '#a8b4c8'), (v + 1) / 1.3, th);
  },
  dungeon(u, v, t, th) {
    const row = Math.floor((v + 1) * 6);
    const brick = (u + 1) * 5 + (row % 2) * 0.5;
    const mortar = (v + 1) * 6 - row < 0.12 || brick - Math.floor(brick) < 0.08;
    const torch = Math.max(0, 1 - Math.hypot(u + 0.3, v + 0.1) * 1.4) * (0.85 + 0.15 * Math.sin(t * 3));
    if (mortar) return ramp(R('#0c0a08', '#2a2018'), torch, th);
    return ramp(R('#1a1410', '#4a3524', '#8a5a34', '#e09a4a'), torch * 0.9 + 0.1, th);
  },
  table(u, v, t, th) {
    const plank = Math.floor((v + 1) * 4.5);
    const grain = vnoise(u * 9, (v + 1) * 4.5 * 3 + plank * 13, 21);
    const seam = (v + 1) * 4.5 - plank < 0.04;
    const glowL = Math.max(0, 1 - Math.hypot((u + 0.97) * 1.6, v * 0.9)) * (0.92 + 0.08 * Math.sin(t * 2.3));
    const glowR = Math.max(0, 1 - Math.hypot((u - 0.97) * 1.6, v * 0.9)) * (0.92 + 0.08 * Math.sin(t * 2.7 + 1));
    const light = 0.22 + 0.7 * Math.max(glowL, glowR) + 0.12 * grain;
    if (seam) return ramp(R('#030302', '#120d07'), light, th);
    return ramp(R('#050403', '#160f08', '#2b1d10', '#4e3218', '#7a4f22'), light, th);
  },
};

// ---------------------------------------------------------------- puddles

export interface Puddle {
  genre: string;
  /** Center and radius in stage pixels (the 1600 by 900 design frame). */
  x: number;
  y: number;
  r: number;
  /** Width stretch, for oval puddles such as the table. */
  sx?: number;
  seed: number;
  drift?: number;
  wobble?: number;
}

export type VoidMode = 'title' | 'map' | 'battle' | 'node' | 'event' | 'menu';

/** Each kind of map node is a puddle of one genre. Events each get their own, since every event is a different reality. */
const NODE_GENRE: Record<string, string> = {
  battle: 'dungeon', elite: 'flesh', boss: 'glitch', rest: 'meadow', merchant: 'office', treasure: 'space',
  cards: 'crayon', mycologist: 'forest', stones: 'desert', woodcarver: 'snow',
};
const EVENT_GENRES = ['neon', 'ocean', 'crayon', 'space', 'snow', 'flesh', 'desert', 'meadow'];
export function nodeGenre(kind: string, id: number): string {
  return NODE_GENRE[kind] ?? EVENT_GENRES[id % EVENT_GENRES.length];
}

function layout(mode: VoidMode, seed: number, feature: string): Puddle[] {
  const pick = (i: number) => {
    const names = ['meadow', 'neon', 'desert', 'ocean', 'office', 'space', 'crayon', 'forest', 'flesh', 'glitch', 'snow', 'dungeon'];
    return names[(seed + i * 7) % names.length];
  };
  switch (mode) {
    case 'battle':
      return [
        { genre: 'table', x: 800, y: 330, r: 330, sx: 2.45, seed: 1, wobble: 0.035 },
        { genre: pick(1), x: 70, y: 790, r: 46, seed: 2, drift: 1 },
        { genre: pick(2), x: 1540, y: 120, r: 38, seed: 3, drift: 1 },
        { genre: pick(3), x: 1500, y: 820, r: 30, seed: 4, drift: 1 },
      ];
    case 'map':
      // The node field fills 110..1490 by 118..670 and the plates sit in the bottom corners, so puddles keep to the gaps.
      return [
        { genre: pick(0), x: 800, y: 856, r: 38, seed: 1, drift: 1 },
        { genre: pick(1), x: 560, y: 800, r: 26, seed: 2, drift: 1 },
        { genre: pick(2), x: 1060, y: 812, r: 30, seed: 3, drift: 1 },
        { genre: pick(3), x: 36, y: 560, r: 28, seed: 4, drift: 1 },
        { genre: pick(4), x: 1566, y: 700, r: 26, seed: 5, drift: 1 },
      ];
    case 'title':
      return [
        { genre: 'crayon', x: 330, y: 220, r: 120, seed: 1, drift: 1 },
        { genre: 'neon', x: 1260, y: 170, r: 90, seed: 2, drift: 1 },
        { genre: 'flesh', x: 1420, y: 700, r: 110, seed: 3, drift: 1 },
        { genre: 'meadow', x: 210, y: 720, r: 80, seed: 4, drift: 1 },
        { genre: 'glitch', x: 780, y: 820, r: 50, seed: 5, drift: 1 },
        { genre: 'space', x: 860, y: 90, r: 44, seed: 6, drift: 1 },
        { genre: 'ocean', x: 1000, y: 560, r: 36, seed: 7, drift: 1 },
      ];
    case 'event':
      // The event box fills the left half, so the event's own reality fills the right.
      return [
        { genre: feature, x: 1200, y: 420, r: 230, seed: 6, drift: 1, wobble: 0.1 },
        { genre: pick(6), x: 520, y: 716, r: 28, seed: 2, drift: 1 },
        { genre: pick(8), x: 28, y: 430, r: 22, seed: 4, drift: 1 },
      ];
    case 'node':
      // The columns fill the top band and the plates sit in the bottom corners, so the node's own reality sits between them.
      return [
        { genre: feature, x: 800, y: 730, r: 120, seed: 6, drift: 1, wobble: 0.1 },
        { genre: pick(7), x: 450, y: 700, r: 28, seed: 3, drift: 1 },
        { genre: pick(8), x: 28, y: 430, r: 22, seed: 4, drift: 1 },
        { genre: pick(9), x: 1578, y: 470, r: 20, seed: 5, drift: 1 },
      ];
    default:
      // Menus keep to the top-left quarter and the middle band.
      return [
        { genre: pick(5), x: 1250, y: 560, r: 150, seed: 1, drift: 1, wobble: 0.1 },
        { genre: pick(6), x: 140, y: 800, r: 60, seed: 2, drift: 1 },
        { genre: pick(7), x: 1520, y: 110, r: 44, seed: 3, drift: 1 },
        { genre: pick(8), x: 640, y: 820, r: 30, seed: 4, drift: 1 },
      ];
  }
}

// ---------------------------------------------------------------- apparitions

/** Abstract shapes that dissolve into the void, drift for a few seconds, and dissolve out again. */
type ShapeKind = 'shard' | 'ring' | 'outline' | 'lens' | 'lattice' | 'bars' | 'spiral';
const SHAPES: ShapeKind[] = ['shard', 'shard', 'ring', 'outline', 'lens', 'lattice', 'bars', 'spiral'];

interface Apparition {
  kind: ShapeKind;
  /** Center and radius in stage units. */
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  born: number;
  life: number;
  ramp: RGB[];
  seed: number;
  /** Flickers whole into and out of existence instead of dissolving. */
  pop: boolean;
  /** Shard outline, in the unit circle. */
  verts: [number, number][];
  sides: number;
  /** A shard that holds a glimpse of another reality. */
  genre: string | null;
}

const SHAPE_RAMPS = [
  R('#3a3000', '#a08410', '#d4ba00', '#fff36b'),
  R('#1b1430', '#4b2a7a', '#8a5ad0', '#d0beff'),
  R('#2a2620', '#6e6858', '#b8b09a', '#ebf1e4'),
  R('#2a0606', '#6b140e', '#c23a2a', '#ff7a5e'),
  R('#062420', '#0f5a50', '#2fb8a0', '#9effe6'),
];

/** Stage areas that hold the interface on each screen. Shapes never appear over them. */
const BUSY: Record<VoidMode, [number, number, number, number][]> = {
  title: [[100, 260, 1260, 650]],
  map: [[0, 0, 1600, 70], [60, 70, 1540, 710], [0, 700, 400, 900], [1200, 700, 1600, 900]],
  battle: [[0, 0, 1600, 900]],
  node: [[0, 0, 1600, 620], [0, 700, 400, 900], [1200, 700, 1600, 900]],
  event: [[0, 0, 1600, 70], [0, 0, 1000, 560], [0, 700, 400, 900], [1200, 700, 1600, 900]],
  menu: [[60, 90, 1500, 580], [0, 700, 400, 900], [1200, 700, 1600, 900]],
};
const MAX_SHAPES: Record<VoidMode, number> = { title: 6, map: 3, battle: 2, node: 4, event: 4, menu: 5 };

/** Signed distance from a point to a polygon, positive inside. */
function polyDist(vs: [number, number][], u: number, v: number): number {
  let best = Infinity;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const [ax, ay] = vs[j];
    const [bx, by] = vs[i];
    if (ay > v !== by > v && u < ((bx - ax) * (v - ay)) / (by - ay) + ax) inside = !inside;
    const ex = bx - ax;
    const ey = by - ay;
    const k = Math.max(0, Math.min(1, ((u - ax) * ex + (v - ay) * ey) / (ex * ex + ey * ey)));
    best = Math.min(best, Math.hypot(u - ax - ex * k, v - ay - ey * k));
  }
  return inside ? best : -best;
}

const EMPTY = -1;
const BODY = 0;
const BRIGHT = 1;
const DARK = 2;

/**
 * What a shape shows at local point u, v (the unit circle, already rotated). `pw` is one art pixel in local units, so
 * lines stay one or two pixels thick at any size. `look` points from the shape toward the cursor.
 */
function shapeAt(a: Apparition, u: number, v: number, pw: number, t: number, look: [number, number]): number {
  switch (a.kind) {
    case 'shard': {
      const sd = polyDist(a.verts, u, v);
      if (sd < 0) return EMPTY;
      return sd < pw * 1.2 ? BRIGHT : BODY;
    }
    case 'ring': {
      const d = Math.abs(Math.hypot(u, v) - 0.76);
      if (d > 0.17) return EMPTY;
      const seg = Math.floor(((Math.atan2(v, u) + Math.PI) / (Math.PI * 2)) * 11);
      if (hash2(seg, Math.floor(t * 1.5), a.seed) < 0.28) return EMPTY;
      return d > 0.17 - pw * 1.2 ? DARK : BODY;
    }
    case 'outline': {
      const sector = (Math.PI * 2) / a.sides;
      const ang = Math.atan2(v, u);
      const local = (((ang % sector) + sector) % sector) - sector / 2;
      const edge = Math.hypot(u, v) * Math.cos(local) - Math.cos(sector / 2) * 0.92;
      return Math.abs(edge) < pw * 1.1 ? BRIGHT : EMPTY;
    }
    case 'lens': {
      // Two arcs make an almond. It blinks now and then, and its dot turns toward the cursor.
      const blink = hash2(Math.floor(t * 2), 0, a.seed) > 0.93 ? 0.15 : 1;
      const vv = v / blink;
      const outer = Math.min(1 - Math.hypot(u, vv - 0.6), 1 - Math.hypot(u, vv + 0.6));
      if (outer < 0) return EMPTY;
      if (outer < pw * 1.2) return DARK;
      const dot = Math.hypot(u - look[0] * 0.32, vv - look[1] * 0.18);
      if (dot < 0.13) return DARK;
      return dot < 0.3 ? BODY : BRIGHT;
    }
    case 'lattice': {
      if (Math.abs(u) > 0.68 || Math.abs(v) > 0.68) return EMPTY;
      const fu = ((u + 0.68) * 4.4) % 1;
      const fv = ((v + 0.68) * 4.4) % 1;
      const lw = pw * 4.4 * 1.1;
      if (fu < lw || fv < lw) return (Math.floor((u + 0.68) * 4.4) + Math.floor((v + 0.68) * 4.4)) % 3 === 0 ? BRIGHT : BODY;
      return EMPTY;
    }
    case 'bars': {
      const row = Math.floor((v + 0.8) / 0.2);
      if (row < 0 || row > 7 || ((v + 0.8) / 0.2) % 1 < pw * 5) return EMPTY;
      const len = hash2(row, Math.floor(t * 3), a.seed);
      if (Math.abs(u + 0.9 - len) > len) return EMPTY;
      return hash2(row, 7, a.seed) > 0.75 ? BRIGHT : BODY;
    }
    case 'spiral': {
      const d = Math.hypot(u, v);
      if (d > 0.95) return EMPTY;
      const s = d * 3.2 - Math.atan2(v, u) / (Math.PI * 2) - t * 0.25;
      return ((s % 1) + 1) % 1 < pw * 3.2 * 1.4 ? BODY : EMPTY;
    }
  }
}

function makeShard(seed: number): [number, number][] {
  const n = 4 + Math.floor(hash2(seed, 1, 9) * 4);
  const vs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const ang = ((i + hash2(seed, i, 10) * 0.6) / n) * Math.PI * 2;
    // One or two points reach out to the rim, so every shard has a sharp end.
    const rad = i === 0 || hash2(seed, i, 12) > 0.8 ? 0.96 : 0.4 + hash2(seed, i, 11) * 0.45;
    vs.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
  }
  return vs;
}

/** Sizes and places a full-window canvas so each of its pixels is one art pixel, aligned to the stage. */
export function fitToGrid(canvas: HTMLCanvasElement): { w: number; h: number; ox: number; oy: number } {
  const p = grid.px;
  const ox = Math.ceil(grid.left / p);
  const oy = Math.ceil(grid.top / p);
  const w = ox + Math.ceil((window.innerWidth - grid.left) / p);
  const h = oy + Math.ceil((window.innerHeight - grid.top) / p);
  canvas.width = w;
  canvas.height = h;
  const st = canvas.style;
  st.left = `${grid.left - ox * p}px`;
  st.top = `${grid.top - oy * p}px`;
  st.width = `${w * p}px`;
  st.height = `${h * p}px`;
  return { w, h, ox, oy };
}

export class VoidRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData | null = null;
  private w = 0;
  private h = 0;
  /** The canvas pixel under the stage's top-left corner. */
  private ox = 0;
  private oy = 0;
  private puddles: Puddle[] = [];
  private mode: VoidMode = 'title';
  private timer: ReturnType<typeof setInterval> | null = null;
  private t0 = performance.now();
  private boilSeed = 0;
  private seed = 1;
  private feature = '';
  private lastBoil = 0;
  private shapes: Apparition[] = [];
  private frame = 0;
  /** The cursor in stage units, for shapes that turn toward it. */
  private look: [number, number] = [800, 450];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'void';
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    document.body.prepend(this.canvas);
    window.addEventListener('mousemove', (e) => (this.look = [(e.clientX - grid.left) / grid.s, (e.clientY - grid.top) / grid.s]));
    this.resize();
    // Eight frames a second reads as stop motion and keeps the cost low.
    this.timer = setInterval(() => this.draw(), 125);
  }

  setMode(mode: VoidMode, seed = this.seed, feature = 'glitch'): void {
    if (mode === this.mode && seed === this.seed && feature === this.feature && this.puddles.length) return;
    this.mode = mode;
    this.seed = seed;
    this.feature = feature;
    this.puddles = layout(mode, seed, feature);
    this.shapes = [];
    this.draw();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  resize(): void {
    const f = fitToGrid(this.canvas);
    this.w = f.w;
    this.h = f.h;
    this.ox = f.ox;
    this.oy = f.oy;
    this.img = this.ctx.createImageData(this.w, this.h);
    this.draw();
  }

  /** Maps a stage point to void pixels. */
  private toVoid(x: number, y: number): [number, number, number] {
    return [x / ART + this.ox, y / ART + this.oy, 1 / ART];
  }

  private draw(): void {
    if (!this.img || document.hidden) return;
    const t = (performance.now() - this.t0) / 1000;
    if (t - this.lastBoil > 0.16) {
      this.lastBoil = t;
      this.boilSeed = (this.boilSeed + 1) % 3;
    }
    const { w, h, ox, oy } = this;
    const d = this.img.data;
    // Fog density and hue, computed on a coarse grid in stage-aligned coordinates and blended per pixel with a smooth
    // curve, since linear blending leaves straight creases along the grid. Ridged noise adds thin tendrils.
    const cell = 3;
    const gw = Math.ceil(w / cell) + 2;
    const gh = Math.ceil(h / cell) + 2;
    const dens = new Float32Array(gw * gh);
    const hue = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const x = gx * cell - ox;
        const y = gy * cell - oy;
        const n = vnoise(x * 0.011 + t * 0.04, y * 0.011 - t * 0.01, 1) * 0.78 + vnoise(x * 0.03 - t * 0.05, y * 0.03 + t * 0.02, 2) * 0.22;
        const ridge = 1 - Math.abs(vnoise(x * 0.022 + t * 0.03, y * 0.022 - t * 0.02, 3) * 2 - 1);
        // The fog thins behind the interface so text and lines keep their contrast. The falloff is wide and broken up by
        // noise, so no rectangle shows.
        let away = Infinity;
        for (const [x0, y0, x1, y1] of BUSY[this.mode]) {
          away = Math.min(away, Math.hypot(Math.max(x0 - x * ART, 0, x * ART - x1), Math.max(y0 - y * ART, 0, y * ART - y1)));
        }
        const calm = 0.5 + 0.5 * Math.max(0, Math.min(1, (away - 30 + (vnoise(x * 0.04, y * 0.04, 5) - 0.5) * 140) / 160));
        dens[gy * gw + gx] = (Math.max(0, n - 0.28) * 1.45 + ridge ** 10 * 0.3) * calm;
        hue[gy * gw + gx] = vnoise(x * 0.005 - t * 0.012, y * 0.005 + t * 0.006, 4);
      }
    }
    const lerp = (f: Float32Array, i: number, fx: number, fy: number) =>
      (f[i] + (f[i + 1] - f[i]) * fx) * (1 - fy) + (f[i + gw] + (f[i + gw + 1] - f[i + gw]) * fx) * fy;
    const ease = (f: number) => f * f * (3 - 2 * f);
    for (let y = 0; y < h; y++) {
      const gy = Math.floor(y / cell);
      const fy = ease((y % cell) / cell);
      for (let x = 0; x < w; x++) {
        const gx = Math.floor(x / cell);
        const fx = ease((x % cell) / cell);
        const gi = gy * gw + gx;
        const th = BAYER[(y - oy) & 3][(x - ox) & 3];
        const v = lerp(dens, gi, fx, fy);
        // Hue follows density as well as position, so bands of color trace the fog's contours like a thin film.
        const loop = ((lerp(hue, gi, fx, fy) * 1.2 + v * 0.9 + ((x - ox) + (y - oy)) * 0.001 + 4) % 1) * OPAL.length;
        const band = Math.floor(loop);
        let col = ramp(OPAL[(band + (loop - band > 1 - th ? 1 : 0)) % OPAL.length], v, th);
        if (hash2(x - ox, y - oy, 77) > 0.9985) col = hash2(x - ox, y - oy, 78) > 0.5 ? [208, 190, 255] : [235, 241, 228];
        const i = (y * w + x) * 4;
        d[i] = col[0];
        d[i + 1] = col[1];
        d[i + 2] = col[2];
        d[i + 3] = 255;
      }
    }
    for (const p of this.puddles) this.paintPuddle(p, t);
    this.frame += 1;
    this.shapes = this.shapes.filter((s) => t - s.born < s.life);
    if (this.shapes.length < MAX_SHAPES[this.mode] && Math.random() < 0.12) this.spawn(t);
    for (const s of this.shapes) this.paintShape(s, t);
    this.ctx.putImageData(this.img, 0, 0);
  }

  /** Tries a few spots in the visible window for a new shape, clear of the interface, the puddles, and other shapes. */
  private spawn(t: number): void {
    const kind = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const small = kind === 'shard' || kind === 'ring' || kind === 'outline';
    const r = (small ? 12 : 26) + Math.random() ** 2 * 50;
    const vx = (Math.random() - 0.5) * 8;
    const vy = (Math.random() - 0.5) * 8;
    const life = 4 + Math.random() * 5;
    const reach = r + 30;
    const left = -grid.left / grid.s;
    const top = -grid.top / grid.s;
    const right = (window.innerWidth - grid.left) / grid.s;
    const bottom = (window.innerHeight - grid.top) / grid.s;
    for (let tries = 0; tries < 14; tries++) {
      const x = left + reach + Math.random() * (right - left - reach * 2);
      const y = top + reach + Math.random() * (bottom - top - reach * 2);
      if (BUSY[this.mode].some(([x0, y0, x1, y1]) => x > x0 - reach && x < x1 + reach && y > y0 - reach && y < y1 + reach)) continue;
      if (this.puddles.some((p) => Math.hypot(x - p.x, y - p.y) < p.r * (p.sx ?? 1) * 1.25 + reach)) continue;
      if (this.shapes.some((s) => Math.hypot(x - s.x, y - s.y) < s.r + reach + 20)) continue;
      const seed = Math.floor(Math.random() * 100000);
      this.shapes.push({
        kind, x, y, r, vx, vy, life, seed,
        rot: Math.random() * Math.PI * 2,
        spin: kind === 'lens' || kind === 'bars' ? 0 : (Math.random() - 0.5) * 0.5,
        born: t,
        ramp: SHAPE_RAMPS[Math.floor(Math.random() * SHAPE_RAMPS.length)],
        pop: Math.random() < 0.3,
        verts: makeShard(seed),
        sides: 3 + Math.floor(Math.random() * 4),
        genre: kind === 'shard' && r > 30 && Math.random() < 0.4 ? Object.keys(GENRES)[seed % Object.keys(GENRES).length] : null,
      });
      return;
    }
  }

  private paintShape(a: Apparition, t: number): void {
    const age = t - a.born;
    const fade = 0.9;
    const alpha = Math.min(1, age / fade, (a.life - age) / fade);
    if (alpha <= 0) return;
    let shown = alpha;
    if (a.pop) {
      // Popping shapes blink whole while they arrive and leave.
      if (alpha < 1 && hash2(this.frame, a.seed, 3) > alpha) return;
      shown = 1;
    }
    const grow = a.pop ? 1 : 0.8 + 0.2 * Math.min(1, age / fade);
    const px = a.x + a.vx * age;
    const py = a.y + a.vy * age;
    const [cx, cy] = this.toVoid(px, py);
    const rpx = (a.r * grow) / ART;
    const reach = Math.ceil(rpx * 1.45);
    const rot = a.rot + a.spin * age;
    const cs = Math.cos(-rot);
    const sn = Math.sin(-rot);
    const lx = this.look[0] - px;
    const ly = this.look[1] - py;
    const ll = Math.hypot(lx, ly) || 1;
    const look: [number, number] = [((lx * cs - ly * sn) / ll), ((lx * sn + ly * cs) / ll)];
    const pw = 1 / rpx;
    const painter = a.genre ? GENRES[a.genre] : null;
    const d = this.img!.data;
    const x0 = Math.max(0, Math.floor(cx - reach));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + reach));
    const y0 = Math.max(0, Math.floor(cy - reach));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + reach));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const th = BAYER[(y - this.oy) & 3][(x - this.ox) & 3];
        if (th >= shown) continue;
        const sx = (x - cx) / rpx;
        const sy = (y - cy) / rpx;
        const u = sx * cs - sy * sn;
        const v = sx * sn + sy * cs;
        const k = shapeAt(a, u, v, pw, t, look);
        if (k === EMPTY) continue;
        const col =
          k === BRIGHT ? a.ramp[a.ramp.length - 1]
          : k === DARK ? a.ramp[0]
          : painter ? painter(u, v, t, th, a.seed)
          : ramp(a.ramp, 0.55 - 0.22 * (sx + sy), th);
        const i = (y * this.w + x) * 4;
        d[i] = col[0];
        d[i + 1] = col[1];
        d[i + 2] = col[2];
      }
    }
  }

  private paintPuddle(p: Puddle, t: number): void {
    const d = this.img!.data;
    const dx = p.drift ? Math.sin(t * 0.07 + p.seed) * 6 : 0;
    const dy = p.drift ? Math.cos(t * 0.05 + p.seed * 2) * 5 : 0;
    const [cx, cy, s] = this.toVoid(p.x + dx, p.y + dy);
    const r = p.r * s;
    const sx = p.sx ?? 1;
    const painter = GENRES[p.genre] ?? GENRES.glitch;
    const wob = p.wobble ?? 0.14;
    const x0 = Math.max(0, Math.floor(cx - r * sx * 1.2));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r * sx * 1.2));
    const y0 = Math.max(0, Math.floor(cy - r * 1.2));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r * 1.2));
    const edgeBand = Math.max(2, r * 0.12);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const ux = (x - cx) / (r * sx);
        const uy = (y - cy) / r;
        const dist = Math.hypot(ux, uy);
        if (dist > 1.25) continue;
        const ang = Math.atan2(uy, ux);
        const edge = 1 + wob * (vnoise(Math.cos(ang) * 2 + 5, Math.sin(ang) * 2 + 5 + this.boilSeed * 0.35, p.seed) - 0.5) * 2;
        const th = BAYER[(y - this.oy) & 3][(x - this.ox) & 3];
        const inside = (edge - dist) * r / edgeBand;
        if (inside < 0) continue;
        if (inside < 1 && th > inside) continue;
        const col = painter(ux / edge, uy / edge, t, th, p.seed);
        const i = (y * this.w + x) * 4;
        d[i] = col[0];
        d[i + 1] = col[1];
        d[i + 2] = col[2];
      }
    }
  }
}

/** A small painting of one genre, for map nodes and decorations. */
export function genreTile(genre: string, size: number, seed = 1, t = 0): string {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const painter = GENRES[genre] ?? GENRES.glitch;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / (size - 1)) * 2 - 1;
      const v = (y / (size - 1)) * 2 - 1;
      const col = painter(u, v, t, BAYER[y & 3][x & 3], seed);
      const i = (y * size + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

/** Static film grain as a data URL, for a faint overlay that gives flat surfaces some grit. */
export function grainTexture(size = 160): string {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = hash2(i % size, Math.floor(i / size), 5) * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

/** A tiny two-color ordered-dither tile as a data URL, for button and panel fills. `share` is how much of the tile takes the second color. */
export function ditherFill(a: string, b: string, share = 0.5): string {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 4;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      ctx.fillStyle = BAYER[y][x] < share ? b : a;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c.toDataURL();
}
