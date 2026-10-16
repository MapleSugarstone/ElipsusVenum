import type { Ev, Seat } from '../engine/types.ts';
import { applyGame } from '../run/game.ts';
import type { Game, GameAction } from '../run/types.ts';
import { boardView } from './view.ts';

export interface Update {
  prev: Game;
  g: Game;
  ev: Ev[];
  seat: Seat;
  a: GameAction;
}

export interface Presence {
  seat: Seat;
  hover?: { kind: 'card' | 'slot' | 'node'; id: number } | null;
  ping?: { kind: 'slot' | 'node'; row?: 'p' | 'e' | 'q'; lane?: number; node?: number };
  say?: number;
}

export interface Session {
  readonly kind: 'local' | 'online';
  game: Game;
  /** Seats this client acts for. Solo controls both. */
  mine: Seat[];
  send(seat: Seat, a: GameAction): string | null;
  subscribe(fn: (u: Update) => void): () => void;
  onPresence(fn: (p: Presence) => void): () => void;
  presence(p: Omit<Presence, 'seat'>, seat: Seat): void;
  status(): string;
  close(): void;
}

const SAVE_KEY = 'elipsusvenum.save.v1';

export function loadSave(): Game | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as Game;
    return g && g.v === 1 && !g.run.over ? g : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage can be blocked */
  }
}

/** Runs the game in this browser. Used for solo play and as the model for online play. */
export class LocalSession implements Session {
  readonly kind = 'local' as const;
  game: Game;
  mine: Seat[];
  private subs = new Set<(u: Update) => void>();
  private psubs = new Set<(p: Presence) => void>();
  constructor(game: Game, mine: Seat[] = [0, 1]) {
    this.game = game;
    this.mine = mine;
  }
  send(seat: Seat, a: GameAction): string | null {
    const prev = this.game;
    const r = applyGame(prev, seat, a, boardView);
    if (r.error) return r.error;
    this.game = r.g;
    this.save();
    for (const fn of this.subs) fn({ prev, g: r.g, ev: r.ev, seat, a });
    return null;
  }
  subscribe(fn: (u: Update) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
  onPresence(fn: (p: Presence) => void): () => void {
    this.psubs.add(fn);
    return () => this.psubs.delete(fn);
  }
  presence(): void {
    /* a local game has nobody to tell */
  }
  status(): string {
    return 'Solo';
  }
  close(): void {
    this.subs.clear();
  }
  private save(): void {
    if (this.game.debug) return;
    try {
      if (this.game.run.over) localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, JSON.stringify(this.game));
    } catch {
      /* storage can be full or blocked */
    }
  }
}
