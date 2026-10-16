// What each card's portrait shows. Every subject draws on a 64 by 48 frame (the visible band is about y 6 to 42) with a
// pen that fills shapes in named materials. The renderer in art.ts lights the result as clay.

export type Mat =
  | 'body' | 'metal' | 'wood' | 'dark' | 'gold' | 'red' | 'cloth' | 'bone' | 'green' | 'cyan' | 'skin' | 'purple'
  | 'white' | 'fur' | 'gray' | 'black' | 'orange' | 'pink' | 'paper' | 'stone' | 'tan' | 'teal';

export interface Pen {
  ell(x: number, y: number, rx: number, ry: number, m: Mat, rot?: number): void;
  circ(x: number, y: number, r: number, m: Mat): void;
  /** A filled polygon from flat x, y pairs. */
  poly(pts: number[], m: Mat): void;
  rect(x: number, y: number, w: number, h: number, m: Mat): void;
  /** A thick stroke through flat x, y pairs, smoothed with quadratic curves when there are three or more points. */
  line(pts: number[], w: number, m: Mat): void;
  /** A dark eye with a glint. */
  eye(x: number, y: number, r?: number, m?: Mat): void;
}

type Draw = (p: Pen) => void;

// ---------------------------------------------------------------- shared shapes

const ring = (p: Pen, x: number, y: number, r: number, w: number, m: Mat) => {
  const pts: number[] = [];
  for (let i = 0; i <= 24; i++) pts.push(x + Math.cos((i / 24) * Math.PI * 2) * r, y + Math.sin((i / 24) * Math.PI * 2) * r);
  p.line(pts, w, m);
};

function knife(p: Pen, x1: number, y1: number, x2: number, y2: number, blade: Mat = 'metal'): void {
  // From the handle end (x1, y1) to the tip (x2, y2).
  const hx = x1 + (x2 - x1) * 0.35, hy = y1 + (y2 - y1) * 0.35;
  p.line([x1, y1, hx, hy], 3.4, 'wood');
  const nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny) || 1;
  p.line([hx + (nx / l) * 3, hy + (ny / l) * 3, hx - (nx / l) * 3, hy - (ny / l) * 3], 1.8, 'gold');
  p.poly([hx + (nx / l) * 1.8, hy + (ny / l) * 1.8, x2, y2, hx - (nx / l) * 1.8, hy - (ny / l) * 1.8], blade);
}

function sword(p: Pen, x1: number, y1: number, x2: number, y2: number, blade: Mat = 'metal'): void {
  const hx = x1 + (x2 - x1) * 0.22, hy = y1 + (y2 - y1) * 0.22;
  p.circ(x1, y1, 2.2, 'gold');
  p.line([x1, y1, hx, hy], 3, 'wood');
  const nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny) || 1;
  p.line([hx + (nx / l) * 5, hy + (ny / l) * 5, hx - (nx / l) * 5, hy - (ny / l) * 5], 2.2, 'gold');
  p.line([hx, hy, x2, y2], 3.4, blade);
}

function shield(p: Pen, x: number, y: number, s: number, m: Mat = 'metal', rim: Mat = 'gold'): void {
  p.poly([x - 9 * s, y - 10 * s, x + 9 * s, y - 10 * s, x + 9 * s, y + 1 * s, x, y + 11 * s, x - 9 * s, y + 1 * s], rim);
  p.poly([x - 7 * s, y - 8 * s, x + 7 * s, y - 8 * s, x + 7 * s, y + 0.5 * s, x, y + 8.5 * s, x - 7 * s, y + 0.5 * s], m);
}

function crown(p: Pen, x: number, y: number, s: number, m: Mat = 'gold'): void {
  p.poly([x - 10 * s, y + 5 * s, x - 10 * s, y - 5 * s, x - 5 * s, y, x, y - 8 * s, x + 5 * s, y, x + 10 * s, y - 5 * s, x + 10 * s, y + 5 * s], m);
  p.circ(x, y + 1.5 * s, 1.6 * s, 'red');
  p.circ(x - 6 * s, y + 2 * s, 1.2 * s, 'cyan');
  p.circ(x + 6 * s, y + 2 * s, 1.2 * s, 'cyan');
}

function fist(p: Pen, x: number, y: number, s: number, m: Mat = 'skin'): void {
  p.ell(x, y, 8 * s, 7 * s, m);
  for (let i = 0; i < 4; i++) p.ell(x + 5 * s, y - 5 * s + i * 3.4 * s, 3.4 * s, 1.9 * s, m);
  p.ell(x - 2 * s, y + 4 * s, 4 * s, 2.4 * s, m, -0.4);
  p.rect(x - 16 * s, y - 4 * s, 9 * s, 8 * s, m);
}

function hand(p: Pen, x: number, y: number, s: number, m: Mat = 'skin', up = true): void {
  const d = up ? -1 : 1;
  p.ell(x, y, 7 * s, 8 * s, m);
  for (let i = 0; i < 4; i++) p.line([x - 4.5 * s + i * 3 * s, y + d * 4 * s, x - 5.5 * s + i * 3.4 * s, y + d * 14 * s], 2.6 * s, m);
  p.line([x + 6 * s, y + d * 2 * s, x + 11 * s, y + d * 7 * s], 2.6 * s, m);
  p.rect(x - 5 * s, y - d * 6 * s - (up ? 0 : 6 * s), 10 * s, 6 * s, m);
}

function arrow(p: Pen, pts: number[], w: number, m: Mat): void {
  p.line(pts, w, m);
  const n = pts.length;
  const x = pts[n - 2], y = pts[n - 1], px = pts[n - 4], py = pts[n - 3];
  const dx = x - px, dy = y - py, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  p.poly([x + ux * 4, y + uy * 4, x - ux * 3 - uy * 4.5, y - uy * 3 + ux * 4.5, x - ux * 3 + uy * 4.5, y - uy * 3 - ux * 4.5], m);
}

function bubble(p: Pen, x: number, y: number, w: number, h: number, m: Mat = 'paper'): void {
  p.ell(x, y, w, h, m);
  p.poly([x - w * 0.4, y + h * 0.6, x - w * 0.8, y + h * 1.4, x - w * 0.05, y + h * 0.8], m);
}

function heart(p: Pen, x: number, y: number, s: number, m: Mat = 'red'): void {
  p.circ(x - 4 * s, y - 2 * s, 4.6 * s, m);
  p.circ(x + 4 * s, y - 2 * s, 4.6 * s, m);
  p.poly([x - 8.4 * s, y - 0.5 * s, x + 8.4 * s, y - 0.5 * s, x, y + 9 * s], m);
}

function bolt(p: Pen, x: number, y: number, s: number, m: Mat = 'gold'): void {
  p.poly([x + 2 * s, y - 12 * s, x - 6 * s, y + 1 * s, x - 0.5 * s, y + 1 * s, x - 3 * s, y + 12 * s, x + 6 * s, y - 2 * s, x + 0.5 * s, y - 2 * s], m);
}

function flame(p: Pen, x: number, y: number, s: number): void {
  p.ell(x, y, 5 * s, 7 * s, 'orange');
  p.poly([x - 5 * s, y - 1 * s, x, y - 14 * s, x + 5 * s, y - 1 * s], 'orange');
  p.ell(x, y + 1 * s, 3 * s, 4.5 * s, 'gold');
  p.poly([x - 3 * s, y, x, y - 8 * s, x + 3 * s, y], 'gold');
}

function drop(p: Pen, x: number, y: number, s: number, m: Mat = 'red'): void {
  p.circ(x, y + 2 * s, 5 * s, m);
  p.poly([x - 4.6 * s, y + 0.5 * s, x, y - 9 * s, x + 4.6 * s, y + 0.5 * s], m);
}

function cloud(p: Pen, x: number, y: number, s: number, m: Mat): void {
  p.circ(x - 8 * s, y + 2 * s, 6 * s, m);
  p.circ(x, y - 3 * s, 8 * s, m);
  p.circ(x + 9 * s, y + 1 * s, 6.5 * s, m);
  p.rect(x - 8 * s, y + 1 * s, 17 * s, 7 * s, m);
}

function skull(p: Pen, x: number, y: number, s: number, m: Mat = 'bone'): void {
  p.ell(x, y - 2 * s, 8 * s, 7.5 * s, m);
  p.rect(x - 5 * s, y + 3 * s, 10 * s, 5 * s, m);
  p.ell(x - 3.2 * s, y - 1 * s, 2.4 * s, 2.6 * s, 'dark');
  p.ell(x + 3.2 * s, y - 1 * s, 2.4 * s, 2.6 * s, 'dark');
  p.poly([x - 1 * s, y + 3 * s, x + 1 * s, y + 3 * s, x, y + 1 * s], 'dark');
  for (let i = -1; i <= 1; i++) p.rect(x + i * 2.6 * s - 0.6 * s, y + 5 * s, 1.2 * s, 3 * s, 'dark');
}

function bone(p: Pen, x1: number, y1: number, x2: number, y2: number, w = 2.6): void {
  p.line([x1, y1, x2, y2], w, 'bone');
  for (const [x, y] of [[x1, y1], [x2, y2]]) { p.circ(x - 1, y - 1, w * 0.85, 'bone'); p.circ(x + 1, y + 1, w * 0.85, 'bone'); }
}

function flask(p: Pen, x: number, y: number, s: number, liquid: Mat): void {
  p.circ(x, y + 3 * s, 9 * s, 'white');
  p.rect(x - 3 * s, y - 12 * s, 6 * s, 9 * s, 'white');
  p.rect(x - 4 * s, y - 14 * s, 8 * s, 2.6 * s, 'wood');
  p.ell(x, y + 5 * s, 7.5 * s, 5.5 * s, liquid);
  p.circ(x + 3 * s, y + 1 * s, 1.2 * s, 'white');
}

function screen(p: Pen, x: number, y: number, w: number, h: number, face: Mat = 'cyan'): void {
  p.rect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 'metal');
  p.rect(x - w / 2, y - h / 2, w, h, face);
  p.rect(x - 4, y + h / 2 + 2, 8, 3, 'metal');
  p.rect(x - 9, y + h / 2 + 5, 18, 2.4, 'metal');
}

function coin(p: Pen, x: number, y: number, r = 4): void {
  p.ell(x, y, r, r * 0.6, 'gold');
}

function waves(p: Pen, x: number, y: number, n: number, m: Mat): void {
  for (let i = 0; i < n; i++) {
    const r = 6 + i * 5;
    p.line([x + r * 0.5, y - r * 0.87, x + r, y, x + r * 0.5, y + r * 0.87], 1.8, m);
  }
}

function speed(p: Pen, x: number, y: number, n: number, m: Mat = 'white'): void {
  for (let i = 0; i < n; i++) p.line([x, y + i * 5, x - 10 - (i % 2) * 5, y + i * 5], 1.6, m);
}

function ground(p: Pen, m: Mat = 'tan', y = 40): void {
  p.ell(32, y + 6, 34, 7, m);
}

// ---------------------------------------------------------------- animals

interface Quad {
  x?: number; y?: number; len?: number; h?: number; m: Mat; belly?: Mat; head?: number; snout?: number; leg?: number; legW?: number;
  ears?: 'pointy' | 'round' | 'long' | 'floppy' | 'none'; tail?: 'thin' | 'bushy' | 'stub' | 'flat' | 'up' | 'none'; tailM?: Mat;
  earM?: Mat; snoutM?: Mat; eyeM?: Mat; neck?: number;
}

/** A four-legged animal facing right. Returns where its head is, for antlers, horns, and gear. */
function quad(p: Pen, o: Quad): { hx: number; hy: number; r: number } {
  const x = o.x ?? 30, y = o.y ?? 27, len = o.len ?? 26, h = o.h ?? 11, r = o.head ?? 6, leg = o.leg ?? 8, lw = o.legW ?? 3;
  const tm = o.tailM ?? o.m;
  const back = x - len / 2, front = x + len / 2;
  if (o.tail === 'thin') p.line([back + 2, y, back - 8, y + 2, back - 14, y - 4], 1.6, tm);
  else if (o.tail === 'bushy') p.ell(back - 5, y - 4, 7, 4, tm, -0.6);
  else if (o.tail === 'up') p.line([back + 1, y - 2, back - 5, y - 8, back - 3, y - 15], 2.6, tm);
  else if (o.tail === 'flat') p.ell(back - 6, y + 3, 7, 2.6, tm, 0.2);
  else if (o.tail === 'stub') p.circ(back, y - 2, 2.2, tm);
  const by = y + h * 0.35;
  for (const dx of [-0.3, 0.3]) p.rect(x + dx * len - lw / 2 + 1.5, by, lw, leg, o.m);
  p.ell(x, y, len / 2, h / 2, o.m);
  if (o.belly) p.ell(x + 1, y + h * 0.22, len * 0.38, h * 0.22, o.belly);
  for (const dx of [-0.36, 0.36]) p.rect(x + dx * len - lw / 2, by, lw, leg + 0.5, o.m);
  const neck = o.neck ?? 0;
  const hx = front + r * 0.2 + neck * 0.4, hy = y - h * 0.45 - neck;
  if (neck) p.line([front - 3, y - 2, hx, hy], r * 1.1, o.m);
  const em = o.earM ?? o.m;
  if (o.ears === 'pointy') { p.poly([hx - r * 0.7, hy - r * 0.4, hx - r * 0.3, hy - r * 1.8, hx + r * 0.1, hy - r * 0.6], em); p.poly([hx - 0.1 * r, hy - r * 0.5, hx + r * 0.3, hy - r * 1.7, hx + r * 0.6, hy - r * 0.3], em); }
  else if (o.ears === 'round') { p.circ(hx - r * 0.55, hy - r * 0.8, r * 0.45, em); p.circ(hx + r * 0.35, hy - r * 0.85, r * 0.45, em); }
  else if (o.ears === 'long') { p.ell(hx - r * 0.5, hy - r * 1.8, r * 0.35, r * 1.4, em, -0.2); p.ell(hx + r * 0.1, hy - r * 1.9, r * 0.35, r * 1.4, em, 0.15); }
  p.circ(hx, hy, r, o.m);
  if (o.ears === 'floppy') p.ell(hx - r * 0.5, hy + r * 0.4, r * 0.4, r * 0.9, em, 0.3);
  const sn = o.snout ?? r * 0.8;
  if (sn > 0) p.ell(hx + r * 0.6 + sn * 0.4, hy + r * 0.25, sn * 0.75, r * 0.5, o.snoutM ?? o.m);
  if (sn > 0) p.circ(hx + r * 0.6 + sn, hy + r * 0.1, Math.max(0.9, r * 0.2), 'dark');
  p.eye(hx + r * 0.3, hy - r * 0.2, Math.max(1, r * 0.22), o.eyeM);
  return { hx, hy, r };
}

interface Bird { x?: number; y?: number; s?: number; m: Mat; wing?: Mat; breast?: Mat; beak?: 'short' | 'long' | 'hook' | 'cone'; beakM?: Mat; head?: Mat; tail?: 'fan' | 'long'; perch?: boolean; spread?: boolean }

function bird(p: Pen, o: Bird): { hx: number; hy: number } {
  const x = o.x ?? 30, y = o.y ?? 26, s = o.s ?? 1;
  if (o.perch) p.line([6, 39, 58, 37], 3, 'wood');
  p.poly([x - 9 * s, y + 1 * s, x - 20 * s, y + (o.tail === 'long' ? 9 : 5) * s, x - 18 * s, y + 9 * s, x - 7 * s, y + 5 * s], o.wing ?? o.m);
  if (o.spread) {
    p.poly([x - 4 * s, y - 2 * s, x - 16 * s, y - 16 * s, x - 2 * s, y - 13 * s, x + 6 * s, y - 2 * s], o.wing ?? o.m);
  }
  p.ell(x, y, 11 * s, 7.5 * s, o.m, -0.15);
  if (o.breast) p.ell(x + 4 * s, y + 2.5 * s, 6 * s, 4.5 * s, o.breast, -0.3);
  if (!o.spread) p.ell(x - 3 * s, y - 0.5 * s, 7.5 * s, 4.5 * s, o.wing ?? o.m, -0.25);
  const hx = x + 9 * s, hy = y - 6 * s;
  p.circ(hx, hy, 5 * s, o.head ?? o.m);
  const bm = o.beakM ?? 'gold';
  if (o.beak === 'long') p.poly([hx + 3 * s, hy - 1.5 * s, hx + 15 * s, hy + 0.5 * s, hx + 3 * s, hy + 1.8 * s], bm);
  else if (o.beak === 'hook') { p.poly([hx + 3 * s, hy - 2 * s, hx + 9 * s, hy - 0.5 * s, hx + 8 * s, hy + 3 * s, hx + 3 * s, hy + 1.5 * s], bm); }
  else if (o.beak === 'cone') p.poly([hx + 3.5 * s, hy - 2 * s, hx + 8 * s, hy + 0.3 * s, hx + 3.5 * s, hy + 2.4 * s], bm);
  else p.poly([hx + 3.5 * s, hy - 1.4 * s, hx + 9 * s, hy + 0.4 * s, hx + 3.5 * s, hy + 1.8 * s], bm);
  p.eye(hx + 1.5 * s, hy - 1 * s, 1.3 * s);
  p.line([x + 1 * s, y + 6 * s, x + 2 * s, y + 12 * s], 1.3, 'gold');
  p.line([x + 4 * s, y + 6 * s, x + 5 * s, y + 12 * s], 1.3, 'gold');
  return { hx, hy };
}

function bat(p: Pen, m: Mat, x = 32, y = 24, wing: Mat = m): void {
  for (const d of [-1, 1]) {
    p.poly([x, y - 3, x + d * 26, y - 10, x + d * 22, y, x + d * 17, y - 2, x + d * 13, y + 3, x + d * 8, y + 1, x + d * 3, y + 5], wing);
    p.line([x, y - 3, x + d * 26, y - 10], 1.2, m);
  }
  p.ell(x, y, 5, 7, m);
  p.poly([x - 4, y - 6, x - 3, y - 12, x - 1, y - 6], m);
  p.poly([x + 1, y - 6, x + 3, y - 12, x + 4, y - 6], m);
  p.eye(x - 2, y - 3, 1.1, 'red');
  p.eye(x + 2, y - 3, 1.1, 'red');
  p.poly([x - 1.5, y + 1, x - 0.5, y + 3, x + 0.5, y + 1], 'white');
}

interface Bug { x?: number; y?: number; m: Mat; segs: [number, number][]; legs?: number; antennae?: number; wings?: Mat; shell?: boolean }

function bug(p: Pen, o: Bug): void {
  const x = o.x ?? 32, y = o.y ?? 28;
  let cx = x - o.segs.reduce((s, [w]) => s + w, 0) / 2;
  const centers: [number, number, number][] = [];
  for (const [w, hgt] of o.segs) { centers.push([cx + w / 2, w, hgt]); cx += w; }
  const mid = centers[Math.min(1, centers.length - 1)];
  for (let i = 0; i < (o.legs ?? 6) / 2; i++) {
    const lx = mid[0] - mid[1] * 0.4 + i * (mid[1] * 0.4);
    p.line([lx, y, lx - 5 + i * 5, y + 7, lx - 8 + i * 7, y + 12], 1.3, 'dark');
  }
  if (o.wings) p.ell(centers[centers.length - 1][0] - 4, y - 7, 9, 4, o.wings, -0.3);
  for (const [c, w, hgt] of centers) p.ell(c, y, w / 2 + 0.6, hgt / 2, o.m);
  if (o.shell) p.line([centers[0][0] + 2, y - 3, centers[0][0] + centers[0][1] - 2, y - 3], 1, 'dark');
  const head = centers[centers.length - 1];
  if (o.antennae) {
    p.line([head[0] + 2, y - 2, head[0] + 6, y - 9, head[0] + 4 + o.antennae, y - 13], 1.1, 'dark');
    p.line([head[0] + 1, y - 2, head[0] + 3, y - 10, head[0] - 1 + o.antennae * 0.6, y - 14], 1.1, 'dark');
  }
  p.eye(head[0] + head[1] * 0.2, y - 1, 1.1);
}

function lizard(p: Pen, m: Mat, tail: Mat = m, x = 30, y = 30): void {
  p.line([x - 12, y, x - 20, y - 2, x - 26, y + 3, x - 22, y + 7], 3, tail);
  for (const dx of [-8, 6]) { p.line([x + dx, y, x + dx - 3, y + 5, x + dx - 1, y + 8], 1.6, m); p.line([x + dx + 2, y, x + dx + 5, y + 5, x + dx + 7, y + 8], 1.6, m); }
  p.ell(x, y, 13, 4, m);
  p.ell(x + 15, y - 1, 5, 3.4, m);
  p.eye(x + 16, y - 2, 1);
}

interface Person {
  x?: number; s?: number; robe?: Mat; skin?: Mat; head?: 'plain' | 'helmet' | 'hood' | 'skull' | 'crown' | 'goblin' | 'orc' | 'goggles' | 'hair';
  legs?: Mat; holdR?: (hx: number, hy: number) => void; holdL?: (hx: number, hy: number) => void; cape?: Mat; big?: boolean; eyes?: Mat; kneel?: boolean;
}

/** A standing figure facing the viewer. Hands are passed to `holdL` and `holdR` for weapons. */
function person(p: Pen, o: Person): void {
  const x = o.x ?? 32, s = o.s ?? 1, big = o.big ? 1.25 : 1;
  const skin = o.skin ?? 'skin', robe = o.robe ?? 'cloth';
  const top = 12 + (o.kneel ? 6 : 0), hipY = 30 + (o.kneel ? 4 : 0);
  if (o.cape) p.poly([x - 9 * s * big, top + 6, x + 9 * s * big, top + 6, x + 12 * s * big, 42, x - 12 * s * big, 42], o.cape);
  if (!o.kneel) { p.rect(x - 6 * s * big, hipY, 4.5 * s * big, 12, o.legs ?? 'dark'); p.rect(x + 1.5 * s * big, hipY, 4.5 * s * big, 12, o.legs ?? 'dark'); }
  else { p.rect(x - 7, hipY, 14, 5, o.legs ?? 'dark'); p.rect(x - 7, hipY + 4, 5, 6, o.legs ?? 'dark'); }
  p.poly([x - 8 * s * big, top + 7, x + 8 * s * big, top + 7, x + 9 * s * big, hipY + 2, x - 9 * s * big, hipY + 2], robe);
  const lh = [x - 13 * s * big, top + 19], rh = [x + 13 * s * big, top + 19];
  p.line([x - 7 * s * big, top + 9, lh[0], lh[1]], 3.2 * big, robe);
  p.line([x + 7 * s * big, top + 9, rh[0], rh[1]], 3.2 * big, robe);
  p.circ(lh[0], lh[1], 2, skin);
  p.circ(rh[0], rh[1], 2, skin);
  const hy = top + 1;
  const hr = 6 * big;
  const hd = o.head ?? 'plain';
  if (hd === 'hood') { p.ell(x, hy, hr + 2.5, hr + 3, robe); p.ell(x, hy + 1.5, hr - 1, hr - 1, 'dark'); p.eye(x - 2, hy + 1, 1, o.eyes ?? 'gold'); p.eye(x + 2, hy + 1, 1, o.eyes ?? 'gold'); }
  else if (hd === 'skull') skull(p, x, hy + 1, 0.8 * big);
  else {
    if (hd === 'goblin') { p.poly([x - hr, hy - 1, x - hr - 8, hy - 5, x - hr + 1, hy + 2], skin); p.poly([x + hr, hy - 1, x + hr + 8, hy - 5, x + hr - 1, hy + 2], skin); }
    p.circ(x, hy, hr, skin);
    if (hd === 'orc') { p.poly([x - 3, hy + 3, x - 2, hy - 0.5, x - 1, hy + 3], 'bone'); p.poly([x + 1, hy + 3, x + 2, hy - 0.5, x + 3, hy + 3], 'bone'); }
    if (hd === 'goggles') { p.rect(x - hr, hy - 2.5, hr * 2, 2, 'dark'); p.circ(x - 2.6, hy - 1.5, 2.2, 'cyan'); p.circ(x + 2.6, hy - 1.5, 2.2, 'cyan'); }
    else { p.eye(x - 2.2, hy - 0.5, 1, o.eyes); p.eye(x + 2.2, hy - 0.5, 1, o.eyes); }
    if (hd === 'helmet') { p.ell(x, hy - 2, hr + 1, hr - 0.5, 'metal'); p.rect(x - hr - 1, hy - 2, hr * 2 + 2, 2.5, 'metal'); p.rect(x - 0.8, hy - 2, 1.6, 6, 'metal'); }
    if (hd === 'crown') crown(p, x, hy - hr - 1, 0.45);
    if (hd === 'hair') { p.ell(x, hy - hr * 0.6, hr + 1.5, hr * 0.6, 'white'); p.circ(x - hr, hy - 1, 2.5, 'white'); p.circ(x + hr, hy - 1, 2.5, 'white'); }
  }
  o.holdL?.(lh[0], lh[1]);
  o.holdR?.(rh[0], rh[1]);
}

function robot(p: Pen, o: { body?: Mat; face?: Mat; wide?: number; legs?: boolean; treads?: boolean; antenna?: boolean; claws?: boolean }): void {
  const w = o.wide ?? 18, body = o.body ?? 'metal';
  if (o.treads) { p.rect(32 - w / 2 - 2, 34, w + 4, 6, 'dark'); for (let i = 0; i < 4; i++) p.circ(32 - w / 2 + 2 + i * (w / 3), 37, 2, 'gray'); }
  if (o.legs) { p.rect(26, 32, 3, 9, 'dark'); p.rect(35, 32, 3, 9, 'dark'); }
  if (o.claws) { p.line([32 - w / 2, 22, 32 - w / 2 - 7, 28, 32 - w / 2 - 4, 33], 2.4, 'gray'); p.line([32 + w / 2, 22, 32 + w / 2 + 7, 28, 32 + w / 2 + 4, 33], 2.4, 'gray'); }
  p.rect(32 - w / 2, 14, w, 20, body);
  p.rect(32 - w / 2 + 3, 17, w - 6, 8, o.face ?? 'cyan');
  p.eye(29, 21, 1.4, 'white');
  p.eye(35, 21, 1.4, 'white');
  if (o.antenna) { p.line([32, 14, 32, 8], 1.2, 'dark'); p.circ(32, 7, 1.8, 'red'); }
}

function slime(p: Pen, m: Mat, s = 1, x = 32): void {
  p.ell(x, 32, 15 * s, 4, m);
  p.ell(x, 27, 13 * s, 11 * s, m);
  p.ell(x - 5 * s, 22, 3 * s, 2 * s, 'white');
  p.eye(x - 3.5 * s, 27, 1.6 * s);
  p.eye(x + 4 * s, 27, 1.6 * s);
  p.line([x + 9 * s, 31, x + 10 * s, 37], 1.6, m);
}

function maw(p: Pen, m: Mat, w = 18, h = 12): void {
  p.ell(32, 26, w + 4, h + 5, m);
  p.ell(32, 27, w - 2, h - 2, 'dark');
  for (let i = 0; i < 6; i++) {
    const tx = 32 - w + 6 + i * ((2 * w - 12) / 5);
    p.poly([tx - 2, 27 - h + 3, tx, 27 - h + 9, tx + 2, 27 - h + 3], 'bone');
    p.poly([tx - 2, 27 + h - 3, tx, 27 + h - 9, tx + 2, 27 + h - 3], 'bone');
  }
  p.ell(32, 32, 7, 3, 'red');
}

function bricks(p: Pen, x: number, y: number, cols: number, rows: number, gaps = 0, m: Mat = 'stone'): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (gaps && (r * 7 + c * 3) % gaps === 0 && r < 2) continue;
      p.rect(x + c * 9 + (r % 2) * 4.5, y + r * 5, 8, 4, m);
    }
  }
}

function chimera(p: Pen, m: Mat): void {
  p.line([12, 28, 6, 22, 9, 15], 3, 'green');
  p.circ(9, 14, 3, 'green');
  p.eye(10, 13, 0.8, 'gold');
  const q = quad(p, { m, len: 26, h: 12, head: 6.5, ears: 'round', snout: 3, leg: 8, x: 30 });
  p.circ(q.hx - 1, q.hy + 1, 7.5, 'orange');
  p.circ(q.hx, q.hy, 6, m);
  p.eye(q.hx + 2, q.hy - 1, 1);
  p.circ(26, 17, 4, 'white');
  p.line([24, 14, 21, 9], 1.6, 'bone');
  p.line([28, 14, 30, 9], 1.6, 'bone');
  p.eye(27, 17, 0.9);
}

// ---------------------------------------------------------------- the cards

const S: Record<string, Draw> = {
  // tokens and side deck
  placeholder: (p) => { p.rect(20, 10, 24, 30, 'paper'); p.rect(22, 12, 20, 26, 'white'); p.line([28, 19, 30, 16, 34, 16, 36, 19, 32, 24, 32, 28], 2.4, 'gray'); p.circ(32, 33, 1.6, 'gray'); },
  'placeholder-foe': (p) => { p.rect(20, 10, 24, 30, 'red'); p.rect(22, 12, 20, 26, 'paper'); p.line([28, 19, 30, 16, 34, 16, 36, 19, 32, 24, 32, 28], 2.4, 'red'); p.circ(32, 33, 1.6, 'red'); },
  bee: (p) => { p.ell(26, 20, 7, 4, 'white', -0.5); p.ell(34, 19, 7, 4, 'white', 0.5); for (let i = 0; i < 5; i++) p.ell(24 + i * 4, 28, 3, 6, i % 2 ? 'dark' : 'gold'); p.poly([20, 27, 15, 28, 20, 30], 'dark'); p.circ(43, 27, 4.5, 'dark'); p.eye(45, 26, 1, 'white'); },
  rabbit: (p) => { ground(p, 'green'); quad(p, { m: 'white', len: 18, h: 13, head: 5.5, ears: 'long', snout: 2, leg: 5, tail: 'stub', tailM: 'white', earM: 'pink', x: 30, y: 29 }); },
  dam: (p) => { p.rect(4, 28, 56, 14, 'cyan'); for (let i = 0; i < 5; i++) p.ell(32 + ((i % 2) * 4 - 2), 36 - i * 4.5, 22 - i * 2, 2.6, 'wood'); },
  tail: (p) => { p.line([14, 34, 24, 30, 34, 34, 44, 26, 48, 18], 4.5, 'green'); p.line([46, 22, 50, 14], 2.5, 'green'); },
  'field-mouse': (p) => { quad(p, { m: 'fur', belly: 'tan', len: 16, h: 9, head: 4.5, ears: 'round', earM: 'pink', snout: 3, snoutM: 'fur', leg: 3, tail: 'thin', tailM: 'pink', x: 30, y: 32 }); },
  // shared creatures
  gecko: (p) => lizard(p, 'green', 'green'),
  skink: (p) => lizard(p, 'tan', 'cyan'),
  leapfrog: (p) => { p.line([22, 30, 12, 36, 6, 40], 3, 'green'); p.line([24, 31, 14, 26, 8, 30], 3, 'green'); p.ell(32, 26, 11, 7, 'green', -0.35); p.ell(34, 30, 7, 3, 'tan', -0.3); p.circ(40, 18, 3.5, 'green'); p.eye(41, 17, 1.4); p.line([38, 30, 44, 36], 2, 'green'); },
  adder: (p) => { p.line([8, 36, 18, 30, 28, 36, 38, 30, 44, 22], 5, 'tan'); for (let i = 0; i < 5; i++) p.circ(12 + i * 7.5, i % 2 ? 31.5 : 34, 1.4, 'fur'); p.ell(47, 20, 5, 3.6, 'tan', -0.4); p.eye(48, 19, 1); p.line([51, 21, 56, 21, 58, 19], 0.9, 'red'); },
  'snapping-turtle': (p) => { p.rect(18, 32, 4, 6, 'green'); p.rect(40, 32, 4, 6, 'green'); p.circ(50, 29, 5, 'green'); p.eye(51, 28, 1.2); p.poly([53, 30, 58, 31, 53, 33], 'bone'); p.ell(31, 29, 16, 10, 'fur'); for (let i = 0; i < 3; i++) p.circ(23 + i * 8, 26, 3, 'tan'); },
  turtle: (p) => S['snapping-turtle'](p),
  weasel: (p) => { quad(p, { m: 'fur', belly: 'paper', len: 32, h: 8, head: 4.5, ears: 'round', snout: 3, leg: 5, tail: 'bushy', x: 28, y: 30 }); },
  wolf: (p) => { quad(p, { m: 'gray', belly: 'white', len: 26, h: 11, head: 5.5, ears: 'pointy', snout: 6, leg: 10, tail: 'bushy', x: 28, y: 25 }); },
  'wolf-pup': (p) => { quad(p, { m: 'gray', belly: 'white', len: 18, h: 9, head: 6, ears: 'pointy', snout: 3.5, leg: 6, tail: 'bushy', x: 30, y: 29 }); },
  alpha: (p) => { const q = quad(p, { m: 'black', belly: 'gray', len: 30, h: 13, head: 6.5, ears: 'pointy', snout: 6.5, leg: 9, tail: 'bushy', x: 27, y: 25, eyeM: 'red' }); p.line([q.hx - 1, q.hy - 4, q.hx + 3, q.hy + 3], 1, 'red'); },
  flanker: (p) => { speed(p, 14, 18, 3); quad(p, { m: 'gray', len: 28, h: 9, head: 5, ears: 'pointy', snout: 6, leg: 9, tail: 'bushy', x: 32, y: 26 }); },
  bear: (p) => { quad(p, { m: 'fur', len: 32, h: 17, head: 7.5, ears: 'round', snout: 4, snoutM: 'tan', leg: 6, legW: 5, tail: 'stub', x: 28, y: 25 }); },
  coyote: (p) => { quad(p, { m: 'tan', belly: 'paper', len: 26, h: 10, head: 5, ears: 'pointy', snout: 6, leg: 10, tail: 'bushy', tailM: 'fur', x: 28, y: 25 }); },
  hound: (p) => { quad(p, { m: 'fur', belly: 'tan', len: 26, h: 11, head: 5.5, ears: 'floppy', earM: 'black', snout: 6, leg: 10, tail: 'up', x: 28, y: 25 }); },
  wolverine: (p) => { quad(p, { m: 'black', belly: 'tan', len: 30, h: 12, head: 6, ears: 'round', snout: 3, leg: 6, legW: 4, tail: 'bushy', x: 28, y: 28 }); },
  mole: (p) => { ground(p, 'fur', 36); quad(p, { m: 'black', len: 24, h: 12, head: 5, ears: 'none', snout: 6, snoutM: 'pink', leg: 2, tail: 'stub', x: 30, y: 30 }); p.line([42, 34, 47, 37], 3, 'pink'); },
  porcupine: (p) => { for (let i = 0; i < 9; i++) { const a = -2.6 + i * 0.28; p.line([28, 27, 28 + Math.cos(a) * 17, 27 + Math.sin(a) * 15], 1.4, i % 2 ? 'bone' : 'fur'); } quad(p, { m: 'fur', len: 24, h: 13, head: 5, ears: 'none', snout: 4, leg: 4, x: 30, y: 29 }); },
  cat: (p) => { quad(p, { m: 'orange', belly: 'paper', len: 22, h: 10, head: 6, ears: 'pointy', snout: 2, leg: 9, tail: 'up', x: 30, y: 26, eyeM: 'green' }); },
  goat: (p) => { const q = quad(p, { m: 'white', len: 24, h: 12, head: 5, ears: 'none', snout: 4, leg: 10, tail: 'stub', x: 28, y: 25 }); p.line([q.hx - 2, q.hy - 3, q.hx - 7, q.hy - 9, q.hx - 10, q.hy - 3], 2.4, 'bone'); p.line([q.hx + 3, q.hy + 4, q.hx + 3, q.hy + 9], 2, 'white'); },
  elk: (p) => { const q = quad(p, { m: 'fur', belly: 'tan', len: 26, h: 12, head: 4.5, ears: 'pointy', snout: 4, leg: 12, tail: 'stub', x: 28, y: 22, neck: 4 }); for (const d of [-1, 1]) p.line([q.hx + d * 2, q.hy - 3, q.hx + d * 6, q.hy - 10, q.hx + d * 4, q.hy - 17], 1.6, 'bone'); p.line([q.hx - 4, q.hy - 9, q.hx - 9, q.hy - 12], 1.4, 'bone'); p.line([q.hx + 5, q.hy - 9, q.hx + 10, q.hy - 13], 1.4, 'bone'); },
  fawn: (p) => { quad(p, { m: 'tan', len: 20, h: 9, head: 4.5, ears: 'long', snout: 3, leg: 13, tail: 'stub', tailM: 'white', x: 30, y: 22 }); for (let i = 0; i < 5; i++) p.circ(24 + i * 3.5, 20 + (i % 2) * 2.5, 0.9, 'white'); },
  moose: (p) => { const q = quad(p, { m: 'fur', len: 30, h: 15, head: 5.5, ears: 'pointy', snout: 6, snoutM: 'fur', leg: 11, tail: 'stub', x: 27, y: 22, neck: 3 }); p.ell(q.hx - 8, q.hy - 6, 6, 3, 'tan', -0.4); p.ell(q.hx + 7, q.hy - 7, 6, 3, 'tan', 0.4); p.line([q.hx + 2, q.hy + 5, q.hx + 2, q.hy + 10], 2, 'fur'); },
  opossum: (p) => { const q = quad(p, { m: 'gray', len: 22, h: 10, head: 5, ears: 'round', earM: 'pink', snout: 6, snoutM: 'white', leg: 5, tail: 'thin', tailM: 'pink', x: 30, y: 28 }); p.circ(q.hx, q.hy, 4.4, 'white'); p.eye(q.hx + 1.5, q.hy - 1, 1.1); },
  'rat-pile': (p) => { for (const [x, y] of [[20, 34], [42, 34], [31, 24]]) quad(p, { m: 'gray', len: 16, h: 8, head: 4, ears: 'round', earM: 'pink', snout: 4, leg: 2, tail: 'thin', tailM: 'pink', x, y }); },
  'field-mice': (p) => { for (const [x, y, s] of [[16, 34, 0.8], [44, 34, 0.8], [30, 27, 1]] as const) quad(p, { m: 'fur', belly: 'tan', len: 14 * s, h: 8 * s, head: 4 * s, ears: 'round', earM: 'pink', snout: 3 * s, leg: 2, tail: 'thin', tailM: 'pink', x, y }); },
  skunk: (p) => { quad(p, { m: 'black', len: 22, h: 11, head: 5, ears: 'round', snout: 4, leg: 5, tail: 'none', x: 34, y: 29 }); p.ell(16, 18, 7, 11, 'black', -0.3); p.ell(17, 18, 2.4, 10, 'white', -0.3); p.ell(34, 24, 10, 1.8, 'white'); },
  beaver: (p) => { const q = quad(p, { m: 'fur', len: 24, h: 12, head: 6, ears: 'round', snout: 3, leg: 4, tail: 'flat', tailM: 'dark', x: 32, y: 29 }); p.rect(q.hx + 4, q.hy + 3, 3, 3, 'orange'); },
  shark: (p) => { p.poly([10, 26, 2, 16, 6, 26, 2, 36], 'gray'); p.ell(32, 27, 24, 8, 'gray'); p.ell(36, 30, 18, 4, 'white'); p.poly([28, 20, 34, 9, 38, 20], 'gray'); p.eye(48, 25, 1.2); for (let i = 0; i < 4; i++) p.poly([44 + i * 3, 31, 45.5 + i * 3, 33.5, 47 + i * 3, 31], 'white'); p.line([40, 24, 40, 30], 0.9, 'dark'); },
  kingfisher: (p) => { bird(p, { m: 'teal', wing: 'cyan', breast: 'orange', beak: 'long', beakM: 'dark', perch: true, y: 27 }); },
  sparrow: (p) => { bird(p, { m: 'fur', wing: 'tan', breast: 'paper', beak: 'cone', perch: true, y: 27 }); },
  crow: (p) => { bird(p, { m: 'black', wing: 'dark', beak: 'short', beakM: 'gray', perch: true, y: 27 }); },
  vulture: (p) => { bird(p, { m: 'fur', wing: 'black', head: 'pink', beak: 'hook', beakM: 'bone', perch: true, y: 28, s: 1.1 }); p.ell(39, 26, 6, 3, 'white'); },
  pigeon: (p) => { const b = bird(p, { m: 'gray', wing: 'white', breast: 'teal', beak: 'short', beakM: 'dark', y: 27 }); p.rect(b.hx - 14, b.hy + 14, 9, 6, 'paper'); p.line([b.hx - 14, b.hy + 14, b.hx - 9.5, b.hy + 17, b.hx - 5, b.hy + 14], 0.8, 'red'); },
  'grave-robin': (p) => { p.rect(42, 14, 14, 26, 'stone'); p.ell(49, 15, 7, 5, 'stone'); p.line([45, 22, 53, 22], 1, 'dark'); bird(p, { m: 'fur', wing: 'tan', breast: 'orange', beak: 'short', y: 30, x: 24, s: 0.85 }); },
  owl: (p) => { p.line([6, 40, 58, 38], 3, 'wood'); p.ell(32, 26, 12, 14, 'fur'); p.ell(32, 21, 10, 8, 'tan'); p.poly([22, 15, 24, 8, 27, 14], 'fur'); p.poly([37, 14, 40, 8, 42, 15], 'fur'); p.circ(28, 21, 3.2, 'gold'); p.circ(36, 21, 3.2, 'gold'); p.eye(28, 21, 1.6); p.eye(36, 21, 1.6); p.poly([31, 24, 33, 24, 32, 27], 'dark'); },
  'courier-bat': (p) => { bat(p, 'fur'); p.rect(28, 28, 8, 6, 'wood'); p.line([28, 28, 32, 24, 36, 28], 0.8, 'dark'); },
  hive: (p) => { p.line([32, 6, 32, 10], 2, 'wood'); for (let i = 0; i < 5; i++) p.ell(32, 14 + i * 5.5, 8 + i * 2.5 - (i === 4 ? 4 : 0), 3.4, 'gold'); p.ell(32, 33, 3, 2.4, 'dark'); for (const [x, y] of [[14, 20], [50, 26], [46, 14]]) { p.ell(x, y, 2, 1.4, 'gold'); p.ell(x, y - 1.5, 1.6, 1, 'white'); } },
  mantis: (p) => { p.line([14, 36, 22, 30], 4, 'green'); p.ell(24, 30, 9, 4, 'green', -0.5); p.line([30, 26, 38, 14], 3, 'green'); p.poly([36, 10, 44, 12, 38, 16], 'green'); p.eye(40, 12, 1.1); p.line([37, 18, 44, 22, 41, 26], 2, 'green'); p.line([36, 19, 42, 26, 46, 22], 2, 'green'); for (const x of [20, 28]) p.line([x, 32, x - 3, 40], 1.2, 'green'); },
  'mantis-saint': (p) => { ring(p, 40, 9, 5, 1.2, 'gold'); S.mantis(p); p.line([35, 20, 46, 18, 48, 13], 2, 'green'); p.line([34, 22, 46, 28, 50, 26], 2, 'green'); },
  cockroach: (p) => { bug(p, { m: 'fur', segs: [[18, 10], [6, 7], [4, 5]], antennae: 10, shell: true }); },
  ant: (p) => { bug(p, { m: 'black', segs: [[12, 9], [5, 5], [7, 6]], antennae: 4 }); },
  'ant-queen': (p) => { bug(p, { m: 'red', segs: [[20, 12], [6, 6], [7, 6]], antennae: 4, wings: 'white' }); crown(p, 44, 16, 0.4); },
  'battery-beetle': (p) => { bug(p, { m: 'teal', segs: [[18, 12], [6, 7], [5, 5]], antennae: 2, shell: true }); p.rect(20, 17, 14, 7, 'metal'); p.rect(34, 19, 2, 3, 'gold'); p.rect(21, 18, 5, 5, 'green'); },
  'phalanx-beetle': (p) => { bug(p, { m: 'metal', segs: [[20, 13], [7, 8], [5, 6]], antennae: 1, shell: true }); shield(p, 46, 26, 0.5); },
  'stink-bug': (p) => { cloud(p, 14, 20, 0.6, 'green'); p.poly([22, 24, 44, 24, 40, 34, 26, 34], 'fur'); p.ell(33, 24, 11, 4, 'fur'); p.circ(46, 26, 3, 'fur'); p.eye(47, 25, 0.9); for (const x of [27, 33, 39]) p.line([x, 33, x - 2, 39], 1.2, 'dark'); },
  'grave-maggots': (p) => { ground(p, 'fur', 38); bone(p, 16, 38, 40, 35, 2.2); for (const [x, y, a] of [[22, 30, 0.3], [34, 28, -0.4], [44, 32, 0.6], [28, 36, 0]] as const) { p.ell(x, y, 5, 2.4, 'paper', a); p.circ(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 1.6, 'tan'); } },
  'mixed-beast': (p) => chimera(p, 'fur'),
  'medic-mouse': (p) => { quad(p, { m: 'gray', belly: 'white', len: 18, h: 10, head: 5, ears: 'round', earM: 'pink', snout: 3.5, leg: 3, tail: 'thin', tailM: 'pink', x: 30, y: 31 }); p.rect(22, 19, 10, 8, 'white'); p.rect(26, 20, 2, 6, 'red'); p.rect(24, 22, 6, 2, 'red'); },
  'pack-rat': (p) => { quad(p, { m: 'gray', len: 20, h: 10, head: 5, ears: 'round', earM: 'pink', snout: 5, leg: 3, tail: 'thin', tailM: 'pink', x: 30, y: 30 }); p.rect(20, 15, 13, 11, 'wood'); p.rect(21, 14, 11, 3, 'cloth'); },
  herald: (p) => { person(p, { robe: 'red', head: 'plain', holdR: (x, y) => { p.line([x, y, x + 8, y - 8], 2, 'gold'); p.poly([x + 7, y - 11, x + 12, y - 4, x + 9, y - 8], 'gold'); p.rect(x + 2, y - 5, 6, 4, 'cloth'); } }); },
  'corner-archer': (p) => { p.rect(4, 6, 8, 36, 'stone'); p.rect(4, 34, 56, 8, 'stone'); person(p, { x: 34, robe: 'green', head: 'hood', eyes: 'white', holdR: (x, y) => { p.line([x, y - 12, x + 4, y, x, y + 12], 1.6, 'wood'); p.line([x, y - 12, x, y + 12], 0.7, 'white'); } }); },
  'bridge-troll': (p) => { p.poly([2, 8, 62, 8, 62, 14, 50, 14, 46, 22, 18, 22, 14, 14, 2, 14], 'stone'); person(p, { robe: 'fur', skin: 'green', head: 'orc', big: true, legs: 'green' }); },
  rook: (p) => { p.rect(20, 18, 24, 20, 'stone'); for (let i = 0; i < 3; i++) p.rect(19 + i * 9, 12, 6, 7, 'stone'); p.rect(16, 37, 32, 4, 'stone'); p.rect(29, 26, 6, 8, 'dark'); },
  sapper: (p) => { person(p, { robe: 'fur', head: 'helmet', holdR: (x, y) => { p.line([x, y - 10, x, y + 8], 1.8, 'wood'); p.ell(x, y + 10, 3, 3.4, 'metal'); }, holdL: (x, y) => { p.circ(x - 2, y + 3, 4, 'black'); p.line([x - 2, y - 1, x, y - 5], 1, 'wood'); p.circ(x + 0.5, y - 6, 1.3, 'gold'); } }); },
  armadillo: (p) => { quad(p, { m: 'pink', len: 26, h: 14, head: 4.5, ears: 'pointy', snout: 5, leg: 4, tail: 'thin', x: 30, y: 29 }); for (let i = 0; i < 5; i++) p.ell(22 + i * 4.5, 26, 2.4, 6.5, i % 2 ? 'gray' : 'stone'); },
  raccoon: (p) => { const q = quad(p, { m: 'gray', belly: 'white', len: 22, h: 11, head: 5.5, ears: 'round', snout: 4, snoutM: 'white', leg: 5, tail: 'bushy', x: 32, y: 28 }); p.rect(q.hx - 3, q.hy - 2, 7, 2.6, 'black'); p.eye(q.hx + 1.5, q.hy - 1, 1, 'white'); for (let i = 0; i < 3; i++) p.ell(14 + i * 2.5, 22 + i * 1.4, 1, 3, 'black', -0.6); },
  drummer: (p) => { person(p, { x: 22, robe: 'red', head: 'plain', holdR: (x, y) => { p.line([x, y, x + 5, y - 6], 1.4, 'wood'); } }); p.ell(42, 32, 10, 9, 'red'); p.ell(42, 25, 10, 3, 'paper'); for (let i = 0; i < 4; i++) p.line([34 + i * 5, 26, 36 + i * 5, 39], 0.8, 'gold'); },
  'totem-pole': (p) => { p.poly([10, 14, 32, 18, 54, 14, 52, 20, 32, 22, 12, 20], 'red'); for (let i = 0; i < 3; i++) { const y = 16 + i * 9; p.rect(24, y, 16, 8.5, i % 2 ? 'wood' : 'tan'); p.eye(28, y + 3, 1.2); p.eye(36, y + 3, 1.2); p.rect(29, y + 5.5, 6, 1.4, 'dark'); } p.poly([28, 16, 36, 16, 32, 8], 'green'); },
  squire: (p) => { person(p, { robe: 'cloth', head: 'helmet', s: 0.85, holdR: (x, y) => p.line([x, y, x + 3, y - 12], 2.4, 'wood') }); },
  warren: (p) => { p.ell(32, 36, 28, 13, 'fur'); for (const [x, y] of [[20, 34], [40, 32], [31, 40]]) p.ell(x, y, 4, 3, 'dark'); p.ell(38, 26, 1.6, 5, 'white', 0.2); p.ell(42, 26, 1.6, 5, 'white', -0.2); },
  // spells, shared
  jab: (p) => { speed(p, 12, 20, 3); fist(p, 34, 26, 1); },
  brace: (p) => { shield(p, 32, 25, 1.2); },
  haymaker: (p) => { p.line([10, 36, 18, 18, 30, 12], 2, 'white'); fist(p, 38, 18, 1.15); },
  sweep: (p) => { p.line([8, 30, 20, 38, 40, 38, 56, 28], 4, 'white'); p.line([12, 28, 22, 34, 40, 34, 52, 26], 1.6, 'cyan'); },
  'iron-skin': (p) => { fist(p, 32, 26, 1.2, 'metal'); p.line([20, 22, 20, 30], 1, 'dark'); },
  pommel: (p) => { sword(p, 28, 34, 48, 10); speed(p, 22, 32, 2); },
  rally: (p) => { p.line([22, 42, 22, 8], 2, 'wood'); p.poly([23, 9, 46, 13, 38, 18, 46, 23, 23, 24], 'red'); },
  'toxin-dart': (p) => { p.line([12, 34, 44, 18], 2, 'wood'); p.poly([12, 34, 6, 32, 9, 38], 'red'); p.poly([44, 18, 52, 14, 47, 21], 'metal'); drop(p, 52, 26, 0.45, 'green'); },
  'noxious-cloud': (p) => { cloud(p, 32, 24, 1.3, 'green'); skull(p, 32, 24, 0.55); },
  backflip: (p) => { arrow(p, [40, 36, 46, 22, 36, 12, 24, 16, 22, 30], 3, 'white'); },
  bloodletting: (p) => { knife(p, 14, 38, 42, 14); drop(p, 46, 30, 0.7); },
  'blood-rite': (p) => { p.rect(18, 30, 28, 10, 'stone'); ring(p, 32, 20, 10, 1.4, 'red'); drop(p, 32, 20, 0.8); },
  'bone-reading': (p) => { bone(p, 14, 34, 30, 24); bone(p, 34, 36, 50, 30); bone(p, 26, 16, 40, 22); p.circ(46, 18, 3, 'gold'); },
  shove: (p) => { hand(p, 34, 26, 0.95, 'skin'); speed(p, 16, 18, 3); },
  crossover: (p) => { arrow(p, [12, 34, 32, 22, 50, 12], 3, 'white'); arrow(p, [12, 12, 32, 22, 50, 34], 3, 'gold'); },
  'hand-me-down': (p) => { hand(p, 26, 18, 0.8, 'skin', false); p.rect(28, 28, 10, 14, 'paper'); p.rect(29.5, 30, 7, 5, 'cyan'); },
  'spare-battery': (p) => { p.rect(20, 14, 24, 26, 'metal'); p.rect(28, 10, 8, 4, 'gold'); p.rect(23, 26, 18, 11, 'green'); p.rect(30, 16, 4, 8, 'white'); p.rect(28, 18, 8, 3, 'white'); },
  'pep-talk': (p) => { bubble(p, 32, 22, 16, 11); p.rect(30.5, 15, 3, 9, 'red'); p.circ(32, 28, 1.8, 'red'); },
  'air-drop': (p) => { p.ell(32, 14, 18, 8, 'red'); for (const x of [16, 32, 48]) p.line([x, 16, 32, 28], 0.8, 'white'); p.rect(24, 28, 16, 12, 'wood'); p.line([24, 34, 40, 34], 1, 'dark'); },
  'cover-fire': (p) => { for (let i = 0; i < 3; i++) { p.line([10, 16 + i * 8, 30, 16 + i * 8], 1.2, 'gold'); p.ell(34, 16 + i * 8, 4, 1.6, 'metal'); } flame(p, 54, 28, 0.5); },
  'double-up': (p) => { p.rect(16, 12, 18, 26, 'paper'); p.rect(28, 8, 18, 26, 'paper'); p.rect(30, 10, 14, 10, 'cyan'); p.line([33, 26, 41, 26], 1.6, 'gray'); },
  'blood-pact': (p) => { hand(p, 22, 28, 0.7, 'skin'); hand(p, 42, 28, 0.7, 'pink'); drop(p, 32, 14, 0.7); },
  catalyst: (p) => { flask(p, 32, 28, 1, 'purple'); for (const [x, y] of [[28, 10], [36, 6], [31, 2]]) p.circ(x, y + 6, 1.6, 'purple'); },
  disarm: (p) => { sword(p, 14, 36, 30, 22); p.line([36, 18, 50, 8], 3.4, 'metal'); hand(p, 26, 40, 0.5, 'skin'); },
  feint: (p) => { sword(p, 18, 38, 36, 12, 'purple'); sword(p, 28, 38, 46, 12); },
  footwork: (p) => { for (const [x, y, a] of [[18, 34, 0.3], [30, 24, -0.3], [42, 30, 0.3], [52, 18, -0.3]] as const) { p.ell(x, y, 3.4, 5, 'paper', a); p.circ(x + Math.sin(a) * 6, y - 6, 1.6, 'paper'); } },
  shockwave: (p) => { for (let i = 0; i < 3; i++) ring(p, 32, 26, 5 + i * 6, 2 - i * 0.3, i % 2 ? 'cyan' : 'white'); p.circ(32, 26, 3, 'gold'); },
  bulwark: (p) => { p.rect(18, 8, 28, 34, 'metal'); p.rect(20, 10, 24, 30, 'gray'); p.rect(30, 12, 4, 26, 'gold'); p.rect(22, 22, 20, 4, 'gold'); },
  reinforce: (p) => { bricks(p, 10, 22, 5, 4); p.rect(44, 8, 4, 14, 'green'); p.rect(39, 13, 14, 4, 'green'); },
  'steady-hands': (p) => { hand(p, 20, 26, 0.75); hand(p, 44, 26, 0.75); p.line([12, 14, 52, 14], 1, 'white'); },
  'war-cry': (p) => { p.poly([12, 30, 30, 22, 30, 38], 'gold'); p.rect(8, 27, 5, 6, 'wood'); waves(p, 30, 30, 3, 'white'); },
  'shield-wall': (p) => { for (let i = 0; i < 3; i++) shield(p, 16 + i * 16, 26, 0.85, i === 1 ? 'cloth' : 'metal'); },
  formation: (p) => { for (const [x, y] of [[32, 14], [22, 28], [42, 28], [12, 40], [32, 40], [52, 40]]) shield(p, x, y - 4, 0.38); },
  'share-the-load': (p) => { p.rect(22, 18, 20, 14, 'wood'); p.line([22, 25, 42, 25], 1, 'dark'); hand(p, 18, 30, 0.55); hand(p, 46, 30, 0.55); },
  clothesline: (p) => { p.line([6, 24, 40, 24], 5, 'skin'); fist(p, 46, 24, 0.7); speed(p, 20, 30, 2); },
  uppercut: (p) => { arrow(p, [20, 42, 26, 30, 30, 22], 2, 'white'); fist(p, 38, 18, 0.95); },
  bludgeon: (p) => { p.line([14, 38, 40, 16], 4, 'wood'); p.ell(42, 14, 7, 5.5, 'wood', -0.7); for (const [x, y] of [[40, 9], [47, 13], [44, 19]]) p.circ(x, y, 1.4, 'metal'); },
  dropkick: (p) => { p.line([14, 16, 34, 26], 5, 'cloth'); p.poly([32, 22, 44, 22, 46, 30, 34, 30], 'dark'); speed(p, 22, 34, 2); },
  'bad-temper': (p) => { p.circ(32, 26, 13, 'red'); p.line([24, 21, 30, 24], 2, 'dark'); p.line([40, 21, 34, 24], 2, 'dark'); p.eye(27, 26, 1.4); p.eye(37, 26, 1.4); p.line([26, 34, 32, 31, 38, 34], 2, 'dark'); cloud(p, 48, 10, 0.4, 'white'); },
  dash: (p) => { speed(p, 30, 16, 4, 'cyan'); arrow(p, [30, 26, 54, 26], 3.5, 'white'); },
  'signal-flare': (p) => { p.line([28, 42, 32, 20], 2, 'gray'); p.circ(33, 14, 5, 'red'); p.circ(33, 14, 2.6, 'gold'); for (const [x, y] of [[24, 10], [42, 12], [36, 4]]) p.circ(x, y, 1.2, 'orange'); },
  feed: (p) => { p.ell(30, 24, 11, 8, 'fur', -0.5); p.line([38, 30, 46, 36], 3, 'bone'); p.circ(47, 37, 2.2, 'bone'); p.circ(45, 38.5, 2.2, 'bone'); },
  'bouncing-flask': (p) => { p.line([8, 38, 16, 18, 24, 38, 30, 26], 1.2, 'white'); flask(p, 40, 24, 0.75, 'orange'); },
  terror: (p) => { p.ell(32, 24, 14, 15, 'white'); p.ell(26, 20, 3, 5, 'dark'); p.ell(38, 20, 3, 5, 'dark'); p.ell(32, 33, 5, 7, 'dark'); },
  'leg-sweep': (p) => { p.line([12, 20, 22, 34, 46, 36], 5, 'cloth'); p.poly([44, 32, 54, 33, 54, 39, 44, 39], 'dark'); p.line([10, 40, 50, 42], 1.5, 'white'); },
  grit: (p) => { p.ell(32, 26, 18, 10, 'red'); p.rect(18, 20, 28, 12, 'dark'); for (let i = 0; i < 6; i++) { p.rect(19 + i * 4.6, 20.5, 4, 5, 'bone'); p.rect(19 + i * 4.6, 26.5, 4, 5, 'bone'); } },
  blur: (p) => { for (let i = 0; i < 4; i++) p.ell(18 + i * 6, 26, 6, 10, i === 3 ? 'cloth' : 'gray'); speed(p, 12, 18, 4, 'white'); },
  fortify: (p) => { p.rect(22, 16, 20, 26, 'stone'); for (let i = 0; i < 3; i++) p.rect(21 + i * 8, 10, 6, 7, 'stone'); p.rect(29, 30, 6, 12, 'wood'); p.rect(30, 20, 4, 5, 'dark'); },
  adrenaline: (p) => { heart(p, 32, 24, 1.3); bolt(p, 34, 24, 0.7, 'gold'); },
  'sharpen-up': (p) => { p.rect(12, 32, 40, 8, 'stone'); knife(p, 52, 20, 22, 30); for (const [x, y] of [[20, 26], [16, 22], [24, 22]]) p.circ(x, y, 1, 'gold'); },
  'swap-places': (p) => { arrow(p, [12, 20, 50, 20], 3, 'white'); arrow(p, [52, 32, 14, 32], 3, 'gold'); },
  'trade-places': (p) => { p.circ(16, 24, 6, 'cloth'); p.circ(48, 24, 6, 'green'); arrow(p, [22, 14, 32, 8, 42, 14], 2.2, 'white'); arrow(p, [42, 34, 32, 40, 22, 34], 2.2, 'white'); },
  rotation: (p) => { arrow(p, [44, 16, 32, 10, 20, 18, 18, 30], 2.6, 'white'); arrow(p, [20, 36, 32, 42, 44, 34, 46, 22], 2.6, 'gold'); },
  'lend-a-hand': (p) => { hand(p, 22, 30, 0.75, 'skin'); hand(p, 42, 22, 0.75, 'tan', false); },
  'charge-up': (p) => { bolt(p, 32, 26, 1.3); ring(p, 32, 26, 15, 1, 'cyan'); },
  knife: (p) => knife(p, 14, 38, 50, 12),
  // Blue
  'throwing-knives': (p) => { knife(p, 8, 36, 30, 22); knife(p, 14, 26, 38, 14); knife(p, 22, 42, 46, 30); speed(p, 8, 14, 2); },
  'hidden-blade': (p) => { p.ell(24, 30, 14, 9, 'cloth', -0.2); p.circ(36, 28, 4, 'skin'); p.poly([38, 30, 56, 22, 38, 26], 'metal'); },
  whetstone: (p) => { p.rect(14, 26, 36, 12, 'stone'); p.rect(14, 26, 36, 3, 'gray'); knife(p, 20, 22, 46, 16); },
  'knife-juggler': (p) => { person(p, { robe: 'cloth', head: 'plain' }); for (const [x, y, a] of [[18, 8, 0.6], [32, 4, 0], [46, 8, -0.6]] as const) knife(p, x - Math.sin(a) * 5, y + 5, x + Math.sin(a) * 4, y - 4); },
  'fan-of-knives': (p) => { for (let i = 0; i < 5; i++) { const a = -2.4 + i * 0.4; knife(p, 32, 38, 32 + Math.cos(a) * 24, 38 + Math.sin(a) * 24); } },
  'sharp-word': (p) => { bubble(p, 32, 22, 18, 12); knife(p, 20, 24, 44, 20); },
  kneel: (p) => { p.circ(48, 12, 6, 'gold'); person(p, { x: 26, robe: 'cloth', head: 'plain', kneel: true }); },
  vigil: (p) => { p.rect(27, 22, 10, 18, 'paper'); flame(p, 32, 18, 0.55); ring(p, 32, 14, 9, 0.8, 'gold'); },
  psalm: (p) => { p.poly([8, 18, 32, 22, 32, 40, 8, 36], 'paper'); p.poly([56, 18, 32, 22, 32, 40, 56, 36], 'paper'); for (let i = 0; i < 3; i++) { p.line([12, 24 + i * 4, 28, 27 + i * 4], 0.8, 'gray'); p.line([36, 27 + i * 4, 52, 24 + i * 4], 0.8, 'gray'); } p.circ(32, 12, 4, 'gold'); },
  'kings-wrath': (p) => { crown(p, 32, 14, 1); bolt(p, 32, 32, 0.8); },
  'kings-decree': (p) => { p.rect(14, 12, 36, 26, 'paper'); p.ell(14, 25, 3, 13, 'tan'); p.ell(50, 25, 3, 13, 'tan'); for (let i = 0; i < 3; i++) p.line([20, 18 + i * 5, 44, 18 + i * 5], 0.8, 'gray'); p.circ(40, 34, 4, 'red'); },
  'kings-shelter': (p) => { p.poly([10, 26, 32, 10, 54, 26], 'cloth'); p.rect(16, 26, 32, 14, 'stone'); crown(p, 32, 34, 0.5); },
  'dagger-rain': (p) => { for (const [x, y] of [[14, 8], [26, 14], [38, 6], [50, 16], [32, 24]]) knife(p, x, y, x, y + 16); },
  'kingsguard-oath': (p) => { shield(p, 32, 26, 1.3, 'cloth'); crown(p, 32, 22, 0.55); },
  'prayer-beads': (p) => { for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; p.circ(32 + Math.cos(a) * 13, 22 + Math.sin(a) * 10, 2.2, i % 4 ? 'wood' : 'gold'); } p.line([32, 32, 32, 40], 1, 'gold'); p.rect(30, 38, 4, 4, 'gold'); },
  assassinate: (p) => { knife(p, 16, 36, 46, 12); drop(p, 46, 22, 0.5); drop(p, 50, 32, 0.4); },
  'crowns-mercy': (p) => { crown(p, 32, 14, 0.9); heart(p, 32, 30, 0.9, 'red'); },
  'divine-right': (p) => { for (let i = 0; i < 8; i++) { const a = -Math.PI + (i / 7) * Math.PI; p.line([32 + Math.cos(a) * 12, 24 + Math.sin(a) * 12, 32 + Math.cos(a) * 22, 24 + Math.sin(a) * 18], 1.4, 'gold'); } crown(p, 32, 24, 1); },
  'kings-ransom': (p) => { for (const [x, y] of [[18, 38], [26, 38], [34, 38], [42, 38], [22, 34], [30, 34], [38, 34], [26, 30], [34, 30]]) coin(p, x, y); crown(p, 32, 18, 0.8); },
  'royal-guard': (p) => { person(p, { robe: 'cloth', head: 'helmet', holdR: (x, y) => { p.line([x, y + 10, x, y - 22], 1.8, 'wood'); p.poly([x - 4, y - 18, x, y - 26, x + 4, y - 18, x, y - 14], 'metal'); } }); },
  oathsworn: (p) => { person(p, { x: 28, robe: 'metal', head: 'helmet', kneel: true, holdR: (x, y) => sword(p, x, y + 2, x + 2, y - 22) }); },
  martyr: (p) => { ring(p, 32, 6, 6, 1.4, 'gold'); person(p, { robe: 'white', head: 'plain' }); },
  'herald-of-the-king': (p) => { p.line([14, 26, 46, 14], 2.6, 'gold'); p.poly([44, 8, 54, 12, 48, 20], 'gold'); p.poly([20, 25, 38, 18, 38, 32, 24, 36], 'cloth'); crown(p, 30, 26, 0.35); },
  'knight-errant': (p) => { person(p, { robe: 'metal', head: 'helmet', legs: 'metal', holdR: (x, y) => { p.line([x - 2, y + 6, x + 14, y - 20], 2, 'wood'); p.poly([x + 13, y - 19, x + 20, y - 18, x + 15, y - 14], 'red'); } }); },
  // Pistachio
  'run-firewall': (p) => { bricks(p, 10, 22, 5, 4, 0, 'red'); for (const x of [16, 28, 40, 50]) flame(p, x, 20, 0.5); },
  'deploy-exploit': (p) => { screen(p, 32, 22, 30, 18, 'dark'); bug(p, { m: 'green', segs: [[8, 6], [4, 4]], x: 32, y: 22, antennae: 2 }); },
  'upload-virus': (p) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.line([28 + Math.cos(a) * 8, 26 + Math.sin(a) * 8, 28 + Math.cos(a) * 13, 26 + Math.sin(a) * 13], 1.6, 'green'); p.circ(28 + Math.cos(a) * 13, 26 + Math.sin(a) * 13, 1.6, 'green'); } p.circ(28, 26, 8, 'green'); p.eye(26, 25, 1); p.eye(31, 25, 1); arrow(p, [50, 38, 50, 14], 3, 'cyan'); },
  botnet: (p) => { const n = [[14, 14], [32, 10], [50, 16], [20, 34], [42, 36], [32, 24]]; for (const [x, y] of n) p.line([32, 24, x, y], 1, 'cyan'); for (const [x, y] of n) { p.rect(x - 4, y - 3, 8, 6, 'metal'); p.rect(x - 3, y - 2, 6, 3, 'green'); } },
  reboot: (p) => { p.line([24, 14, 18, 22, 20, 32, 32, 38, 44, 32, 46, 22, 40, 14], 3, 'green'); p.line([32, 8, 32, 24], 3, 'green'); },
  hack: (p) => { screen(p, 32, 22, 34, 22, 'dark'); for (let i = 0; i < 4; i++) p.line([18, 15 + i * 4, 18 + 8 + ((i * 7) % 14), 15 + i * 4], 1.2, 'green'); },
  glitch: (p) => { for (let i = 0; i < 6; i++) p.rect(10 + ((i * 13) % 20), 10 + i * 5, 26, 4, i % 3 === 0 ? 'cyan' : i % 3 === 1 ? 'pink' : 'green'); },
  'patch-notes': (p) => { p.rect(18, 8, 28, 34, 'paper'); for (let i = 0; i < 5; i++) { p.circ(23, 15 + i * 5.5, 1, 'green'); p.line([26, 15 + i * 5.5, 40, 15 + i * 5.5], 0.9, 'gray'); } },
  'one-up': (p) => { heart(p, 26, 24, 1.1, 'green'); p.rect(42, 18, 3, 12, 'white'); p.rect(37.5, 22.5, 12, 3, 'white'); p.rect(50, 18, 2.6, 12, 'white'); },
  bug: (p) => { bug(p, { m: 'red', segs: [[14, 11], [6, 7], [5, 5]], antennae: 3, shell: true }); for (const [x, y] of [[16, 14], [46, 36]]) p.rect(x, y, 6, 2, 'cyan'); },
  'cheat-code': (p) => { p.ell(32, 28, 20, 10, 'black'); p.rect(16, 25, 8, 2.6, 'gray'); p.rect(18.7, 22.3, 2.6, 8, 'gray'); p.circ(42, 25, 2, 'red'); p.circ(46, 29, 2, 'green'); arrow(p, [22, 12, 32, 12], 1.6, 'gold'); arrow(p, [42, 14, 42, 6], 1.6, 'gold'); },
  'evil-monologue': (p) => { bubble(p, 34, 20, 18, 11, 'paper'); for (const x of [26, 33, 40]) p.circ(x, 20, 1.8, 'dark'); p.poly([20, 10, 22, 2, 26, 8], 'red'); p.poly([42, 8, 46, 2, 48, 10], 'red'); },
  'level-up': (p) => { arrow(p, [32, 40, 32, 14], 5, 'green'); for (const [x, y] of [[18, 14], [46, 12], [40, 28]]) p.circ(x, y, 1.6, 'gold'); },
  multitask: (p) => { for (let i = 0; i < 3; i++) { p.rect(12 + i * 8, 10 + i * 7, 24, 16, 'metal'); p.rect(13 + i * 8, 13 + i * 7, 22, 12, i === 2 ? 'cyan' : 'dark'); } },
  overclock: (p) => { p.ell(32, 30, 18, 14, 'metal'); p.ell(32, 30, 15, 11, 'dark'); p.line([32, 32, 44, 22], 2, 'red'); for (let i = 0; i < 5; i++) { const a = Math.PI + (i / 4) * Math.PI; p.circ(32 + Math.cos(a) * 12, 30 + Math.sin(a) * 9, 1, i > 2 ? 'red' : 'green'); } flame(p, 50, 18, 0.4); },
  speedrun: (p) => { p.circ(32, 27, 14, 'metal'); p.circ(32, 27, 11, 'paper'); p.rect(30, 9, 4, 4, 'metal'); p.line([32, 27, 32, 19], 1.6, 'dark'); p.line([32, 27, 38, 30], 1.6, 'red'); speed(p, 14, 20, 3); },
  'rage-quit': (p) => { p.poly([12, 22, 30, 20, 26, 36, 14, 36], 'black'); p.poly([34, 20, 52, 22, 50, 36, 38, 36], 'black'); p.circ(20, 28, 2, 'gray'); p.circ(44, 28, 2, 'red'); p.line([30, 18, 34, 24, 30, 30, 34, 38], 1.2, 'gold'); },
  'save-scum': (p) => { p.rect(16, 10, 32, 32, 'black'); p.rect(22, 10, 18, 11, 'metal'); p.rect(34, 12, 4, 7, 'dark'); p.rect(20, 26, 24, 14, 'paper'); },
  'boss-music': (p) => { p.circ(22, 34, 5, 'white'); p.circ(42, 30, 5, 'white'); p.rect(25, 10, 3, 24, 'white'); p.rect(45, 6, 3, 24, 'white'); p.poly([25, 10, 48, 6, 48, 12, 25, 16], 'white'); skull(p, 34, 26, 0.35); },
  'remote-control': (p) => { p.rect(24, 14, 14, 28, 'black'); p.circ(31, 19, 2.6, 'red'); for (let i = 0; i < 3; i++) p.rect(27, 25 + i * 4.5, 8, 2.4, 'gray'); waves(p, 34, 10, 3, 'cyan'); },
  'firmware-update': (p) => { p.rect(20, 16, 24, 20, 'black'); for (let i = 0; i < 4; i++) { p.rect(16, 18 + i * 4.5, 4, 2, 'gold'); p.rect(44, 18 + i * 4.5, 4, 2, 'gold'); } arrow(p, [32, 6, 32, 30], 3, 'green'); },
  minion: (p) => { robot(p, { body: 'green', face: 'dark', wide: 16, legs: true, antenna: true }); },
  'lab-drone': (p) => { for (const x of [16, 48]) { p.line([x, 18, 32, 24], 2, 'metal'); p.ell(x, 16, 9, 1.6, 'gray'); } p.ell(32, 26, 9, 6, 'metal'); p.circ(32, 29, 3.4, 'dark'); p.eye(32, 29, 1.6, 'red'); },
  turret: (p) => { p.poly([16, 42, 48, 42, 42, 32, 22, 32], 'metal'); p.ell(32, 28, 11, 7, 'green'); p.rect(38, 24, 18, 4, 'gray'); p.eye(28, 27, 1.6, 'red'); },
  henchbot: (p) => { robot(p, { body: 'metal', face: 'red', wide: 22, treads: true, claws: true }); },
  henchman: (p) => { person(p, { robe: 'black', head: 'goggles', skin: 'skin', holdR: (x, y) => p.line([x, y, x + 3, y - 10], 2.4, 'wood') }); },
  'mad-scientist': (p) => { person(p, { robe: 'white', head: 'hair', legs: 'dark', holdR: (x, y) => flask(p, x + 2, y - 4, 0.45, 'green') }); p.rect(28, 14.5, 8, 2, 'cyan'); },
  // enemies
  hunger: (p) => maw(p, 'purple'),
  devourer: (p) => maw(p, 'red', 22, 14),
  grub: (p) => { p.line([14, 32, 18, 22, 28, 18, 40, 22, 44, 30], 8, 'paper'); for (let i = 0; i < 5; i++) p.line([16 + i * 7, 20 + (i === 2 ? -2 : 0), 17 + i * 7, 28], 0.8, 'tan'); p.circ(45, 32, 4, 'fur'); p.eye(46, 31, 0.9); },
  rat: (p) => { quad(p, { m: 'gray', len: 24, h: 11, head: 5.5, ears: 'round', earM: 'pink', snout: 6, leg: 4, tail: 'thin', tailM: 'pink', x: 32, y: 28, eyeM: 'red' }); },
  goblin: (p) => { person(p, { robe: 'fur', skin: 'green', head: 'goblin', eyes: 'red', holdR: (x, y) => knife(p, x, y + 2, x + 4, y - 10) }); },
  'goblin-chief': (p) => { person(p, { robe: 'red', skin: 'green', head: 'goblin', eyes: 'red', big: true, holdR: (x, y) => { p.line([x, y + 8, x, y - 18], 1.6, 'wood'); skull(p, x, y - 20, 0.35); } }); for (let i = 0; i < 3; i++) p.line([28 + i * 4, 8, 26 + i * 6, 0], 1.6, i === 1 ? 'red' : 'gold'); },
  'goblin-again': (p) => { person(p, { robe: 'fur', skin: 'green', head: 'goblin', eyes: 'red' }); p.rect(25, 11, 14, 2.4, 'white'); p.rect(33, 13, 2, 4, 'white'); },
  slime: (p) => slime(p, 'green'),
  'small-slime': (p) => slime(p, 'green', 0.6),
  bat: (p) => bat(p, 'black'),
  'venom-bat': (p) => { bat(p, 'black', 32, 24, 'green'); drop(p, 32, 36, 0.4, 'green'); },
  archer: (p) => { person(p, { robe: 'fur', head: 'hood', eyes: 'red', holdR: (x, y) => { p.line([x, y - 12, x + 5, y, x, y + 12], 1.6, 'wood'); p.line([x, y - 12, x, y + 12], 0.7, 'white'); } }); },
  skeleton: (p) => { for (let i = 0; i < 4; i++) p.rect(26, 19 + i * 3, 12, 1.6, 'bone'); p.rect(31, 18, 2, 14, 'bone'); bone(p, 26, 20, 18, 30, 1.6); bone(p, 38, 20, 46, 30, 1.6); bone(p, 29, 32, 27, 42, 1.6); bone(p, 35, 32, 37, 42, 1.6); skull(p, 32, 12, 0.7); },
  'half-wall': (p) => { bricks(p, 8, 24, 6, 4, 3); p.rect(44, 8, 2, 34, 'wood'); p.rect(10, 16, 40, 2, 'wood'); p.ell(48, 38, 5, 3, 'gray'); },
  knight: (p) => { person(p, { robe: 'metal', head: 'helmet', legs: 'metal', eyes: 'red', holdR: (x, y) => sword(p, x, y + 4, x + 4, y - 18), holdL: (x, y) => shield(p, x, y + 2, 0.55, 'red') }); },
  'small-dragon': (p) => { p.poly([24, 22, 12, 8, 30, 16], 'red'); p.poly([30, 22, 40, 6, 42, 18], 'red'); p.line([18, 32, 10, 34, 6, 28], 3, 'red'); quad(p, { m: 'red', belly: 'gold', len: 22, h: 11, head: 5, ears: 'none', snout: 5, leg: 6, x: 28, y: 29, eyeM: 'gold' }); flame(p, 54, 22, 0.35); },
  cultist: (p) => { person(p, { robe: 'purple', head: 'hood', eyes: 'red', holdR: (x, y) => { p.rect(x - 2, y - 6, 4, 6, 'paper'); flame(p, x, y - 8, 0.25); } }); },
  'cult-elder': (p) => { person(p, { robe: 'purple', head: 'hood', eyes: 'gold', big: true, holdR: (x, y) => { p.line([x, y + 8, x, y - 22], 1.8, 'wood'); p.circ(x, y - 23, 3, 'gold'); } }); },
  spitter: (p) => { p.ell(28, 30, 14, 9, 'green'); p.ell(30, 33, 9, 4, 'tan'); p.circ(24, 21, 3.5, 'green'); p.circ(34, 21, 3.5, 'green'); p.eye(24, 20, 1.4); p.eye(34, 20, 1.4); p.line([40, 30, 46, 28], 2, 'dark'); for (const [x, y, r] of [[50, 26, 2.6], [56, 22, 1.8], [54, 30, 1.4]]) p.circ(x, y, r, 'green'); },
  brute: (p) => { person(p, { robe: 'fur', skin: 'tan', head: 'plain', big: true, eyes: 'red', holdR: (x, y) => { p.line([x, y + 6, x + 6, y - 12], 3, 'wood'); p.ell(x + 7, y - 14, 4, 6, 'wood', 0.4); } }); },
  mimic: (p) => { p.rect(14, 26, 36, 14, 'wood'); p.rect(14, 24, 36, 3, 'gold'); p.poly([14, 22, 50, 22, 50, 10, 14, 6], 'wood'); p.rect(14, 20, 36, 2.6, 'gold'); for (let i = 0; i < 6; i++) { p.poly([16 + i * 6, 22, 19 + i * 6, 26, 22 + i * 6, 22], 'bone'); } p.ell(32, 30, 8, 2.4, 'red'); p.eye(24, 14, 1.4, 'gold'); p.eye(40, 14, 1.4, 'gold'); },
  'sir-tutorial': (p) => { person(p, { x: 26, robe: 'metal', head: 'helmet', legs: 'metal', holdR: (x, y) => p.line([x, y, x + 12, y - 14], 1.2, 'wood') }); p.rect(42, 10, 18, 14, 'paper'); p.line([47, 14, 49, 12, 53, 12, 55, 14, 51, 17, 51, 19], 1.4, 'red'); p.circ(51, 21.5, 0.9, 'red'); },
  'tutorial-steed': (p) => { p.line([20, 42, 36, 18], 2.4, 'wood'); p.ell(40, 16, 8, 5, 'white', -0.4); p.ell(46, 19, 4, 3, 'white'); p.eye(41, 14, 1); p.line([34, 12, 36, 20], 2.4, 'black'); },
  orc: (p) => { person(p, { robe: 'fur', skin: 'green', head: 'orc', big: true, eyes: 'red', holdR: (x, y) => { p.line([x, y + 6, x, y - 16], 2, 'wood'); p.poly([x, y - 16, x + 8, y - 12, x + 8, y - 6, x, y - 8], 'metal'); } }); },
  'orc-shaman': (p) => { person(p, { robe: 'red', skin: 'green', head: 'orc', eyes: 'gold', holdR: (x, y) => { p.line([x, y + 8, x, y - 20], 1.6, 'wood'); skull(p, x, y - 22, 0.35); } }); },
  wraith: (p) => { p.poly([18, 24, 46, 24, 50, 42, 42, 36, 36, 42, 30, 36, 24, 42, 16, 36], 'purple'); p.ell(32, 20, 12, 12, 'purple'); p.ell(32, 21, 7, 8, 'dark'); p.eye(29, 21, 1.2, 'cyan'); p.eye(35, 21, 1.2, 'cyan'); },
  golem: (p) => { p.rect(22, 16, 20, 16, 'stone'); p.rect(14, 18, 7, 14, 'stone'); p.rect(43, 18, 7, 14, 'stone'); p.rect(23, 32, 7, 10, 'stone'); p.rect(34, 32, 7, 10, 'stone'); p.rect(26, 8, 12, 9, 'stone'); p.eye(29, 12, 1.2, 'cyan'); p.eye(35, 12, 1.2, 'cyan'); p.line([28, 22, 32, 26, 36, 22], 1, 'cyan'); },
  'bomb-imp': (p) => { p.circ(32, 28, 12, 'black'); p.ell(27, 23, 3, 2, 'gray'); p.poly([22, 20, 20, 10, 26, 18], 'red'); p.poly([42, 20, 44, 10, 38, 18], 'red'); p.eye(28, 28, 1.4, 'gold'); p.eye(36, 28, 1.4, 'gold'); p.line([28, 33, 32, 35, 36, 33], 1, 'gold'); p.line([32, 16, 36, 10], 1.4, 'wood'); flame(p, 37, 9, 0.3); },
  necromancer: (p) => { person(p, { robe: 'black', head: 'hood', eyes: 'green', holdR: (x, y) => { p.line([x, y + 8, x, y - 20], 1.6, 'bone'); skull(p, x, y - 22, 0.4); }, holdL: (x, y) => p.circ(x, y - 2, 3, 'green') }); },
  'mirror-knight': (p) => { person(p, { robe: 'white', head: 'helmet', legs: 'metal', holdL: (x, y) => { p.ell(x, y, 7, 9, 'gold'); p.ell(x, y, 5.5, 7.5, 'cyan'); p.line([x - 2, y - 4, x + 1, y + 2], 1, 'white'); }, holdR: (x, y) => sword(p, x, y + 4, x + 3, y - 18) }); },
  harpy: (p) => { const b = bird(p, { m: 'fur', wing: 'tan', head: 'skin', beak: 'cone', beakM: 'red', spread: true, y: 28 }); p.ell(b.hx - 2, b.hy - 3, 5, 3, 'black'); },
  troll: (p) => { person(p, { robe: 'fur', skin: 'green', head: 'orc', big: true, eyes: 'gold', holdR: (x, y) => { p.line([x, y + 6, x + 4, y - 12], 3.4, 'wood'); } }); p.ell(32, 14, 3, 2, 'green'); },
  'the-copycat': (p) => { quad(p, { m: 'black', len: 20, h: 10, head: 6, ears: 'pointy', snout: 2, leg: 8, tail: 'up', x: 22, y: 27, eyeM: 'gold' }); p.poly([40, 8, 58, 6, 56, 40, 42, 42], 'cyan'); p.line([44, 12, 52, 30], 1, 'white'); },
  'abyss-eye': (p) => { p.ell(32, 26, 22, 14, 'white'); for (let i = 0; i < 4; i++) p.line([12 + i * 3, 18 + i * 4, 20 + i * 2, 22 + i * 2], 0.8, 'red'); p.circ(32, 26, 10, 'purple'); p.circ(32, 26, 5, 'dark'); p.circ(29, 23, 2, 'white'); },
  'dread-knight': (p) => { person(p, { robe: 'black', head: 'helmet', legs: 'black', eyes: 'red', cape: 'red', holdR: (x, y) => sword(p, x, y + 4, x + 4, y - 20, 'red') }); for (const x of [26, 38]) p.poly([x - 2, 6, x, 0, x + 2, 6], 'black'); },
  chimera: (p) => chimera(p, 'tan'),
  lich: (p) => { person(p, { robe: 'purple', head: 'skull', legs: 'purple', holdR: (x, y) => { p.line([x, y + 8, x, y - 20], 1.6, 'bone'); p.circ(x, y - 22, 3.4, 'cyan'); } }); crown(p, 32, 6, 0.45); },
  'unfinished-monster': (p) => { p.line([12, 38, 14, 20, 24, 12, 36, 10, 48, 16, 52, 30, 46, 40], 1.4, 'dark'); p.ell(24, 30, 9, 8, 'red'); p.eye(38, 20, 2.4); p.line([30, 28, 44, 32], 1, 'dark'); p.rect(40, 34, 10, 6, 'paper'); },
  'void-spider': (p) => { for (let i = 0; i < 4; i++) for (const d of [-1, 1]) p.line([32, 26, 32 + d * (10 + i * 3), 18 + i * 3, 32 + d * (16 + i * 4), 30 + i * 3], 1.4, 'black'); p.ell(32, 30, 9, 8, 'black'); p.circ(32, 22, 6, 'purple'); for (const [x, y] of [[29, 20], [35, 20], [31, 23], [33, 23]]) p.eye(x, y, 0.9, 'purple'); },
  'your-best-friend': (p) => { p.circ(32, 24, 15, 'white'); p.ell(25, 20, 3, 4, 'dark'); p.ell(39, 19, 4, 3, 'dark'); p.ell(32, 30, 10, 4, 'dark'); for (let i = 0; i < 6; i++) p.rect(23.5 + i * 3, 27, 2.4, 3, 'white'); p.rect(20, 6, 24, 4, 'black'); p.rect(24, 0, 16, 7, 'black'); },
  'other-hand': (p) => { hand(p, 32, 32, 1.2, 'white'); p.ell(32, 34, 3, 1, 'red'); },
};

/** The subject drawn for a card, or null to fall back to the tribe's shape. */
export function subjectFor(id: string): Draw | null {
  return S[id] ?? null;
}
