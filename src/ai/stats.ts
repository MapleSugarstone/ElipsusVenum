import { chooseRunAction } from './runbot.ts';
import type { BotOptions } from './bot.ts';
import { legalGame, waitingOn, applyGameInPlace, createGame } from '../run/game.ts';
import type { Seat } from '../engine/types.ts';

export interface BattleStat {
  act: number;
  tier: string;
  halves: string[];
  boss: string | null;
  won: boolean;
  turns: number;
  candlesLost: number;
  deaths: number;
}

export interface RunStat {
  seed: number;
  chars: [string, string];
  result: 'win' | 'loss' | 'cap';
  act: number;
  floor: number;
  /** Progress through the run as one number: 13 floors per act. */
  depth: number;
  battles: BattleStat[];
  offers: { offered: string[]; picked: string | null }[];
  decks: string[][];
  plays: Record<string, number>;
  actions: number;
}

/** Plays one run with the bots on both seats and records what happened in it. */
export function playRunStats(seed: number, chars: [string, string], opts: BotOptions = {}, maxActions = 60000): RunStat {
  const g = createGame({ seed, chars, solo: true });
  const stat: RunStat = { seed, chars, result: 'cap', act: 1, floor: 0, depth: 0, battles: [], offers: [], decks: [], plays: {}, actions: 0 };
  let current: BattleStat | null = null;
  let candlesBefore = 0;
  let aliveBefore = 0;
  while (!g.run.over && stat.actions < maxActions) {
    const seats = waitingOn(g);
    if (seats.length === 0) break;
    for (const seat of seats as Seat[]) {
      if (g.run.over || !waitingOn(g).includes(seat)) continue;
      const a = chooseRunAction(g, seat, opts);
      if (legalGame(g, seat, a)) throw new Error(`illegal bot action ${JSON.stringify(a)}`);
      if (a.t === 'pick' && g.run.node?.offers) {
        const offers = g.run.node.offers[seat];
        stat.offers.push({ offered: offers.map((o) => o.id), picked: a.i >= 0 ? offers[a.i].id : null });
      }
      const wasBattle = g.run.screen === 'battle';
      const ev = applyGameInPlace(g, seat, a);
      stat.actions++;
      for (const e of ev) {
        if (e.k === 'play' && typeof e.id === 'string') stat.plays[e.id] = (stat.plays[e.id] ?? 0) + 1;
        if (e.k === 'battleStart') {
          current = {
            act: g.run.act, tier: String(e.tier), halves: (e.halves as string[]) ?? [], boss: (e.boss as string | null) ?? null,
            won: false, turns: 0, candlesLost: 0, deaths: 0,
          };
          candlesBefore = g.run.seats.reduce((x, s) => x + s.candles, 0);
          aliveBefore = g.run.seats.filter((s) => s.alive).length;
        }
      }
      if (current && wasBattle && g.run.screen !== 'battle') {
        current.won = g.run.over !== 'loss';
        current.turns = g.battle?.turn ?? 0;
        const after = g.run.seats.reduce((x, s) => x + s.candles, 0);
        current.candlesLost = Math.max(0, candlesBefore - after);
        current.deaths = Math.max(0, aliveBefore - g.run.seats.filter((s) => s.alive).length);
        if (current.tier === 'boss' && current.won) current.deaths = 0;
        stat.battles.push(current);
        current = null;
      }
    }
  }
  stat.result = g.run.over ?? 'cap';
  stat.act = Math.min(g.run.act, 3);
  stat.floor = g.run.floor;
  stat.depth = g.run.over === 'win' ? 39 : (stat.act - 1) * 13 + g.run.floor;
  stat.decks = g.run.seats.map((s) => s.deck.map((c) => c.id + (c.up ? '+' : '')));
  return stat;
}
