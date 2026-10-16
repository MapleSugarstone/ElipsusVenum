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
};

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
  'tooth-win': [['kkkkkkkk', 'kyffffak', '.kffffk.', '..kaak..']],
  'tooth-loss': [['..kmmk..', '.krrrrk.', 'krlrrrmk', 'kkkkkkkk']],
  'tooth-empty': [['.tttttt.', 'tj....jt', '.tj..jt.', '..tttt..']],
  tooth: [['kkkkk', 'kyffk', 'kfffk', '.kak.', '..k..']],
  'bead-on': [['.k.', 'kyk', 'kfk', '.k.']],
  'bead-off': [['.k.', 'kak', 'kdk', '.k.']],
  blood: [['..k..', '.krk.', '.krk.', 'krrrk', 'klrrk', 'krrmk', '.kkk.']],
  'cost-bone': [['.k...k.', 'kpkkkpk', '.kpppk.', 'kqkkkqk', '.k...k.']],
  'cost-energy': [['..k..', '.kbk.', 'kbcck', 'kccek', '.kek.', '..k..']],
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
