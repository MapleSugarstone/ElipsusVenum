import { GLOSSARY } from '../engine/registry.ts';
import { cardLines, defLines, markTerms } from '../engine/text.ts';
import { card as cardDef } from '../engine/registry.ts';
import { fullCard, type FullCardOpts } from './card.ts';
import { h } from './dom.ts';

let el: HTMLDivElement | null = null;
let stageScale = 1;

export function setStageScale(s: number): void {
  stageScale = s;
}

function termsIn(id: string, opts: FullCardOpts): string[] {
  const lines = opts.ab ? cardLines(opts.ab) : defLines(cardDef(id), !!opts.up);
  const out: string[] = [];
  for (const line of lines) {
    for (const span of line.spans) {
      if (!span.b) continue;
      const word = span.t.replace(/ \d+$/, '');
      const key = GLOSSARY.has(word) ? word : GLOSSARY.has(word.replace(/s$/, '')) ? word.replace(/s$/, '') : null;
      if (key && !out.includes(key)) out.push(key);
    }
  }
  return out;
}

/** Shows a card at full size with glossary entries for every bold term on it. */
export function inspectCard(id: string, opts: FullCardOpts, anchor: DOMRect): void {
  hideInspect();
  const card = fullCard(id, { ...opts, cls: 'static' });
  const tips = h('div', { class: 'tips' });
  for (const term of termsIn(id, opts)) {
    const tip = h('div', { class: 'tip' }, h('b', {}, term));
    tip.append(...markTerms(GLOSSARY.get(term)!).map((s) => (s.b ? h('strong', {}, s.t) : document.createTextNode(s.t))));
    tips.append(tip);
  }
  el = h('div', { class: 'inspector', style: { transform: `scale(${stageScale})`, transformOrigin: 'top left' } }, card, tips);
  document.getElementById('overlay-root')!.append(el);
  const w = (280 + 260) * stageScale;
  const hgt = 392 * stageScale;
  let x: number;
  let y: number;
  if (anchor.top > window.innerHeight * 0.55 && anchor.top - hgt - 8 > 0) {
    // Hand cards sit low on the screen, so their inspector opens above them.
    x = Math.max(4, Math.min(window.innerWidth - w - 4, anchor.left + anchor.width / 2 - (280 * stageScale) / 2));
    y = anchor.top - hgt - 8;
  } else {
    x = anchor.right + 12;
    if (x + w > window.innerWidth) x = anchor.left - w - 12;
    if (x < 4) x = 4;
    y = Math.max(4, Math.min(window.innerHeight - hgt - 4, anchor.top + anchor.height / 2 - hgt / 2));
  }
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

export function hideInspect(): void {
  el?.remove();
  el = null;
}

/** Wires hover inspection onto an element. */
export function inspectable(target: HTMLElement, get: () => { id: string; opts: FullCardOpts } | null): void {
  target.addEventListener('mouseenter', () => {
    const info = get();
    if (info) inspectCard(info.id, info.opts, target.getBoundingClientRect());
  });
  target.addEventListener('mouseleave', hideInspect);
}

export function tipText(text: string): HTMLElement {
  const span = h('span', {});
  span.append(...markTerms(text).map((s) => (s.b ? h('b', {}, s.t) : document.createTextNode(s.t))));
  return span;
}
