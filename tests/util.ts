import '../src/content/index.ts';
import { CHARACTERS } from '../src/content/index.ts';
import { createBattle, type BattleSetup, type SeatSetup } from '../src/engine/battle.ts';
import { makeInst } from '../src/engine/fx.ts';
import { defHalf, HALVES } from '../src/engine/registry.ts';
import type { Battle } from '../src/engine/types.ts';

export function starterSeat(char: string, extra: Partial<SeatSetup> = {}): SeatSetup {
  const def = CHARACTERS[char];
  return {
    char,
    alive: true,
    candles: 2,
    deck: def.start.map((id, d) => ({ d, id })),
    side: def.side,
    sideCount: 10,
    relics: [def.relic],
    items: [null, null, null],
    ...extra,
  };
}

export function starterBattle(seed: number, halves: [string, string] = ['grubs', 'goblins'], extra: Partial<BattleSetup> = {}): Battle {
  return createBattle({ seed, seats: [starterSeat('blue'), starterSeat('pistachio')], halves, ...extra }).b;
}

/** An empty test battle: no decks, no enemy script, every bell unrung, both players have drawn. */
export function blankBattle(seed = 1): Battle {
  const seat = (char: string): SeatSetup => ({ char, alive: true, candles: 2, deck: [], side: 'placeholder', sideCount: 0, relics: [], items: [null, null, null] });
  if (!HALVES.has('test-empty')) defHalf({ id: 'test-empty', act: 0, tier: 'normal', turns: [] });
  const b = createBattle({ seed, seats: [seat('blue'), seat('pistachio')], halves: ['test-empty', 'test-empty'] }).b;
  for (const s of b.seats) {
    s.drew = true;
    s.c = {};
    s.side = [makeInst(b, 'placeholder', 0, 'p')];
  }
  for (const f of b.foe) f.backlog = [];
  return b;
}

/** Puts a fresh instance of a card into a slot of a test battle. */
export function put(b: Battle, id: string, row: 'p' | 'e' | 'q', lane: number) {
  const c = makeInst(b, id, lane < 4 ? 0 : 1, row === 'p' ? 'p' : 'e');
  (row === 'p' ? b.p : row === 'e' ? b.e : b.q)[lane] = c;
  if (c.ab.some((a) => a.a === 'kw:shield')) c.st.shield = 1;
  return c;
}

export function give(b: Battle, seat: 0 | 1, id: string) {
  const c = makeInst(b, id, seat, 'p');
  b.seats[seat].hand.push(c);
  return c;
}
