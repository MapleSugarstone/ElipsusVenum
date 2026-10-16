// A co-op game played through a relay room. Commands go to the room, and the game changes only when a release comes back,
// so both players apply the same commands in the same order.
import { digest } from '../engine/digest.ts';
import type { Ev, Seat } from '../engine/types.ts';
import { applyGame, createGame, legalGame } from '../run/game.ts';
import type { Game, GameAction } from '../run/types.ts';
import type { Presence, Session, Update } from '../ui/session.ts';
import { boardView } from '../ui/view.ts';
import type { Link } from './client.ts';
import type { FromRoom, Release, StartInfo, WireAction } from './protocol.ts';

/** Every Nth release, both players report a hash of their game so the room can catch a desync. */
export const HASH_EVERY = 8;
const COOP_SAVE = 'elipsusvenum.coop.v1';

export interface CoopSave {
  state: string;
  names: [string, string];
  at: number;
}

export function loadCoopSave(): CoopSave | null {
  try {
    const raw = localStorage.getItem(COOP_SAVE);
    if (!raw) return null;
    const v = JSON.parse(raw) as CoopSave;
    return typeof v.state === 'string' && Array.isArray(v.names) ? v : null;
  } catch {
    return null;
  }
}

export function clearCoopSave(): void {
  try {
    localStorage.removeItem(COOP_SAVE);
  } catch {
    /* storage blocked */
  }
}

export function gameFromInfo(info: StartInfo): Game {
  if (info.state) {
    const g = JSON.parse(info.state) as Game;
    g.solo = false;
    g.debug = false;
    return g;
  }
  return createGame({ seed: info.seed, chars: info.chars, solo: false });
}

export class OnlineSession implements Session {
  readonly kind = 'online' as const;
  game: Game;
  mine: Seat[];
  readonly seat: Seat;
  readonly info: StartInfo;
  private link: Link;
  /** Releases applied since the last base, kept so a resync can replay what came after the base. */
  private log: Release[] = [];
  private baseN = -1;
  private subs = new Set<(u: Update) => void>();
  private psubs = new Set<(p: Presence) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private away: [boolean, boolean] = [false, false];
  private gone: [boolean, boolean] = [false, false];
  onEnd: ((why: string) => void) | null = null;
  problem = '';

  constructor(link: Link, seat: Seat, info: StartInfo, base: { n: number; state: string } | null = null, record: Release[] = []) {
    this.link = link;
    this.seat = seat;
    this.info = info;
    this.mine = [seat];
    this.game = gameFromInfo(info);
    if (base) {
      this.game = JSON.parse(base.state) as Game;
      this.baseN = base.n;
    }
    for (const r of record) this.apply(r, false);
    if (typeof window !== 'undefined') this.timer = setInterval(() => this.pump(), 40);
  }

  setPartnerState(away: [boolean, boolean], gone: [boolean, boolean]): void {
    this.away = away;
    this.gone = gone;
    this.updateMine();
  }

  private updateMine(): void {
    const other: Seat = this.seat === 0 ? 1 : 0;
    this.mine = this.gone[other] ? [0, 1] : [this.seat];
  }

  /** Reads and handles every message the room has sent. The tests call this directly. */
  pump(): void {
    this.link.tick();
    for (let m = this.link.poll(); m; m = this.link.poll()) this.handle(m);
  }

  handle(m: FromRoom): void {
    switch (m.type) {
      case 'release':
        this.apply(m.r, true);
        break;
      case 'rejoin': {
        this.game = m.base ? (JSON.parse(m.base.state) as Game) : gameFromInfo(m.info);
        this.baseN = m.base?.n ?? -1;
        this.log = [];
        for (const r of m.record) this.apply(r, false);
        this.setPartnerState(m.away, m.gone);
        this.notifyAll();
        break;
      }
      case 'resync':
      case 'checkpoint':
        this.link.send({ type: 'state', n: this.lastN(), state: JSON.stringify(this.game) });
        if (m.type === 'checkpoint') this.trim(this.lastN());
        break;
      case 'state': {
        const g = JSON.parse(m.state) as Game;
        const after = this.log.filter((r) => r.n > m.n);
        this.game = g;
        this.baseN = m.n;
        this.log = [];
        for (const r of after) this.apply(r, false);
        this.notifyAll();
        break;
      }
      case 'away':
        this.away[m.seat] = true;
        this.notifyAll();
        break;
      case 'back':
        this.away[m.seat] = false;
        this.gone[m.seat] = false;
        this.updateMine();
        this.notifyAll();
        break;
      case 'gone':
        this.gone[m.seat] = true;
        this.away[m.seat] = false;
        this.updateMine();
        this.notifyAll();
        break;
      case 'presence':
        for (const fn of this.psubs) fn({ seat: m.seat, ...m.p } as Presence);
        break;
      case 'refused':
        this.problem = m.reason;
        if (this.link.problem) this.onEnd?.(m.reason);
        break;
    }
  }

  private lastN(): number {
    return this.log.length ? this.log[this.log.length - 1].n : this.baseN;
  }

  private trim(n: number): void {
    this.log = this.log.filter((r) => r.n > n);
    this.baseN = n;
  }

  private apply(r: Release, live: boolean): void {
    if (r.n <= this.lastN()) return;
    const prev = this.game;
    const res = applyGame(prev, r.s, r.a as GameAction, live ? boardView : undefined);
    this.log.push(r);
    if (!res.error) this.game = res.g;
    if (live && r.n % HASH_EVERY === 0) this.link.send({ type: 'hash', n: r.n, h: digest(this.game) });
    if (live) {
      this.save();
      for (const fn of this.subs) fn({ prev, g: this.game, ev: res.error ? [] : res.ev, seat: r.s, a: r.a as GameAction });
    }
  }

  private notifyAll(): void {
    for (const fn of this.subs) fn({ prev: this.game, g: this.game, ev: [] as Ev[], seat: this.seat, a: { t: 'done' } });
  }

  private save(): void {
    try {
      if (this.game.run.over) localStorage.removeItem(COOP_SAVE);
      else localStorage.setItem(COOP_SAVE, JSON.stringify({ state: JSON.stringify(this.game), names: this.info.names, at: Date.now() } satisfies CoopSave));
    } catch {
      /* storage full or blocked */
    }
  }

  send(seat: Seat, a: GameAction): string | null {
    if (!this.mine.includes(seat)) return 'That is your partner\'s seat.';
    if (a.t === 'debug') return 'Debug edits are off in online play.';
    const err = legalGame(this.game, seat, a);
    if (err) return err;
    this.link.send({ type: 'cmd', a: a as WireAction, ...(seat !== this.seat ? { seat } : {}) });
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

  private lastPresence = 0;
  presence(p: Omit<Presence, 'seat'>): void {
    const now = Date.now();
    if (now - this.lastPresence < 250) return;
    this.lastPresence = now;
    this.link.send({ type: 'presence', p: p as never });
  }

  status(): string {
    const other: Seat = this.seat === 0 ? 1 : 0;
    const slack = this.link.slack();
    if (slack > 0) return `Reconnecting, ${slack}s`;
    if (this.gone[other]) return `${this.info.names[other]} left. You play both seats.`;
    if (this.away[other]) return `${this.info.names[other]} dropped. Holding their seat.`;
    return `Online with ${this.info.names[other]}`;
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.link.send({ type: 'leave' });
    this.link.close();
    this.subs.clear();
  }
}
