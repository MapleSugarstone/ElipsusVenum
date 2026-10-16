// Messages between a client and a relay room, and the readers that check every message both ways. A reader takes the raw
// frame, refuses anything of the wrong shape, and builds a fresh message from the fields it checked, so nothing else a sender
// put in a frame travels on. Nothing here imports game code, so the Worker shares this file with the game.

/** Raise this with any change to the messages or the record. */
export const PROTOCOL = 1;
/** Seconds the room holds the seat of a player whose connection dropped. After that the partner may play both seats. */
export const HOLD_SECONDS = 90;
/** The longest frame a client may send, the longest a state upload may be, and the longest frame the room sends. */
export const FRAME_MAX = 8_192, STATE_MAX = 900_000, ROOM_FRAME_MAX = 1_000_000;
export const DEPTH_MAX = 8;
/** The most releases a record holds before the room asks for a checkpoint. */
export const RECORD_SOFT_MAX = 1500, RECORD_MAX = 4000;
export const NAME_MAX = 12, REASON_MAX = 300;
export const CHARS = ['blue', 'pistachio'] as const;

export type SlotRefW = { row: 'p' | 'e' | 'q'; lane: number };

/** Every command a player can send, in the same shape the game's `GameAction` has. Debug edits never travel. */
export type WireAction =
  | { t: 'b'; a: WireBattle }
  | { t: 'vote'; node: number }
  | { t: 'lock' } | { t: 'unlock' } | { t: 'done' }
  | { t: 'pick'; i: number }
  | { t: 'relic'; i: number }
  | { t: 'buy'; kind: 'card' | 'item' | 'relic'; i: number }
  | { t: 'remove'; d: number }
  | { t: 'rest'; opt: 'relight' | 'upgrade' | 'power' | 'health' | 'revive'; d?: number }
  | { t: 'merge'; a: number; b: number }
  | { t: 'stones'; from: number; line: number; to: number }
  | { t: 'totem'; i: number }
  | { t: 'evote'; i: number }
  | { t: 'gift'; n: number };

export type WireBattle =
  | { t: 'draw'; from: 'main' | 'side' }
  | { t: 'play'; uid: number; lane?: number; sac?: number[]; tg?: SlotRefW[] }
  | { t: 'ring' } | { t: 'unring' }
  | { t: 'item'; slot: number; tg?: SlotRefW[] }
  | { t: 'ghost'; kind: 'bone' | 'mark'; tg?: SlotRefW };

/** One command as the room released it: its number, the seat it acts for, and the command. */
export interface Release {
  n: number;
  s: 0 | 1;
  a: WireAction;
}

/** What a player shows the partner without changing the game: a hover, a ping, or a quick line. */
export interface WirePresence {
  hover?: { kind: 'card' | 'slot' | 'node'; id: number } | null;
  ping?: { kind: 'slot' | 'node'; row?: 'p' | 'e' | 'q'; lane?: number; node?: number };
  say?: number;
}

export interface StartInfo {
  seed: number;
  chars: [string, string];
  names: [string, string];
  /** A saved run both players continue from, as JSON text, or null for a new run. */
  state: string | null;
}

export type Hello = { type: 'hello'; build: string; name: string } | { type: 'hello'; build: string; resume: string };

export type ToRoom =
  | Hello
  | { type: 'char'; char: string }
  | { type: 'ready'; on: boolean }
  | { type: 'load'; state: string }
  | { type: 'cmd'; a: WireAction; seat?: 0 | 1 }
  | { type: 'hash'; n: number; h: string }
  | { type: 'state'; n: number; state: string }
  | { type: 'presence'; p: WirePresence }
  | { type: 'leave' }
  | { type: 'ping' };

export type FromRoom =
  | { type: 'waiting'; code?: string }
  | { type: 'seated'; seat: 0 | 1; token: string }
  | { type: 'setup'; names: [string | null, string | null]; chars: [string | null, string | null]; ready: [boolean, boolean]; loaded: boolean }
  | { type: 'start'; seat: 0 | 1; info: StartInfo }
  | { type: 'release'; r: Release }
  | { type: 'rejoin'; seat: 0 | 1; info: StartInfo; base: { n: number; state: string } | null; record: Release[]; away: [boolean, boolean]; gone: [boolean, boolean] }
  | { type: 'resync'; n: number }
  | { type: 'state'; n: number; state: string }
  | { type: 'checkpoint'; n: number }
  | { type: 'away'; seat: 0 | 1; left: number }
  | { type: 'back'; seat: 0 | 1 }
  | { type: 'gone'; seat: 0 | 1 }
  | { type: 'presence'; seat: 0 | 1; p: WirePresence }
  | { type: 'refused'; reason: string }
  | { type: 'resumeFailed'; reason: string }
  | { type: 'pong' };

export type QueueReply = { ok: true; room: string; code?: string } | { ok: false; reason: string };

// ---------------------------------------------------------------- readers

type Obj = Record<string, unknown>;
const NO = undefined;
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const whole = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isSeat = (v: unknown): v is 0 | 1 => v === 0 || v === 1;
const isBuild = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(v);
const isToken = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v);
const isCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Z0-9]{6}$/.test(v);
const isHash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

function obj(v: unknown, allowed: readonly string[], need: readonly string[] = allowed): Obj | null {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) return null;
  const o = v as Obj;
  for (const k of Object.keys(o)) if (!allowed.includes(k)) return null;
  for (const k of need) if (!own(o, k)) return null;
  return o;
}

function arr<T>(v: unknown, lo: number, hi: number, item: (x: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(v) || v.length < lo || v.length > hi) return NO;
  const out: T[] = [];
  for (const x of v) {
    const r = item(x);
    if (r === NO) return NO;
    out.push(r);
  }
  return out;
}

function text(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.length <= max && /^[\x20-\x7e]*$/.test(v) ? v : NO;
}

export function readName(v: unknown): string | undefined {
  return typeof v === 'string' && v.length >= 1 && v.length <= NAME_MAX && /^[A-Za-z0-9 .'!?-]+$/.test(v) && v.trim() ? v : NO;
}

function depthOk(raw: string, max: number): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (inString) {
      if (c === 92) i++;
      else if (c === 34) inString = false;
    } else if (c === 34) inString = true;
    else if (c === 91 || c === 123) {
      if (++depth > max) return false;
    } else if (c === 93 || c === 125) depth--;
  }
  return true;
}

function frame(raw: unknown, max: number): Obj | string {
  if (typeof raw !== 'string') return 'it is not text';
  if (raw.length > max) return 'it is too long';
  if (!depthOk(raw, DEPTH_MAX)) return 'it nests too deep';
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return 'it is not JSON';
  }
  if (!v || typeof v !== 'object' || Array.isArray(v) || typeof (v as Obj).type !== 'string') return 'it has no type';
  return v as Obj;
}

function readSlot(v: unknown): SlotRefW | undefined {
  const o = obj(v, ['row', 'lane']);
  return o && oneOf(o.row, ['p', 'e', 'q'] as const) && whole(o.lane, 0, 7) ? { row: o.row, lane: o.lane } : NO;
}

export function readBattle(v: unknown): WireBattle | undefined {
  const t = v && typeof v === 'object' ? (v as Obj).t : NO;
  switch (t) {
    case 'draw': {
      const o = obj(v, ['t', 'from']);
      return o && oneOf(o.from, ['main', 'side'] as const) ? { t, from: o.from } : NO;
    }
    case 'play': {
      const o = obj(v, ['t', 'uid', 'lane', 'sac', 'tg'], ['t', 'uid']);
      if (!o || !whole(o.uid, 0, 1_000_000)) return NO;
      const out: WireBattle = { t: 'play', uid: o.uid };
      if (own(o, 'lane')) {
        if (!whole(o.lane, 0, 7)) return NO;
        out.lane = o.lane;
      }
      if (own(o, 'sac')) {
        const sac = arr(o.sac, 0, 4, (x) => (whole(x, 0, 7) ? x : NO));
        if (!sac) return NO;
        out.sac = sac;
      }
      if (own(o, 'tg')) {
        const tg = arr(o.tg, 0, 4, readSlot);
        if (!tg) return NO;
        out.tg = tg;
      }
      return out;
    }
    case 'ring':
    case 'unring':
      return obj(v, ['t']) ? { t } : NO;
    case 'item': {
      const o = obj(v, ['t', 'slot', 'tg'], ['t', 'slot']);
      if (!o || !whole(o.slot, 0, 5)) return NO;
      if (!own(o, 'tg')) return { t, slot: o.slot };
      const tg = arr(o.tg, 0, 4, readSlot);
      return tg ? { t, slot: o.slot, tg } : NO;
    }
    case 'ghost': {
      const o = obj(v, ['t', 'kind', 'tg'], ['t', 'kind']);
      if (!o || !oneOf(o.kind, ['bone', 'mark'] as const)) return NO;
      if (!own(o, 'tg')) return { t, kind: o.kind };
      const tg = readSlot(o.tg);
      return tg ? { t, kind: o.kind, tg } : NO;
    }
  }
  return NO;
}

const INDEX = 50, DECK = 100_000;

export function readAction(v: unknown): WireAction | undefined {
  const t = v && typeof v === 'object' ? (v as Obj).t : NO;
  const one = (field: string, lo: number, hi: number) => {
    const o = obj(v, ['t', field]);
    return o && whole(o[field], lo, hi) ? ({ t, [field]: o[field] } as WireAction) : NO;
  };
  switch (t) {
    case 'b': {
      const o = obj(v, ['t', 'a']);
      const a = o ? readBattle(o.a) : NO;
      return a ? { t: 'b', a } : NO;
    }
    case 'vote':
      return one('node', 0, 500);
    case 'lock':
    case 'unlock':
    case 'done':
      return obj(v, ['t']) ? ({ t } as WireAction) : NO;
    case 'pick':
      return one('i', -1, INDEX);
    case 'relic':
    case 'totem':
    case 'evote':
      return one('i', 0, INDEX);
    case 'remove':
      return one('d', 0, DECK);
    case 'gift':
      return one('n', 1, 99_999);
    case 'buy': {
      const o = obj(v, ['t', 'kind', 'i']);
      return o && oneOf(o.kind, ['card', 'item', 'relic'] as const) && whole(o.i, 0, INDEX) ? { t, kind: o.kind, i: o.i } : NO;
    }
    case 'rest': {
      const o = obj(v, ['t', 'opt', 'd'], ['t', 'opt']);
      if (!o || !oneOf(o.opt, ['relight', 'upgrade', 'power', 'health', 'revive'] as const)) return NO;
      if (!own(o, 'd')) return { t, opt: o.opt };
      return whole(o.d, 0, DECK) ? { t, opt: o.opt, d: o.d } : NO;
    }
    case 'merge': {
      const o = obj(v, ['t', 'a', 'b']);
      return o && whole(o.a, 0, DECK) && whole(o.b, 0, DECK) ? { t, a: o.a, b: o.b } : NO;
    }
    case 'stones': {
      const o = obj(v, ['t', 'from', 'line', 'to']);
      return o && whole(o.from, 0, DECK) && whole(o.line, 0, 20) && whole(o.to, 0, DECK) ? { t, from: o.from, line: o.line, to: o.to } : NO;
    }
  }
  return NO;
}

function readPresence(v: unknown): WirePresence | undefined {
  const o = obj(v, ['hover', 'ping', 'say'], []);
  if (!o) return NO;
  const out: WirePresence = {};
  if (own(o, 'hover')) {
    if (o.hover === null) out.hover = null;
    else {
      const h = obj(o.hover, ['kind', 'id']);
      if (!h || !oneOf(h.kind, ['card', 'slot', 'node'] as const) || !whole(h.id, 0, 1_000_000)) return NO;
      out.hover = { kind: h.kind, id: h.id };
    }
  }
  if (own(o, 'ping')) {
    const p = obj(o.ping, ['kind', 'row', 'lane', 'node'], ['kind']);
    if (!p || !oneOf(p.kind, ['slot', 'node'] as const)) return NO;
    const ping: WirePresence['ping'] = { kind: p.kind };
    if (own(p, 'row')) {
      if (!oneOf(p.row, ['p', 'e', 'q'] as const)) return NO;
      ping.row = p.row;
    }
    if (own(p, 'lane')) {
      if (!whole(p.lane, 0, 7)) return NO;
      ping.lane = p.lane;
    }
    if (own(p, 'node')) {
      if (!whole(p.node, 0, 500)) return NO;
      ping.node = p.node;
    }
    out.ping = ping;
  }
  if (own(o, 'say')) {
    if (!whole(o.say, 0, 31)) return NO;
    out.say = o.say;
  }
  return out;
}

/** Every message a room takes, rebuilt from its checked fields, or why the frame was refused. */
export function readClient(raw: unknown): { m: ToRoom } | { why: string } {
  const big = typeof raw === 'string' && raw.length > FRAME_MAX && /^\{"type":"(state|load)"/.test(raw);
  const o = frame(raw, big ? STATE_MAX + 200 : FRAME_MAX);
  if (typeof o === 'string') return { why: o };
  const m = clientMessage(o);
  return m ? { m } : { why: `a message of type ${JSON.stringify(String(o.type).slice(0, 16))} has the wrong shape` };
}

function clientMessage(o: Obj): ToRoom | undefined {
  switch (o.type) {
    case 'hello': {
      if (own(o, 'resume')) {
        const h = obj(o, ['type', 'build', 'resume']);
        return h && isBuild(h.build) && isToken(h.resume) ? { type: 'hello', build: h.build, resume: h.resume } : NO;
      }
      const h = obj(o, ['type', 'build', 'name']);
      const name = h ? readName(h.name) : NO;
      return h && isBuild(h.build) && name ? { type: 'hello', build: h.build, name } : NO;
    }
    case 'char': {
      const c = obj(o, ['type', 'char']);
      return c && oneOf(c.char, CHARS) ? { type: 'char', char: c.char } : NO;
    }
    case 'ready': {
      const r = obj(o, ['type', 'on']);
      return r && typeof r.on === 'boolean' ? { type: 'ready', on: r.on } : NO;
    }
    case 'load': {
      const l = obj(o, ['type', 'state']);
      const state = l ? text(l.state, STATE_MAX) : NO;
      return state ? { type: 'load', state } : NO;
    }
    case 'cmd': {
      const c = obj(o, ['type', 'a', 'seat'], ['type', 'a']);
      const a = c ? readAction(c.a) : NO;
      if (!c || !a) return NO;
      if (own(c, 'seat')) return isSeat(c.seat) ? { type: 'cmd', a, seat: c.seat } : NO;
      return { type: 'cmd', a };
    }
    case 'hash': {
      const h = obj(o, ['type', 'n', 'h']);
      return h && whole(h.n, 0, 10_000_000) && isHash(h.h) ? { type: 'hash', n: h.n, h: h.h } : NO;
    }
    case 'state': {
      const s = obj(o, ['type', 'n', 'state']);
      const state = s ? text(s.state, STATE_MAX) : NO;
      return s && whole(s.n, 0, 10_000_000) && state ? { type: 'state', n: s.n, state } : NO;
    }
    case 'presence': {
      const p = obj(o, ['type', 'p']);
      const pres = p ? readPresence(p.p) : NO;
      return pres ? { type: 'presence', p: pres } : NO;
    }
    case 'leave':
    case 'ping':
      return obj(o, ['type']) ? { type: o.type } : NO;
  }
  return NO;
}

function readRelease(v: unknown): Release | undefined {
  const o = obj(v, ['n', 's', 'a']);
  const a = o ? readAction(o.a) : NO;
  return o && whole(o.n, 0, 10_000_000) && isSeat(o.s) && a ? { n: o.n, s: o.s, a } : NO;
}

function readInfo(v: unknown): StartInfo | undefined {
  const o = obj(v, ['seed', 'chars', 'names', 'state']);
  if (!o || !whole(o.seed, 0, 0xffffffff)) return NO;
  const chars = arr(o.chars, 2, 2, (x) => (oneOf(x, CHARS) ? x : NO));
  const names = arr(o.names, 2, 2, readName);
  const state = o.state === null ? null : text(o.state, STATE_MAX);
  if (!chars || !names || state === NO) return NO;
  return { seed: o.seed, chars: [chars[0], chars[1]], names: [names[0], names[1]], state };
}

const pair = <T>(v: unknown, item: (x: unknown) => T | undefined): [T, T] | undefined => {
  const a = arr(v, 2, 2, item);
  return a ? [a[0], a[1]] : NO;
};
const bool = (x: unknown) => (typeof x === 'boolean' ? x : NO);

/** Every message a client takes from its room, rebuilt from its checked fields, or null for a frame of any other shape. */
export function readRoom(raw: unknown): FromRoom | null {
  const o = frame(raw, ROOM_FRAME_MAX);
  return typeof o === 'string' ? null : (roomMessage(o) ?? null);
}

function roomMessage(o: Obj): FromRoom | undefined {
  switch (o.type) {
    case 'waiting': {
      const w = obj(o, ['type', 'code'], ['type']);
      if (!w) return NO;
      if (!own(w, 'code')) return { type: 'waiting' };
      return isCode(w.code) ? { type: 'waiting', code: w.code } : NO;
    }
    case 'seated': {
      const s = obj(o, ['type', 'seat', 'token']);
      return s && isSeat(s.seat) && isToken(s.token) ? { type: 'seated', seat: s.seat, token: s.token } : NO;
    }
    case 'setup': {
      const s = obj(o, ['type', 'names', 'chars', 'ready', 'loaded']);
      if (!s || typeof s.loaded !== 'boolean') return NO;
      const names = pair(s.names, (x) => (x === null ? null : readName(x)));
      const chars = pair(s.chars, (x) => (x === null ? null : oneOf(x, CHARS) ? x : NO));
      const ready = pair(s.ready, bool);
      return names && chars && ready ? { type: 'setup', names, chars, ready, loaded: s.loaded } : NO;
    }
    case 'start': {
      const s = obj(o, ['type', 'seat', 'info']);
      const info = s ? readInfo(s.info) : NO;
      return s && isSeat(s.seat) && info ? { type: 'start', seat: s.seat, info } : NO;
    }
    case 'release': {
      const r = obj(o, ['type', 'r']);
      const rel = r ? readRelease(r.r) : NO;
      return rel ? { type: 'release', r: rel } : NO;
    }
    case 'rejoin': {
      const r = obj(o, ['type', 'seat', 'info', 'base', 'record', 'away', 'gone']);
      if (!r || !isSeat(r.seat)) return NO;
      const info = readInfo(r.info);
      let base: { n: number; state: string } | null | undefined = null;
      if (r.base !== null) {
        const b = obj(r.base, ['n', 'state']);
        const state = b ? text(b.state, STATE_MAX) : NO;
        base = b && whole(b.n, 0, 10_000_000) && state ? { n: b.n, state } : NO;
      }
      const record = arr(r.record, 0, RECORD_MAX, readRelease);
      const away = pair(r.away, bool);
      const gone = pair(r.gone, bool);
      return info && base !== NO && record && away && gone ? { type: 'rejoin', seat: r.seat, info, base, record, away, gone } : NO;
    }
    case 'resync':
    case 'checkpoint': {
      const r = obj(o, ['type', 'n']);
      return r && whole(r.n, 0, 10_000_000) ? { type: o.type, n: r.n } : NO;
    }
    case 'state': {
      const s = obj(o, ['type', 'n', 'state']);
      const state = s ? text(s.state, STATE_MAX) : NO;
      return s && whole(s.n, 0, 10_000_000) && state ? { type: 'state', n: s.n, state } : NO;
    }
    case 'away': {
      const a = obj(o, ['type', 'seat', 'left']);
      return a && isSeat(a.seat) && whole(a.left, 0, HOLD_SECONDS) ? { type: 'away', seat: a.seat, left: a.left } : NO;
    }
    case 'back':
    case 'gone': {
      const b = obj(o, ['type', 'seat']);
      return b && isSeat(b.seat) ? { type: o.type, seat: b.seat } : NO;
    }
    case 'presence': {
      const p = obj(o, ['type', 'seat', 'p']);
      const pres = p ? readPresence(p.p) : NO;
      return p && isSeat(p.seat) && pres ? { type: 'presence', seat: p.seat, p: pres } : NO;
    }
    case 'refused':
    case 'resumeFailed': {
      const r = obj(o, ['type', 'reason']);
      const reason = r ? text(r.reason, REASON_MAX) : NO;
      return reason === NO ? NO : { type: o.type, reason };
    }
    case 'pong':
      return obj(o, ['type']) ? { type: 'pong' } : NO;
  }
  return NO;
}

export function readQueueReply(v: unknown): QueueReply | null {
  const ok = v && typeof v === 'object' ? (v as Obj).ok : NO;
  if (ok === true) {
    const o = obj(v, ['ok', 'room', 'code'], ['ok', 'room']);
    if (!o || typeof o.room !== 'string' || !/^[A-Za-z0-9_-]{0,64}$/.test(o.room) || (own(o, 'code') && !isCode(o.code))) return null;
    return own(o, 'code') ? { ok: true, room: o.room, code: o.code as string } : { ok: true, room: o.room };
  }
  const o = ok === false ? obj(v, ['ok', 'reason']) : null;
  const reason = o ? text(o.reason, REASON_MAX) : NO;
  return reason === NO ? null : { ok: false, reason };
}

export { isHash };
