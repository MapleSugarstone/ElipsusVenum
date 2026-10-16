import { card as cardDef, type CardDef } from '../engine/registry.ts';
import { BAYER, GENRES } from './void.ts';

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

const BACKDROPS = ['meadow', 'neon', 'desert', 'ocean', 'office', 'space', 'crayon', 'forest', 'snow', 'dungeon', 'flesh', 'glitch'];

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

/**
 * A clay figure lit from the top left, standing in front of a darkened puddle of some other reality. The figure is
 * designed on a W by H frame and drawn at w by hgt art pixels, so each size a card is shown at gets art whose pixels
 * land on the shared grid. Cached.
 */
export function artFor(id: string, w = W, hgt = Math.round(w * 0.75)): string {
  const key = `${id}:${w}x${hgt}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = cardDef(id);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const seed = hash(id);
  const r = rng(seed);
  const sc = w / W;
  const offY = (hgt - H * sc) / 2;
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.setTransform(sc, 0, 0, sc, 0, offY);
  silhouette(ctx, def, r);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const mask = ctx.getImageData(0, 0, w, hgt).data;
  const m = new Float32Array(w * hgt);
  for (let i = 0; i < w * hgt; i++) m[i] = mask[i * 4 + 3] / 255;
  const height = blur(m, w, hgt, Math.max(1, Math.round(3 * sc)));
  const enemy = def.pool === 'enemy';
  const ramp = enemy ? CLAY.enemy : def.kind === 'spell' ? CLAY[def.pool] ?? CLAY.spell : CLAY[def.tribe ?? 'none'] ?? CLAY.none;
  const backdrop = GENRES[BACKDROPS[seed % BACKDROPS.length]];
  const out = ctx.createImageData(w, hgt);
  const d = out.data;
  const eyeX = Math.round((36 + (seed % 8)) * sc);
  const eyeY = Math.round((20 + ((seed >> 3) % 5)) * sc + offY);
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const th = BAYER[y & 3][x & 3];
      let col: RGB;
      if (m[i] > 0.5) {
        const hx = (height[i - 1] ?? 0) - (height[i + 1] ?? 0);
        const hy = (height[i - w] ?? 0) - (height[i + w] ?? 0);
        // The blur widens with resolution, so the slope per pixel shrinks by the same factor.
        const light = 0.42 + height[i] * 0.45 + (hx + hy) * 1.6 * sc;
        const level = Math.max(0, Math.min(ramp.length - 1, Math.floor(light * (ramp.length - 1) + th)));
        col = ramp[level];
        if (def.kind === 'creature' && Math.abs(x - eyeX) <= 0 && Math.abs(y - eyeY) <= 0 && m[i] > 0.5) col = enemy ? [255, 240, 120] : [255, 255, 255];
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
