import { BOSSES, CARDS, HALVES } from '../engine/registry.ts';
import type { Seat } from '../engine/types.ts';
import type { DebugOp } from '../run/types.ts';
import type { App } from './app.ts';
import { h, toast } from './dom.ts';

const LOG_KEY = 'elipsusvenum.debuglog.v1';

/** Pause-and-edit tools for a sandbox game. Every edit is an action, so it is logged, replayable, and exportable. */
export class DebugPanel {
  readonly root: HTMLDivElement;
  private app: App;
  private picked = 'wolf';
  private log: DebugOp[] = [];

  constructor(app: App) {
    this.app = app;
    this.root = h('div', { class: 'debug-panel' });
    try {
      this.log = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as DebugOp[];
    } catch {
      this.log = [];
    }
    this.build();
  }

  refresh(): void {
    /* the panel reads state when a button is pressed */
  }

  private run(d: DebugOp): void {
    const err = this.app.send(0, { t: 'debug', d });
    if (err) return toast(this.app.stage, err);
    this.log.push(d);
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(this.log.slice(-500)));
    } catch {
      /* storage blocked */
    }
  }

  private build(): void {
    const r = this.root;
    const sel = (options: [string, string][], value?: string) => {
      const s = h('select', {});
      for (const [v, label] of options) s.append(h('option', { value: v, selected: v === value }, label));
      return s;
    };
    const num = (v: number) => h('input', { type: 'number', value: String(v), style: { width: '64px' } });
    const halves = [...HALVES.keys()].sort().map((k) => [k, k] as [string, string]);
    const rows: [string, string][] = [['p', 'Player row'], ['e', 'Enemy row'], ['q', 'Queue row']];
    const lanes: [string, string][] = [...Array(8).keys()].map((i) => [String(i), `Lane ${i + 1}`]);
    const seats: [string, string][] = [['0', 'Left player'], ['1', 'Right player']];

    r.append(h('h4', {}, 'Start a battle'));
    const ha = sel(halves, 'grubs');
    const hb = sel(halves, 'goblins');
    const boss = sel([['', 'No boss'], ...[...BOSSES.keys()].map((k) => [k, k] as [string, string])]);
    r.append(h('div', { class: 'row' }, ha, hb, boss), h('button', { onclick: () => this.run({ op: 'battle', halves: [ha.value, hb.value], boss: boss.value || undefined }) }, 'Start battle'));

    r.append(h('h4', {}, 'Card'));
    const search = h('input', { placeholder: 'Search cards' });
    const list = h('div', { class: 'list' });
    const fill = () => {
      list.innerHTML = '';
      const q = search.value.toLowerCase();
      for (const def of [...CARDS.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        if (q && !def.name.toLowerCase().includes(q) && !def.id.includes(q)) continue;
        const item = h('div', { class: def.id === this.picked ? 'on' : '', onclick: () => ((this.picked = def.id), fill()) }, `${def.name} (${def.pool})`);
        list.append(item);
      }
    };
    search.addEventListener('input', fill);
    fill();
    r.append(search, list);
    const row = sel(rows);
    const lane = sel(lanes);
    const seat = sel(seats);
    r.append(h('div', { class: 'row' }, row, lane));
    r.append(
      h('div', { class: 'row' },
        h('button', { onclick: () => this.run({ op: 'place', id: this.picked, row: row.value as 'p', lane: Number(lane.value) }) }, 'Place in slot'),
        h('button', { onclick: () => this.run({ op: 'clear', row: row.value as 'p', lane: Number(lane.value) }) }, 'Clear slot'),
      ),
      h('div', { class: 'row' }, seat,
        h('button', { onclick: () => this.run({ op: 'hand', seat: Number(seat.value) as Seat, id: this.picked }) }, 'To hand'),
        h('button', { onclick: () => this.run({ op: 'deck', seat: Number(seat.value) as Seat, id: this.picked }) }, 'To run deck'),
      ),
    );

    r.append(h('h4', {}, 'Slot stats'));
    const pw = num(4);
    const hp = num(4);
    r.append(h('div', { class: 'row' }, 'Power', pw, 'Health', hp), h('button', { onclick: () => this.run({ op: 'stat', row: row.value as 'p', lane: Number(lane.value), power: Number(pw.value), health: Number(hp.value) }) }, 'Set stats in the slot above'));

    r.append(h('h4', {}, 'Player numbers'));
    const field = sel([['energy', 'Energy'], ['bones', 'Bones'], ['block', 'Block'], ['scale', 'Scale'], ['candles', 'Candles'], ['teeth', 'Teeth']]);
    const val = num(5);
    const seat2 = sel(seats);
    r.append(h('div', { class: 'row' }, seat2, field, val), h('button', { onclick: () => this.run({ op: 'seat', seat: Number(seat2.value) as Seat, field: field.value as 'energy', v: Number(val.value) }) }, 'Set'));
    r.append(h('button', { onclick: () => this.run({ op: 'win' }) }, 'Win this battle'));

    r.append(h('h4', {}, 'Edit log'));
    const text = h('textarea', { placeholder: 'Exported edits appear here. Paste edits here to import them.' });
    r.append(
      text,
      h('div', { class: 'row' },
        h('button', { onclick: () => ((text.value = JSON.stringify(this.log, null, 1)), void navigator.clipboard?.writeText(text.value).catch(() => undefined)) }, 'Export'),
        h('button', {
          onclick: () => {
            try {
              const ops = JSON.parse(text.value) as DebugOp[];
              for (const op of ops) this.run(op);
            } catch {
              toast(this.app.stage, 'That is not a list of edits');
            }
          },
        }, 'Import and apply'),
        h('button', { onclick: () => ((this.log = []), localStorage.removeItem(LOG_KEY), (text.value = '')) }, 'Clear log'),
      ),
    );
  }
}
