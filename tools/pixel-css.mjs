// Rewrites the game's stylesheets to the pixel grid: square corners, borders and outlines of whole art pixels (4 stage
// units), hard shadows with offsets on the grid, no blurred shadows or glows, and dashed lines instead of dotted ones.
// Run with: node tools/pixel-css.mjs. It is safe to run again.
import fs from 'node:fs';

const FILES = ['src/ui/style.css', 'src/ui/void.css', 'src/ui/hud.css'];
const UNIT = 4;

/** Splits on commas that are not inside parentheses. */
function splitTop(value) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const snap = (n) => (Math.abs(n) < 2 ? 0 : Math.sign(n) * Math.max(UNIT, Math.round(Math.abs(n) / UNIT) * UNIT));

const COLOR = /(rgba?\([^)]*\)|hsla?\([^)]*\)|var\(--[\w-]+\)|#[0-9a-fA-F]{3,8}\b|\btransparent\b|\bblack\b|\bwhite\b|\bcurrentColor\b)/;

function fixShadow(value, box) {
  if (value.trim() === 'none') return value;
  const kept = [];
  for (const sh of splitTop(value)) {
    const inset = /\binset\b/.test(sh);
    const color = sh.match(COLOR)?.[0] ?? '';
    const rest = sh.replace(COLOR, ' ').replace(/\binset\b/, ' ');
    const nums = (rest.match(/-?\d*\.?\d+(px)?/g) ?? []).map((n) => parseFloat(n));
    const [x = 0, y = 0, blur = 0, spread = 0] = nums;
    if (blur > 0) continue;
    if (box) {
      const sp = spread >= 1000 ? spread : snap(spread);
      const nx = snap(x), ny = snap(y);
      if (nx === 0 && ny === 0 && sp === 0) continue;
      kept.push(`${inset ? 'inset ' : ''}${nx}px ${ny}px 0 ${sp ? `${sp}px ` : ''}${color}`.replace(/(^| )0px/g, '$10'));
    } else {
      const nx = snap(x), ny = snap(y);
      if (nx === 0 && ny === 0) continue;
      kept.push(`${nx}px ${ny}px 0 ${color}`);
    }
  }
  return kept.length ? kept.join(', ') : 'none';
}

for (const file of FILES) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const out = [];
  let changed = 0;
  for (const line of lines) {
    const m = line.match(/^(\s*)([a-z-]+)\s*:\s*(.*?);\s*$/);
    if (!m) { out.push(line); continue; }
    const [, ind, prop, value] = m;
    let next = value;
    if (prop === 'border-radius') { changed++; continue; }
    if (prop === 'box-shadow') next = fixShadow(value, true);
    else if (prop === 'text-shadow') next = fixShadow(value, false);
    else if (/^(border(-(top|right|bottom|left))?|outline)$/.test(prop)) {
      next = value.replace(/\b([123])px\b/, `${UNIT}px`).replace(/\bdotted\b/, 'dashed');
    } else if (/^border(-(top|right|bottom|left))?-width$|^outline-width$/.test(prop)) {
      next = value.replace(/\b([123])px\b/g, `${UNIT}px`);
    }
    if (next !== value) changed++;
    out.push(`${ind}${prop}: ${next};`);
  }
  fs.writeFileSync(file, out.join('\n'));
  console.log(`${file}: ${changed} declarations changed`);
}
