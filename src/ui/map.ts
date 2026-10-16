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
import { BAYER, GENRES, nodeGenre } from './void.ts';

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

type NodeState = 'idle' | 'reach' | 'here';
type RGB = [number, number, number];
const RING: Record<NodeState, RGB> = { idle: [58, 48, 84], reach: [212, 186, 0], here: [208, 190, 255] };
const HALO: Record<NodeState, RGB | null> = { idle: null, reach: [255, 207, 58], here: [154, 136, 208] };

/** Disc radius in art pixels. A node sprite is 2 * (R + 3) art pixels across, so 80 units, or 104 for the boss. */
const nodeR = (kind: NodeKind): number => (kind === 'boss' ? 10 : 7);

const artCache = new Map<string, string>();
/** A painted pixel disc with a ring for its state, in two frames side by side. A reachable node's halo flickers between them. */
function nodeArt(kind: NodeKind, id: number, state: NodeState): string {
  const genre = nodeGenre(kind, id);
  const R = nodeR(kind);
  const key = `${genre}:${id % 5}:${R}:${state}`;
  let url = artCache.get(key);
  if (url) return url;
  const W = 2 * (R + 3);
  const c = (W - 1) / 2;
  // Layer 0 is the painting, 1 the state ring, 2 a black rim, and 3 the halo. Each ring is one radius band wide.
  const layer = new Int8Array(W * W).fill(-1);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const l = Math.floor(Math.hypot(x - c, y - c) - R + 1);
      layer[y * W + x] = l < 0 ? 0 : l <= 3 ? l : -1;
    }
  }
  const painter = GENRES[genre] ?? GENRES.glitch;
  // The fight painting is mostly unlit brick at this size, and a node you cannot reach is grayed and darkened.
  const lit = (kind === 'battle' ? 1.8 : 1) * (state === 'idle' ? 0.65 : 1);
  const sat = state === 'idle' ? 0.55 : 1;
  const cv = document.createElement('canvas');
  cv.width = W * 2;
  cv.height = W;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W * 2, W);
  for (let f = 0; f < 2; f++) {
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const l = layer[y * W + x];
        let col: RGB | null = null;
        if (l === 0) {
          const [r, g, b] = painter((x - c) / R, (y - c) / R, 0, BAYER[y & 3][x & 3], (id % 5) + 1);
          const gray = (r + g + b) / 3;
          col = [r, g, b].map((v) => Math.min(255, Math.round((gray + (v - gray) * sat) * lit))) as RGB;
        } else if (l === 1) col = RING[state];
        else if (l === 2) col = [0, 0, 0];
        else if (l === 3 && HALO[state] && (state === 'here' ? (x + y) % 2 === 0 : (x + y + f) % 2 === 0)) col = HALO[state];
        if (!col) continue;
        const i = (y * W * 2 + f * W + x) * 4;
        img.data.set([col[0], col[1], col[2], 255], i);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  artCache.set(key, (url = cv.toDataURL()));
  return url;
}

/** Dotted threads between nodes, one art pixel per dot on a canvas at art-pixel resolution. */
function threadCanvas(lines: { a: [number, number]; b: [number, number]; kind: 'past' | 'idle' | 'live' }[]): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 400;
  cv.height = 225;
  cv.className = 'map-threads';
  const ctx = cv.getContext('2d')!;
  const STYLE = { past: { col: '#3c3456', on: (s: number) => s % 4 === 0 }, idle: { col: '#8a7cb8', on: (s: number) => s % 3 === 0 }, live: { col: '#d4ba00', on: (s: number) => s % 3 !== 2 } };
  for (const kind of ['past', 'idle', 'live'] as const) {
    ctx.fillStyle = STYLE[kind].col;
    for (const ln of lines) {
      if (ln.kind !== kind) continue;
      const [x1, y1] = [ln.a[0] / 4, ln.a[1] / 4];
      const [x2, y2] = [ln.b[0] / 4, ln.b[1] / 4];
      const mx = (x1 + x2) / 2;
      const at = (t: number): [number, number] => {
        const u = 1 - t;
        return [u * u * u * x1 + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * x2, u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2];
      };
      let s = 0, step = -1, [px, py] = at(0);
      for (let i = 1; i <= 400; i++) {
        const [x, y] = at(i / 400);
        s += Math.hypot(x - px, y - py);
        px = x;
        py = y;
        if (Math.floor(s) === step) continue;
        step = Math.floor(s);
        if (STYLE[kind].on(step)) ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  }
  return cv;
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
    const snap = (v: number) => Math.round(v / 4) * 4;
    if (row >= rows) return [snap(X1), snap(Y0 + 3 * COL_H)];
    return [snap(X0 + (row * (X1 - X0)) / rows), snap(Y0 + col * COL_H)];
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
    const reach = new Set(reachable(map, run.at));
    const here = run.at === null ? -1 : map.nodes[run.at].row;
    const lines: Parameters<typeof threadCanvas>[0] = [];
    for (const n of map.nodes) {
      for (const t of n.next) {
        const m = map.nodes[t];
        const live = (run.at === n.id || (run.at === null && n.row === 0)) && reach.has(t);
        lines.push({ a: this.pos(n.row, n.col, map.rows), b: this.pos(m.row, m.col, map.rows), kind: live ? 'live' : n.row < here ? 'past' : 'idle' });
      }
    }
    this.field.append(threadCanvas(lines));
    for (const n of map.nodes) {
      const [x, y] = this.pos(n.row, n.col, map.rows);
      const state: NodeState = run.at === n.id ? 'here' : reach.has(n.id) ? 'reach' : 'idle';
      const btn = h('button', {
        class: `map-node k-${n.kind} ${reach.has(n.id) ? 'reach' : ''} ${run.at === n.id ? 'here' : ''} ${n.row < here ? 'done' : ''}`,
        style: { left: `${x}px`, top: `${y}px`, backgroundImage: `url(${nodeArt(n.kind, n.id, state)})` },
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
