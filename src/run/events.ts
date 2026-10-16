import { CARDS, RELICS, ITEMS, card as cardDef, type Rarity } from '../engine/registry.ts';
import { randInt } from '../engine/rng.ts';
import { SEATS, type Ev, type Seat } from '../engine/types.ts';
import type { Game, RunSeat } from './types.ts';

/** The toolbox an event option receives. Every change applies to the run, never to a battle. */
export class RunCtx {
  readonly g: Game;
  readonly ev: Ev[];
  pendingBattle: { halves: [string, string]; tier: 'normal' | 'elite'; boss?: string } | null = null;
  constructor(g: Game, ev: Ev[]) {
    this.g = g;
    this.ev = ev;
  }
  get run() {
    return this.g.run;
  }
  seat(i: Seat): RunSeat {
    return this.g.run.seats[i];
  }
  rand(n: number): number {
    return randInt(this.g.rng, n);
  }
  each(fn: (s: RunSeat, i: Seat) => void): void {
    for (const i of SEATS) fn(this.seat(i), i);
  }
  living(): Seat[] {
    return SEATS.filter((i) => this.seat(i).alive);
  }
  addCard(i: Seat, id: string, up = false): void {
    const s = this.seat(i);
    s.deck.push({ d: s.nextD++, id, ...(up ? { up: true } : {}) });
    this.ev.push({ k: 'deckAdd', seat: i, id, up });
  }
  randomCard(i: Seat, rarity: Rarity): string {
    const s = this.seat(i);
    const pool = [...CARDS.values()]
      .filter((c) => (c.pool === 'shared' || c.pool === s.char) && c.rarity === rarity)
      .map((c) => c.id)
      .sort();
    return pool[this.rand(pool.length)];
  }
  removeCard(i: Seat, d: number): void {
    const s = this.seat(i);
    const idx = s.deck.findIndex((c) => c.d === d);
    if (idx < 0) return;
    const [gone] = s.deck.splice(idx, 1);
    this.ev.push({ k: 'deckRemove', seat: i, id: gone.id });
  }
  /** Replaces a random card in the deck with a random card of the same rarity. Curses are left alone. */
  transformRandom(i: Seat): string | null {
    const s = this.seat(i);
    const options = s.deck.filter((c) => cardDef(c.id).pool !== 'curse');
    if (options.length === 0) return null;
    const pick = options[this.rand(options.length)];
    const was = cardDef(pick.id);
    const rarity: Rarity = was.rarity === 'special' ? 'common' : was.rarity;
    const into = this.randomCard(i, rarity);
    if (!into) return null;
    this.ev.push({ k: 'deckRemove', seat: i, id: pick.id });
    const idx = s.deck.indexOf(pick);
    s.deck[idx] = { d: pick.d, id: into };
    this.ev.push({ k: 'deckAdd', seat: i, id: into, up: false });
    return into;
  }
  /** Removes a random card from the deck, a curse first if there is one. */
  removeRandom(i: Seat): string | null {
    const s = this.seat(i);
    if (s.deck.length <= 1) return null;
    const curses = s.deck.filter((c) => cardDef(c.id).pool === 'curse');
    const pool = curses.length ? curses : s.deck;
    const pick = pool[this.rand(pool.length)];
    this.removeCard(i, pick.d);
    return pick.id;
  }
  upgradeRandom(i: Seat, kind?: 'creature' | 'spell'): string | null {
    const s = this.seat(i);
    const options = s.deck.filter((c) => !c.up && cardDef(c.id).up && (!kind || cardDef(c.id).kind === kind));
    if (options.length === 0) return null;
    const pick = options[this.rand(options.length)];
    pick.up = true;
    this.ev.push({ k: 'deckUpgrade', seat: i, id: pick.id });
    return pick.id;
  }
  teeth(i: Seat, n: number): void {
    const s = this.seat(i);
    s.teeth = Math.max(0, s.teeth + n);
    this.ev.push({ k: 'runTeeth', seat: i, n, v: s.teeth });
  }
  candle(i: Seat, n: number): void {
    const s = this.seat(i);
    if (!s.alive) return;
    s.candles = Math.max(0, Math.min(3, s.candles + n));
    this.ev.push({ k: 'runCandle', seat: i, v: s.candles });
    if (s.candles === 0) {
      s.alive = false;
      this.ev.push({ k: 'runDead', seat: i });
      if (SEATS.every((x) => !this.seat(x).alive)) {
        this.run.over = 'loss';
        this.run.screen = 'over';
      }
    }
  }
  revive(i: Seat): boolean {
    const s = this.seat(i);
    if (s.alive) return false;
    s.alive = true;
    s.candles = 1;
    this.ev.push({ k: 'revive', seat: i });
    return true;
  }
  relic(i: Seat, rarity: Rarity = 'common'): string | null {
    const s = this.seat(i);
    const pool = [...RELICS.values()]
      .filter((r) => r.rarity === rarity && (r.pool === 'shared' || r.pool === s.char) && !s.relics.includes(r.id))
      .map((r) => r.id)
      .sort();
    if (pool.length === 0) return null;
    const id = pool[this.rand(pool.length)];
    s.relics.push(id);
    RELICS.get(id)?.gain?.(this.g.run, i);
    this.ev.push({ k: 'relicGain', seat: i, id });
    return id;
  }
  item(i: Seat): string | null {
    const s = this.seat(i);
    const free = s.items.indexOf(null);
    if (free < 0) return null;
    const pool = [...ITEMS.values()].map((x) => x.id).sort();
    s.items[free] = pool[this.rand(pool.length)];
    this.ev.push({ k: 'itemGain', seat: i, id: s.items[free] });
    return s.items[free];
  }
  fight(halves: [string, string], tier: 'normal' | 'elite' = 'normal'): void {
    this.pendingBattle = { halves, tier };
  }
  /** Starts a boss fight that pays out like an elite fight. */
  fightBoss(boss: string): void {
    this.pendingBattle = { halves: ['', ''], tier: 'elite', boss };
  }
}

export interface EventOption {
  label: string;
  /** What the option does, stated plainly. */
  text: string;
  ok?(r: RunCtx): boolean;
  run(r: RunCtx): string;
}

export interface EventDef {
  id: string;
  acts: number[];
  title: string;
  /** What Your Best Friend says when the players arrive. */
  intro: string;
  weight?: number;
  options: EventOption[];
}

export const EVENTS = new Map<string, EventDef>();
export function defEvent(def: EventDef): EventDef {
  if (EVENTS.has(def.id)) throw new Error(`duplicate event ${def.id}`);
  EVENTS.set(def.id, def);
  return def;
}
