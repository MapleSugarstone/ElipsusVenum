import { CHARACTERS } from '../content/index.ts';
import type { DeckCard } from '../engine/battle.ts';
import { ability, card as cardDef, ITEMS, kwInst, RELICS } from '../engine/registry.ts';
import { cardLines, fillTemplate, type TextLine } from '../engine/text.ts';
import type { AbilityInst } from '../engine/types.ts';
import { other, type Seat } from '../engine/types.ts';
import { EVENTS } from '../run/events.ts';
import { deckLines } from '../run/game.ts';
import type { GameAction, Offer } from '../run/types.ts';
import type { App } from './app.ts';
import { fullCard } from './card.ts';
import { clear, h, toast } from './dom.ts';
import { hideInspect, inspectable, tipText } from './inspect.ts';
import { pager } from './pager.ts';
import type { Update } from './session.ts';

const TITLES: Record<string, string> = {
  reward: 'Spoils', bossReward: 'The boss is beaten', rest: 'Rest site', merchant: 'Merchant', treasure: 'Treasure', event: 'Event',
  cards: 'Card choice', mycologist: 'Mycologists', stones: 'Sacrificial stones', woodcarver: 'Woodcarver',
};

/** A deck card's rules lines, with its upgrade's numbers and keywords when `up` is set. Lines moved onto it stay. */
function upAb(dc: DeckCard, up: boolean): AbilityInst[] {
  const def = cardDef(dc.id);
  const base = def.ab.map((a) => {
    if (!up || !a.p || !def.up?.p) return a;
    const p = { ...a.p };
    for (const k of Object.keys(def.up.p)) if (k in p) p[k] = def.up.p[k];
    return { ...a, p };
  });
  if (up && def.up?.kw) for (const k of def.up.kw) base.push(kwInst(k));
  return [...base, ...deckLines(dc).slice(def.ab.length)];
}

export function deckCardEl(dc: DeckCard, scale: number): HTMLDivElement {
  return fullCard(dc.id, { up: dc.up, ab: upAb(dc, !!dc.up), dp: dc.dp, dh: dc.dh, scale });
}

const lineText = (l: TextLine) => l.spans.map((s) => s.t).join('');

/** The card as it is and as it would be upgraded, side by side, with every change on the upgraded one highlighted. */
function upgradePreview(dc: DeckCard): HTMLDivElement {
  const def = cardDef(dc.id);
  const before = cardLines(upAb(dc, false)).map(lineText);
  const after = cardLines(upAb(dc, true));
  const mark = after.map((l, i) => (before.includes(lineText(l)) ? -1 : i)).filter((i) => i >= 0);
  const up = def.up ?? {};
  const scale = 0.5;
  const cell = (label: string, el: HTMLElement) =>
    h('div', { class: 'up-cell' }, h('div', { class: 'up-label' }, label), h('div', { class: 'offer', style: { width: `${280 * scale}px`, height: `${392 * scale}px` } }, el));
  return h('div', { class: 'up-preview' },
    cell('Now', fullCard(dc.id, { ab: upAb(dc, false), dp: dc.dp, dh: dc.dh, scale })),
    h('div', { class: 'spr spr-arrow' }),
    cell('Upgraded', fullCard(dc.id, { up: true, ab: upAb(dc, true), dp: dc.dp, dh: dc.dh, scale, mark, markCost: !!up.cost, markStats: up.power !== undefined || up.health !== undefined })),
  );
}

export class NodeScreen {
  readonly root: HTMLDivElement;
  private app: App;
  private pick: Record<number, number[]> = { 0: [], 1: [] };
  private stoneLine: Record<number, number> = { 0: -1, 1: -1 };
  private sheet: HTMLDivElement | null = null;

  constructor(app: App) {
    this.app = app;
    this.root = h('div', { class: 'node-screen' });
  }

  start(): void {
    this.render();
    const node = this.app.session!.game.run.node;
    if (node?.event) this.app.say(EVENTS.get(node.event.id)?.intro ?? '');
  }

  onUpdate(_u: Update): void {
    this.render();
  }

  destroy(): void {
    hideInspect();
    this.sheet?.remove();
    this.root.remove();
  }

  private send(seat: Seat, a: GameAction): void {
    hideInspect();
    const err = this.app.send(seat, a);
    if (err) toast(this.root, err);
  }

  private render(): void {
    const s = this.app.session!;
    const g = s.game;
    const node = g.run.node;
    clear(this.root);
    if (!node) return;
    this.root.append(h('h2', {}, TITLES[node.kind] ?? node.kind));
    if (node.kind === 'event') return this.renderEvent();
    if (node.kind === 'cards' && node.note) this.root.append(h('p', { style: { color: 'var(--muted)', marginTop: '-10px' } }, `These cards are all ${node.note} creatures, or close to it.`));
    const cols = h('div', { class: 'node-cols' });
    for (const seat of [0, 1] as Seat[]) cols.append(this.column(seat));
    this.root.append(cols);
  }

  private column(seat: Seat): HTMLDivElement {
    const s = this.app.session!;
    const g = s.game;
    const node = g.run.node!;
    const rs = g.run.seats[seat];
    const mine = s.mine.includes(seat);
    const col = h('div', { class: 'node-col' });
    col.append(h('h3', {}, h('span', { class: 'dot', style: { background: `var(--seat-${seat})` } }), CHARACTERS[rs.char].name, h('span', { style: { color: 'var(--warn)', fontSize: '16px', marginLeft: '10px' } }, `${rs.teeth} teeth`)));
    if (node.done[seat]) {
      col.append(h('p', { style: { color: 'var(--muted)' } }, mine ? 'Done. Waiting for your partner.' : 'Done.'));
      return col;
    }
    const body = h('div', {});
    col.append(body);
    const offerEl = (o: Offer, onPick?: () => void, price?: number, scale = 0.7) => {
      const wrap = h('div', { class: `offer ${o.sold ? 'sold' : ''}`, style: { width: `${280 * scale}px`, height: `${392 * scale}px` }, onclick: () => !o.sold && mine && onPick?.() });
      wrap.append(fullCard(o.id, { up: o.up, scale }));
      if (price !== undefined) wrap.append(h('div', { class: 'price' }, `${price} teeth`));
      inspectable(wrap, () => ({ id: o.id, opts: { up: o.up } }));
      return wrap;
    };
    const doneBtn = (label = 'Continue') => h('button', { class: 'primary', disabled: !mine, onclick: () => this.send(seat, { t: 'done' }) }, label);

    switch (node.kind) {
      case 'reward':
      case 'cards':
      case 'bossReward': {
        if (node.kind === 'reward' && node.relics?.[seat]?.length) {
          body.append(h('p', {}, 'Relic gained: ', this.relicTag(node.relics[seat][0])));
        }
        if (node.kind === 'bossReward' && node.relics?.[seat]?.length) {
          body.append(h('p', {}, 'Choose a boss relic:'));
          const row = h('div', { class: 'relic-list', style: { marginBottom: '14px' } });
          node.relics[seat].forEach((r, i) => row.append(h('button', { disabled: !mine, onclick: () => this.send(seat, { t: 'relic', i }) }, this.relicTag(r))));
          body.append(row);
        }
        const offers = node.offers?.[seat] ?? [];
        if (offers.length) {
          body.append(h('p', {}, 'Take one card, or skip.'));
          const row = h('div', { class: 'offer-row' });
          offers.forEach((o, i) => row.append(offerEl(o, () => this.send(seat, { t: 'pick', i }))));
          body.append(row);
          body.append(h('button', { disabled: !mine, onclick: () => this.send(seat, { t: 'pick', i: -1 }) }, 'Skip'));
        }
        if (node.kind === 'bossReward') body.append(' ', doneBtn('Go on to the next act'));
        break;
      }
      case 'treasure':
        body.append(h('p', {}, 'Relic gained: ', node.relics?.[seat]?.[0] ? this.relicTag(node.relics[seat][0]) : 'none left to find'), doneBtn());
        break;
      case 'merchant': {
        const shop = node.shop![seat];
        const row = h('div', { class: 'offer-row', style: { marginBottom: '30px', gap: '8px', flexWrap: 'nowrap' } });
        // Five offers at this scale fill one row of a player's half.
        shop.cards.forEach((o, i) => row.append(offerEl(o, () => this.send(seat, { t: 'buy', kind: 'card', i }), o.price, 0.47)));
        body.append(row);
        const goods = h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' } });
        shop.items.forEach((o, i) => goods.append(h('button', { disabled: !mine || o.sold, title: ITEMS.get(o.id)?.text, onclick: () => this.send(seat, { t: 'buy', kind: 'item', i }) }, `${ITEMS.get(o.id)?.name} (${o.price})`)));
        if (shop.relic) goods.append(h('button', { disabled: !mine || shop.relic.sold, title: RELICS.get(shop.relic.id)?.text, onclick: () => this.send(seat, { t: 'buy', kind: 'relic', i: 0 }) }, `${RELICS.get(shop.relic.id)?.name} (${shop.relic.price})`));
        body.append(goods);
        const end = h('div', { class: 'picker-row' });
        if (!shop.removed) end.append(this.deckPicker(seat, (dc) => this.send(seat, { t: 'remove', d: dc.d }), undefined, `Remove a card (${shop.removePrice} teeth)`));
        end.append(doneBtn('Leave'));
        body.append(end);
        break;
      }
      case 'rest': {
        const mate = g.run.seats[other(seat)];
        const opts = h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' } });
        if (!mate.alive) opts.append(h('button', { class: 'primary', disabled: !mine || !rs.alive, onclick: () => this.send(seat, { t: 'rest', opt: 'revive' }) }, 'Revive your partner'));
        opts.append(h('button', { disabled: !mine || !rs.alive || rs.candles >= 3, onclick: () => this.send(seat, { t: 'rest', opt: 'relight' }) }, 'Relight a candle'));
        body.append(opts);
        body.append(h('p', {}, 'Or choose a card: upgrade it, or give a creature 2 power or 4 health.'));
        const sel = this.pick[seat][0];
        const chosen = rs.deck.find((c) => c.d === sel);
        if (chosen) {
          const isCreature = cardDef(chosen.id).kind === 'creature';
          if (!chosen.up && cardDef(chosen.id).up) body.append(upgradePreview(chosen));
          else body.append(h('p', { class: 'up-none' }, chosen.up ? `${cardDef(chosen.id).name} is already upgraded.` : `${cardDef(chosen.id).name} has no upgrade.`));
          body.append(
            h('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } },
              h('button', { disabled: !mine || chosen.up || !cardDef(chosen.id).up, onclick: () => this.send(seat, { t: 'rest', opt: 'upgrade', d: chosen.d }) }, `Upgrade ${cardDef(chosen.id).name}`),
              h('button', { disabled: !mine || !isCreature, onclick: () => this.send(seat, { t: 'rest', opt: 'power', d: chosen.d }) }, '+2 power'),
              h('button', { disabled: !mine || !isCreature, onclick: () => this.send(seat, { t: 'rest', opt: 'health', d: chosen.d }) }, '+4 health'),
            ),
          );
        }
        const end = h('div', { class: 'picker-row' }, this.deckPicker(seat, (dc) => ((this.pick[seat] = [dc.d]), this.render()), undefined, chosen ? 'Choose another card' : 'Choose a card'), doneBtn('Skip'));
        body.append(end);
        break;
      }
      case 'mycologist': {
        body.append(h('p', {}, 'Choose two copies of the same creature. They merge into one with both sets of stats and rules.'));
        const [a, b] = this.pick[seat];
        body.append(h('button', { class: 'primary', disabled: !mine || a === undefined || b === undefined, onclick: () => this.send(seat, { t: 'merge', a, b }) }, 'Merge'), ' ', doneBtn('Skip'));
        body.append(this.deckPicker(seat, (dc) => this.toggle(seat, dc.d, 2), (dc) => cardDef(dc.id).kind === 'creature' && rs.deck.filter((x) => x.id === dc.id).length > 1, 'Choose two copies', true));
        break;
      }
      case 'stones': {
        body.append(h('p', {}, 'Choose a creature to give up, then one of its lines, then the creature that receives it.'));
        const [from, to] = this.pick[seat];
        const fromCard = rs.deck.find((c) => c.d === from);
        if (fromCard) {
          const lines = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0' } });
          deckLines(fromCard).forEach((l, i) => {
            const def = ability(l.a);
            const text = def.kw ? def.kw + (l.p?.n ? ` ${l.p.n}` : '') : fillTemplate(def.text, { ...(def.p ?? {}), ...(l.p ?? {}) });
            lines.append(h('button', { class: this.stoneLine[seat] === i ? 'primary' : '', onclick: () => ((this.stoneLine[seat] = i), this.render()) }, tipText(text)));
          });
          body.append(lines);
        }
        body.append(
          h('button', { class: 'primary', disabled: !mine || from === undefined || to === undefined || this.stoneLine[seat] < 0, onclick: () => this.send(seat, { t: 'stones', from, line: this.stoneLine[seat], to }) }, 'Move the line'),
          ' ',
          doneBtn('Skip'),
        );
        body.append(this.deckPicker(seat, (dc) => this.toggle(seat, dc.d, 2), (dc) => cardDef(dc.id).kind === 'creature', 'Choose two creatures', true));
        break;
      }
      case 'woodcarver': {
        body.append(h('p', {}, 'Choose a totem. It replaces any totem you have.'));
        node.totems![seat].forEach((t, i) => body.append(h('button', { class: 'event-opt', disabled: !mine, onclick: () => this.send(seat, { t: 'totem', i }) }, h('b', {}, `${t.tribe} totem`), tipText(`Every ${t.tribe} creature in your deck gains ${t.kw}.`))));
        body.append(doneBtn('Skip'));
        break;
      }
    }
    return col;
  }

  private toggle(seat: Seat, d: number, max: number): void {
    const cur = this.pick[seat];
    this.pick[seat] = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].slice(-max);
    if (!this.pick[seat].includes(this.pick[seat][0])) this.stoneLine[seat] = -1;
    this.render();
  }

  private relicTag(id: string): HTMLElement {
    const r = RELICS.get(id);
    return h('span', { class: 'relic', title: r?.text ?? '' }, r ? `${r.name}: ${r.text}` : id);
  }

  /** The cards picked so far, shown small, and a button that opens the deck as a paged sheet to pick from. */
  private deckPicker(seat: Seat, onPick: (dc: DeckCard) => void, filter?: (dc: DeckCard) => boolean, label = 'Choose from your deck', multi = false): HTMLDivElement {
    const rs = this.app.session!.game.run.seats[seat];
    const mine = this.app.session!.mine.includes(seat);
    const row = h('div', { class: 'picker-row' });
    for (const dc of rs.deck) if (this.pick[seat].includes(dc.d)) row.append(this.deckCell(dc, 0.45, true));
    row.append(h('button', { disabled: !mine, onclick: () => this.openSheet(seat, onPick, filter, multi) }, label));
    return row;
  }

  private deckCell(dc: DeckCard, scale: number, sel: boolean, onClick?: () => void): HTMLDivElement {
    const wrap = h('div', { class: `offer ${sel ? 'sel' : ''}`, style: { width: `${280 * scale}px`, height: `${392 * scale}px` }, onclick: () => onClick?.() });
    wrap.append(deckCardEl(dc, scale));
    inspectable(wrap, () => ({ id: dc.id, opts: { up: dc.up, ab: deckLines(dc), power: cardDef(dc.id).power + (dc.dp ?? 0), health: cardDef(dc.id).health + (dc.dh ?? 0) } }));
    return wrap;
  }

  /** A full-screen sheet of one player's deck. A single pick closes it, and a multiple pick stays open until Done. */
  private openSheet(seat: Seat, onPick: (dc: DeckCard) => void, filter: ((dc: DeckCard) => boolean) | undefined, multi: boolean): void {
    this.sheet?.remove();
    const sheet = h('div', { class: 'deck-view' });
    let page = 0;
    const close = () => {
      hideInspect();
      sheet.remove();
      if (this.sheet === sheet) this.sheet = null;
    };
    const draw = () => {
      const rs = this.app.session!.game.run.seats[seat];
      clear(sheet);
      sheet.append(
        h('div', { class: 'deck-head' },
          h('h2', {}, `${CHARACTERS[rs.char].name}'s deck`),
          h('span', {}, multi ? 'Click cards to pick them.' : 'Click a card to pick it.'),
          h('button', { class: 'primary', onclick: close }, multi ? 'Done' : 'Cancel'),
        ),
      );
      const cells = rs.deck
        .filter((dc) => !filter || filter(dc))
        .map((dc) => this.deckCell(dc, 0.6, this.pick[seat].includes(dc.d), () => (onPick(dc), multi ? draw() : close())));
      if (!cells.length) sheet.append(h('p', {}, 'No card in this deck qualifies.'));
      sheet.append(pager(cells, 16, page, (p) => ((page = p), hideInspect(), draw())));
    };
    draw();
    sheet.addEventListener('contextmenu', (e) => (e.preventDefault(), close()));
    this.app.stage.append(sheet);
    this.sheet = sheet;
  }

  private renderEvent(): void {
    const s = this.app.session!;
    const g = s.game;
    const node = g.run.node!;
    const e = node.event!;
    const def = EVENTS.get(e.id);
    if (!def) return;
    const box = h('div', { class: 'event-box' });
    box.append(h('h3', { style: { fontFamily: 'var(--font-display)', fontWeight: 'normal', fontSize: '28px', margin: '0 0 8px' } }, def.title));
    box.append(h('div', { class: 'intro' }, `Your Best Friend: ${def.intro}`));
    if (e.stage === 0) {
      def.options.forEach((o, i) => {
        const btn = h('button', {
          class: 'event-opt',
          onclick: () => {
            if (this.app.solo()) {
              for (const seat of [0, 1] as Seat[]) {
                const err = this.app.send(seat, { t: 'evote', i }) ?? this.app.send(seat, { t: 'lock' });
                if (err) return toast(this.root, err);
              }
            } else this.send(s.mine[0], { t: 'evote', i });
          },
        }, h('b', {}, o.label), tipText(o.text));
        e.votes.forEach((v, seat) => {
          if (v === i) btn.append(h('span', { class: `tok t${seat} ${e.locks[seat] ? 'locked' : ''}`, style: { right: `${8 + seat * 32}px` } }));
        });
        box.append(btn);
      });
      if (!this.app.solo()) {
        const seat = s.mine[0];
        box.append(
          h('button', { class: 'primary', disabled: e.votes[seat] === null || e.locks[seat], onclick: () => this.send(seat, { t: 'lock' }) }, 'Lock in'),
          ' ',
          h('button', { disabled: !e.locks[seat], onclick: () => this.send(seat, { t: 'unlock' }) }, 'Unlock'),
          h('p', { style: { color: 'var(--muted)' } }, 'If you lock in different options, a coin decides.'),
        );
      }
    } else {
      box.append(h('p', { style: { fontSize: '20px' } }, e.result ?? ''));
      const waiting = s.mine.filter((seat) => !node.done[seat]);
      if (waiting.length) {
        box.append(h('button', { class: 'primary', onclick: () => waiting.forEach((seat) => this.send(seat, { t: 'done' })) }, 'Continue'));
      } else box.append(h('p', { style: { color: 'var(--muted)' } }, 'Waiting for your partner.'));
    }
    this.root.append(box);
  }
}
