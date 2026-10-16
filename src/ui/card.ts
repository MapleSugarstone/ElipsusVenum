import { card as cardDef, type CardDef } from '../engine/registry.ts';
import { cardLines, defLines, type TextLine } from '../engine/text.ts';
import type { AbilityInst, Cost } from '../engine/types.ts';
import { artFor } from './art.ts';
import { ART } from './grid.ts';
import { h } from './dom.ts';
import type { CardView } from './view.ts';

const ICON = {
  blood: '<span class="cost-icon spr-blood"></span>',
  bones: '<span class="cost-icon spr-cost-bone"></span>',
  energy: '<span class="cost-icon spr-cost-energy"></span>',
};

export function costHtml(cost: Cost): string {
  const parts: string[] = [];
  for (const k of ['blood', 'bones', 'energy'] as const) {
    const n = cost[k] ?? 0;
    if (!n) continue;
    if (n <= 3 && k !== 'bones') parts.push(ICON[k].repeat(n));
    else parts.push(`<span class="cost-num">${n}</span>${ICON[k]}`);
  }
  if (parts.length === 0) parts.push('<span class="cost-num" style="color:var(--ink-soft)">0</span>');
  return parts.join('');
}

function linesHtml(lines: TextLine[], mark: number[] = []): string {
  return lines
    .map((l, i) => `<p class="${l.off ? 'off' : ''} ${mark.includes(i) ? 'changed' : ''}">${l.spans.map((s) => (s.b ? `<b>${esc(s.t)}</b>` : esc(s.t))).join('')}</p>`)
    .join('');
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

export function typeLine(def: CardDef): string {
  const kind = def.kind === 'creature' ? 'Creature' : def.tags.includes('power') ? 'Spell, Power' : 'Spell';
  const tribe = def.tribe && def.tribe !== 'Any' ? ` - ${def.tribe}` : def.tribe === 'Any' ? ' - Every tribe' : '';
  const who = def.pool === 'blue' ? '  (Blue)' : def.pool === 'pistachio' ? '  (Pistachio)' : '';
  return kind + tribe + who;
}

/** Font size for the rules box, stepped by text length so long cards stay inside the box. */
function textSize(chars: number, spell: boolean): number {
  const room = spell ? 1.25 : 1;
  const steps: [number, number][] = [[70, 17.5], [110, 16.5], [150, 15.5], [200, 14.5], [260, 13.5], [330, 12.5], [9999, 11.5]];
  for (const [max, size] of steps) if (chars <= max * room) return size;
  return 11.5;
}

export interface FullCardOpts {
  up?: boolean;
  ab?: AbilityInst[];
  power?: number;
  health?: number;
  maxHealth?: number;
  cost?: Cost;
  scale?: number;
  /** The scale the card shows at on the stage, when a style rather than `scale` sets it. */
  k?: number;
  cls?: string;
  dp?: number;
  dh?: number;
  /** Rules lines to highlight, by index, for showing what an upgrade changes. */
  mark?: number[];
  markCost?: boolean;
  markStats?: boolean;
}

/**
 * The art window for a card shown at scale `k`. The window shrinks to a whole number of art pixels inside a box of
 * boxW by boxH card units, and the art is drawn at exactly that many pixels.
 */
function artHtml(cls: string, id: string, boxW: number, boxH: number, k: number): string {
  const w = Math.floor((boxW * k) / ART);
  const hgt = Math.floor((boxH * k) / ART);
  const cw = (w * ART) / k + 2;
  const ch = (hgt * ART) / k + 2;
  return `<div class="${cls}" style="background-image:url(${artFor(id, w, hgt)});width:${cw}px;height:${ch}px;left:calc(50% - ${cw / 2}px)"></div>`;
}

/** A full card at its design size of 280 by 392, scaled by `scale`. */
export function fullCard(id: string, opts: FullCardOpts = {}): HTMLDivElement {
  const def = cardDef(id);
  const up = !!opts.up;
  const lines = opts.ab ? cardLines(opts.ab) : defLines(def, up);
  const chars = lines.reduce((a, l) => a + l.spans.reduce((b, s) => b + s.t.length, 0) + 12, 0);
  const cost = opts.cost ?? (up && def.up?.cost ? def.up.cost : def.cost);
  const basePower = (up ? def.up?.power : undefined) ?? def.power;
  const baseHealth = (up ? def.up?.health : undefined) ?? def.health;
  const power = opts.power ?? basePower + (opts.dp ?? 0);
  const health = opts.health ?? baseHealth + (opts.dh ?? 0);
  const maxHealth = opts.maxHealth ?? baseHealth + (opts.dh ?? 0);
  const k = opts.k ?? opts.scale ?? 1;
  const el = h('div', {
    class: `card ${def.kind} pool-${def.pool} rarity-${def.rarity} ${up ? 'up' : ''} ${opts.cls ?? ''}`,
    style: opts.scale ? { transform: `scale(${opts.scale})` } : undefined,
  });
  el.innerHTML = `
    <div class="c-name ${def.name.length > 15 ? 'long' : ''}">${esc(def.name)}</div>
    <div class="c-cost ${opts.markCost ? 'changed' : ''}">${costHtml(cost)}</div>
    ${artHtml('c-art', id, 252, 150, k)}
    <div class="c-type">${esc(typeLine(def))}</div>
    <div class="c-text" style="font-size:${textSize(chars, def.kind === 'spell')}px">${linesHtml(lines, opts.mark)}</div>
    ${def.kind === 'creature' ? `<div class="c-stats ${opts.markStats ? 'changed' : ''}"><span class="${power > basePower ? 'buffed' : power < basePower ? 'hurt' : ''}">${power}</span><span class="${health < maxHealth ? 'hurt' : health > baseHealth ? 'buffed' : ''}">${health}</span></div>` : ''}`;
  el.style.setProperty('--k', String(k));
  el.dataset.id = id;
  return el;
}

/** Keyword chips and short text for a creature on the board. */
function miniText(ab: AbilityInst[]): string {
  const lines = cardLines(ab);
  return lines.map((l) => `<span class="${l.off ? 'off' : ''}">${l.spans.map((s) => (s.b ? `<b>${esc(s.t)}</b>` : esc(s.t))).join('')}</span>`).join(' ');
}

const STATUS_LABEL: Record<string, string> = {
  bond: 'Bond',
  vulnerable: 'Vuln', weak: 'Weak', poison: 'Psn', stun: 'Stun', shield: 'Shield', artifact: 'Art', intangible: 'Intg', glitch: 'Glitch',
};
const DEBUFF = new Set(['vulnerable', 'weak', 'poison', 'stun', 'glitch']);

export function fillMini(el: HTMLElement, v: CardView, queued: boolean): void {
  const def = cardDef(v.id);
  el.className = `mini pool-${def.pool} ${v.side === 'p' ? `seat-${v.seat}` : ''} ${queued ? 'queued' : ''}`;
  const key = JSON.stringify([v.id, v.up, v.power, v.health, v.maxHealth, v.st, v.ab, queued]);
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.dataset.uid = String(v.uid);
  const statuses = Object.entries(v.st)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `<span class="chip ${DEBUFF.has(s) ? 'debuff' : ''}">${STATUS_LABEL[s] ?? s}${n > 1 ? ` ${n}` : ''}</span>`)
    .join('');
  el.innerHTML = `
    <div class="m-name">${esc(def.name)}${v.up ? '+' : ''}</div>
    ${artHtml('m-art', v.id, 132, 80, 1)}
    <div class="m-st">${statuses}</div>
    <div class="m-kw">${miniText(v.ab)}</div>
    <div class="m-stats"><span style="color:${v.power > v.basePower ? '#2e6b2e' : v.power < v.basePower ? 'var(--blood)' : 'inherit'}">${v.power}</span><span style="color:${v.health < v.maxHealth ? 'var(--blood)' : 'inherit'}">${v.health}</span></div>`;
}
