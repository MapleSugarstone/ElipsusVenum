// The client end of a relay room: queue requests, the socket, pings, a silence watchdog, and the reconnect that takes a
// dropped seat back with its token. Every message from the room passes `readRoom` before anything reads it.
import { HOLD_SECONDS, readQueueReply, readRoom, type FromRoom, type QueueReply, type ToRoom } from './protocol.ts';

declare const __BUILD__: string;
declare const __RELAY_URL__: string;

export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

const PING_MS = 10_000;
const SILENCE_MS = 25_000;
const WATCH_MS = 2_500;
const SLEEP_SLACK_MS = 5_000;
const HOLD_MS = HOLD_SECONDS * 1000;
const RETRY_FIRST_MS = 1_200;
const RETRY_MAX_MS = 5_000;
const ANSWER_MS = 10_000;
const SEAT_KEY = 'elipsusvenum.seat.v1';
const CLOSE_REPLACED = 4000;

/** Where the rooms are: this page's own origin while developing (Vite passes /api on), and the deployed Worker otherwise. */
export function relayBase(): string {
  if (import.meta.env?.DEV) return location.origin;
  return typeof __RELAY_URL__ === 'string' ? __RELAY_URL__ : '';
}

export function relayReachable(): boolean {
  return !!relayBase();
}

export type QueueKind = 'public' | 'host' | 'join';

export async function queue(kind: QueueKind, code?: string): Promise<QueueReply> {
  return post(kind, { build: BUILD, format: 'coop', ...(code ? { code } : {}) });
}

export function cancelQueue(room: string, code?: string): Promise<QueueReply> {
  return post('cancel', { room, ...(code ? { code } : {}) });
}

export function renewQueue(room: string): Promise<QueueReply> {
  return post('renew', { room });
}

async function post(path: string, body: object): Promise<QueueReply> {
  try {
    const res = await fetch(`${relayBase()}/api/queue/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return readQueueReply(await res.json()) ?? { ok: false, reason: 'The lobby sent an answer this version cannot read.' };
  } catch {
    return { ok: false, reason: 'The rooms could not be reached.' };
  }
}

export interface HeldSeat {
  room: string;
  token: string;
  build: string;
  heard: number;
}

export function heldSeat(now = Date.now()): HeldSeat | null {
  try {
    const raw = sessionStorage.getItem(SEAT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<HeldSeat> | null;
    const ok = !!v && typeof v.room === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v.room) && typeof v.token === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v.token) && typeof v.build === 'string' && typeof v.heard === 'number';
    if (ok && now - v!.heard! < HOLD_MS) return v as HeldSeat;
    sessionStorage.removeItem(SEAT_KEY);
  } catch {
    /* storage may be blocked */
  }
  return null;
}

function keepSeat(s: HeldSeat | null): void {
  try {
    if (s) sessionStorage.setItem(SEAT_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SEAT_KEY);
  } catch {
    /* storage may be blocked */
  }
}

export function forgetSeat(): void {
  keepSeat(null);
}

/** What a session reads the room through. The tests use an in-memory version. */
export interface Link {
  send(m: ToRoom): void;
  poll(): FromRoom | null;
  tick(): void;
  close(): void;
  /** Seconds left in the room's hold while the link tries to come back, or 0 while connected. */
  slack(): number;
  problem: string;
}

/**
 * A socket to one room. Messages sent before the first socket opens wait for it. A socket that drops after the player has a
 * seat opens again with the seat's token until the hold runs out.
 */
export class NetLink implements Link {
  private ws: WebSocket | null = null;
  private inbox: FromRoom[] = [];
  private outbox: string[] = [];
  private live: AbortController | null = null;
  private lastHeard = Date.now();
  private lastPing = 0;
  private lastCheck = Date.now();
  private opened = false;
  private everOpened = false;
  private closed = false;
  private token: string | null;
  private back: boolean;
  private holdUntil = 0;
  private retryAt = 0;
  private retryWait = RETRY_FIRST_MS;
  private triedAt = 0;
  problem = '';
  readonly room: string;

  constructor(room: string, resume?: string) {
    this.room = room;
    this.token = resume ?? null;
    this.back = !!this.token;
    if (this.back) this.holdUntil = Date.now() + HOLD_MS;
    this.connect();
  }

  private connect(): void {
    const ws = new WebSocket(`${relayBase().replace(/^http/, 'ws')}/api/room/${this.room}`);
    const live = new AbortController();
    const on = { signal: live.signal };
    this.ws = ws;
    this.live = live;
    this.opened = false;
    ws.addEventListener('open', () => {
      this.opened = this.everOpened = true;
      this.lastHeard = this.lastCheck = this.triedAt = Date.now();
      if (this.back) ws.send(JSON.stringify({ type: 'hello', build: BUILD, resume: this.token! } satisfies ToRoom));
      for (const s of this.outbox) ws.send(s);
      this.outbox = [];
    }, on);
    ws.addEventListener('message', (ev) => this.receive(ev.data), on);
    ws.addEventListener('close', (ev) => {
      if (ev.code === CLOSE_REPLACED) return this.lost('Another page took this seat.');
      this.dropped(!this.opened ? 'The room could not be reached.' : ev.code === 1006 ? 'The link died without closing.' : 'The room closed the link.');
    }, on);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.lastHeard = Date.now();
    }, on);
  }

  send(m: ToRoom): void {
    if (this.closed) return;
    const s = JSON.stringify(m);
    const open = !this.back && this.ws?.readyState === WebSocket.OPEN;
    if (open) this.ws!.send(s);
    else if (!this.everOpened) this.outbox.push(s);
  }

  poll(): FromRoom | null {
    return this.inbox.shift() ?? null;
  }

  slack(): number {
    return this.back && !this.closed ? Math.max(0, Math.ceil((this.holdUntil - Date.now()) / 1000)) : 0;
  }

  tick(): void {
    if (this.closed) return;
    const now = Date.now();
    if (this.back) {
      if (now >= this.holdUntil) {
        forgetSeat();
        return this.lost('The connection dropped and the room stopped holding your seat.');
      }
      if (this.ws && this.opened && now - this.triedAt >= ANSWER_MS) this.dropped('The room did not answer.');
      if (!this.ws && now >= this.retryAt) this.connect();
      return;
    }
    if (!this.opened) return;
    if (now - this.lastPing >= PING_MS) {
      this.lastPing = now;
      this.send({ type: 'ping' });
    }
    if (now - this.lastCheck < WATCH_MS) return;
    const late = now - this.lastCheck - WATCH_MS;
    this.lastCheck = now;
    if (late >= SLEEP_SLACK_MS) {
      this.lastHeard = now;
      return;
    }
    if (document.visibilityState === 'visible' && now - this.lastHeard >= SILENCE_MS) this.dropped('The room stopped answering.');
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.back = false;
    this.letGo();
  }

  private letGo(): void {
    this.live?.abort();
    this.live = null;
    try {
      this.ws?.close(1000, 'done');
    } catch {
      /* already closed */
    }
    this.ws = null;
    this.opened = false;
  }

  private dropped(why: string): void {
    if (this.closed) return;
    this.letGo();
    if (!this.token) return this.lost(why);
    if (!this.back) {
      this.back = true;
      this.holdUntil = Date.now() + HOLD_MS;
      this.retryWait = RETRY_FIRST_MS;
      this.keep(true);
    }
    this.retryAt = Date.now() + this.retryWait;
    this.retryWait = Math.min(RETRY_MAX_MS, this.retryWait * 2);
  }

  private receive(raw: unknown): void {
    if (this.closed) return;
    this.lastHeard = Date.now();
    const m = readRoom(raw);
    if (!m) return this.lost('The room sent a message this version cannot read. Reload the page.');
    if (m.type === 'pong') return this.keep();
    if (m.type === 'resumeFailed') {
      forgetSeat();
      return this.lost(m.reason);
    }
    if (m.type === 'refused' && this.back) {
      forgetSeat();
      return this.lost(m.reason);
    }
    if (m.type === 'seated') this.token = m.token;
    if (m.type === 'rejoin' || m.type === 'seated') {
      this.back = false;
      this.retryWait = RETRY_FIRST_MS;
    }
    this.keep(m.type === 'seated' || m.type === 'rejoin');
    this.inbox.push(m);
  }

  private keptAt = 0;
  private keep(force = false): void {
    if (!this.token) return;
    const now = Date.now();
    if (!force && now - this.keptAt < 5000) return;
    this.keptAt = now;
    keepSeat({ room: this.room, token: this.token, build: BUILD, heard: now });
  }

  private lost(reason: string): void {
    if (this.closed) return;
    this.problem = reason;
    this.inbox.push({ type: 'refused', reason });
    this.close();
  }
}
