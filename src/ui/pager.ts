import { h } from './dom.ts';

/** Shows `per` items at a time with arrow buttons to turn the page, since no screen in the game scrolls. */
export function pager(items: HTMLElement[], per: number, page: number, onPage: (p: number) => void): HTMLDivElement {
  const pages = Math.max(1, Math.ceil(items.length / per));
  const p = Math.min(Math.max(0, page), pages - 1);
  const grid = h('div', { class: 'deck-grid' });
  grid.append(...items.slice(p * per, (p + 1) * per));
  const wrap = h('div', { class: 'pager' }, grid);
  if (pages > 1) {
    wrap.append(
      h('div', { class: 'pager-nav' },
        h('button', { disabled: p === 0, onclick: () => onPage(p - 1) }, '<'),
        h('span', {}, `${p + 1} / ${pages}`),
        h('button', { disabled: p === pages - 1, onclick: () => onPage(p + 1) }, '>'),
      ),
    );
  }
  return wrap;
}
