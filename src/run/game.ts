import { CHARACTERS } from '../content/index.ts';
import { applyInPlace, createBattle, legal as legalBattle, decision, type DeckCard, type SeatSetup } from '../engine/battle.ts';
import { checkOver, emit, makeInst, rowOf } from '../engine/fx.ts';
import { ability, BOSSES, CARDS, card as cardDef, HALVES, ITEMS, RELICS, type Rarity } from '../engine/registry.ts';
import { nextU32, randInt, seedRng, type Rng } from '../engine/rng.ts';
import { SEATS, other, type AbilityInst, type Battle, type Ev, type Seat } from '../engine/types.ts';
import { EVENTS, RunCtx } from './events.ts';
import { generateMap, reachable } from './map.ts';
import type { DebugOp, Game, GameAction, NodeState, Offer, Run, RunSeat, Shop } from './types.ts';

export const ACTS = 3;
const SIDE_COUNT = 10;
const BASE_TEETH = { normal: 3, elite: 6, boss: 10 };
const PRICES: Record<string, number> = { common: 4, uncommon: 6, rare: 9, item: 3, relic: 10, remove: 5 };
export const TOTEM_KEYWORDS = ['Airborne', 'Reach', 'Guardian', 'Sprinter', 'Burrower', 'Deadly', 'Spare Lives', 'Returning', 'Shield', 'Submerge'];
export const TRIBES = ['Canine', 'Hooved', 'Avian', 'Insect', 'Reptile', 'Machine'];

export interface GameSetup {
  seed: number;
  chars: [string, string];
  solo: boolean;
  debug?: boolean;
}

export interface GameResult {
  g: Game;
  ev: Ev[];
  error?: string;
}

function newSeat(char: string): RunSeat {
  const def = CHARACTERS[char];
  return {
    char,
    deck: def.start.map((id, d) => ({ d, id })),
    nextD: def.start.length,
    teeth: 0,
    candles: 2,
    alive: true,
    relics: [def.relic],
    items: [null, null, null],
    totem: null,
  };
}

export function createGame(setup: GameSetup): Game {
  const rng = seedRng(setup.seed);
  const run: Run = {
    act: 1,
    floor: 0,
    seats: [newSeat(setup.chars[0]), newSeat(setup.chars[1])],
    map: generateMap(rng, 1),
    at: null,
    screen: 'map',
    votes: [null, null],
    locks: [false, false],
    node: null,
    over: null,
    coin: null,
    battles: 0,
    fight: null,
  };
  return { v: 1, seed: setup.seed, rng, solo: setup.solo, debug: !!setup.debug, n: 0, run, battle: null };
}

// ---------------------------------------------------------------- helpers

const rarityRoll = (rng: Rng, tier: 'normal' | 'elite' | 'boss'): Rarity => {
  if (tier === 'boss') return 'rare';
  const r = randInt(rng, 100);
  if (tier === 'elite') return r < 40 ? 'common' : r < 80 ? 'uncommon' : 'rare';
  return r < 62 ? 'common' : r < 92 ? 'uncommon' : 'rare';
};

function cardPool(char: string, rarity: Rarity, kind?: 'creature' | 'spell'): string[] {
  return [...CARDS.values()]
    .filter((c) => (c.pool === 'shared' || c.pool === char) && c.rarity === rarity && (!kind || c.kind === kind))
    .map((c) => c.id)
    .sort();
}

function rollOffers(g: Game, seat: Seat, tier: 'normal' | 'elite' | 'boss', count = 3, filter?: (id: string) => boolean): Offer[] {
  const s = g.run.seats[seat];
  const out: Offer[] = [];
  const upChance = g.run.act === 1 ? 0 : g.run.act === 2 ? 15 : 30;
  for (let tries = 0; out.length < count && tries < 60; tries++) {
    const pool = cardPool(s.char, rarityRoll(g.rng, tier)).filter((id) => !filter || filter(id));
    if (pool.length === 0) continue;
    const id = pool[randInt(g.rng, pool.length)];
    if (out.some((o) => o.id === id)) continue;
    const up = !!cardDef(id).up && randInt(g.rng, 100) < upChance;
    out.push(up ? { id, up } : { id });
  }
  return out;
}

function relicPool(s: RunSeat, rarities: string[]): string[] {
  return [...RELICS.values()]
    .filter((r) => rarities.includes(r.rarity) && (r.pool === 'shared' || r.pool === s.char) && !s.relics.includes(r.id))
    .map((r) => r.id)
    .sort();
}

function rollRelics(g: Game, seat: Seat, rarities: string[], count: number): string[] {
  const pool = relicPool(g.run.seats[seat], rarities);
  const out: string[] = [];
  while (out.length < count && out.length < pool.length) {
    const id = pool[randInt(g.rng, pool.length)];
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function rollShop(g: Game, seat: Seat): Shop {
  const s = g.run.seats[seat];
  const cards: Offer[] = [];
  for (const rarity of ['common', 'common', 'uncommon', 'uncommon', 'rare'] as Rarity[]) {
    const pool = cardPool(s.char, rarity).filter((id) => !cards.some((c) => c.id === id));
    if (pool.length === 0) continue;
    const id = pool[randInt(g.rng, pool.length)];
    cards.push({ id, price: PRICES[rarity] + randInt(g.rng, 3) });
  }
  const itemIds = [...ITEMS.keys()].sort();
  const items: Offer[] = [];
  for (let i = 0; i < 2 && itemIds.length; i++) items.push({ id: itemIds[randInt(g.rng, itemIds.length)], price: PRICES.item });
  const relics = relicPool(s, ['common', 'uncommon']);
  const relic = relics.length ? { id: relics[randInt(g.rng, relics.length)], price: PRICES.relic } : null;
  return { cards, items, relic, removePrice: PRICES.remove, removed: false };
}

export function gainRelic(g: Game, seat: Seat, id: string, ev: Ev[]): void {
  g.run.seats[seat].relics.push(id);
  RELICS.get(id)?.gain?.(g.run, seat);
  ev.push({ k: 'relicGain', seat, id });
}

function addCard(s: RunSeat, id: string, up = false): DeckCard {
  const dc: DeckCard = { d: s.nextD++, id, ...(up ? { up: true } : {}) };
  s.deck.push(dc);
  return dc;
}

/** Every rules line on a deck card, in the order the card shows them. */
export function deckLines(dc: DeckCard): AbilityInst[] {
  return [...cardDef(dc.id).ab, ...(dc.ab ?? [])];
}

// ---------------------------------------------------------------- battles

function seatSetup(s: RunSeat): SeatSetup {
  return {
    char: s.char,
    alive: s.alive,
    candles: s.candles,
    deck: s.deck,
    side: CHARACTERS[s.char].side,
    sideCount: SIDE_COUNT,
    relics: s.relics,
    items: s.items,
    totem: s.totem ?? undefined,
  };
}

function pickHalves(g: Game, tier: 'normal' | 'elite'): [string, string] {
  let pool = [...HALVES.values()].filter((h) => h.act === g.run.act && h.tier === tier).map((h) => h.id).sort();
  if (pool.length === 0) pool = [...HALVES.values()].filter((h) => h.act === 1 && h.tier === tier).map((h) => h.id).sort();
  const a = pool[randInt(g.rng, pool.length)];
  const rest = pool.filter((x) => x !== a);
  const b = rest.length ? rest[randInt(g.rng, rest.length)] : a;
  return [a, b];
}

function startBattle(g: Game, ev: Ev[], tier: 'normal' | 'elite' | 'boss', halves?: [string, string], boss?: string): void {
  const run = g.run;
  if (tier === 'boss' && !boss) {
    let bosses = [...BOSSES.values()].filter((x) => x.act === run.act).map((x) => x.id).sort();
    if (bosses.length === 0) bosses = [...BOSSES.keys()].sort();
    boss = bosses[randInt(g.rng, bosses.length)];
  }
  const h = halves ?? (tier === 'boss' ? (['', ''] as [string, string]) : pickHalves(g, tier));
  const r = createBattle({
    seed: nextU32(g.rng),
    seats: [seatSetup(run.seats[0]), seatSetup(run.seats[1])],
    halves: h,
    boss,
    size: undefined,
  });
  g.battle = r.b;
  run.screen = 'battle';
  run.fight = tier;
  run.node = null;
  ev.push({ k: 'battleStart', tier, halves: r.b.foe.map((f) => f.enc), boss: boss ?? null });
  ev.push(...r.ev);
}

function endBattle(g: Game, ev: Ev[]): void {
  const b = g.battle!;
  const run = g.run;
  const tier = run.fight ?? 'normal';
  for (const i of SEATS) {
    const rs = run.seats[i];
    const bs = b.seats[i];
    rs.candles = bs.candles;
    rs.alive = bs.alive;
    rs.items = [...bs.items];
    rs.teeth += bs.teeth;
    for (const p of bs.perm) {
      for (const owner of run.seats) {
        const dc = owner.deck.find((x) => x.d === p.d);
        if (!dc) continue;
        dc.dp = (dc.dp ?? 0) + p.dp;
        dc.dh = (dc.dh ?? 0) + p.dh;
      }
    }
  }
  run.battles += 1;
  run.fight = null;
  if (b.over === 'loss') {
    run.over = 'loss';
    run.screen = 'over';
    ev.push({ k: 'runOver', r: 'loss' });
    return;
  }
  for (const i of SEATS) run.seats[i].teeth += BASE_TEETH[tier];
  ev.push({ k: 'battleWon', tier, teeth: BASE_TEETH[tier] });
  if (tier === 'boss') {
    for (const i of SEATS) {
      const rs = run.seats[i];
      if (!rs.alive) {
        rs.alive = true;
        rs.candles = 1;
        ev.push({ k: 'revive', seat: i });
      }
    }
    run.node = {
      kind: 'bossReward',
      done: [false, false],
      offers: [rollOffers(g, 0, 'boss'), rollOffers(g, 1, 'boss')],
      relics: [rollRelics(g, 0, ['boss', 'rare'], 3), rollRelics(g, 1, ['boss', 'rare'], 3)],
    };
  } else {
    const node: NodeState = {
      kind: 'reward',
      done: [false, false],
      offers: [rollOffers(g, 0, tier), rollOffers(g, 1, tier)],
    };
    if (tier === 'elite') {
      node.relics = [rollRelics(g, 0, ['common', 'uncommon'], 1), rollRelics(g, 1, ['common', 'uncommon'], 1)];
      SEATS.forEach((i) => {
        const id = node.relics![i][0];
        if (id) {
          gainRelic(g, i, id, ev);
        }
      });
    }
    run.node = node;
  }
  run.screen = 'node';
}

// ---------------------------------------------------------------- map and nodes

function enterNode(g: Game, ev: Ev[], id: number): void {
  const run = g.run;
  const node = run.map.nodes[id];
  run.at = id;
  run.floor = node.row + 1;
  run.votes = [null, null];
  run.locks = [false, false];
  ev.push({ k: 'enter', node: id, kind: node.kind });
  const fresh = (kind: NodeState['kind']): NodeState => ({ kind, done: [false, false] });
  switch (node.kind) {
    case 'battle':
      startBattle(g, ev, 'normal');
      return;
    case 'elite':
      startBattle(g, ev, 'elite');
      return;
    case 'boss':
      startBattle(g, ev, 'boss');
      return;
    case 'rest':
    case 'mycologist':
    case 'stones':
      run.node = fresh(node.kind);
      break;
    case 'merchant':
      run.node = { ...fresh('merchant'), shop: [rollShop(g, 0), rollShop(g, 1)] };
      break;
    case 'treasure': {
      const n = fresh('treasure');
      n.relics = [rollRelics(g, 0, ['common', 'uncommon'], 1), rollRelics(g, 1, ['common', 'uncommon'], 1)];
      SEATS.forEach((i) => {
        const r = n.relics![i][0];
        if (r) {
          gainRelic(g, i, r, ev);
        }
      });
      run.node = n;
      break;
    }
    case 'cards': {
      const n = fresh('cards');
      const tribe = TRIBES[randInt(g.rng, TRIBES.length - 1)];
      const themed = (id: string) => cardDef(id).tribe === tribe || cardDef(id).tribe === 'Any';
      n.offers = [rollOffers(g, 0, 'normal', 3, themed), rollOffers(g, 1, 'normal', 3, themed)];
      for (const i of SEATS) if (n.offers[i].length < 3) n.offers[i] = rollOffers(g, i, 'elite');
      n.note = tribe;
      run.node = n;
      break;
    }
    case 'woodcarver': {
      const n = fresh('woodcarver');
      const roll = () => ({ tribe: TRIBES[randInt(g.rng, TRIBES.length)], kw: TOTEM_KEYWORDS[randInt(g.rng, TOTEM_KEYWORDS.length)] });
      n.totems = [[roll(), roll(), roll()], [roll(), roll(), roll()]];
      run.node = n;
      break;
    }
    case 'event': {
      const pool = [...EVENTS.values()].filter((e) => e.acts.includes(run.act)).sort((a, b) => (a.id < b.id ? -1 : 1));
      const total = pool.reduce((a, e) => a + (e.weight ?? 10), 0);
      let roll = randInt(g.rng, Math.max(1, total));
      let pick = pool[0];
      for (const e of pool) {
        if (roll < (e.weight ?? 10)) {
          pick = e;
          break;
        }
        roll -= e.weight ?? 10;
      }
      run.node = { ...fresh('event'), event: { id: pick?.id ?? '', stage: 0, votes: [null, null], locks: [false, false] } };
      break;
    }
  }
  run.screen = 'node';
}

function flipCoin(g: Game, ev: Ev[], votes: [number, number]): number {
  const result = votes[randInt(g.rng, 2)];
  g.run.coin = { votes, result, n: (g.run.coin?.n ?? 0) + 1 };
  ev.push({ k: 'coin', votes, result });
  return result;
}

function finishNode(g: Game, ev: Ev[]): void {
  const run = g.run;
  const kind = run.node?.kind;
  run.node = null;
  g.battle = null;
  if (kind === 'bossReward') {
    run.act += 1;
    if (run.act > ACTS) {
      run.over = 'win';
      run.screen = 'over';
      ev.push({ k: 'runOver', r: 'win' });
      return;
    }
    run.map = generateMap(g.rng, run.act);
    run.at = null;
    run.floor = 0;
    ev.push({ k: 'act', act: run.act });
  }
  run.screen = 'map';
}

function resolveEvent(g: Game, ev: Ev[]): void {
  const run = g.run;
  const e = run.node!.event!;
  const [a, b] = e.votes as [number, number];
  const choice = a === b ? a : flipCoin(g, ev, [a, b]);
  const def = EVENTS.get(e.id)!;
  const ctx = new RunCtx(g, ev);
  e.result = def.options[choice].run(ctx);
  e.stage = 1;
  ev.push({ k: 'eventResult', i: choice, text: e.result });
  if (run.over) return;
  if (ctx.pendingBattle) startBattle(g, ev, ctx.pendingBattle.tier, ctx.pendingBattle.halves);
}

// ---------------------------------------------------------------- legality

export function legalGame(g: Game, seat: Seat, a: GameAction): string | null {
  const run = g.run;
  if (a.t === 'debug') return g.debug ? null : 'debug is off';
  if (run.over) return 'the run is over';
  const s = run.seats[seat];
  const node = run.node;
  switch (a.t) {
    case 'b':
      if (run.screen !== 'battle' || !g.battle) return 'no battle';
      return legalBattle(g.battle, seat, a.a);
    case 'vote':
      if (run.screen !== 'map') return 'not on the map';
      if (run.locks[seat]) return 'vote is locked';
      return reachable(run.map, run.at).includes(a.node) ? null : 'you cannot reach that node';
    case 'lock':
      if (run.screen === 'map') return run.votes[seat] !== null && !run.locks[seat] ? null : 'vote first';
      if (node?.event && node.event.stage === 0) return node.event.votes[seat] !== null && !node.event.locks[seat] ? null : 'vote first';
      return 'nothing to lock';
    case 'unlock':
      if (run.screen === 'map') return run.locks[seat] ? null : 'not locked';
      if (node?.event && node.event.stage === 0) return node.event.locks[seat] ? null : 'not locked';
      return 'nothing to unlock';
    case 'evote': {
      const e = node?.event;
      if (!e || e.stage !== 0) return 'no event choice';
      if (e.locks[seat]) return 'vote is locked';
      const opt = EVENTS.get(e.id)?.options[a.i];
      if (!opt) return 'no such option';
      if (opt.ok && !opt.ok(new RunCtx(structuredClone(g), []))) return 'that option is not available';
      return null;
    }
    case 'gift':
      return Number.isInteger(a.n) && a.n > 0 && s.teeth >= a.n ? null : 'not enough teeth';
    case 'done':
      if (run.screen !== 'node' || !node) return 'nothing to finish';
      if (node.done[seat]) return 'already done';
      if (node.event && node.event.stage === 0) return 'vote on the event first';
      return null;
  }
  if (run.screen !== 'node' || !node) return 'not at a node';
  if (node.done[seat]) return 'you are done here';
  switch (a.t) {
    case 'pick': {
      if (!node.offers) return 'no cards offered';
      if (a.i === -1) return null;
      return node.offers[seat][a.i] && !node.offers[seat][a.i].sold ? null : 'no such card';
    }
    case 'relic':
      if (node.kind !== 'bossReward' || !node.relics) return 'no relic choice';
      return node.relics[seat][a.i] ? null : 'no such relic';
    case 'buy': {
      const shop = node.shop?.[seat];
      if (!shop) return 'no shop';
      const offer = a.kind === 'card' ? shop.cards[a.i] : a.kind === 'item' ? shop.items[a.i] : shop.relic;
      if (!offer || offer.sold) return 'sold out';
      if (s.teeth < (offer.price ?? 0)) return 'not enough teeth';
      if (a.kind === 'item' && !s.items.includes(null)) return 'no free item slot';
      return null;
    }
    case 'remove': {
      const shop = node.shop?.[seat];
      if (!shop) return 'no shop';
      if (shop.removed) return 'already removed a card here';
      if (s.teeth < shop.removePrice) return 'not enough teeth';
      return s.deck.some((c) => c.d === a.d) ? null : 'no such card';
    }
    case 'rest': {
      if (node.kind !== 'rest') return 'not at a rest site';
      if (a.opt === 'revive') return run.seats[other(seat)].alive ? 'your partner is alive' : s.alive ? null : 'you are dead';
      if (a.opt === 'relight') return s.alive && s.candles < 3 ? null : 'cannot relight';
      const dc = s.deck.find((c) => c.d === a.d);
      if (!dc) return 'choose a card';
      if (a.opt === 'upgrade') return !dc.up && cardDef(dc.id).up ? null : 'cannot upgrade that card';
      return cardDef(dc.id).kind === 'creature' ? null : 'choose a creature';
    }
    case 'merge': {
      if (node.kind !== 'mycologist') return 'no mycologists here';
      const x = s.deck.find((c) => c.d === a.a);
      const y = s.deck.find((c) => c.d === a.b);
      if (!x || !y || x === y) return 'choose two cards';
      if (x.id !== y.id || cardDef(x.id).kind !== 'creature') return 'choose two copies of one creature';
      return null;
    }
    case 'stones': {
      if (node.kind !== 'stones') return 'no stones here';
      const from = s.deck.find((c) => c.d === a.from);
      const to = s.deck.find((c) => c.d === a.to);
      if (!from || !to || from === to) return 'choose two cards';
      if (cardDef(from.id).kind !== 'creature' || cardDef(to.id).kind !== 'creature') return 'choose two creatures';
      const line = deckLines(from)[a.line];
      if (!line) return 'choose a rules line';
      if (deckLines(to).some((l) => l.a === line.a)) return 'that card already has this line';
      return null;
    }
    case 'totem':
      if (node.kind !== 'woodcarver' || !node.totems) return 'no woodcarver here';
      return node.totems[seat][a.i] ? null : 'no such totem';
  }
  return 'unknown action';
}

// ---------------------------------------------------------------- applying

export function applyGame(prev: Game, seat: Seat, a: GameAction, snap?: (b: Battle) => unknown): GameResult {
  const err = legalGame(prev, seat, a);
  if (err) return { g: prev, ev: [{ k: 'refuse', seat, why: err }], error: err };
  const g = structuredClone(prev);
  const ev = applyGameInPlace(g, seat, a, snap);
  return { g, ev };
}

/** Applies an action already known to be legal, changing `g` in place. */
export function applyGameInPlace(g: Game, seat: Seat, a: GameAction, snap?: (b: Battle) => unknown): Ev[] {
  const ev: Ev[] = [];
  const run = g.run;
  const s = run.seats[seat];
  const node = run.node;
  g.n += 1;
  switch (a.t) {
    case 'b': {
      ev.push(...applyInPlace(g.battle!, seat, a.a, snap));
      if (g.battle!.over) endBattle(g, ev);
      break;
    }
    case 'vote':
      run.votes[seat] = a.node;
      ev.push({ k: 'vote', seat, node: a.node });
      break;
    case 'lock':
      if (run.screen === 'map') {
        run.locks[seat] = true;
        ev.push({ k: 'lock', seat });
        if (run.locks[0] && run.locks[1]) {
          const [x, y] = run.votes as [number, number];
          enterNode(g, ev, x === y ? x : flipCoin(g, ev, [x, y]));
        }
      } else if (node?.event) {
        node.event.locks[seat] = true;
        ev.push({ k: 'lock', seat });
        if (node.event.locks[0] && node.event.locks[1]) resolveEvent(g, ev);
      }
      break;
    case 'unlock':
      if (run.screen === 'map') run.locks[seat] = false;
      else if (node?.event) node.event.locks[seat] = false;
      ev.push({ k: 'unlock', seat });
      break;
    case 'evote':
      node!.event!.votes[seat] = a.i;
      ev.push({ k: 'evote', seat, i: a.i });
      break;
    case 'gift':
      s.teeth -= a.n;
      run.seats[other(seat)].teeth += a.n;
      ev.push({ k: 'gift', seat, n: a.n });
      break;
    case 'pick': {
      if (a.i >= 0) {
        const o = node!.offers![seat][a.i];
        addCard(s, o.id, o.up);
        o.sold = true;
        ev.push({ k: 'deckAdd', seat, id: o.id, up: !!o.up });
      }
      if (node!.kind !== 'bossReward') node!.done[seat] = true;
      else node!.offers![seat] = [];
      break;
    }
    case 'relic': {
      const id = node!.relics![seat][a.i];
      gainRelic(g, seat, id, ev);
      node!.relics![seat] = [];
      break;
    }
    case 'buy': {
      const shop = node!.shop![seat];
      const offer = a.kind === 'card' ? shop.cards[a.i] : a.kind === 'item' ? shop.items[a.i] : shop.relic!;
      s.teeth -= offer.price ?? 0;
      offer.sold = true;
      if (a.kind === 'card') addCard(s, offer.id, offer.up);
      else if (a.kind === 'item') s.items[s.items.indexOf(null)] = offer.id;
      else gainRelic(g, seat, offer.id, ev);
      ev.push({ k: 'buy', seat, kind: a.kind, id: offer.id });
      break;
    }
    case 'remove': {
      const shop = node!.shop![seat];
      s.teeth -= shop.removePrice;
      shop.removed = true;
      const idx = s.deck.findIndex((c) => c.d === a.d);
      const [gone] = s.deck.splice(idx, 1);
      ev.push({ k: 'deckRemove', seat, id: gone.id });
      break;
    }
    case 'rest': {
      if (a.opt === 'revive') {
        const mate = run.seats[other(seat)];
        mate.alive = true;
        mate.candles = 1;
        ev.push({ k: 'revive', seat: other(seat) });
      } else if (a.opt === 'relight') {
        s.candles += 1;
        ev.push({ k: 'runCandle', seat, v: s.candles });
      } else {
        const dc = s.deck.find((c) => c.d === a.d)!;
        if (a.opt === 'upgrade') dc.up = true;
        else if (a.opt === 'power') dc.dp = (dc.dp ?? 0) + 2;
        else dc.dh = (dc.dh ?? 0) + 4;
        ev.push({ k: 'deckChange', seat, d: dc.d, opt: a.opt });
      }
      node!.done[seat] = true;
      break;
    }
    case 'merge': {
      const x = s.deck.find((c) => c.d === a.a)!;
      const y = s.deck.find((c) => c.d === a.b)!;
      const def = cardDef(y.id);
      x.dp = (x.dp ?? 0) + def.power + (y.dp ?? 0);
      x.dh = (x.dh ?? 0) + def.health + (y.dh ?? 0);
      if (y.ab) x.ab = [...(x.ab ?? []), ...y.ab.filter((l) => !deckLines(x).some((m) => m.a === l.a))];
      if (y.up) x.up = true;
      s.deck.splice(s.deck.indexOf(y), 1);
      node!.done[seat] = true;
      ev.push({ k: 'merge', seat, d: x.d });
      break;
    }
    case 'stones': {
      const from = s.deck.find((c) => c.d === a.from)!;
      const to = s.deck.find((c) => c.d === a.to)!;
      const line = deckLines(from)[a.line];
      to.ab = [...(to.ab ?? []), { a: line.a, ...(line.p ? { p: { ...line.p } } : {}) }];
      s.deck.splice(s.deck.indexOf(from), 1);
      node!.done[seat] = true;
      ev.push({ k: 'stones', seat, to: to.d, a: line.a });
      break;
    }
    case 'totem':
      s.totem = node!.totems![seat][a.i];
      node!.done[seat] = true;
      ev.push({ k: 'totem', seat, ...s.totem });
      break;
    case 'done':
      node!.done[seat] = true;
      ev.push({ k: 'done', seat });
      break;
    case 'debug':
      debugOp(g, ev, a.d);
      break;
  }
  if (run.screen === 'node' && run.node && run.node.done[0] && run.node.done[1]) finishNode(g, ev);
  return ev;
}

function debugOp(g: Game, ev: Ev[], d: DebugOp): void {
  const b = g.battle;
  if (d.op === 'battle') {
    g.run.over = null;
    startBattle(g, ev, d.boss ? 'boss' : 'normal', d.halves, d.boss);
    return;
  }
  if (d.op === 'deck') {
    addCard(g.run.seats[d.seat], d.id);
    return;
  }
  if (!b) return;
  const env = { b, ev };
  switch (d.op) {
    case 'place': {
      const side = d.row === 'p' ? 'p' : 'e';
      const c = makeInst(b, d.id, d.lane < 4 ? 0 : 1, side);
      if (c.ab.some((x) => x.a === 'kw:shield')) c.st.shield = 1;
      rowOf(b, d.row)[d.lane] = c;
      emit(env, { k: 'enter', uid: c.uid, row: d.row, lane: d.lane, how: 'debug' });
      break;
    }
    case 'clear':
      rowOf(b, d.row)[d.lane] = null;
      emit(env, { k: 'debug' });
      break;
    case 'stat': {
      const c = rowOf(b, d.row)[d.lane];
      if (!c) break;
      if (d.power !== undefined) c.power = d.power;
      if (d.health !== undefined) {
        c.health = d.health;
        c.maxHealth = Math.max(c.maxHealth, d.health);
      }
      emit(env, { k: 'debug' });
      break;
    }
    case 'hand':
      b.seats[d.seat].hand.push(makeInst(b, d.id, d.seat, 'p'));
      emit(env, { k: 'debug' });
      break;
    case 'seat':
      (b.seats[d.seat] as unknown as Record<string, number>)[d.field] = d.v;
      emit(env, { k: 'debug' });
      break;
    case 'win':
      for (const s of b.seats) if (s.alive) s.won = true;
      checkOver(env);
      if (b.over) endBattle(g, ev);
      break;
  }
}

// ---------------------------------------------------------------- waiting

/** Seats the game is waiting on. A dead player's optional ghost turn never holds the game up. */
export function waitingOn(g: Game): Seat[] {
  const run = g.run;
  if (run.over) return [];
  if (run.screen === 'battle' && g.battle) {
    const d = decision(g.battle);
    return d.kind === 'play' ? d.waiting : [];
  }
  if (run.screen === 'map') return SEATS.filter((i) => !run.locks[i]);
  const node = run.node;
  if (!node) return [];
  if (node.event && node.event.stage === 0) return SEATS.filter((i) => !node.event!.locks[i]);
  return SEATS.filter((i) => !node.done[i]);
}

export function lineText(inst: AbilityInst): string {
  return ability(inst.a).kw ?? ability(inst.a).text;
}
