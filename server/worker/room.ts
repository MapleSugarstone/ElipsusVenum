// One co-op run's room. It reads every frame through `readClient`, keeps the relay rules' state in storage, and holds one
// alarm for the earliest deadline. Sockets use the hibernation API, so an idle room costs nothing and keeps its sockets when
// the runtime evicts it. The record is stored in chunks so a command writes one small chunk rather than the whole run.
import { DurableObject } from 'cloudflare:workers';
import { readClient, type FromRoom, type Hello, type Release, type ToRoom } from '../../src/net/protocol';
import { newRelay, RelayRules, type Out, type RelayData } from '../../src/net/relay';
import { lobbyOf, type Env } from './env';

interface Tag {
  seat?: 0 | 1;
  heard: number;
  strikes: number;
  since: number;
  count: number;
}

const STRIKES_MAX = 5;
/** Frames one socket may send in a window. Presence messages are throttled on the client, so play stays well under this. */
const FLOOD_MAX = 150;
const FLOOD_WINDOW_MS = 10_000;
const SILENT_MS = 90_000;
const SOCKETS_MAX = 6;
const CHUNK = 250;
export const CLOSE_REPLACED = 4000;
export const CLOSE_SILENT = 4001;
export const CLOSE_OUT = 1008;

type Meta = Omit<RelayData, 'record' | 'base'> & { chunks: number; recordStart: number; baseN: number | null };

export class Room extends DurableObject<Env> {
  private data: RelayData | null = null;
  private savedMeta = '';
  private savedLen = 0;
  private savedStart = -1;
  private savedBaseN: number | null = null;
  private alarmAt: number | null | undefined = undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  private name(): string {
    return this.ctx.id.name ?? this.ctx.id.toString();
  }

  private log(event: string, fields: Record<string, unknown> = {}): void {
    console.log(JSON.stringify({ event, room: this.name(), ...fields }));
  }

  private async load(now: number): Promise<RelayData> {
    if (this.data) return this.data;
    const meta = await this.ctx.storage.get<Meta>('meta');
    if (!meta) {
      const r = crypto.getRandomValues(new Uint32Array(1));
      this.data = newRelay(r[0]);
      this.data.active = now;
      return this.data;
    }
    const keys = Array.from({ length: meta.chunks }, (_, i) => `r${i}`);
    const chunks = keys.length ? await this.ctx.storage.get<Release[]>(keys) : new Map<string, Release[]>();
    const record: Release[] = [];
    for (const k of keys) record.push(...(chunks.get(k) ?? []));
    const base = meta.baseN === null ? null : { n: meta.baseN, state: (await this.ctx.storage.get<string>('base')) ?? '' };
    const { chunks: _c, recordStart: _s, baseN: _b, ...rest } = meta;
    this.data = { ...rest, record, base };
    this.savedMeta = JSON.stringify(meta);
    this.savedLen = record.length;
    this.savedStart = record[0]?.n ?? -1;
    this.savedBaseN = meta.baseN;
    // A deploy drops every socket with no close event, so a seat with no socket is held from now.
    const held = new Set(this.ctx.getWebSockets().map((ws) => this.tagOf(ws).seat));
    const rules = new RelayRules(this.data);
    for (const seat of [0, 1] as const) if (this.data.seats[seat] && !held.has(seat) && this.data.seats[seat]!.away === null && !this.data.seats[seat]!.gone) this.deliver(rules.leave(seat, now));
    return this.data;
  }

  private async save(now: number): Promise<void> {
    const d = this.data!;
    const start = d.record[0]?.n ?? -1;
    const rewrite = start !== this.savedStart || d.record.length < this.savedLen;
    const writes: Record<string, unknown> = {};
    const chunks = Math.ceil(d.record.length / CHUNK);
    const from = rewrite ? 0 : Math.floor(this.savedLen / CHUNK);
    for (let i = from; i < chunks; i++) writes[`r${i}`] = d.record.slice(i * CHUNK, (i + 1) * CHUNK);
    const baseN = d.base?.n ?? null;
    if (baseN !== this.savedBaseN && d.base) writes.base = d.base.state;
    const { record: _r, base: _b, ...rest } = d;
    const meta: Meta = { ...rest, chunks, recordStart: start, baseN };
    const metaRaw = JSON.stringify(meta);
    if (metaRaw !== this.savedMeta) writes.meta = meta;
    if (Object.keys(writes).length) await this.ctx.storage.put(writes);
    if (rewrite) {
      const stale = Array.from({ length: 20 }, (_, i) => `r${chunks + i}`);
      await this.ctx.storage.delete(stale);
    }
    this.savedMeta = metaRaw;
    this.savedLen = d.record.length;
    this.savedStart = start;
    this.savedBaseN = baseN;
    const rules = new RelayRules(d);
    const due = rules.nextDeadline() ?? d.active + 6 * 60 * 60 * 1000;
    const at = Math.max(due, now + 250);
    if (this.alarmAt === undefined) this.alarmAt = await this.ctx.storage.getAlarm();
    if (at === this.alarmAt) return;
    await this.ctx.storage.setAlarm(at);
    this.alarmAt = at;
  }

  private tagOf(ws: WebSocket): Tag {
    const t = ws.deserializeAttachment() as Partial<Tag> | null;
    return { seat: t?.seat, heard: t?.heard ?? 0, strikes: t?.strikes ?? 0, since: t?.since ?? 0, count: t?.count ?? 0 };
  }

  private setTag(ws: WebSocket, t: Tag): void {
    ws.serializeAttachment(t);
  }

  private deliver(out: Out): void {
    if (!out.length) return;
    const sockets = this.ctx.getWebSockets();
    for (const { seat, m } of out) for (const ws of sockets) if (this.tagOf(ws).seat === seat) this.sendTo(ws, m);
  }

  private sendTo(ws: WebSocket, m: FromRoom): void {
    try {
      ws.send(JSON.stringify(m));
    } catch {
      /* the socket closed between the check and the send */
    }
  }

  private shut(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
    const now = Date.now();
    await this.sweep(now);
    if (this.ctx.getWebSockets().length >= SOCKETS_MAX) return new Response('the room is full', { status: 503 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    this.setTag(server, { heard: now, strikes: 0, since: now, count: 0 });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    try {
      await this.handle(ws, raw);
    } catch (err) {
      console.error('room message threw', err);
      this.log('fault', { error: err instanceof Error ? err.message : String(err) });
      this.sendTo(ws, { type: 'refused', reason: 'The room hit a fault.' });
    }
  }

  private async handle(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const now = Date.now();
    const tag = this.tagOf(ws);
    if (now - tag.since >= FLOOD_WINDOW_MS) {
      tag.since = now;
      tag.count = 0;
    }
    tag.count++;
    tag.heard = now;
    const read = readClient(typeof raw === 'string' ? raw : null);
    if ('why' in read) tag.strikes++;
    this.setTag(ws, tag);
    const d = await this.load(now);
    const rules = new RelayRules(d);
    const out: Out = this.silent(rules, now);
    if (tag.count > FLOOD_MAX || tag.strikes >= STRIKES_MAX) out.push(...this.closeOut(ws, rules, now));
    else if ('why' in read) this.sendTo(ws, { type: 'refused', reason: 'The room could not read that message.' });
    else out.push(...this.take(ws, read.m, rules, now));
    await this.save(now);
    this.deliver(out);
  }

  private take(ws: WebSocket, m: ToRoom, rules: RelayRules, now: number): Out {
    const d = rules.d;
    const tag = this.tagOf(ws);
    if (m.type !== 'hello') return tag.seat === undefined ? [] : rules.receive(tag.seat, m, now);
    if (tag.seat !== undefined) return [];
    if ('resume' in m) return this.resume(ws, m, rules, now);
    const free = !d.seats[0] ? 0 : !d.seats[1] ? 1 : null;
    if (free === null || d.phase !== 'open') {
      this.sendTo(ws, { type: 'refused', reason: 'That room is full.' });
      this.shut(ws, 1000, 'full');
      return [];
    }
    const out = rules.join(free, m as Extract<Hello, { name: string }>, crypto.randomUUID(), now);
    if (!d.seats[free]) {
      for (const o of out) this.sendTo(ws, o.m);
      this.shut(ws, 1000, 'refused');
      return [];
    }
    this.setTag(ws, { ...tag, seat: free });
    return out;
  }

  private resume(ws: WebSocket, m: Extract<Hello, { resume: string }>, rules: RelayRules, now: number): Out {
    const d = rules.d;
    const seat = rules.tokenSeat(m.resume);
    if (seat === null) {
      this.sendTo(ws, { type: 'resumeFailed', reason: 'That run is no longer in this room.' });
      this.shut(ws, 1000, 'unknown seat');
      return [];
    }
    if (d.seats[seat]!.build !== m.build) {
      this.sendTo(ws, { type: 'resumeFailed', reason: 'The game was updated during the run. Save files carry over: reload the page and host the saved run again.' });
      this.shut(ws, 1000, 'build changed');
      return [];
    }
    for (const other of this.ctx.getWebSockets()) {
      const t = this.tagOf(other);
      if (other === ws || t.seat !== seat) continue;
      this.setTag(other, { ...t, seat: undefined });
      this.shut(other, CLOSE_REPLACED, 'replaced');
    }
    this.setTag(ws, { ...this.tagOf(ws), seat });
    this.log('back', { seat, phase: d.phase, n: d.n });
    return rules.resume(seat, now);
  }

  private closeOut(ws: WebSocket, rules: RelayRules, now: number): Out {
    const tag = this.tagOf(ws);
    this.log('closed out', { seat: tag.seat ?? null });
    this.setTag(ws, { ...tag, seat: undefined });
    this.shut(ws, CLOSE_OUT, 'closed out');
    return tag.seat === undefined ? [] : rules.leave(tag.seat, now);
  }

  private silent(rules: RelayRules, now: number): Out {
    const out: Out = [];
    for (const ws of this.ctx.getWebSockets()) {
      const tag = this.tagOf(ws);
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
      if (now - Math.max(tag.heard, pinged) < SILENT_MS) continue;
      this.setTag(ws, { ...tag, seat: undefined });
      this.shut(ws, CLOSE_SILENT, 'silent');
      if (tag.seat !== undefined) out.push(...rules.leave(tag.seat, now));
    }
    return out;
  }

  private async sweep(now: number): Promise<void> {
    if (!this.ctx.getWebSockets().length) return;
    const d = await this.load(now);
    const out = this.silent(new RelayRules(d), now);
    await this.save(now);
    this.deliver(out);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    try {
      await this.drop(ws, `code ${code}${wasClean ? ' clean' : ''}${reason ? ` ${reason}` : ''}`);
    } catch (err) {
      console.error('room close threw', err);
    }
    this.shut(ws, 1000, 'closed');
  }

  async webSocketError(ws: WebSocket, err: unknown): Promise<void> {
    try {
      await this.drop(ws, `error ${err instanceof Error ? err.message : String(err)}`);
    } catch (e) {
      console.error('room error handler threw', e);
    }
  }

  private async drop(ws: WebSocket, how: string): Promise<void> {
    const tag = this.tagOf(ws);
    const seat = tag.seat;
    if (seat === undefined) return;
    this.setTag(ws, { ...tag, seat: undefined });
    const now = Date.now();
    const d = await this.load(now);
    const wasOpen = d.phase === 'open';
    this.log('seat closed', { seat, phase: d.phase, how });
    const out = new RelayRules(d).leave(seat, now);
    await this.save(now);
    this.deliver(out);
    if (wasOpen && !d.seats[0] && !d.seats[1]) await lobbyOf(this.env).cancel(this.name(), null);
  }

  async alarm(): Promise<void> {
    this.alarmAt = null;
    try {
      const now = Date.now();
      const d = await this.load(now);
      const rules = new RelayRules(d);
      if (rules.abandoned(now, this.ctx.getWebSockets().length)) {
        await this.ctx.storage.deleteAll();
        this.data = null;
        this.savedMeta = '';
        this.savedLen = 0;
        this.savedStart = -1;
        this.savedBaseN = null;
        this.alarmAt = undefined;
        return;
      }
      const out = this.silent(rules, now);
      out.push(...rules.tick(now));
      await this.save(now);
      this.deliver(out);
    } catch (err) {
      console.error('room alarm threw', err);
      await this.ctx.storage.setAlarm(Date.now() + 1000);
      this.alarmAt = undefined;
    }
  }
}
