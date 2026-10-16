import { paramsOf } from './fx.ts';
import { ability, card as cardDef, GLOSSARY, type CardDef } from './registry.ts';
import type { AbilityInst, CardInst, Num } from './types.ts';

/** A run of card text. `b` marks a glossary term shown in bold with hover help. */
export interface Span {
  t: string;
  b?: boolean;
}

export function fillTemplate(text: string, p: Num): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (k in p ? String(p[k]) : `{${k}}`));
}

let termPattern: RegExp | null = null;
let termCount = -1;
function terms(): RegExp {
  if (!termPattern || termCount !== GLOSSARY.size) {
    const names = [...GLOSSARY.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    termPattern = new RegExp(`\\b(${names.join('|')})(?:s)?\\b`, 'g');
    termCount = GLOSSARY.size;
  }
  return termPattern;
}

/** Splits a sentence into spans with glossary terms marked. */
export function markTerms(text: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of text.matchAll(terms())) {
    if (m.index! > last) out.push({ t: text.slice(last, m.index) });
    out.push({ t: m[0], b: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}

export interface TextLine {
  spans: Span[];
  off?: boolean;
  kw?: boolean;
}

function lineFor(inst: AbilityInst): TextLine | null {
  const def = ability(inst.a);
  if (def.kw) {
    const n = inst.p?.n ?? def.p?.n;
    return { spans: [{ t: n !== undefined ? `${def.kw} ${n}` : def.kw, b: true }], off: inst.off, kw: true };
  }
  if (!def.text) return null;
  return { spans: markTerms(fillTemplate(def.text, paramsOf(inst))), off: inst.off };
}

/** Text lines for a card: keywords first on one line, then rules lines, then end keywords. */
export function cardLines(ab: AbilityInst[]): TextLine[] {
  const kws: Span[] = [];
  const ends: Span[] = [];
  const lines: TextLine[] = [];
  let kwOff = false;
  for (const inst of ab) {
    const def = ability(inst.a);
    const line = lineFor(inst);
    if (!line) continue;
    if (def.kw) {
      const bucket = def.end ? ends : kws;
      if (bucket.length) bucket.push({ t: '. ' });
      bucket.push(...line.spans);
      if (inst.off) kwOff = true;
    } else lines.push(line);
  }
  const out: TextLine[] = [];
  if (kws.length) out.push({ spans: [...kws, { t: '.' }], kw: true, off: kwOff });
  out.push(...lines);
  if (ends.length) out.push({ spans: [...ends, { t: '.' }], kw: true });
  return out;
}

export function instLines(c: CardInst): TextLine[] {
  return cardLines(c.ab);
}

export function defLines(def: CardDef, up = false): TextLine[] {
  const ab = def.ab.map((a) => {
    if (!up || !a.p || !def.up?.p) return a;
    const p = { ...a.p };
    for (const k of Object.keys(def.up.p)) if (k in p) p[k] = def.up.p[k];
    return { ...a, p };
  });
  if (up && def.up?.kw) for (const k of def.up.kw) ab.push(typeof k === 'string' ? { a: `kw:${k.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` } : { a: `kw:${k[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, p: { n: k[1] } });
  return cardLines(ab);
}

export function plainText(lines: TextLine[]): string {
  return lines.map((l) => l.spans.map((s) => s.t).join('')).join(' ');
}

export function cardName(id: string, up = false): string {
  return cardDef(id).name + (up ? '+' : '');
}
