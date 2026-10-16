// The card review page: every card, relic, item, and encounter in one place, with a request box on each. The requests
// stay in this browser and become one message for the assistant.
import '../content/index.ts';
import { CARDS, HALVES, ITEMS, RELICS, BOSSES } from '../engine/registry.ts';
import { defLines, plainText } from '../engine/text.ts';
import { fullCard } from '../ui/card.ts';
import { clear, h } from '../ui/dom.ts';
import { inspectable } from '../ui/inspect.ts';

const KEY = 'elipsusvenum.review.v1';
type Notes = Record<string, string>;

function load(): Notes {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Notes;
  } catch {
    return {};
  }
}
function save(n: Notes): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(n));
  } catch {
    /* storage blocked */
  }
}

const notes = load();
const root = document.getElementById('review')!;
let pool = 'all';
let query = '';
let showUp = false;
let picked: string | null = null;

function describe(key: string): string {
  const [kind, id] = key.split(':');
  if (kind === 'card') {
    const def = CARDS.get(id)!;
    const stats = def.kind === 'creature' ? ` ${def.power}/${def.health}` : '';
    return `${def.name} (${id}, ${def.pool} ${def.kind}${stats}): ${plainText(defLines(def))}`;
  }
  if (kind === 'relic') return `Relic ${RELICS.get(id)?.name} (${id}): ${RELICS.get(id)?.text}`;
  if (kind === 'item') return `Item ${ITEMS.get(id)?.name} (${id}): ${ITEMS.get(id)?.text}`;
  if (kind === 'half') return `Encounter half ${id}`;
  if (kind === 'boss') return `Boss ${BOSSES.get(id)?.name} (${id})`;
  return key;
}

function message(): string {
  const lines = Object.entries(notes).filter(([, v]) => v.trim());
  if (!lines.length) return 'No requests yet.';
  return ['Please make these changes in ElipsusVenum:', '', ...lines.map(([k, v]) => `- ${describe(k)}\n  Request: ${v.trim()}`)].join('\n');
}

function render(): void {
  clear(root);
  const wrap = h('div', { class: 'rv' });
  const main = h('div', {});
  main.append(h('h1', {}, 'Card review'));
  const bar = h('div', { class: 'rv-bar' });
  const search = h('input', { placeholder: 'Search', value: query, oninput: (e: Event) => ((query = (e.target as HTMLInputElement).value.toLowerCase()), renderGrid()) });
  const poolSel = h('select', { onchange: (e: Event) => ((pool = (e.target as HTMLSelectElement).value), renderGrid()) },
    ...['all', 'shared', 'blue', 'pistachio', 'enemy', 'token', 'side', 'curse', 'relics', 'items', 'encounters'].map((p) => h('option', { value: p, selected: p === pool }, p)));
  const up = h('label', {}, h('input', { type: 'checkbox', checked: showUp, onchange: (e: Event) => ((showUp = (e.target as HTMLInputElement).checked), renderGrid()) }), ' Show upgraded');
  bar.append(search, poolSel, up);
  main.append(bar);
  const grid = h('div', { class: 'rv-grid' });
  main.append(grid);
  const side = h('div', { class: 'rv-side' });
  wrap.append(main, side);
  root.append(wrap);

  function renderGrid(): void {
    clear(grid);
    if (pool === 'relics' || pool === 'items' || pool === 'encounters') return renderList();
    const defs = [...CARDS.values()]
      .filter((d) => pool === 'all' || d.pool === pool)
      .filter((d) => !query || d.name.toLowerCase().includes(query) || d.id.includes(query) || plainText(defLines(d)).toLowerCase().includes(query))
      .sort((a, b) => a.pool.localeCompare(b.pool) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    for (const d of defs) {
      const key = `card:${d.id}`;
      const cell = h('div', { class: `rv-cell ${notes[key]?.trim() ? 'has-note' : ''} ${picked === key ? 'on' : ''}`, onclick: () => ((picked = key), renderGrid(), renderSide()) });
      cell.append(fullCard(d.id, { up: showUp && !!d.up, scale: 0.7 }));
      inspectable(cell, () => ({ id: d.id, opts: { up: showUp && !!d.up } }));
      grid.append(cell);
    }
  }

  function renderList(): void {
    const rows: [string, string][] = [];
    if (pool === 'relics') for (const r of RELICS.values()) rows.push([`relic:${r.id}`, `${r.name} (${r.rarity}, ${r.pool}): ${r.text}`]);
    if (pool === 'items') for (const i of ITEMS.values()) rows.push([`item:${i.id}`, `${i.name}: ${i.text}`]);
    if (pool === 'encounters') {
      for (const b of BOSSES.values()) rows.push([`boss:${b.id}`, `Boss ${b.name}, act ${b.act}, ${b.phases.length} phases`]);
      for (const half of HALVES.values()) {
        const ids = [...(half.front ?? []), ...half.turns.flat()].map((p) => CARDS.get(p.id)?.name ?? p.id);
        rows.push([`half:${half.id}`, `${half.id} (act ${half.act}, ${half.tier}): ${ids.join(', ')}`]);
      }
    }
    for (const [key, text] of rows) {
      if (query && !text.toLowerCase().includes(query)) continue;
      grid.append(h('button', { class: `event-opt ${picked === key ? 'primary' : ''}`, style: { width: '100%' }, onclick: () => ((picked = key), renderGrid(), renderSide()) }, text + (notes[key]?.trim() ? '  (request)' : '')));
    }
  }

  function renderSide(): void {
    clear(side);
    if (picked) {
      side.append(h('div', { style: { color: 'var(--muted)' } }, describe(picked)));
      const box = h('textarea', { placeholder: 'What should change? For example: make this 4/6, or this should be Airborne.' });
      box.value = notes[picked] ?? '';
      box.addEventListener('input', () => {
        notes[picked!] = box.value;
        save(notes);
        pre.textContent = message();
      });
      side.append(box);
    } else side.append(h('p', { style: { color: 'var(--muted)' } }, 'Click a card to write a request for it.'));
    const pre = h('pre', {}, message());
    side.append(
      h('button', { class: 'primary', onclick: () => void navigator.clipboard?.writeText(message()).then(() => (copied.textContent = 'Copied.')) }, 'Copy message for Claude'),
      h('button', { onclick: () => { for (const k of Object.keys(notes)) delete notes[k]; save(notes); renderGrid(); renderSide(); } }, 'Clear all requests'),
    );
    const copied = h('span', { style: { color: 'var(--ok)' } });
    side.append(copied, pre);
  }

  renderGrid();
  renderSide();
}

render();
