import { CHARACTERS } from '../content/index.ts';
import { dealerLine } from '../content/dealer.ts';
import type { Seat } from '../engine/types.ts';
import { reachable } from '../run/map.ts';
import type { NodeKind } from '../run/types.ts';
import type { App } from './app.ts';
import { clear, h, toast } from './dom.ts';
import { hoverTip } from './hud.ts';
import type { Presence, Update } from './session.ts';
import { sfx } from '../audio/sfx.ts';
import { music } from '../audio/music.ts';
import { genreTile, nodeGenre } from './void.ts';

export const KIND_LABEL: Record<NodeKind, string> = {
  battle: 'Fight', elite: 'Elite', boss: 'Boss', rest: 'Rest', merchant: 'Shop', treasure: 'Chest', event: '?',
  cards: 'Cards', mycologist: 'Merge', stones: 'Stones', woodcarver: 'Totem',
};
const KIND_HELP: Record<NodeKind, string> = {
  battle: 'A fight. Each of you picks a card after.',
  elite: 'A hard fight. Each of you gets a relic and a better card.',
  boss: 'The boss of this act.',
  rest: 'Relight a candle, upgrade a card, strengthen a creature, or revive your partner.',
  merchant: 'Spend teeth on cards, items, relics, or removing a card.',
  treasure: 'Each of you gets a relic.',
  event: 'Something Your Best Friend made. You vote on what to do.',
  cards: 'Each of you picks one of three cards from one tribe.',
  mycologist: 'Merge two copies of a creature into one with both sets of stats.',
  stones: 'Move a rules line from one creature to another. The first creature is used up.',
  woodcarver: 'Pick a totem. Every creature of its tribe gains its keyword.',
};

const artCache = new Map<string, string>();
function nodeArt(kind: NodeKind, id: number): string {
  const genre = nodeGenre(kind, id);
  const size = kind === 'boss' ? 24 : 16;
  const key = `${genre}:${id % 5}:${size}`;
  let url = artCache.get(key);
  if (!url) artCache.set(key, (url = genreTile(genre, size, (id % 5) + 1)));
  return url;
}

const X0 = 110;
const X1 = 1490;
const Y0 = 118;
const COL_H = 92;

export class MapScreen {
  readonly root: HTMLDivElement;
  private app: App;
  private field: HTMLDivElement;
  private controls: HTMLDivElement;

  constructor(app: App) {
    this.app = app;
    this.root = h('div', { class: 'map-screen' });
    this.field = h('div', { class: 'map-field' });
    this.controls = h('div', { class: 'map-controls' });
    this.root.append(this.field, this.controls);
  }

  start(): void {
    this.render();
    this.app.say(dealerLine('map', this.app.session!.game.n));
  }

  onUpdate(u: Update): void {
    const coin = u.ev.find((e) => e.k === 'coin');
    if (coin) this.showCoin(coin.votes as number[], coin.result as number);
    this.render();
  }

  destroy(): void {
    this.root.remove();
  }

  private pos(row: number, col: number, rows: number): [number, number] {
    if (row >= rows) return [X1, Y0 + 3 * COL_H];
    return [X0 + (row * (X1 - X0)) / rows, Y0 + col * COL_H];
  }

  private showCoin(votes: number[], result: number): void {
    const g = this.app.session!.game;
    const kinds = votes.map((v) => KIND_LABEL[g.run.map.nodes[v]?.kind ?? 'battle']);
    const coin = h('div', { class: 'coin' }, kinds[votes.indexOf(result)] ?? '');
    this.app.stage.append(coin);
    this.app.say(dealerLine('coin', g.n));
    sfx('coin');
    music.stinger('coin');
    setTimeout(() => coin.remove(), 1800);
  }

  private sendPing(node: number): void {
    this.app.ping({ ping: { kind: 'node', node } });
    this.showPing(node);
  }

  ping(p: Presence): void {
    if (p.ping?.kind === 'node' && p.ping.node !== undefined) this.showPing(p.ping.node);
  }

  private showPing(node: number): void {
    const el = this.field.querySelector<HTMLElement>(`[data-node="${node}"]`);
    if (!el) return;
    const mark = h('div', { class: 'ping-mark', style: { left: el.style.left, top: el.style.top } });
    this.field.append(mark);
    setTimeout(() => mark.remove(), 1900);
  }

  private vote(node: number): void {
    const s = this.app.session!;
    const g = s.game;
    if (this.app.solo()) {
      for (const seat of [0, 1] as Seat[]) {
        if (g.run.locks[seat]) continue;
        const err = s.send(seat, { t: 'vote', node }) ?? s.send(seat, { t: 'lock' });
        if (err) return toast(this.root, err);
      }
      return;
    }
    const err = s.send(s.mine[0], { t: 'vote', node });
    if (err) toast(this.root, err);
  }

  render(): void {
    const g = this.app.session!.game;
    const run = g.run;
    const map = run.map;
    clear(this.field);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '1600');
    svg.setAttribute('height', '900');
    svg.classList.add('map-threads');
    const reach = new Set(reachable(map, run.at));
    const here = run.at === null ? -1 : map.nodes[run.at].row;
    for (const n of map.nodes) {
      for (const t of n.next) {
        const m = map.nodes[t];
        const [x1, y1] = this.pos(n.row, n.col, map.rows);
        const [x2, y2] = this.pos(m.row, m.col, map.rows);
        const line = document.createElementNS(svgNS, 'path');
        const mx = (x1 + x2) / 2;
        line.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
        const live = (run.at === n.id || (run.at === null && n.row === 0)) && reach.has(t);
        line.setAttribute('class', `thread ${live ? 'live' : ''} ${n.row < here ? 'past' : ''}`);
        svg.append(line);
      }
    }
    this.field.append(svg);
    for (const n of map.nodes) {
      const [x, y] = this.pos(n.row, n.col, map.rows);
      const btn = h('button', {
        class: `map-node k-${n.kind} ${reach.has(n.id) ? 'reach' : ''} ${run.at === n.id ? 'here' : ''} ${n.row < here ? 'done' : ''}`,
        style: { left: `${x}px`, top: `${y}px`, backgroundImage: `url(${nodeArt(n.kind, n.id)})` },
        onclick: (e: MouseEvent) => (e.altKey ? this.sendPing(n.id) : reach.has(n.id) && this.vote(n.id)),
      });
      btn.dataset.node = String(n.id);
      btn.append(h('span', { class: 'node-label' }, KIND_LABEL[n.kind]));
      run.votes.forEach((v, seat) => {
        if (v === n.id) btn.append(h('span', { class: `tok t${seat} ${run.locks[seat] ? 'locked' : ''}` }));
      });
      hoverTip(btn, n.kind === 'event' ? 'Something strange' : KIND_LABEL[n.kind], KIND_HELP[n.kind]);
      this.field.append(btn);
    }
    this.renderControls();
  }

  private renderControls(): void {
    const s = this.app.session!;
    const run = s.game.run;
    clear(this.controls);
    if (this.app.solo()) {
      this.controls.append(h('div', { class: 'map-hint' }, 'Click a glowing puddle to go there.'));
      return;
    }
    const seat = s.mine[0];
    const other: Seat = seat === 0 ? 1 : 0;
    const mate = CHARACTERS[run.seats[other].char].name;
    const mateVote = run.votes[other];
    this.controls.append(
      h('div', { class: 'map-hint' }, mateVote === null ? `${mate} has not chosen yet.` : `${mate} wants ${KIND_LABEL[run.map.nodes[mateVote].kind]}${run.locks[other] ? ' and locked in' : ''}.`),
      h('button', { class: 'primary', disabled: run.votes[seat] === null || run.locks[seat], onclick: () => s.send(seat, { t: 'lock' }) }, 'Lock in'),
      h('button', { disabled: !run.locks[seat], onclick: () => s.send(seat, { t: 'unlock' }) }, 'Unlock'),
      h('div', { class: 'map-hint small' }, 'If you lock in different puddles, a coin decides. Alt+click a puddle to point at it.'),
    );
  }
}
