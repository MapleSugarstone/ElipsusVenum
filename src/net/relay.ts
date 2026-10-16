// The rules one relay room follows, with no runtime in them, so the Worker and the tests run the same code. The room runs
// no game code. It seats two players, lets them choose characters, starts the run with one seed, numbers every command and
// sends it to both players, compares the state hashes they report, and holds a dropped seat for its player to come back.
import {
  HOLD_SECONDS, RECORD_SOFT_MAX, type FromRoom, type Hello, type Release, type StartInfo, type ToRoom,
} from './protocol.ts';

export interface SeatRec {
  token: string;
  name: string;
  build: string;
  char: string | null;
  ready: boolean;
  /** When the socket dropped, or null while connected. */
  away: number | null;
  /** True once the hold ran out or the player left. The partner may then act for this seat. */
  gone: boolean;
}

export interface RelayData {
  v: 1;
  phase: 'open' | 'setup' | 'play';
  seed: number;
  seats: [SeatRec | null, SeatRec | null];
  /** A saved run the host offered to continue, as JSON text. */
  load: string | null;
  info: StartInfo | null;
  /** The number the next release gets. */
  n: number;
  base: { n: number; state: string } | null;
  record: Release[];
  hashes: Record<string, [string | null, string | null]>;
  /** The release number a checkpoint or resync upload was asked for, if one is pending. */
  asked: number | null;
  /** When the room was last touched, for clearing an abandoned room. */
  active: number;
}

export type Out = { seat: 0 | 1; m: FromRoom }[];

const HOLD_MS = HOLD_SECONDS * 1000;
/** How long a room with nobody connected keeps its run before it clears itself. */
export const ABANDON_MS = 6 * 60 * 60 * 1000;
const HASHES_KEPT = 64;

export function newRelay(seed: number): RelayData {
  return { v: 1, phase: 'open', seed: seed >>> 0, seats: [null, null], load: null, info: null, n: 0, base: null, record: [], hashes: {}, asked: null, active: 0 };
}

const both = (m: FromRoom): Out => [{ seat: 0, m }, { seat: 1, m }];

export class RelayRules {
  readonly d: RelayData;
  private softMax: number;
  constructor(d: RelayData, softMax = RECORD_SOFT_MAX) {
    this.d = d;
    this.softMax = softMax;
  }

  tokenSeat(token: string): 0 | 1 | null {
    if (this.d.seats[0]?.token === token) return 0;
    if (this.d.seats[1]?.token === token) return 1;
    return null;
  }

  private present(seat: 0 | 1): boolean {
    const s = this.d.seats[seat];
    return !!s && s.away === null && !s.gone;
  }

  private setupMsg(): FromRoom {
    const [a, b] = this.d.seats;
    return {
      type: 'setup',
      names: [a?.name ?? null, b?.name ?? null],
      chars: [a?.char ?? null, b?.char ?? null],
      ready: [!!a?.ready, !!b?.ready],
      loaded: this.d.load !== null,
    };
  }

  /** Seats a new player. Returns what to send, including a refusal for a seat that could not be taken. */
  join(seat: 0 | 1, m: Extract<Hello, { name: string }>, token: string, now: number): Out {
    const d = this.d;
    d.active = now;
    const mate = d.seats[seat === 0 ? 1 : 0];
    if (mate && mate.build !== m.build) return [{ seat, m: { type: 'refused', reason: 'Your partner has a different version of the game. Both of you should reload the page.' } }];
    d.seats[seat] = { token, name: m.name, build: m.build, char: null, ready: false, away: null, gone: false };
    const out: Out = [{ seat, m: { type: 'seated', seat, token } }];
    if (d.seats[0] && d.seats[1]) {
      d.phase = 'setup';
      out.push(...both(this.setupMsg()));
    } else out.push({ seat, m: { type: 'waiting' } });
    return out;
  }

  receive(seat: 0 | 1, m: ToRoom, now: number): Out {
    const d = this.d;
    d.active = now;
    const me = d.seats[seat];
    if (!me) return [];
    switch (m.type) {
      case 'char':
        if (d.phase !== 'setup') return [];
        me.char = m.char;
        me.ready = false;
        return both(this.setupMsg());
      case 'ready':
        if (d.phase !== 'setup') return [];
        me.ready = m.on && (me.char !== null || d.load !== null);
        return this.maybeStart();
      case 'load':
        if (d.phase !== 'setup' || seat !== 0) return [];
        d.load = m.state;
        for (const s of d.seats) if (s) s.ready = false;
        return both(this.setupMsg());
      case 'cmd': {
        if (d.phase !== 'play') return [];
        const actor = m.seat ?? seat;
        if (actor !== seat && !d.seats[actor]?.gone) return [{ seat, m: { type: 'refused', reason: 'You can only act for your partner after they leave.' } }];
        const r: Release = { n: d.n++, s: actor, a: m.a };
        d.record.push(r);
        const out = both({ type: 'release', r });
        if (d.record.length >= this.softMax && d.asked === null) {
          const to: 0 | 1 = this.present(0) ? 0 : 1;
          d.asked = r.n;
          out.push({ seat: to, m: { type: 'checkpoint', n: r.n } });
        }
        return out;
      }
      case 'hash': {
        if (d.phase !== 'play') return [];
        const key = String(m.n);
        const entry = d.hashes[key] ?? [null, null];
        entry[seat] = m.h;
        d.hashes[key] = entry;
        const keys = Object.keys(d.hashes).map(Number).sort((a, b) => a - b);
        while (keys.length > HASHES_KEPT) delete d.hashes[String(keys.shift())];
        if (entry[0] && entry[1] && entry[0] !== entry[1] && d.asked === null) {
          // The first seat present is the one both continue from. A co-op run hides nothing, so either copy serves.
          const from: 0 | 1 = this.present(0) ? 0 : 1;
          d.asked = -1;
          return [{ seat: from, m: { type: 'resync', n: m.n } }];
        }
        return [];
      }
      case 'state': {
        if (d.phase !== 'play' || d.asked === null) return [];
        const resync = d.asked === -1;
        d.asked = null;
        d.base = { n: m.n, state: m.state };
        d.record = d.record.filter((r) => r.n > m.n);
        d.hashes = {};
        if (!resync) return [];
        const other: 0 | 1 = seat === 0 ? 1 : 0;
        return [{ seat: other, m: { type: 'state', n: m.n, state: m.state } }];
      }
      case 'presence': {
        const other: 0 | 1 = seat === 0 ? 1 : 0;
        return this.present(other) ? [{ seat: other, m: { type: 'presence', seat, p: m.p } }] : [];
      }
      case 'leave': {
        me.gone = true;
        me.away = null;
        const other: 0 | 1 = seat === 0 ? 1 : 0;
        if (d.phase !== 'play') {
          d.seats[seat] = null;
          if (d.phase === 'setup') d.phase = 'open';
          return d.seats[other] ? [{ seat: other, m: { type: 'waiting' } }] : [];
        }
        return [{ seat: other, m: { type: 'gone', seat } }];
      }
      case 'ping':
      case 'hello':
        return [];
    }
  }

  private maybeStart(): Out {
    const d = this.d;
    const [a, b] = d.seats;
    if (!a || !b || !a.ready || !b.ready) return both(this.setupMsg());
    if (d.load === null && (!a.char || !b.char)) return both(this.setupMsg());
    d.phase = 'play';
    d.info = { seed: d.seed, chars: [a.char ?? 'blue', b.char ?? 'pistachio'], names: [a.name, b.name], state: d.load };
    d.load = null;
    const info = d.info;
    return [{ seat: 0, m: { type: 'start', seat: 0, info } }, { seat: 1, m: { type: 'start', seat: 1, info } }];
  }

  /** A seat came back with its token. */
  resume(seat: 0 | 1, now: number): Out {
    const d = this.d;
    d.active = now;
    const me = d.seats[seat]!;
    me.away = null;
    me.gone = false;
    const other: 0 | 1 = seat === 0 ? 1 : 0;
    const out: Out = [];
    if (d.phase === 'play' && d.info) {
      out.push({
        seat,
        m: {
          type: 'rejoin', seat, info: d.info, base: d.base, record: d.record,
          away: [d.seats[0]?.away !== null && d.seats[0]?.away !== undefined, d.seats[1]?.away !== null && d.seats[1]?.away !== undefined],
          gone: [!!d.seats[0]?.gone, !!d.seats[1]?.gone],
        },
      });
    } else {
      out.push({ seat, m: { type: 'seated', seat, token: me.token } });
      out.push({ seat, m: d.phase === 'setup' ? this.setupMsg() : { type: 'waiting' } });
    }
    if (d.seats[other]) out.push({ seat: other, m: { type: 'back', seat } });
    return out;
  }

  /** A socket dropped. Its seat is held for HOLD_SECONDS. A room still waiting for its second player just frees the seat. */
  leave(seat: 0 | 1, now: number): Out {
    const d = this.d;
    const me = d.seats[seat];
    if (!me || me.gone) return [];
    const other: 0 | 1 = seat === 0 ? 1 : 0;
    if (d.phase === 'open') {
      d.seats[seat] = null;
      return [];
    }
    me.away = now;
    return d.seats[other] ? [{ seat: other, m: { type: 'away', seat, left: HOLD_SECONDS } }] : [];
  }

  tick(now: number): Out {
    const d = this.d;
    const out: Out = [];
    for (const seat of [0, 1] as const) {
      const s = d.seats[seat];
      if (!s || s.away === null || now - s.away < HOLD_MS) continue;
      if (d.phase === 'setup') {
        d.seats[seat] = null;
        d.phase = 'open';
        const other: 0 | 1 = seat === 0 ? 1 : 0;
        if (d.seats[other]) out.push({ seat: other, m: { type: 'waiting' } });
        continue;
      }
      s.away = null;
      s.gone = true;
      const other: 0 | 1 = seat === 0 ? 1 : 0;
      if (d.seats[other]) out.push({ seat: other, m: { type: 'gone', seat } });
    }
    return out;
  }

  nextDeadline(): number | null {
    let due: number | null = null;
    for (const s of this.d.seats) if (s?.away !== null && s?.away !== undefined) due = Math.min(due ?? Infinity, s.away + HOLD_MS);
    return due;
  }

  /** True when nobody is connected and the room has sat idle long enough to clear. */
  abandoned(now: number, connected: number): boolean {
    return connected === 0 && now - this.d.active > ABANDON_MS;
  }
}
