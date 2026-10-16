import { CHARACTERS } from '../content/index.ts';
import { card as cardDef } from '../engine/registry.ts';
import type { Seat } from '../engine/types.ts';
import { deckLines } from '../run/game.ts';
import type { App } from './app.ts';
import { clear, h } from './dom.ts';
import { hideInspect, inspectable } from './inspect.ts';
import { deckCardEl } from './node.ts';
import { pager } from './pager.ts';

/** Two rows of eight cards at 0.6 scale fill the stage below the header. */
const PER_PAGE = 16;

/** A full-screen view of one player's deck, sorted by kind then name, a page at a time. */
export const DeckView = {
  open(app: App, seat: Seat): void {
    const g = app.session?.game;
    if (!g) return;
    const rs = g.run.seats[seat];
    const close = () => {
      hideInspect();
      wrap.remove();
    };
    const wrap = h('div', { class: 'deck-view' });
    wrap.append(
      h('div', { class: 'deck-head' },
        h('h2', {}, `${CHARACTERS[rs.char].name}'s deck`),
        h('span', {}, `${rs.deck.length} cards. The side deck holds 10 Placeholders.`),
        h('button', { class: 'primary', onclick: close }, 'Close'),
      ),
    );
    const sorted = [...rs.deck].sort((a, b) => {
      const da = cardDef(a.id);
      const db = cardDef(b.id);
      if (da.kind !== db.kind) return da.kind === 'creature' ? -1 : 1;
      return da.name.localeCompare(db.name);
    });
    const cells = sorted.map((dc) => {
      const cell = h('div', { class: 'offer' });
      cell.append(deckCardEl(dc, 0.6));
      inspectable(cell, () => ({ id: dc.id, opts: { up: dc.up, ab: deckLines(dc), power: cardDef(dc.id).power + (dc.dp ?? 0), health: cardDef(dc.id).health + (dc.dh ?? 0) } }));
      return cell;
    });
    const body = h('div', {});
    const show = (p: number) => {
      hideInspect();
      clear(body);
      body.append(pager(cells, PER_PAGE, p, show));
    };
    show(0);
    wrap.append(body);
    wrap.addEventListener('contextmenu', (e) => (e.preventDefault(), close()));
    app.stage.append(wrap);
  },
};
