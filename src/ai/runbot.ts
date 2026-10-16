import { chooseAction, type BotOptions } from './bot.ts';
import { card as cardDef } from '../engine/registry.ts';
import { randInt } from '../engine/rng.ts';
import { SEATS, other, type Seat } from '../engine/types.ts';
import { EVENTS, RunCtx } from '../run/events.ts';
import { applyGameInPlace, legalGame, waitingOn, deckLines } from '../run/game.ts';
import { reachable } from '../run/map.ts';
import type { Game, GameAction } from '../run/types.ts';

const KIND_SCORE: Record<string, number> = {
  battle: 5, elite: 3, rest: 6, merchant: 4, treasure: 9, event: 5, cards: 6, mycologist: 3, stones: 3, woodcarver: 4, boss: 0,
};

/** Actions one seat may take in one battle turn before the bot rings anyway. It stops loops between cards. */
const TURN_CAP = 40;
const turnCount = new Map<string, number>();

/** A plain policy for everything outside battles. It favors upgrades and cheap value. */
export function chooseRunAction(g: Game, seat: Seat, opts: BotOptions = {}): GameAction {
  const run = g.run;
  const s = run.seats[seat];
  if (run.screen === 'battle' && g.battle) {
    const key = `${g.seed}:${run.battles}:${g.battle.turn}:${seat}`;
    const n = (turnCount.get(key) ?? 0) + 1;
    turnCount.set(key, n);
    if (turnCount.size > 5000) turnCount.clear();
    const b = g.battle;
    if (n > TURN_CAP && b.seats[seat].alive && b.seats[seat].drew && !b.seats[seat].rung) return { t: 'b', a: { t: 'ring' } };
    return { t: 'b', a: chooseAction(b, seat, opts) };
  }
  if (run.screen === 'map') {
    if (run.votes[seat] === null) {
      const options = reachable(run.map, run.at);
      const mate = run.votes[other(seat)];
      if (mate !== null && options.includes(mate)) return { t: 'vote', node: mate };
      let best = options[0];
      let bestScore = -1;
      for (const id of options) {
        const kind = run.map.nodes[id].kind;
        let score = KIND_SCORE[kind] ?? 1;
        if (kind === 'rest' && run.seats.some((x) => !x.alive || x.candles < 2)) score += 6;
        if (kind === 'elite' && run.seats.some((x) => x.candles < 2)) score -= 4;
        score += randInt(g.rng.slice() as typeof g.rng, 3);
        if (score > bestScore) {
          bestScore = score;
          best = id;
        }
      }
      return { t: 'vote', node: best };
    }
    return { t: 'lock' };
  }
  const node = run.node!;
  if (node.event && node.event.stage === 0) {
    if (node.event.votes[seat] === null) {
      const def = EVENTS.get(node.event.id)!;
      const ctx = new RunCtx(structuredClone(g), []);
      const i = def.options.findIndex((o) => !o.ok || o.ok(ctx));
      return { t: 'evote', i: Math.max(0, i) };
    }
    return { t: 'lock' };
  }
  const tryAct = (a: GameAction): GameAction | null => (legalGame(g, seat, a) ? null : a);
  if (node.relics?.[seat]?.length && (node.picks?.[seat] ?? 0) > 0) return { t: 'relic', i: 0 };
  switch (node.kind) {
    case 'reward':
    case 'cards':
    case 'bossReward': {
      const offers = node.offers?.[seat] ?? [];
      if (offers.length) {
        const pick = offers.findIndex((o) => cardDef(o.id).rarity !== 'common');
        return { t: 'pick', i: pick >= 0 ? pick : 0 };
      }
      return { t: 'done' };
    }
    case 'merchant': {
      const shop = node.shop![seat];
      const removable = s.deck.find((c) => c.id === 'bug') ?? s.deck.find((c) => c.id === 'jab');
      if (removable && !shop.removed) {
        const a = tryAct({ t: 'remove', d: removable.d });
        if (a) return a;
      }
      for (let i = 0; i < shop.cards.length; i++) {
        if (cardDef(shop.cards[i].id).rarity === 'common') continue;
        const a = tryAct({ t: 'buy', kind: 'card', i });
        if (a) return a;
      }
      return { t: 'done' };
    }
    case 'rest': {
      if (!run.seats[other(seat)].alive) {
        const a = tryAct({ t: 'rest', opt: 'revive' });
        if (a) return a;
      }
      if (s.alive && s.candles < 2) return { t: 'rest', opt: 'relight' };
      const up = s.deck.find((c) => !c.up && cardDef(c.id).up && cardDef(c.id).rarity !== 'common') ?? s.deck.find((c) => !c.up && cardDef(c.id).up);
      if (up) return { t: 'rest', opt: 'upgrade', d: up.d };
      return { t: 'done' };
    }
    case 'mycologist': {
      const seen = new Map<string, number>();
      for (const c of s.deck) {
        if (cardDef(c.id).kind !== 'creature') continue;
        const prev = seen.get(c.id);
        if (prev !== undefined) return { t: 'merge', a: prev, b: c.d };
        seen.set(c.id, c.d);
      }
      return { t: 'done' };
    }
    case 'stones': {
      const creatures = s.deck.filter((c) => cardDef(c.id).kind === 'creature');
      for (const from of creatures) {
        const lines = deckLines(from);
        if (lines.length === 0) continue;
        for (const to of creatures) {
          if (to === from) continue;
          const a = tryAct({ t: 'stones', from: from.d, line: 0, to: to.d });
          if (a && cardDef(to.id).power >= 4) return a;
        }
      }
      return { t: 'done' };
    }
    case 'woodcarver':
      return { t: 'totem', i: 0 };
    default:
      return { t: 'done' };
  }
}

/** Plays a whole run with the bots on both seats. Returns the number of actions. */
export function autoplayRun(g: Game, maxActions = 200000, opts: BotOptions = {}): number {
  let n = 0;
  while (!g.run.over && n < maxActions) {
    const waiting = waitingOn(g);
    const seats: Seat[] = waiting.length ? waiting : [];
    if (seats.length === 0) {
      if (g.run.screen === 'battle' && g.battle) {
        const dead = SEATS.find((x) => !g.battle!.seats[x].alive);
        if (dead !== undefined) continue;
      }
      throw new Error(`run stalled on screen ${g.run.screen}`);
    }
    for (const seat of seats) {
      if (g.run.over) break;
      if (!waitingOn(g).includes(seat)) continue;
      const a = chooseRunAction(g, seat, opts);
      const err = legalGame(g, seat, a);
      if (err) throw new Error(`run bot chose an illegal action (${err}): ${JSON.stringify(a)} on ${g.run.screen}/${g.run.node?.kind}`);
      applyGameInPlace(g, seat, a);
      n++;
    }
  }
  return n;
}
