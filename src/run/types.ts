import type { DeckCard } from '../engine/battle.ts';
import type { Rng } from '../engine/rng.ts';
import type { Battle, BattleAction, Seat } from '../engine/types.ts';

export type NodeKind =
  | 'battle' | 'elite' | 'boss' | 'rest' | 'merchant' | 'treasure' | 'event'
  | 'cards' | 'mycologist' | 'stones' | 'woodcarver';

export interface MapNode {
  id: number;
  row: number;
  col: number;
  kind: NodeKind;
  next: number[];
}

export interface MapState {
  act: number;
  rows: number;
  nodes: MapNode[];
}

export interface RunSeat {
  char: string;
  deck: DeckCard[];
  nextD: number;
  teeth: number;
  candles: number;
  alive: boolean;
  relics: string[];
  items: (string | null)[];
  totem: { tribe: string; kw: string } | null;
}

export interface Offer {
  id: string;
  up?: boolean;
  price?: number;
  sold?: boolean;
}

export interface Shop {
  cards: Offer[];
  items: Offer[];
  relic: Offer | null;
  removePrice: number;
  removed: boolean;
}

export interface NodeState {
  kind: NodeKind | 'reward' | 'bossReward';
  done: [boolean, boolean];
  offers?: [Offer[], Offer[]];
  relics?: [string[], string[]];
  shop?: [Shop, Shop];
  totems?: [{ tribe: string; kw: string }[], { tribe: string; kw: string }[]];
  event?: { id: string; stage: number; votes: [number | null, number | null]; locks: [boolean, boolean]; result?: string };
  note?: string;
}

export type Screen = 'map' | 'battle' | 'node' | 'over';

export interface Run {
  act: number;
  floor: number;
  seats: [RunSeat, RunSeat];
  map: MapState;
  at: number | null;
  screen: Screen;
  votes: [number | null, number | null];
  locks: [boolean, boolean];
  node: NodeState | null;
  over: null | 'win' | 'loss';
  /** The last coin flip, for the UI to show. */
  coin: null | { votes: [number, number]; result: number; n: number };
  battles: number;
  fight: null | 'normal' | 'elite' | 'boss';
}

export interface Game {
  v: number;
  seed: number;
  rng: Rng;
  solo: boolean;
  debug: boolean;
  n: number;
  run: Run;
  battle: Battle | null;
}

export type DebugOp =
  | { op: 'place'; id: string; row: 'p' | 'e' | 'q'; lane: number }
  | { op: 'clear'; row: 'p' | 'e' | 'q'; lane: number }
  | { op: 'stat'; row: 'p' | 'e' | 'q'; lane: number; power?: number; health?: number }
  | { op: 'hand'; seat: Seat; id: string }
  | { op: 'seat'; seat: Seat; field: 'energy' | 'bones' | 'block' | 'scale' | 'candles' | 'teeth'; v: number }
  | { op: 'battle'; halves: [string, string]; boss?: string }
  | { op: 'deck'; seat: Seat; id: string }
  | { op: 'win' };

export type GameAction =
  | { t: 'b'; a: BattleAction }
  | { t: 'vote'; node: number }
  | { t: 'lock' }
  | { t: 'unlock' }
  | { t: 'pick'; i: number }
  | { t: 'relic'; i: number }
  | { t: 'buy'; kind: 'card' | 'item' | 'relic'; i: number }
  | { t: 'remove'; d: number }
  | { t: 'rest'; opt: 'relight' | 'upgrade' | 'power' | 'health' | 'revive'; d?: number }
  | { t: 'merge'; a: number; b: number }
  | { t: 'stones'; from: number; line: number; to: number }
  | { t: 'totem'; i: number }
  | { t: 'evote'; i: number }
  | { t: 'gift'; n: number }
  | { t: 'done' }
  | { t: 'debug'; d: DebugOp };
