import { costOf, legal, needsDraw, sacValue, targetOk } from '../engine/battle.ts';
import { hasKw } from '../engine/fx.ts';
import { ability, BOSSES, card as cardDef, ITEMS, type TargetSpec } from '../engine/registry.ts';
import { LANES, lanesOf, other, ownerOf, type Battle, type BattleAction, type Ev, type Row, type Seat, type SlotRef } from '../engine/types.ts';
import { CHARACTERS } from '../content/index.ts';
import { dealerLine } from '../content/dealer.ts';
import { fillMini, fullCard } from './card.ts';
import { banner, clear, floatNum, h, sleep, toast } from './dom.ts';
import { hideInspect, inspectable, inspectCard } from './inspect.ts';
import { hoverTip } from './hud.ts';
import type { App } from './app.ts';
import type { Presence, Update } from './session.ts';
import { boardView, type BoardView, type CardView } from './view.ts';
import { sfx } from '../audio/sfx.ts';
import { music } from '../audio/music.ts';

const BONE_SVG = '<svg viewBox="0 0 22 22" width="22" height="22"><g transform="rotate(-40 11 11)" fill="#e3dcc4" stroke="#000" stroke-width="1.4"><rect x="4" y="9" width="14" height="4" rx="1"/><circle cx="4" cy="8.5" r="2.6"/><circle cx="4" cy="13.5" r="2.6"/><circle cx="18" cy="8.5" r="2.6"/><circle cx="18" cy="13.5" r="2.6"/></g></svg>';
const SHIELD_SVG = '<svg viewBox="0 0 22 22" width="22" height="22"><path d="M11 2 L19 5 L18 13 Q16 18 11 20 Q6 18 4 13 L3 5 Z" fill="#d0beff" stroke="#000" stroke-width="1.4"/></svg>';

const LEFT = 158;
const LANE_W = 150;
const GAP = 8;
const SEAM = 28;
const ROW_Y: Record<Row, number> = { q: 52, e: 212, p: 408 };
export const laneX = (lane: number) => LEFT + lane * (LANE_W + GAP) + (lane >= 4 ? SEAM : 0);

type Sel =
  | null
  | { kind: 'card'; seat: Seat; uid: number; sac: number[]; lane?: number; tg: SlotRef[] }
  | { kind: 'item'; seat: Seat; slot: number; tg: SlotRef[] }
  | { kind: 'mark'; seat: Seat; tg: SlotRef[] };

type Need = { kind: 'sac'; n: number } | { kind: 'lane' } | { kind: 'tg'; spec: TargetSpec; i: number } | { kind: 'ready' };

const TARGET_PROMPT = (spec: TargetSpec): string => {
  const where = spec.who === 'any' ? 'in any lane' : spec.who === 'partner' ? 'in your partner\'s lanes' : 'in your lanes';
  if (spec.row === 'lane') return `Choose a lane ${where}`;
  if (spec.row === 'e') return `Choose an enemy creature ${where}`;
  if (spec.need === 'empty') return `Choose an empty slot ${where}`;
  return `Choose a creature ${where}`;
};

export class BattleScreen {
  readonly root: HTMLDivElement;
  private app: App;
  private board: HTMLDivElement;
  private slots = new Map<string, HTMLDivElement>();
  private minis = new Map<number, HTMLDivElement>();
  private panels: HTMLDivElement[] = [];
  private scales: HTMLDivElement[] = [];
  private promptEl: HTMLDivElement;
  private shown: BoardView | null = null;
  private sel: Sel = null;
  private queue: Ev[] = [];
  private busy = false;
  private dead = false;
  private keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.cancel();
  };

  constructor(app: App) {
    this.app = app;
    this.root = h('div', { class: 'battle', oncontextmenu: (e: Event) => (e.preventDefault(), this.cancel()) });
    this.board = h('div', { style: { position: 'absolute', inset: '0' } });
    this.promptEl = h('div', { class: 'prompt', style: { display: 'none' } });
    this.root.append(this.board, this.promptEl);
    for (const row of ['q', 'e', 'p'] as Row[]) {
      for (let lane = 0; lane < LANES; lane++) {
        const slot = h('div', {
          class: `slot ${row}`,
          style: { left: `${laneX(lane)}px`, top: `${ROW_Y[row]}px` },
          onclick: (e: MouseEvent) => (e.altKey ? this.sendPing(row, lane) : this.clickSlot(row, lane)),
        });
        this.slots.set(`${row}${lane}`, slot);
        this.board.append(slot);
      }
    }
    this.board.append(h('div', { class: 'seam', style: { left: `${laneX(4) - SEAM / 2 - GAP / 2}px` } }));
    for (const seat of [0, 1] as Seat[]) {
      const scale = h('div', { class: 'scale', style: { left: seat === 0 ? '14px' : '1456px' } });
      this.scales.push(scale);
      this.root.append(scale);
      const panel = h('div', { class: `seat-panel s${seat}`, style: { left: seat === 0 ? '0px' : '802px' } });
      this.panels.push(panel);
      this.root.append(panel);
    }
    window.addEventListener('keydown', this.keyHandler);
  }

  destroy(): void {
    this.dead = true;
    this.queue = [];
    window.removeEventListener('keydown', this.keyHandler);
    hideInspect();
    this.root.remove();
  }

  private get game() {
    return this.app.session!.game;
  }
  private get b(): Battle {
    return this.game.battle!;
  }
  private get mine(): Seat[] {
    return this.app.session!.mine;
  }

  // ------------------------------------------------------------ updates and animation

  start(): void {
    this.renderAll();
    const tier = this.game.run.fight;
    this.app.say(tier === 'boss' ? '' : dealerLine(tier === 'elite' ? 'elite' : 'battle', this.game.n + this.game.run.battles));
  }

  onUpdate(u: Update): void {
    if (!this.game.battle) return;
    this.queue.push(...u.ev);
    if (!this.busy) void this.drain();
  }

  private async drain(): Promise<void> {
    this.busy = true;
    while (this.queue.length && !this.dead) {
      const ev = this.queue.shift()!;
      await this.animate(ev);
      if (this.dead || !this.app.session) return;
      if (ev.view) {
        this.shown = ev.view as BoardView;
        this.renderBoard();
        this.renderScales();
      }
    }
    this.busy = false;
    if (!this.dead && this.app.session?.game.battle) this.renderAll();
  }

  private speed(): number {
    return this.app.prefs.speed;
  }

  private center(uid: number): { x: number; y: number } | null {
    const el = this.minis.get(uid);
    if (!el) return null;
    return { x: parseFloat(el.style.left) + 60, y: parseFloat(el.style.top) + 40 };
  }

  private async animate(ev: Ev): Promise<void> {
    const k = ev.k;
    const s = this.speed();
    const wait = (ms: number) => sleep(ms * s);
    switch (k) {
      case 'attack': {
        const el = this.minis.get(ev.uid as number);
        if (el) {
          el.classList.remove('lunge-up', 'lunge-down');
          void el.offsetWidth;
          el.classList.add(ev.side === 'p' ? 'lunge-up' : 'lunge-down');
          sfx('attack');
        }
        await wait(230);
        return;
      }
      case 'dmg': {
        const el = this.minis.get(ev.uid as number);
        const at = this.center(ev.uid as number);
        if (el) {
          el.classList.remove('hit');
          void el.offsetWidth;
          el.classList.add('hit');
        }
        if (at) floatNum(this.root, at.x, at.y, `-${ev.n}`);
        sfx('hit');
        // Heavy hits hold for a moment so the blow lands.
        if ((ev.n as number) >= 6) {
          await wait(80);
          this.app.shake(3, 140);
        }
        await wait(150);
        return;
      }
      case 'die': {
        const el = this.minis.get(ev.uid as number);
        if (el) {
          el.classList.add('dying');
          this.minis.delete(ev.uid as number);
          setTimeout(() => el.remove(), 300);
        }
        sfx('die');
        await wait(180);
        return;
      }
      case 'scale': {
        const seat = ev.seat as Seat;
        const n = ev.n as number;
        if (n !== 0) {
          floatNum(this.root, seat === 0 ? 60 : 1500, 300, `${n > 0 ? '+' : ''}${n}`, n > 0 ? 'teeth' : '');
          sfx(n > 0 ? 'scaleUp' : 'scaleDown');
        }
        await wait(140);
        return;
      }
      case 'teeth':
        floatNum(this.root, (ev.seat as Seat) === 0 ? 60 : 1500, 250, `+${ev.n} teeth`, 'teeth');
        return;
      case 'candle':
        banner(this.root, `${this.charName(ev.seat as Seat)} loses a candle`, 'var(--candle)');
        this.app.say(dealerLine('candle', this.game.n));
        sfx('candle');
        music.stinger('candle');
        this.app.shake(8, 320);
        await wait(700);
        return;
      case 'dead':
        banner(this.root, `${this.charName(ev.seat as Seat)} is dead`, 'var(--danger)');
        this.app.shake(10, 420);
        this.app.say(dealerLine('dead', this.game.n));
        await wait(900);
        return;
      case 'doubled':
        banner(this.root, 'The enemies double up', 'var(--danger)');
        await wait(700);
        return;
      case 'won':
        banner(this.root, `${this.charName(ev.seat as Seat)} wins the half`, 'var(--candle)');
        sfx('win');
        await wait(600);
        return;
      case 'phase':
        banner(this.root, 'Next phase');
        this.app.say(String(ev.line ?? ''));
        await wait(900);
        return;
      case 'over':
        banner(this.root, ev.r === 'win' ? 'Victory' : 'Defeat', ev.r === 'win' ? 'var(--candle)' : 'var(--danger)');
        if (ev.r === 'win') this.app.say(dealerLine('win', this.game.n));
        music.stinger(ev.r === 'win' ? 'win' : 'lose');
        await wait(1100);
        return;
      case 'combat':
        sfx('bell');
        await wait(120);
        return;
      case 'enter':
      case 'advance':
      case 'move':
      case 'transform':
        if (ev.how !== 'debug') sfx(k === 'enter' ? 'place' : 'move');
        await wait(110);
        return;
      case 'play':
      case 'draw':
        sfx(k === 'draw' ? 'draw' : 'card');
        await wait(40);
        return;
      case 'hit': {
        const lane = ev.lane as number;
        floatNum(this.root, laneX(lane) + 60, ROW_Y.e + 60, '');
        return;
      }
      case 'blessed':
        banner(this.root, 'The King answers', 'var(--warn)');
        music.stinger('blessed');
        await wait(500);
        return;
      case 'houseRule':
        banner(this.root, 'New house rule', 'var(--warn)');
        this.app.say(String(ev.text ?? ''));
        await wait(900);
        return;
      case 'scavenge':
        sfx('place');
        await wait(150);
        return;
      case 'armor':
      case 'shield': {
        const at = this.center(ev.uid as number);
        if (at) floatNum(this.root, at.x, at.y, ev.k === 'armor' ? 'Armor' : 'Shield', 'good');
        await wait(120);
        return;
      }
      case 'coin':
        return;
      default:
        return;
    }
  }

  private charName(seat: Seat): string {
    return CHARACTERS[this.game.run.seats[seat].char].name;
  }

  // ------------------------------------------------------------ rendering

  renderAll(): void {
    if (!this.game.battle) return;
    this.shown = boardView(this.b);
    this.renderBoard();
    this.renderScales();
    this.renderPanels();
    this.renderPrompt();
    this.renderRules();
  }

  private rulesEl: HTMLDivElement | null = null;
  /** House rules in play this battle, shown above the queue row so both players can read them. */
  private renderRules(): void {
    this.rulesEl?.remove();
    const b = this.b;
    const boss = b.boss ? BOSSES.get(b.boss.id) : undefined;
    const lines: string[] = [];
    if (boss) lines.push(`${boss.name}, phase ${b.boss!.phase} of ${boss.phases.length}`);
    for (const r of b.rules) lines.push(ability(r).text);
    if (!lines.length) return;
    this.rulesEl = h('div', { style: { position: 'absolute', left: `${LEFT + 300}px`, top: '46px', color: 'var(--warn)', fontSize: '13px', zIndex: '5' } }, lines.join('  |  '));
    this.root.append(this.rulesEl);
  }

  private renderBoard(): void {
    const v = this.shown;
    if (!v) return;
    const seen = new Set<number>();
    for (const row of ['q', 'e', 'p'] as Row[]) {
      for (let lane = 0; lane < LANES; lane++) {
        const c = v[row][lane];
        const slot = this.slots.get(`${row}${lane}`)!;
        slot.classList.toggle('dead-lane', !v.seats[ownerOf(lane)].alive);
        if (!c) continue;
        seen.add(c.uid);
        let el = this.minis.get(c.uid);
        if (!el) {
          el = h('div', { class: 'mini', style: { left: `${laneX(lane)}px`, top: `${ROW_Y[row] + (row === 'e' ? -40 : row === 'p' ? 40 : -20)}px`, opacity: '0' } });
          const mini = el;
          el.addEventListener('click', (e) => {
            const ref = this.refOf(Number(mini.dataset.uid));
            if (ref) (e.altKey ? this.sendPing(ref.row, ref.lane) : this.clickSlot(ref.row, ref.lane));
          });
          inspectable(el, () => {
            const cur = this.findView(Number(mini.dataset.uid));
            return cur ? { id: cur.id, opts: { up: cur.up, ab: cur.ab, power: cur.power, health: cur.health, maxHealth: cur.maxHealth, cost: cur.cost } } : null;
          });
          this.board.append(el);
          this.minis.set(c.uid, el);
          const fresh = el;
          requestAnimationFrame(() => {
            fresh.style.opacity = '';
            fresh.style.top = `${ROW_Y[row]}px`;
          });
        } else {
          el.style.left = `${laneX(lane)}px`;
          el.style.top = `${ROW_Y[row]}px`;
        }
        fillMini(el, c, row === 'q');
        el.dataset.row = row;
      }
    }
    for (const [uid, el] of this.minis) {
      if (!seen.has(uid)) {
        el.remove();
        this.minis.delete(uid);
      }
    }
    this.highlight();
  }

  private findView(uid: number): CardView | null {
    const v = this.shown;
    if (!v) return null;
    for (const row of ['p', 'e', 'q'] as Row[]) for (const c of v[row]) if (c?.uid === uid) return c;
    return null;
  }

  private refOf(uid: number): SlotRef | null {
    const v = this.shown;
    if (!v) return null;
    for (const row of ['p', 'e', 'q'] as Row[]) {
      const lane = v[row].findIndex((c) => c?.uid === uid);
      if (lane >= 0) return { row, lane };
    }
    return null;
  }

  private renderScales(): void {
    const v = this.shown;
    if (!v) return;
    // The music leans in as the worse of the two scales leans toward a loss.
    const danger = Math.max(0, ...v.seats.filter((s) => s.alive && !s.won).map((s) => -s.scale / s.size));
    music.setIntensity(Math.min(1, danger * 1.3 + (v.turn > 8 ? 0.15 : 0)));
    for (const seat of [0, 1] as Seat[]) {
      const s = v.seats[seat];
      const el = this.scales[seat];
      const char = CHARACTERS[this.game.run.seats[seat].char];
      const candles = Array.from({ length: Math.max(s.candles, 2) }, (_, i) => `<div class="candle ${i < s.candles ? 'lit' : 'out'}"></div>`).join('');
      // The scale is a column of teeth: the ones above the line are won, the ones below are lost.
      const lead = s.won ? s.size : Math.max(-s.size, Math.min(s.size, s.scale));
      const teeth: string[] = [];
      for (let i = s.size; i >= 1; i--) teeth.push(`<div class="tooth ${lead >= i ? 'win' : ''}"></div>`);
      teeth.push('<div class="tooth mid"></div>');
      for (let i = 1; i <= s.size; i++) teeth.push(`<div class="tooth ${-lead >= i ? 'loss' : ''}"></div>`);
      el.innerHTML = `
        <div class="s-name" style="color:var(--seat-${seat})">${char.name.replace('Doctor ', 'Dr. ')}</div>
        <div class="candles">${candles}</div>
        <div class="s-cap">Win</div>
        <div class="teeth">${teeth.join('')}</div>
        <div class="s-cap">Lose</div>
        <div class="s-val">${s.won ? 'Won' : !s.alive ? 'Dead' : s.scale > 0 ? `+${s.scale}` : s.scale}</div>
        ${s.block ? `<div class="s-cap" style="color:var(--accent-2)">Block ${s.block}</div>` : ''}`;
    }
  }

  private renderPanels(): void {
    const b = this.b;
    for (const seat of [0, 1] as Seat[]) {
      const panel = this.panels[seat];
      clear(panel);
      const s = b.seats[seat];
      const mineSeat = this.mine.includes(seat);
      const char = CHARACTERS[this.game.run.seats[seat].char];
      const res = h('div', { class: 'res' });
      res.append(h('div', { class: 'r-head', style: { color: `var(--seat-${seat})` } }, char.name));
      if (!s.alive) {
        res.append(h('div', { class: 'r-dead' }, 'Dead until revived'));
        if (mineSeat && !b.over && b.seats[other(seat)].alive) {
          const used = s.ghost;
          const give = h('button', { disabled: used, onclick: () => this.act(seat, { t: 'ghost', kind: 'bone' }) }, 'Give a bone');
          const mark = h('button', { disabled: used, onclick: () => this.select({ kind: 'mark', seat, tg: [] }) }, 'Mark an enemy');
          hoverTip(give, 'Ghost turn', 'Once per turn, a dead player can help. Your partner gains 1 bone.');
          hoverTip(mark, 'Ghost turn', 'Once per turn, a dead player can help. The marked enemy takes 2 extra damage this turn.');
          res.append(give, mark);
        }
        panel.append(res);
        continue;
      }
      const stats = h('div', { class: 'r-stats' });
      const cells = h('div', { class: 'cells' });
      for (let i = 0; i < Math.max(s.maxEnergy, s.energy); i++) cells.append(h('div', { class: `cell ${i < s.energy ? 'full' : ''}` }));
      hoverTip(cells, `Energy ${s.energy} of ${s.maxEnergy}`, 'Spent on spells and machines. It refills every turn and grows by 1 each turn, up to 6.');
      stats.append(cells);
      const bones = h('div', { class: 'r-count', html: `${BONE_SVG}<span>${s.bones}</span>` });
      hoverTip(bones, 'Bones', 'You gain 1 when one of your creatures dies. Some cards cost bones.');
      stats.append(bones);
      if (s.block) {
        const block = h('div', { class: 'r-count block', html: `${SHIELD_SVG}<span>${s.block}</span>` });
        hoverTip(block, 'Block', 'Absorbs damage that enemies in your lanes would deal to your scale. It clears at the start of your turn.');
        stats.append(block);
      }
      res.append(stats);
      const chips = h('div', { class: 'r-chips' });
      if (s.c.devotion || (s.c.blessed ?? 0) > 0) {
        const dev = h('div', { class: `devotion ${(s.c.blessed ?? 0) > 0 ? 'blessed' : ''}` });
        for (let i = 0; i < 10; i++) dev.append(h('span', { class: i < (s.c.devotion ?? 0) ? 'on' : '' }));
        hoverTip(dev, (s.c.blessed ?? 0) > 0 ? 'Blessed' : `Devotion ${s.c.devotion ?? 0} of 10`, 'Pray to raise it. At 10 the King answers: you become Blessed until the end of your turn.');
        chips.append(dev);
      }
      for (const [st, n] of Object.entries(s.st)) {
        if (!n) continue;
        const chip = h('span', { class: 'chip-status' }, `${st[0].toUpperCase()}${st.slice(1)} ${n}`);
        hoverTip(chip, `${st[0].toUpperCase()}${st.slice(1)}`, `${n}.`);
        chips.append(chip);
      }
      for (const p of s.programs) {
        const text = ability(p.a).text.replace(/\{(\w+)\}/g, (_, k) => String(p.p?.[k] ?? ability(p.a).p?.[k] ?? ''));
        const chip = h('span', { class: 'chip-program' }, text.split('.')[0]);
        hoverTip(chip, `Program: ${text.split('.')[0]}`, text.split('.').slice(1).join('.').trim());
        chips.append(chip);
      }
      for (const p of s.powers) {
        const text = ability(p.a).text.replace(/\{(\w+)\}/g, (_, k) => String(p.p?.[k] ?? ability(p.a).p?.[k] ?? ''));
        const chip = h('span', { class: 'chip-power' }, 'Power');
        hoverTip(chip, 'Power', text);
        chips.append(chip);
      }
      if (chips.childElementCount) res.append(chips);
      const wantDraw = mineSeat && needsDraw(b, seat) && !b.over;
      const piles = h('div', { class: 'r-piles' });
      const pile = (label: string, count: number, from: 'main' | 'side', help: string) => {
        const can = wantDraw && count > 0;
        const el = h('div', { class: `pile-stack ${can ? 'want' : ''} ${count === 0 ? 'empty' : ''} ${from}`, onclick: () => can && this.act(seat, { t: 'draw', from }) },
          h('div', { class: 'back' }), h('div', { class: 'back' }), h('div', { class: 'back' }), h('div', { class: 'pile-count' }, String(count)), h('div', { class: 'pile-label' }, label));
        hoverTip(el, label, help);
        return el;
      };
      piles.append(
        pile('Deck', s.deck.length + s.discard.length, 'main', `Draw your next card. ${s.discard.length ? `${s.discard.length} played spells shuffle back in when it runs out.` : ''}`),
        pile('Side', s.side.length, 'side', 'Draw a Placeholder: a free 0/2 creature to block a lane or sacrifice for blood.'),
      );
      res.append(piles);
      const items = h('div', { class: 'r-items' });
      s.items.forEach((id, slot) => {
        if (!id) return;
        const def = ITEMS.get(id)!;
        const icon = h('button', { class: 'item-slot', disabled: !mineSeat, onclick: () => this.select({ kind: 'item', seat, slot, tg: [] }) }, def.name.slice(0, 1));
        hoverTip(icon, def.name, def.text);
        items.append(icon);
      });
      if (s.items.some(Boolean)) res.append(items);
      if (mineSeat && !this.app.solo()) this.root.append(this.bell(s.rung ? 'rung' : !s.drew || b.over !== null ? 'off' : 'ready', () => this.act(seat, { t: s.rung ? 'unring' : 'ring' }), s.rung ? 'Waiting for your partner' : 'Strike the bell'));
      if (!mineSeat && s.rung) res.append(h('div', { class: 'r-rung' }, 'Rang the bell'));
      panel.append(res);
      panel.append(this.renderHand(seat, mineSeat));
    }
    this.soloBell?.remove();
    this.soloBell = null;
    for (const old of this.root.querySelectorAll('.bell-obj')) old.remove();
    if (this.app.solo()) {
      const allDrew = b.seats.every((x) => !x.alive || x.drew);
      this.soloBell = this.bell(allDrew && b.over === null ? 'ready' : 'off', () => this.ringAll(), allDrew ? 'Strike the bell' : 'Draw first');
      this.soloBell.classList.add('solo');
      this.root.append(this.soloBell);
    }
  }

  private soloBell: HTMLDivElement | null = null;

  /** The bell is an object you strike, not a button. */
  private bell(state: 'ready' | 'rung' | 'off', onRing: () => void, label: string): HTMLDivElement {
    const el = h('div', {
      class: `bell-obj ${state}`,
      onclick: () => {
        if (state === 'off') return;
        el.classList.add('ringing');
        onRing();
      },
    }, h('div', { class: 'knob' }), h('div', { class: 'dome' }), h('div', { class: 'lip' }), h('div', { class: 'clapper' }), h('div', { class: 'bell-label' }, label));
    hoverTip(el, 'The bell', 'Ends your turn. Your creatures attack, then the enemy attacks and moves up.');
    return el;
  }

  private renderHand(seat: Seat, mineSeat: boolean): HTMLDivElement {
    const s = this.b.seats[seat];
    const hand = h('div', { class: 'hand' });
    const n = s.hand.length;
    const scale = 0.55;
    const w = 280 * scale;
    const step = n > 1 ? Math.min(w + 6, (530 - w) / (n - 1)) : 0;
    s.hand.forEach((c, i) => {
      if (!mineSeat) {
        hand.append(h('div', { class: 'hand-back', style: { left: `${i * Math.min(60, step)}px`, top: '40px' } }));
        return;
      }
      const picked = this.sel?.kind === 'card' && this.sel.uid === c.uid;
      const cost = costOf(this.b, seat, c);
      const cant = s.energy < cost.energy || s.bones < cost.bones || hasKw(c, 'Unplayable');
      const el = fullCard(c.id, { up: c.up, ab: c.ab, power: c.power, health: c.health, maxHealth: c.maxHealth, cost: c.cost, k: scale, cls: `${picked ? 'picked' : ''} ${cant ? 'cant' : ''}` });
      el.style.setProperty('--s', String(scale));
      el.style.left = `${i * step}px`;
      el.style.top = picked ? '-14px' : '8px';
      el.addEventListener('click', () => this.clickHand(seat, c.uid));
      el.addEventListener('mouseenter', () => inspectCard(c.id, { up: c.up, ab: c.ab, power: c.power, health: c.health, cost: costOf(this.b, seat, c) }, el.getBoundingClientRect()));
      el.addEventListener('mouseleave', hideInspect);
      hand.append(el);
    });
    return hand;
  }

  // ------------------------------------------------------------ input

  private sendPing(row: Row, lane: number): void {
    this.app.ping({ ping: { kind: 'slot', row, lane } });
    this.showPing(row, lane);
  }

  ping(p: Presence): void {
    if (p.ping?.kind === 'slot' && p.ping.row && p.ping.lane !== undefined) this.showPing(p.ping.row as Row, p.ping.lane);
  }

  private showPing(row: Row, lane: number): void {
    const mark = h('div', { class: 'ping-mark', style: { left: `${laneX(lane) + LANE_W / 2}px`, top: `${ROW_Y[row] + 80}px` } });
    this.root.append(mark);
    setTimeout(() => mark.remove(), 1900);
  }

  private act(seat: Seat, a: BattleAction): void {
    if (this.busy) return;
    hideInspect();
    const err = this.app.send(seat, { t: 'b', a });
    if (err) toast(this.root, err);
    this.sel = null;
    this.renderPrompt();
  }

  private ringAll(): void {
    if (this.busy) return;
    for (const seat of [0, 1] as Seat[]) {
      const s = this.b?.seats[seat];
      if (!s || !s.alive || s.rung) continue;
      const err = this.app.send(seat, { t: 'b', a: { t: 'ring' } });
      if (err) {
        toast(this.root, err);
        return;
      }
      if (!this.game.battle || this.game.battle.over) return;
    }
  }

  private select(sel: Sel): void {
    if (this.busy) return;
    this.sel = sel;
    this.advanceSel();
  }

  private cancel(): void {
    this.sel = null;
    this.renderPanels();
    this.renderPrompt();
    this.highlight();
  }

  private clickHand(seat: Seat, uid: number): void {
    if (this.busy || !this.mine.includes(seat)) return;
    if (this.sel?.kind === 'card' && this.sel.uid === uid) return this.cancel();
    const b = this.b;
    if (needsDraw(b, seat)) return toast(this.root, 'Draw a card first');
    const c = b.seats[seat].hand.find((x) => x.uid === uid)!;
    const cost = costOf(b, seat, c);
    if (b.seats[seat].energy < cost.energy) return toast(this.root, 'Not enough energy');
    if (b.seats[seat].bones < cost.bones) return toast(this.root, 'Not enough bones');
    this.select({ kind: 'card', seat, uid, sac: [], tg: [] });
  }

  private need(): Need | null {
    const sel = this.sel;
    if (!sel) return null;
    const b = this.b;
    if (sel.kind === 'mark') return sel.tg.length ? { kind: 'ready' } : { kind: 'tg', spec: { row: 'e', who: 'partner' }, i: 0 };
    if (sel.kind === 'item') {
      const def = ITEMS.get(b.seats[sel.seat].items[sel.slot]!)!;
      if (sel.tg.length < def.tg.length) return { kind: 'tg', spec: def.tg[sel.tg.length], i: sel.tg.length };
      return { kind: 'ready' };
    }
    const c = b.seats[sel.seat].hand.find((x) => x.uid === sel.uid);
    if (!c) return null;
    const def = cardDef(c.id);
    const cost = costOf(b, sel.seat, c);
    const paid = sel.sac.reduce((a, lane) => a + (b.p[lane] ? sacValue(b.p[lane]!) : 0), 0);
    if (cost.blood > paid) return { kind: 'sac', n: cost.blood - paid };
    if (def.kind === 'creature' && sel.lane === undefined) return { kind: 'lane' };
    if (sel.tg.length < def.tg.length) return { kind: 'tg', spec: def.tg[sel.tg.length], i: sel.tg.length };
    return { kind: 'ready' };
  }

  private advanceSel(): void {
    const need = this.need();
    if (need?.kind === 'ready') return this.commit();
    if (need?.kind === 'lane' && this.sel?.kind === 'card') {
      const options = this.validRefs(need);
      if (options.length === 1 && this.sel.sac.length === 1) {
        this.sel.lane = options[0].lane;
        return this.advanceSel();
      }
    }
    this.renderPanels();
    this.renderPrompt();
    this.highlight();
  }

  private commit(): void {
    const sel = this.sel!;
    if (sel.kind === 'mark') return this.act(sel.seat, { t: 'ghost', kind: 'mark', tg: sel.tg[0] });
    if (sel.kind === 'item') return this.act(sel.seat, { t: 'item', slot: sel.slot, tg: sel.tg });
    const a: BattleAction = { t: 'play', uid: sel.uid, lane: sel.lane, sac: sel.sac, tg: sel.tg };
    const err = legal(this.b, sel.seat, a);
    if (err) {
      toast(this.root, err);
      return this.cancel();
    }
    this.act(sel.seat, a);
  }

  private validRefs(need: Need): SlotRef[] {
    const sel = this.sel;
    if (!sel) return [];
    const b = this.b;
    const out: SlotRef[] = [];
    if (need.kind === 'sac') {
      for (const lane of lanesOf(sel.seat)) if (b.p[lane]) out.push({ row: 'p', lane });
    } else if (need.kind === 'lane' && sel.kind === 'card') {
      for (const lane of lanesOf(sel.seat)) {
        const occ = b.p[lane];
        if (!occ || (sel.sac.includes(lane) && !hasKw(occ, 'Spare Lives'))) out.push({ row: 'p', lane });
      }
    } else if (need.kind === 'tg') {
      const seat = sel.kind === 'mark' ? other(sel.seat) : sel.seat;
      for (const row of (need.spec.row === 'lane' ? ['p'] : [need.spec.row]) as Row[]) {
        for (let lane = 0; lane < LANES; lane++) {
          const ref = { row, lane };
          if (sel.kind === 'mark') {
            if (ownerOf(lane) === seat && b.e[lane]) out.push(ref);
          } else if (!targetOk(b, sel.seat, need.spec, ref)) out.push(ref);
        }
      }
    }
    return out;
  }

  private clickSlot(row: Row, lane: number): void {
    if (this.busy) return;
    const sel = this.sel;
    const need = this.need();
    if (!sel || !need || need.kind === 'ready') return;
    const valid = this.validRefs(need);
    const hit = valid.find((r) => r.lane === lane && (need.kind === 'tg' && need.spec.row === 'lane' ? true : r.row === row));
    if (!hit) return;
    if (need.kind === 'sac' && sel.kind === 'card') {
      sel.sac = sel.sac.includes(lane) ? sel.sac.filter((l) => l !== lane) : [...sel.sac, lane];
    } else if (need.kind === 'lane' && sel.kind === 'card') {
      sel.lane = lane;
    } else if (need.kind === 'tg') {
      sel.tg.push(hit);
    }
    this.advanceSel();
  }

  private highlight(): void {
    for (const slot of this.slots.values()) slot.classList.remove('live');
    for (const el of this.minis.values()) el.classList.remove('target', 'sac');
    const sel = this.sel;
    const need = this.need();
    if (!sel || !need) return;
    if (sel.kind === 'card') {
      for (const lane of sel.sac) {
        const c = this.b.p[lane];
        if (c) this.minis.get(c.uid)?.classList.add('sac');
      }
    }
    for (const ref of this.validRefs(need)) {
      const rows: Row[] = need.kind === 'tg' && need.spec.row === 'lane' ? ['p', 'e'] : [ref.row];
      for (const row of rows) {
        this.slots.get(`${row}${ref.lane}`)?.classList.add('live');
        const c = this.shown?.[row][ref.lane];
        if (c) this.minis.get(c.uid)?.classList.add('target');
      }
    }
  }

  private renderPrompt(): void {
    const need = this.need();
    const sel = this.sel;
    let text = '';
    if (sel && need) {
      if (need.kind === 'sac') text = `Choose ${need.n} more blood to sacrifice`;
      else if (need.kind === 'lane') text = 'Choose a lane for the creature';
      else if (need.kind === 'tg') text = sel.kind === 'mark' ? 'Choose an enemy in your partner\'s lanes to mark' : TARGET_PROMPT(need.spec);
      text += '. Right click to cancel.';
    } else if (this.game.battle && !this.game.battle.over) {
      const wait = this.mine.filter((s) => needsDraw(this.b, s));
      if (wait.length) text = `Draw a card for ${wait.map((s) => this.charName(s)).join(' and ')}: click Deck or Side.`;
    }
    this.promptEl.textContent = text;
    this.promptEl.style.display = text ? '' : 'none';
  }
}
