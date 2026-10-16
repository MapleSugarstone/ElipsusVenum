// The relay Worker: queue requests go to the one lobby, and a run's socket goes to its own room. Every request but the
// health check passes a rate limit by address with a backstop for every address together. It runs no game code.
import { PROTOCOL, type QueueReply } from '../../src/net/protocol';
import { lobbyOf, type Env } from './env';
import { Lobby } from './lobby';
import { Room } from './room';

export { Lobby, Room };

const ADDRESS_BURST = 20;
const ADDRESS_PER_SECOND = 0.5;
const WORLD_BURST = 600;
const WORLD_PER_SECOND = 100;
const BUCKETS_MAX = 5000;
const BUCKET_IDLE_MS = 10 * 60 * 1000;
const BODY_MAX = 1024;

interface Bucket {
  tokens: number;
  at: number;
}
const buckets = new Map<string, Bucket>();
const world: Bucket = { tokens: WORLD_BURST, at: Date.now() };

function draw(b: Bucket, burst: number, perSecond: number, now: number): boolean {
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSecond);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function limited(address: string, now: number): string | null {
  if (buckets.size > BUCKETS_MAX) for (const [k, b] of buckets) if (now - b.at > BUCKET_IDLE_MS) buckets.delete(k);
  let b = buckets.get(address);
  if (!b) buckets.set(address, (b = { tokens: ADDRESS_BURST, at: now }));
  if (!draw(b, ADDRESS_BURST, ADDRESS_PER_SECOND, now)) return 'Too many requests from this address. Wait a minute and try again.';
  if (!draw(world, WORLD_BURST, WORLD_PER_SECOND, now)) return 'The rooms are busy. Try again in a minute.';
  return null;
}

function addressKey(address: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < address.length; i++) {
    h ^= address.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function allowedOrigin(env: Env, origin: string | null): boolean {
  if (origin === null) return false;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
}

function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  if (!allowedOrigin(env, origin)) return {};
  return { 'Access-Control-Allow-Origin': origin!, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
}

async function bodyOf(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('content-length') ?? 0) > BODY_MAX) return null;
  const text = await request.text();
  if (text.length > BODY_MAX) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function keyOf(b: Record<string, unknown>): string | null {
  const { build, format } = b;
  if (typeof build !== 'string' || !/^[A-Za-z0-9_.-]{1,40}$/.test(build)) return null;
  if (format !== 'coop') return null;
  return `${build}|${format}`;
}

const strOf = (v: unknown, re: RegExp): string | null => (typeof v === 'string' && re.test(v) ? v : null);
const ROOM_ID = /^(pub|prv)-[0-9a-f-]{36}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(env, origin);
    const reply = (body: QueueReply, status = 200) => Response.json(body, { status, headers: cors });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/api/health') return Response.json({ ok: true, protocol: PROTOCOL }, { headers: cors });
    const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    if (url.pathname.startsWith('/api/queue/')) {
      if (request.method !== 'POST') return new Response('use POST', { status: 405, headers: cors });
      if (!allowedOrigin(env, origin)) return new Response('forbidden origin', { status: 403, headers: cors });
      const busy = limited(address, Date.now());
      if (busy) return reply({ ok: false, reason: busy }, 429);
      const b = await bodyOf(request);
      if (!b) return reply({ ok: false, reason: 'The request could not be read.' }, 400);
      const lobby = lobbyOf(env);
      const key = keyOf(b);
      switch (url.pathname.slice('/api/queue/'.length)) {
        case 'public':
          return key ? reply(await lobby.findPublic(key)) : reply({ ok: false, reason: 'The request could not be read.' }, 400);
        case 'host':
          return key ? reply(await lobby.host(key, addressKey(address))) : reply({ ok: false, reason: 'The request could not be read.' }, 400);
        case 'join': {
          const code = strOf(b.code, /^[A-Za-z0-9]{6}$/);
          if (!key || !code) return reply({ ok: false, reason: 'A code is six letters and numbers.' }, 400);
          return reply(await lobby.join(code.toUpperCase(), key));
        }
        case 'renew': {
          const room = strOf(b.room, ROOM_ID);
          return room ? reply(await lobby.renew(room)) : reply({ ok: false, reason: 'The request could not be read.' }, 400);
        }
        case 'cancel':
          await lobby.cancel(strOf(b.room, ROOM_ID), strOf(b.code, /^[A-Za-z0-9]{6}$/)?.toUpperCase() ?? null);
          return reply({ ok: true, room: '' });
      }
      return new Response('not found', { status: 404, headers: cors });
    }

    // A socket handshake is not covered by CORS, so the origin is checked here rather than left to the browser.
    const m = url.pathname.match(/^\/api\/room\/([A-Za-z0-9_-]{1,64})$/);
    if (m) {
      if (!allowedOrigin(env, origin)) return new Response('forbidden origin', { status: 403, headers: cors });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426, headers: cors });
      if (!ROOM_ID.test(m[1])) return new Response('no such room', { status: 404, headers: cors });
      const busy = limited(address, Date.now());
      if (busy) return new Response(busy, { status: 429, headers: cors });
      return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(request);
    }
    return new Response('not found', { status: 404, headers: cors });
  },
} satisfies ExportedHandler<Env>;
