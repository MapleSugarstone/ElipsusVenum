import { CHARACTERS } from '../content/index.ts';
import type { Seat } from '../engine/types.ts';
import { cancelQueue, forgetSeat, heldSeat, NetLink, queue, relayReachable, BUILD, type QueueKind } from '../net/client.ts';
import { readName, type FromRoom } from '../net/protocol.ts';
import { clearCoopSave, loadCoopSave, OnlineSession } from '../net/session.ts';
import type { App } from './app.ts';
import { clear, h } from './dom.ts';

const NAME_KEY = 'elipsusvenum.name.v1';

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/** The co-op menu: host or join a room, pick characters, ready up, then hand the link to an online session. */
export class OnlineMenu {
  readonly root: HTMLDivElement;
  private app: App;
  private link: NetLink | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private seat: Seat | null = null;
  private code = '';
  private room = '';
  private setup: Extract<FromRoom, { type: 'setup' }> | null = null;
  private note = '';
  private busy = false;

  constructor(app: App) {
    this.app = app;
    this.root = h('div', { class: 'screen setup-screen' });
    this.render();
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.root.remove();
  }

  private back(): void {
    this.leave();
    this.app.title();
  }

  private leave(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.link) {
      this.link.send({ type: 'leave' });
      this.link.close();
    }
    if (this.room && this.seat === 0 && !this.setup) void cancelQueue(this.room, this.code || undefined);
    this.link = null;
    this.seat = null;
    this.setup = null;
    this.code = '';
    this.room = '';
  }

  private render(): void {
    const r = this.root;
    clear(r);
    r.append(h('h2', {}, 'Co-op online'));
    if (!relayReachable()) {
      r.append(h('p', { style: { color: 'var(--muted)' } }, 'This copy of the game has no relay server set, so online play is off.'), h('button', { onclick: () => this.back() }, 'Back'));
      return;
    }
    if (this.note) r.append(h('p', { style: { color: 'var(--warn)' } }, this.note));
    if (!this.link) return this.renderStart();
    if (!this.setup) {
      r.append(h('p', { style: { fontSize: '20px' } }, this.code ? 'Waiting for your partner. Give them this code:' : 'Waiting for another player.'));
      if (this.code) r.append(h('div', { style: { fontFamily: 'var(--font-display)', fontSize: '64px', letterSpacing: '8px', margin: '10px 0 20px' } }, this.code));
      r.append(h('button', { onclick: () => (this.leave(), this.render()) }, 'Cancel'));
      return;
    }
    this.renderSetup();
  }

  private renderStart(): void {
    const r = this.root;
    const name = h('input', { value: savedName(), maxlength: '12', placeholder: 'Your name' });
    const code = h('input', { maxlength: '6', placeholder: 'Code', style: { textTransform: 'uppercase', width: '120px', letterSpacing: '3px' } });
    const go = (kind: QueueKind) => {
      const n = name.value.trim();
      if (!readName(n)) {
        this.note = 'Pick a name of 1 to 12 letters, numbers, or spaces.';
        return this.render();
      }
      try {
        localStorage.setItem(NAME_KEY, n);
      } catch {
        /* storage blocked */
      }
      void this.queue(kind, n, kind === 'join' ? code.value.trim().toUpperCase() : undefined);
    };
    r.append(h('div', { class: 'title-menu lobby' },
      h('label', { class: 'field' }, 'Name', name),
      h('button', { disabled: this.busy, onclick: () => go('host') }, 'Host a room'),
      h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, code, h('button', { disabled: this.busy, style: { minWidth: '0' }, onclick: () => go('join') }, 'Join with a code')),
      h('button', { disabled: this.busy, onclick: () => go('public') }, 'Find a stranger'),
    ));
    const held = heldSeat();
    if (held) r.append(h('p', {}, 'You were in a co-op run a moment ago. ', h('button', { class: 'primary', onclick: () => this.rejoin(held.room, held.token) }, 'Rejoin it')));
    const save = loadCoopSave();
    if (save) r.append(h('p', { style: { color: 'var(--muted)' } }, `You have a saved co-op run with ${save.names.join(' and ')}. Host a room to offer it to your partner.`, ' ', h('button', { onclick: () => (clearCoopSave(), this.render()) }, 'Forget it')));
    r.append(h('p', { style: { color: 'var(--muted)', marginTop: '30px' } }, 'Each of you plays one half of the board. Votes on the map that disagree go to a coin.'));
    r.append(h('button', { onclick: () => this.back() }, 'Back'));
  }

  private renderSetup(): void {
    const r = this.root;
    const s = this.setup!;
    const me = this.seat!;
    r.append(h('p', { style: { color: 'var(--muted)' } }, `You hold the ${me === 0 ? 'left' : 'right'} half of the board.`));
    if (s.loaded) r.append(h('p', { style: { color: 'var(--warn)' } }, 'You are continuing a saved run. The characters come from the save.'));
    const row = h('div', { class: 'char-row' });
    for (const seat of [0, 1] as Seat[]) {
      const col = h('div', { class: 'char-pick' }, h('h3', {}, `${s.names[seat] ?? 'Waiting'}${seat === me ? ' (you)' : ''}`));
      if (!s.loaded) {
        for (const ch of Object.values(CHARACTERS)) {
          col.append(h('button', {
            class: `char-option ${s.chars[seat] === ch.id ? 'on' : ''}`,
            disabled: seat !== me,
            onclick: () => this.link?.send({ type: 'char', char: ch.id }),
          }, h('b', {}, ch.name), h('span', {}, ch.id === 'blue' ? 'Knives, prayer, and his King.' : 'Programs, hacks, and villainy.')));
        }
      }
      col.append(h('p', { style: { color: s.ready[seat] ? 'var(--ok)' : 'var(--muted)' } }, s.ready[seat] ? 'Ready' : 'Not ready'));
      row.append(col);
    }
    r.append(row);
    const save = loadCoopSave();
    const actions = h('div', { style: { display: 'flex', gap: '12px', marginTop: '20px' } });
    actions.append(h('button', { class: 'primary', disabled: !s.loaded && !s.chars[me], onclick: () => this.link?.send({ type: 'ready', on: !s.ready[me] }) }, s.ready[me] ? 'Not ready' : 'Ready'));
    if (me === 0 && save && !s.loaded) actions.append(h('button', { onclick: () => this.link?.send({ type: 'load', state: save.state }) }, `Continue the saved run with ${save.names[1]}`));
    actions.append(h('button', { onclick: () => (this.leave(), this.render()) }, 'Leave'));
    r.append(actions);
  }

  private async queue(kind: QueueKind, name: string, code?: string): Promise<void> {
    this.busy = true;
    this.note = '';
    this.render();
    const reply = await queue(kind, code);
    this.busy = false;
    if (!reply.ok) {
      this.note = reply.reason;
      return this.render();
    }
    this.room = reply.room;
    this.code = reply.code && kind === 'host' ? reply.code : '';
    this.link = new NetLink(reply.room);
    this.link.send({ type: 'hello', build: BUILD, name });
    this.listen();
    this.render();
  }

  private rejoin(room: string, token: string): void {
    this.room = room;
    this.link = new NetLink(room, token);
    this.listen();
    this.render();
  }

  private listen(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.pump(), 50);
  }

  private pump(): void {
    const link = this.link;
    if (!link) return;
    link.tick();
    let changed = false;
    for (let m = link.poll(); m; m = link.poll()) {
      changed = true;
      switch (m.type) {
        case 'seated':
          this.seat = m.seat;
          break;
        case 'waiting':
          this.setup = null;
          break;
        case 'setup':
          this.setup = m;
          break;
        case 'start':
        case 'rejoin': {
          if (this.timer) clearInterval(this.timer);
          this.timer = null;
          const session = m.type === 'start'
            ? new OnlineSession(link, m.seat, m.info)
            : new OnlineSession(link, m.seat, m.info, m.base, m.record);
          if (m.type === 'rejoin') session.setPartnerState(m.away, m.gone);
          session.onEnd = (why) => {
            forgetSeat();
            this.app.title();
            this.app.notice(why);
          };
          this.link = null;
          this.app.begin(session);
          return;
        }
        case 'refused':
        case 'resumeFailed':
          this.note = m.reason;
          if (link.problem || m.type === 'resumeFailed') {
            this.link = null;
            forgetSeat();
          }
          break;
      }
    }
    if (changed) this.render();
  }
}
