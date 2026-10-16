import type { Rng } from './rng.ts';

export type Seat = 0 | 1;
export const LANES = 8;
export const HALF = 4;
export const SEATS: readonly Seat[] = [0, 1];
export const MAX_ENERGY = 6;
export const HAND_LIMIT = 10;
export const SCALE_SIZE = 12;

export const ownerOf = (lane: number): Seat => (lane < HALF ? 0 : 1);
export const lanesOf = (seat: Seat): number[] => (seat === 0 ? [0, 1, 2, 3] : [4, 5, 6, 7]);
export const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

/** p is the player row, e the enemy row, q the enemy queue row. */
export type Row = 'p' | 'e' | 'q';
export interface SlotRef {
  row: Row;
  lane: number;
}

export interface Cost {
  blood?: number;
  bones?: number;
  energy?: number;
}

export type Num = Record<string, number>;

/** One line of rules on a card instance. `a` names an ability in the registry, `p` holds its numbers. */
export interface AbilityInst {
  a: string;
  p?: Num;
  off?: boolean;
}

export interface CardInst {
  uid: number;
  id: string;
  /** p for a player card, e for an enemy card. */
  side: 'p' | 'e';
  /** The controlling seat of a player card, or the half an enemy card belongs to. */
  seat: Seat;
  up: boolean;
  cost: Cost;
  power: number;
  health: number;
  maxHealth: number;
  ab: AbilityInst[];
  st: Num;
  c: Num;
  /** Power that lasts until the end of the current turn. */
  tmp: number;
  /** The run deck entry this instance came from, if any. */
  deck?: number;
}

export interface SeatState {
  char: string;
  alive: boolean;
  won: boolean;
  scale: number;
  size: number;
  candles: number;
  teeth: number;
  hand: CardInst[];
  deck: CardInst[];
  side: CardInst[];
  discard: CardInst[];
  exhaust: CardInst[];
  bones: number;
  energy: number;
  maxEnergy: number;
  block: number;
  drew: boolean;
  rung: boolean;
  ghost: boolean;
  st: Num;
  c: Num;
  powers: AbilityInst[];
  programs: AbilityInst[];
  relics: string[];
  items: (string | null)[];
  /** Stat changes to deck cards that last for the rest of the run, applied when the battle ends. */
  perm: { d: number; dp: number; dh: number }[];
}

export interface Placement {
  id: string;
  /** Lane within the half, 0 to 3. Omitted means any empty queue slot. */
  lane?: number;
}

export interface FoeHalf {
  enc: string;
  step: number;
  backlog: CardInst[];
  st: Num;
  /** Set when this half's player died: its placements go to the other half's backlog. */
  redirect: boolean;
}

export interface Battle {
  v: number;
  rng: Rng;
  turn: number;
  uid: number;
  over: null | 'win' | 'loss';
  p: (CardInst | null)[];
  e: (CardInst | null)[];
  q: (CardInst | null)[];
  seats: [SeatState, SeatState];
  foe: [FoeHalf, FoeHalf];
  boss: null | { id: string; phase: number; c: Num };
  /** Enemy uids marked by a ghost: they take 2 extra damage until the next player turn. */
  marks: number[];
  /** Ability ids of house rules the opponent announced for this battle. */
  rules: string[];
}

export type BattleAction =
  | { t: 'draw'; from: 'main' | 'side' }
  | { t: 'play'; uid: number; lane?: number; sac?: number[]; tg?: SlotRef[] }
  | { t: 'ring' }
  | { t: 'unring' }
  | { t: 'item'; slot: number; tg?: SlotRef[] }
  | { t: 'ghost'; kind: 'bone' | 'mark'; tg?: SlotRef };

export interface Ev {
  k: string;
  [field: string]: unknown;
}
