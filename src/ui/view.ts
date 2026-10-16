import { powerOf } from '../engine/fx.ts';
import type { AbilityInst, Battle, CardInst, Cost, Num } from '../engine/types.ts';

export interface CardView {
  uid: number;
  id: string;
  up: boolean;
  side: 'p' | 'e';
  seat: number;
  power: number;
  basePower: number;
  health: number;
  maxHealth: number;
  st: Num;
  ab: AbilityInst[];
  cost: Cost;
}

export interface SeatView {
  scale: number;
  size: number;
  candles: number;
  energy: number;
  maxEnergy: number;
  bones: number;
  block: number;
  won: boolean;
  alive: boolean;
  rung: boolean;
  drew: boolean;
  hand: number[];
  deck: number;
  side: number;
  devotion: number;
  blessed: boolean;
  programs: string[];
  st: Num;
}

export interface BoardView {
  turn: number;
  p: (CardView | null)[];
  e: (CardView | null)[];
  q: (CardView | null)[];
  seats: SeatView[];
}

export function cardView(b: Battle, c: CardInst): CardView {
  return {
    uid: c.uid,
    id: c.id,
    up: c.up,
    side: c.side,
    seat: c.seat,
    power: powerOf(b, c),
    basePower: c.power,
    health: c.health,
    maxHealth: c.maxHealth,
    st: { ...c.st },
    ab: c.ab.map((a) => ({ ...a, p: a.p ? { ...a.p } : undefined })),
    cost: { ...c.cost },
  };
}

export function boardView(b: Battle): BoardView {
  const row = (cards: (CardInst | null)[]) => cards.map((c) => (c ? cardView(b, c) : null));
  return {
    turn: b.turn,
    p: row(b.p),
    e: row(b.e),
    q: row(b.q),
    seats: b.seats.map((s) => ({
      scale: s.scale,
      size: s.size,
      candles: s.candles,
      energy: s.energy,
      maxEnergy: s.maxEnergy,
      bones: s.bones,
      block: s.block,
      won: s.won,
      alive: s.alive,
      rung: s.rung,
      drew: s.drew,
      hand: s.hand.map((c) => c.uid),
      deck: s.deck.length + s.discard.length,
      side: s.side.length,
      devotion: s.c.devotion ?? 0,
      blessed: (s.c.blessed ?? 0) > 0,
      programs: s.programs.map((p) => p.a),
      st: { ...s.st },
    })),
  };
}
