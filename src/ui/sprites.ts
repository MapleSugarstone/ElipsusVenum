// Small pixel sprites for the interface, drawn from text grids so candles, energy, teeth, and icons sit on the same art
// grid as everything else. Each one becomes a CSS variable `--spr-<name>` holding a data URL. One art pixel is 4 stage
// units, so a sprite w pixels wide is shown 4w units wide.

/** Palette letters shared by every sprite. A dot is transparent. */
const PAL: Record<string, string> = {
  k: '#000000',
  w: '#e9dcae', s: '#a89a6e', d: '#6e6248',
  y: '#fff6a0', f: '#ffcf3a', o: '#ff7a1f', a: '#b38a00',
  g: '#6e7a90', h: '#a8b4c8',
  c: '#41d6ff', b: '#c8f6ff', e: '#16708c', x: '#12242a', z: '#1f3a44',
  r: '#c22a1e', l: '#ff8a6e', m: '#6b140e',
  v: '#d0beff', u: '#9a88d0', n: '#5e4c8e',
  p: '#e3dcc4', q: '#b8ae86',
  t: '#2a2a2a', j: '#3d3d3d',
  B: '#7aa7ff', D: '#3d5fa8', G: '#a6e34a', E: '#5c8a1c', W: '#ffffff',
  K: 'rgba(0, 0, 0, 0.35)',
};

const token = (hi: string, lo: string, rim: string): string[] =>
  ['...k...', '..kBk..', '.kBBDk.', 'kBBBBDk', '.kBBDk.', '..kDk..', '...k...'].map((r) => r.replace(/k/g, rim).replace(/B/g, hi).replace(/D/g, lo));

/** Frames side by side: each sprite is a list of frames, each frame a list of equal-length rows. */
const SPRITES: Record<string, string[][]> = {
  'candle-lit': [
    ['..y...', '..yf..', '.yff..', '.foff.', '..ff..', '...k..', 'kwwwsk', 'kwwwsk', 'kwwwsk', 'kwwssk', 'kwwwsk', 'kwwwsk', 'ksssdk', 'kkkkkk'],
    ['...y..', '..fy..', '..ffy.', '.ffof.', '..ff..', '...k..', 'kwwwsk', 'kwwwsk', 'kwwwsk', 'kwwssk', 'kwwwsk', 'kwwwsk', 'ksssdk', 'kkkkkk'],
    ['......', '..yy..', '.yff..', '.foof.', '..ff..', '...k..', 'kwwwsk', 'kwwwsk', 'kwwwsk', 'kwwssk', 'kwwwsk', 'kwwwsk', 'ksssdk', 'kkkkkk'],
  ],
  'candle-out': [
    ['..g...', '...g..', '..h...', '...g..', '......', '...k..', 'ksssdk', 'kssddk', 'ksssdk', 'kssddk', 'ksssdk', 'ksssdk', 'kddddk', 'kkkkkk'],
    ['...g..', '..h...', '...g..', '..g...', '......', '...k..', 'ksssdk', 'kssddk', 'ksssdk', 'kssddk', 'ksssdk', 'ksssdk', 'kddddk', 'kkkkkk'],
  ],
  energy: [['...k...', '..kbk..', '.kbcck.', 'kbcccek', 'kccccek', '.kccek.', '..kek..', '...k...']],
  'energy-empty': [['...k...', '..kzk..', '.kzxxk.', 'kzxxxxk', 'kxxxxxk', '.kxxxk.', '..kxk..', '...k...']],
  bone: [['.kk....kk.', 'kppkkkkppk', '.kppppppk.', 'kpqkkkkqpk', '.kk....kk.']],
  shield: [['kkkkkkk', 'kvvvvuk', 'kvvvuuk', 'kvvvuuk', 'kvvuunk', '.kvunk.', '..kuk..', '...k...']],
  'tooth-win': [['kkkkkkkk', '.kyffak.', '..kaak..']],
  'tooth-loss': [['..kmmk..', '.krlrmk.', 'kkkkkkkk']],
  'tooth-empty': [['.tttttt.', '.tj..jt.', '..tttt..']],
  'halo-near': [['f.f.', '.f.f', 'f.f.', '.f.f']],
  'halo-far': [['f...', '..f.', '.f..', '...f']],
  back: [cardBack('n', 'u', 'v')],
  'back-side': [cardBack('d', 'a', 'f')],
  'tok-0': [token('B', 'D', 'k')],
  'tok-1': [token('G', 'E', 'k')],
  'tok-0-locked': [token('B', 'D', 'W')],
  'tok-1-locked': [token('G', 'E', 'W')],
  hatch: [['KK..', '.KK.', '..KK', 'K..K']],
  coin: [coinFace(16), coinFace(10), coinFace(2.5), coinFace(10)],
  ping: [ring(5, 0), ring(9, 0), ring(13, 1), ring(16, 2)],
  tooth: [['kkkkk', 'kyffk', 'kfffk', '.kak.', '..k..']],
  'bead-on': [['.k.', 'kyk', 'kfk', '.k.']],
  'bead-off': [['.k.', 'kak', 'kdk', '.k.']],
  blood: [['..k..', '.krk.', '.krk.', 'krrrk', 'klrrk', 'krrmk', '.kkk.']],
  'cost-bone': [['.k...k.', 'kpkkkpk', '.kpppk.', 'kqkkkqk', '.k...k.']],
  'cost-energy': [['..k..', '.kbk.', 'kbcck', 'kccek', '.kek.', '..k..']],
  'cost-energy-empty': [['..k..', '.kzk.', 'kzxxk', 'kxxxk', '.kxk.', '..k..']],
  arrow: [['...k...', '...kk..', 'kkkkfk.', 'kffffyk', 'kkkkfk.', '...kk..', '...k...']],
  bell: [[
    '.....kkkk.....',
    '.....kffk.....',
    '...kkffffkk...',
    '..kfyyfffffk..',
    '.kfyyffffffak.',
    '.kfyfffffffak.',
    '.kfyfffffffak.',
    '.kffffffffaak.',
    'kfffffffffaaak',
    'kkkkkkkkkkkkkk',
    '.kaaaaaaaaaak.',
    '..kkkkkkkkkk..',
    '......kk......',
    '......kk......',
  ]],
};

/** A 16 by 22 card back: a black rim, a dithered field of two colors, and a ringed eye in the middle. */
function cardBack(a: string, b: string, ring: string): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 22; y++) {
    let row = '';
    for (let x = 0; x < 16; x++) {
      const dx = (x - 7.5) / 4.5, dy = (y - 10.5) / 6.5, r = dx * dx + dy * dy;
      if (x === 0 || x === 15 || y === 0 || y === 21) row += 'k';
      else if (r < 0.18) row += 'k';
      else if (r < 0.55) row += 'y';
      else if (r < 1.05) row += ring;
      else if (r < 1.35) row += 'k';
      else row += (x + y) % 2 ? a : b;
    }
    rows.push(row);
  }
  return rows;
}

/** Marks the pixels of a 34 by 34 ellipse that touch its outside, so the outline is one clean pixel wide. */
function ellipse(rx: number, ry: number): { inside: (x: number, y: number) => boolean; edge: (x: number, y: number) => boolean } {
  const c = 16.5;
  const inside = (x: number, y: number) => ((x - c) / rx) ** 2 + ((y - c) / ry) ** 2 <= 1;
  const edge = (x: number, y: number) => inside(x, y) && (!inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1));
  return { inside, edge };
}

/** One frame of the coin turning, `rx` art pixels from its middle to its side. */
function coinFace(rx: number): string[] {
  const { inside, edge } = ellipse(rx, 16);
  const rows: string[] = [];
  for (let y = 0; y < 34; y++) {
    let row = '';
    for (let x = 0; x < 34; x++) {
      const dx = (x - 16.5) / rx, dy = (y - 16.5) / 16, r = dx * dx + dy * dy;
      if (!inside(x, y)) row += '.';
      else if (edge(x, y)) row += 'k';
      else if (r > 0.72 || rx < 4) row += 'a';
      else if (r > 0.6) row += 'k';
      else if (dx + dy < -0.55) row += (x + y) % 2 ? 'y' : 'f';
      else if (dx + dy > 0.7) row += 'o';
      else row += 'f';
    }
    rows.push(row);
  }
  return rows;
}

/** One frame of a pointing ring, thinned to every second or every third pixel as it widens. */
function ring(r: number, thin: number): string[] {
  const { edge } = ellipse(r, r);
  const rows: string[] = [];
  for (let y = 0; y < 34; y++) {
    let row = '';
    for (let x = 0; x < 34; x++) row += edge(x, y) && (thin === 0 || (x + y) % (thin + 1) === 0) ? 'v' : '.';
    rows.push(row);
  }
  return rows;
}

function draw(frames: string[][]): string {
  const fw = frames[0][0].length, fh = frames[0].length;
  const c = document.createElement('canvas');
  c.width = fw * frames.length;
  c.height = fh;
  const ctx = c.getContext('2d')!;
  frames.forEach((rows, f) => {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = PAL[row[x]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(f * fw + x, y, 1, 1);
      }
    });
  });
  return c.toDataURL();
}

/** Sets a `--spr-<name>` CSS variable for every sprite. */
export function installSprites(): void {
  const root = document.documentElement.style;
  for (const [name, frames] of Object.entries(SPRITES)) root.setProperty(`--spr-${name}`, `url(${draw(frames)})`);
}
