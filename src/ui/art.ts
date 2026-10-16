import { card as cardDef, type CardDef } from '../engine/registry.ts';
import { BAYER, GENRES, SCENES } from './void.ts';
import { subjectFor, type Mat, type Pen } from './subjects.ts';

const W = 64;
const H = 48;
const cache = new Map<string, string>();

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const R = (...hs: string[]) => hs.map(hex);

/** Clay ramps, dark to light, one per tribe and pool. */
const CLAY: Record<string, RGB[]> = {
  Canine: R('#2a1208', '#6b2f14', '#b85a24', '#f09a4a', '#ffd9a0'),
  Avian: R('#08202a', '#145a6b', '#24a8b8', '#6ff0e6', '#e0fff8'),
  Insect: R('#102008', '#2f5e12', '#6bb324', '#c8f04a', '#f6ffb0'),
  Hooved: R('#241a08', '#5e4314', '#a8792a', '#e6c25a', '#fff0b0'),
  Reptile: R('#06200f', '#12552a', '#22a050', '#6ff08a', '#d0ffd8'),
  Machine: R('#141026', '#3a3366', '#7a70c0', '#c0b8ff', '#f0ecff'),
  none: R('#1a0f24', '#4a2a5e', '#9a5ab0', '#e09ae8', '#ffe0ff'),
  enemy: R('#1a0606', '#5a1414', '#a02a2a', '#e86048', '#ffc0a0'),
  blue: R('#060a24', '#142c6b', '#2f62c8', '#7aa7ff', '#dce8ff'),
  pistachio: R('#081a06', '#24500f', '#4f9a1f', '#a6e34a', '#ecffc0'),
  spell: R('#1a1406', '#4a3a0a', '#a08410', '#d4ba00', '#fff6a0'),
};

const BACKDROPS = SCENES;

function silhouette(ctx: CanvasRenderingContext2D, def: CardDef, r: () => number): void {
  const tribe = def.tribe ?? '';
  const cx = 32 + (r() - 0.5) * 6;
  const cy = 28 + (r() - 0.5) * 4;
  const ell = (x: number, y: number, rx: number, ry: number, rot = 0) => {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), rot, 0, Math.PI * 2);
    ctx.fill();
  };
  const leg = (x: number, y: number, len: number, w = 3) => ell(x, y + len / 2, w / 2, len / 2);
  if (def.kind === 'spell') {
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r();
      ctx.beginPath();
      ctx.moveTo(32 + Math.cos(a) * 6, 24 + Math.sin(a) * 6);
      ctx.lineTo(32 + Math.cos(a) * 19, 24 + Math.sin(a) * 16);
      ctx.stroke();
    }
    ell(32, 24, 8 + r() * 4, 8 + r() * 3);
    if (def.tags.includes('knife')) {
      ctx.beginPath();
      ctx.moveTo(12, 40);
      ctx.lineTo(50, 8);
      ctx.lineTo(46, 18);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  const big = 1 + Math.min(def.health, 14) / 22;
  switch (tribe) {
    case 'Avian':
      ell(cx, cy, 10 * big, 7 * big);
      ell(cx + 10, cy - 6, 5, 5);
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 2);
      ctx.quadraticCurveTo(cx - 14, cy - 20, cx - 24 * big, cy - 12 - r() * 6);
      ctx.lineTo(cx + 4, cy + 2);
      ctx.fill();
      leg(cx - 2, cy + 5, 8, 2);
      leg(cx + 3, cy + 5, 8, 2);
      break;
    case 'Insect':
      for (let i = 0; i < 3; i++) ell(cx - 10 + i * 10, cy, 6 * big, 5 * big);
      for (let i = 0; i < 3; i++) leg(cx - 10 + i * 10, cy + 3, 11, 2);
      leg(cx + 12, cy - 12, 8, 2);
      leg(cx + 16, cy - 13, 8, 2);
      break;
    case 'Hooved':
      ell(cx, cy, 14 * big, 8 * big);
      ell(cx + 14 * big, cy - 9, 5, 6, 0.4);
      for (const dx of [-9, -5, 6, 10]) leg(cx + dx, cy + 5, 14, 3);
      leg(cx + 12, cy - 20, 9, 2);
      leg(cx + 17, cy - 21, 9, 2);
      break;
    case 'Reptile':
      ell(cx, cy + 4, 15 * big, 6);
      ell(cx + 15, cy + 2, 6, 4.5);
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy + 2);
      ctx.quadraticCurveTo(cx - 24, cy + 2, cx - 29, cy + 10);
      ctx.lineTo(cx - 12, cy + 8);
      ctx.fill();
      for (const dx of [-7, 7]) leg(cx + dx, cy + 7, 6, 3);
      break;
    case 'Machine':
      ctx.fillRect(cx - 11 * big, cy - 9, 22 * big, 18);
      ctx.fillRect(cx - 6, cy - 18, 12, 9);
      ctx.fillRect(cx - 13 * big, cy + 9, 5, 7);
      ctx.fillRect(cx + 8 * big, cy + 9, 5, 7);
      ctx.fillRect(cx - 1, cy - 25, 2, 7);
      break;
    case 'Canine':
      ell(cx, cy, 13 * big, 7 * big);
      ell(cx + 13 * big, cy - 7, 6, 5);
      ctx.beginPath();
      ctx.moveTo(cx + 9 * big, cy - 10);
      ctx.lineTo(cx + 11 * big, cy - 18);
      ctx.lineTo(cx + 14 * big, cy - 10);
      ctx.fill();
      for (const dx of [-8, -4, 5, 9]) leg(cx + dx, cy + 4, 11, 3);
      ctx.beginPath();
      ctx.moveTo(cx - 11, cy - 2);
      ctx.quadraticCurveTo(cx - 20, cy - 12, cx - 22, cy - 6);
      ctx.lineTo(cx - 11, cy + 3);
      ctx.fill();
      break;
    default: {
      const blobs = 3 + Math.floor(r() * 4);
      for (let i = 0; i < blobs; i++) ell(cx + (r() - 0.5) * 22, cy + (r() - 0.5) * 16, 5 + r() * 9 * big, 4 + r() * 7 * big, r() * 3);
      const legs = Math.floor(r() * 5);
      for (let i = 0; i < legs; i++) leg(cx - 12 + i * 6, cy + 6, 8 + r() * 6, 3);
      if (r() > 0.5) for (let i = 0; i < 3; i++) leg(cx - 6 + i * 6, cy - 22, 10, 2);
    }
  }
}

function blur(src: Float32Array, w: number, hgt: number, passes: number): Float32Array {
  let a = src;
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(w * hgt);
    for (let y = 0; y < hgt; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= hgt) continue;
            sum += a[yy * w + xx];
            n++;
          }
        }
        b[y * w + x] = sum / n;
      }
    }
    a = b;
  }
  return a;
}

/** Clay ramps for the materials a subject draws with, dark to light. `body` uses the card's tribe or pool ramp. */
const RAMPS: Record<Exclude<Mat, 'body'>, RGB[]> = {
  metal: R('#14161c', '#3a3e48', '#6e7480', '#aab0bc', '#e8ecf2'),
  wood: R('#1e1006', '#43260f', '#704420', '#a06a38', '#d09a5e'),
  dark: R('#040404', '#0c0b10', '#18161e', '#24212c', '#302c3a'),
  gold: R('#3a2600', '#8a6200', '#d4a400', '#ffd23a', '#fff6a0'),
  red: R('#2a0606', '#6b140e', '#b4261a', '#e8543a', '#ffa48a'),
  cloth: R('#080e2a', '#16286b', '#2f52c0', '#6e94ff', '#c8d8ff'),
  bone: R('#2e2a22', '#6a6452', '#aaa28a', '#dcd4bc', '#fffaec'),
  green: R('#061a08', '#165218', '#2e9a2a', '#7ed83a', '#d8ff8a'),
  cyan: R('#032028', '#0a5464', '#14a4c0', '#48dcff', '#c8f8ff'),
  skin: R('#2a1408', '#6b3a1e', '#b0704a', '#e0a478', '#ffdcbc'),
  purple: R('#120620', '#38145e', '#6e2aa8', '#b064f0', '#ecc8ff'),
  white: R('#2a2c34', '#646872', '#a4a8b2', '#dadde4', '#ffffff'),
  fur: R('#1a0f06', '#3e2412', '#6a4422', '#9a6c3c', '#cca070'),
  gray: R('#18191e', '#3c3e46', '#686c76', '#9a9ea8', '#d0d2d8'),
  black: R('#020203', '#0a0a0e', '#16161c', '#262630', '#3a3a46'),
  orange: R('#2e1000', '#7a3000', '#d0600a', '#ff9a3a', '#ffd09a'),
  pink: R('#3a1420', '#7a3048', '#c06478', '#f0a0b0', '#ffd8e0'),
  paper: R('#2e2a1e', '#6e6648', '#b0a682', '#e4dcbc', '#fffaea'),
  stone: R('#16161a', '#36363e', '#5e5e68', '#8c8c96', '#c0c0c8'),
  tan: R('#2a1e0e', '#5e4626', '#9a7a4a', '#cfae78', '#f4dcae'),
  teal: R('#03201e', '#0a5650', '#14968a', '#40d0bc', '#b0fff0'),
};
const MATS = ['body', ...Object.keys(RAMPS)] as Mat[];
/** Materials that glow a little, so they read in the dark. */
const BRIGHT = new Set<Mat>(['gold', 'cyan', 'orange']);

/** A pen that fills each shape with its material's code in the red channel, for the renderer to read back. */
function makePen(ctx: CanvasRenderingContext2D): Pen {
  const code = (m: Mat) => `rgb(${MATS.indexOf(m) * 8 + 4},0,0)`;
  const ell = (x: number, y: number, rx: number, ry: number, m: Mat, rot = 0) => {
    ctx.fillStyle = code(m);
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.3, rx), Math.max(0.3, ry), rot, 0, Math.PI * 2);
    ctx.fill();
  };
  return {
    ell,
    circ: (x, y, r, m) => ell(x, y, r, r, m),
    poly: (pts, m) => {
      ctx.fillStyle = code(m);
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
      ctx.fill();
    },
    rect: (x, y, w, h, m) => {
      ctx.fillStyle = code(m);
      ctx.fillRect(x, y, w, h);
    },
    line: (pts, w, m) => {
      ctx.strokeStyle = code(m);
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      const n = pts.length / 2;
      if (n <= 2) ctx.lineTo(pts[2], pts[3]);
      else {
        for (let i = 1; i < n - 1; i++) {
          const mx = (pts[i * 2] + pts[i * 2 + 2]) / 2, my = (pts[i * 2 + 1] + pts[i * 2 + 3]) / 2;
          ctx.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], i === n - 2 ? pts[i * 2 + 2] : mx, i === n - 2 ? pts[i * 2 + 3] : my);
        }
      }
      ctx.stroke();
    },
    eye: (x, y, r = 1.3, m = 'dark') => {
      ell(x, y, r, r, m);
      if (m === 'dark') ell(x + r * 0.35, y - r * 0.35, r * 0.45, r * 0.45, 'white');
    },
  };
}

/**
 * A clay portrait lit from the top left, in front of a darkened puddle of some other reality. The subject is designed on
 * a W by H frame and drawn at w by hgt art pixels, so each size a card is shown at gets art whose pixels land on the
 * shared grid. The mask is drawn four times larger and each pixel takes the material most of its samples hold. Cached.
 */
export function artFor(id: string, w = W, hgt = Math.round(w * 0.75)): string {
  const key = `${id}:${w}x${hgt}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = cardDef(id);
  const SS = 4;
  const big = document.createElement('canvas');
  big.width = w * SS;
  big.height = hgt * SS;
  const bctx = big.getContext('2d', { willReadFrequently: true })!;
  const seed = hash(id);
  const r = rng(seed);
  const sc = w / W;
  const offY = (hgt - H * sc) / 2;
  bctx.setTransform(sc * SS, 0, 0, sc * SS, 0, offY * SS);
  const draw = subjectFor(id);
  if (draw) draw(makePen(bctx));
  else {
    bctx.fillStyle = 'rgb(4,0,0)';
    bctx.strokeStyle = 'rgb(4,0,0)';
    silhouette(bctx, def, r);
  }
  const px = bctx.getImageData(0, 0, w * SS, hgt * SS).data;
  const cover = new Float32Array(w * hgt);
  const mat = new Int8Array(w * hgt).fill(-1);
  const tally = new Int32Array(MATS.length);
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      tally.fill(0);
      let n = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const j = ((y * SS + sy) * w * SS + x * SS + sx) * 4;
          if (px[j + 3] < 128) continue;
          n++;
          if (px[j + 3] === 255 && px[j] % 8 === 4) tally[(px[j] - 4) / 8]++;
        }
      }
      const i = y * w + x;
      cover[i] = n / (SS * SS);
      if (n * 2 >= SS * SS) {
        let best = 0;
        for (let k = 1; k < MATS.length; k++) if (tally[k] > tally[best]) best = k;
        mat[i] = best;
      }
    }
  }
  const height = blur(cover, w, hgt, Math.max(1, Math.round(3 * sc)));
  const enemy = def.pool === 'enemy';
  const bodyRamp = enemy ? CLAY.enemy : def.kind === 'spell' ? CLAY[def.pool] ?? CLAY.spell : CLAY[def.tribe ?? 'none'] ?? CLAY.none;
  const backdrop = GENRES[BACKDROPS[seed % BACKDROPS.length]];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext('2d')!;
  const out = ctx.createImageData(w, hgt);
  const d = out.data;
  const matAt = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= hgt ? -1 : mat[y * w + x]);
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const th = BAYER[y & 3][x & 3];
      let col: RGB;
      const mi = mat[i];
      if (mi >= 0) {
        const m = MATS[mi];
        const ramp = m === 'body' ? bodyRamp : RAMPS[m];
        const hx = (height[i - 1] ?? 0) - (height[i + 1] ?? 0);
        const hy = (height[i - w] ?? 0) - (height[i + w] ?? 0);
        // The blur widens with resolution, so the slope per pixel shrinks by the same factor.
        let light = 0.42 + height[i] * 0.45 + (hx + hy) * 1.6 * sc;
        // A crease where two materials meet, and a rim where the figure meets the backdrop, keep parts apart at low size.
        let edge = false, crease = false;
        for (const [ax, ay] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          const o = matAt(ax, ay);
          if (o < 0) edge = true;
          else if (o !== mi) crease = true;
        }
        if (crease && (seamSide(x, y, mi, matAt))) light -= 0.24;
        if (edge) light -= 0.1;
        if (BRIGHT.has(m)) light += 0.12;
        const level = Math.max(0, Math.min(ramp.length - 1, Math.floor(light * (ramp.length - 1) + th)));
        col = ramp[level];
      } else {
        const bg = backdrop((x / sc / (W - 1)) * 2 - 1, ((y - offY) / sc / (H - 1)) * 2 - 1, 0, th, seed % 7);
        // The backdrop sits in shadow: half its light, and darker still near the figure.
        const shade = 0.42 - Math.min(0.25, height[i] * 0.6);
        col = [bg[0] * shade, bg[1] * shade, bg[2] * shade];
        if (th > 0.82 - height[i] * 0.4) col = [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5];
      }
      d[i * 4] = col[0];
      d[i * 4 + 1] = col[1];
      d[i * 4 + 2] = col[2];
      d[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

/** Only the part drawn first takes the crease, so a seam is one pixel wide rather than two. */
function seamSide(x: number, y: number, mi: number, matAt: (x: number, y: number) => number): boolean {
  const right = matAt(x + 1, y), down = matAt(x, y + 1);
  return (right >= 0 && right !== mi) || (down >= 0 && down !== mi);
}
