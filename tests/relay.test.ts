import { describe, expect, it } from 'vitest';
import '../src/content/index.ts';
import { chooseRunAction } from '../src/ai/runbot.ts';
import { digest } from '../src/engine/digest.ts';
import type { Seat } from '../src/engine/types.ts';
import type { Link } from '../src/net/client.ts';
import { readClient, readRoom, type FromRoom, type ToRoom } from '../src/net/protocol.ts';
import { newRelay, RelayRules, type Out } from '../src/net/relay.ts';
import { OnlineSession } from '../src/net/session.ts';
import { waitingOn } from '../src/run/game.ts';

/** A room and two links in memory. Every frame goes through JSON and the readers, as it would over a socket. */
class Hub {
  rules: RelayRules;
  links: (FakeLink | null)[] = [null, null];
  now = 1000;
  constructor(softMax?: number) {
    this.rules = new RelayRules(newRelay(77), softMax);
  }
  deliver(out: Out): void {
    for (const { seat, m } of out) {
      const link = this.links[seat];
      if (!link || link.down) continue;
      const read = readRoom(JSON.stringify(m));
      if (!read) throw new Error(`room sent an unreadable ${m.type}`);
      link.inbox.push(read);
    }
  }
  receive(seat: Seat, m: ToRoom): void {
    const read = readClient(JSON.stringify(m));
    if ('why' in read) throw new Error(`client sent an unreadable ${m.type}: ${read.why}`);
    this.deliver(this.rules.receive(seat, read.m, this.now));
  }
}

class FakeLink implements Link {
  inbox: FromRoom[] = [];
  down = false;
  problem = '';
  hub: Hub;
  seat: Seat;
  constructor(hub: Hub, seat: Seat) {
    this.hub = hub;
    this.seat = seat;
    hub.links[seat] = this;
  }
  send(m: ToRoom): void {
    if (!this.down) this.hub.receive(this.seat, m);
  }
  poll(): FromRoom | null {
    return this.inbox.shift() ?? null;
  }
  tick(): void {}
  close(): void {}
  slack(): number {
    return 0;
  }
}

function startPair(hub: Hub): [OnlineSession, OnlineSession] {
  const links = [new FakeLink(hub, 0), new FakeLink(hub, 1)];
  hub.deliver(hub.rules.join(0, { type: 'hello', build: 'test', name: 'Ann' }, 'token-aaaaaaaa', hub.now));
  hub.deliver(hub.rules.join(1, { type: 'hello', build: 'test', name: 'Bo' }, 'token-bbbbbbbb', hub.now));
  links[0].send({ type: 'char', char: 'blue' });
  links[1].send({ type: 'char', char: 'pistachio' });
  links[0].send({ type: 'ready', on: true });
  links[1].send({ type: 'ready', on: true });
  const sessions = links.map((link, seat) => {
    let start: Extract<FromRoom, { type: 'start' }> | null = null;
    for (let m = link.poll(); m; m = link.poll()) if (m.type === 'start') start = m;
    if (!start) throw new Error('no start message');
    return new OnlineSession(link, seat as Seat, start.info);
  });
  return [sessions[0], sessions[1]];
}

/** Each session's bot acts for the seats it controls, then both pump their inboxes. */
function play(sessions: OnlineSession[], steps: number): void {
  for (let i = 0; i < steps; i++) {
    const s = sessions[i % sessions.length];
    const g = s.game;
    if (g.run.over) return;
    const seat = waitingOn(g).find((x) => s.mine.includes(x));
    if (seat !== undefined) {
      const err = s.send(seat, chooseRunAction(g, seat, { limit: 30 }));
      if (err) throw new Error(err);
    }
    for (const x of sessions) x.pump();
  }
}

describe('relay', () => {
  it('two players see the same game after many commands', () => {
    const hub = new Hub();
    const [a, b] = startPair(hub);
    expect(digest(a.game)).toBe(digest(b.game));
    play([a, b], 400);
    expect(a.game.n).toBeGreaterThan(20);
    expect(digest(a.game)).toBe(digest(b.game));
  });

  it('a hash mismatch makes both continue from one copy', () => {
    const hub = new Hub();
    const [a, b] = startPair(hub);
    play([a, b], 30);
    b.game.run.seats[0].teeth += 50;
    play([a, b], 120);
    expect(digest(a.game)).toBe(digest(b.game));
  });

  it('a dropped player rejoins with the record and matches the partner', () => {
    const hub = new Hub();
    const [a, b] = startPair(hub);
    play([a, b], 60);
    hub.links[1]!.down = true;
    hub.deliver(hub.rules.leave(1, hub.now));
    hub.links[1]!.down = false;
    const link = new FakeLink(hub, 1);
    hub.deliver(hub.rules.resume(1, hub.now));
    const rejoin = link.poll();
    expect(rejoin?.type).toBe('rejoin');
    if (rejoin?.type !== 'rejoin') return;
    const b2 = new OnlineSession(link, 1, rejoin.info, rejoin.base, rejoin.record);
    a.pump();
    expect(digest(b2.game)).toBe(digest(a.game));
    play([a, b2], 60);
    expect(digest(b2.game)).toBe(digest(a.game));
    void b;
  });

  it('after the hold runs out, the remaining player acts for both seats', () => {
    const hub = new Hub();
    const [a] = startPair(hub);
    hub.links[1]!.down = true;
    hub.deliver(hub.rules.leave(1, hub.now));
    hub.now += 91_000;
    hub.deliver(hub.rules.tick(hub.now));
    a.pump();
    expect(a.mine).toEqual([0, 1]);
    play([a], 200);
    expect(a.game.n).toBeGreaterThan(10);
  });

  it('a long record is replaced by a checkpoint that a rejoin starts from', () => {
    const hub = new Hub(40);
    const [a, b] = startPair(hub);
    play([a, b], 200);
    expect(hub.rules.d.base).not.toBeNull();
    expect(hub.rules.d.record.length).toBeLessThan(200);
    const link = new FakeLink(hub, 1);
    hub.deliver(hub.rules.resume(1, hub.now));
    const rejoin = link.poll();
    if (rejoin?.type !== 'rejoin') throw new Error('expected a rejoin');
    const b2 = new OnlineSession(link, 1, rejoin.info, rejoin.base, rejoin.record);
    expect(digest(b2.game)).toBe(digest(a.game));
    void b;
  });

  it('the readers refuse extra fields and debug commands', () => {
    expect('why' in readClient(JSON.stringify({ type: 'cmd', a: { t: 'debug', d: { op: 'win' } } }))).toBe(true);
    expect('why' in readClient(JSON.stringify({ type: 'cmd', a: { t: 'vote', node: 1, extra: 1 } }))).toBe(true);
    expect('why' in readClient(JSON.stringify({ type: 'cmd', a: { t: 'b', a: { t: 'play', uid: 3, lane: 9 } } }))).toBe(true);
    expect('m' in readClient(JSON.stringify({ type: 'cmd', a: { t: 'b', a: { t: 'play', uid: 3, lane: 2, sac: [1], tg: [{ row: 'e', lane: 2 }] } } }))).toBe(true);
  });
});
