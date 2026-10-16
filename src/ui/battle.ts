import { costOf, legal, needsDraw, sacValue, targetOk } from '../engine/battle.ts';
import { hasKw } from '../engine/fx.ts';
import { ability, BOSSES, card as cardDef, ITEMS, RELICS, type TargetSpec } from '../engine/registry.ts';
import { LANES, lanesOf, other, ownerOf, type Battle, type BattleAction, type Ev, type Row, type Seat, type SlotRef } from '../engine/types.ts';
import { CHARACTERS } from '../content/index.ts';
import { dealerLine } from '../content/dealer.ts';
import { fillMini, fullCard } from './card.ts';
import { banner, clear, floatNum, h, sleep, toast } from './dom.ts';
import { hideInspect, inspectable, inspectCard } from './inspect.ts';
import { hoverTip } from './hud.ts';
import { grid } from './grid.ts';
import type { App } from './app.ts';
import type { Presence, Update } from './session.ts';
import { boardView, terrainView, type BoardView, type CardView } from './view.ts';
import { sfx } from '../audio/sfx.ts';
import { music } from '../audio/music.ts';

const BONE_SVG = '<span class="spr spr-bone"></span>';
const SHIELD_SVG = '<span class="spr spr-shield"></span>';

const LEFT = 158;
const LANE_W = 150;
const GAP = 8;
const SEAM = 28;
const ROW_Y: Record<Row, number> = { q: 52, e: 212, p: 408 };
export const laneX = (lane: number) => LEFT + lane * (LANE_W + GAP) + (lane >= 4 ? SEAM : 0);

type Sel =
  | null
  | { kind: 'card'; seat: Seat; uid: number; sac: number[]; lane?: number; want?: number; tg: SlotRef[] }
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
    const typing = e.target instanceof HTMLInputElement;
    if (!typing && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'd' || e.key === 'D' || e.key === 's' || e.key === 'S')) {
      this.pendingDraw = e.key.toLowerCase() === 'd' ? 'main' : 'side';
      if (!this.busy) this.drawFromKey();
    }
    if (e.code === 'Space' && !typing && !e.repeat) {
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      this.root.querySelector<HTMLElement>('.bell-obj.ready, .bell-obj.rung')?.click();
    }
  };
  private drag: { seat: Seat; uid: number; startX: number; startY: number; grabX: number; grabY: number; live: boolean; ghost: HTMLDivElement | null } | null = null;
  private hoverSlot: HTMLElement | null = null;
  private suppressClick = false;
  /** A draw key pressed during an animation, used once it ends. */
  private pendingDraw: 'main' | 'side' | null = null;

  private drawFromKey(): void {
    const from = this.pendingDraw;
    this.pendingDraw = null;
    if (!from || !this.game.battle) return;
    const seat = this.mine.find((x) => needsDraw(this.b, x) && !this.b.over);
    if (seat !== undefined) this.act(seat, { t: 'draw', from });
  }

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
        slot.dataset.row = row;
        slot.dataset.lane = String(lane);
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
    this.choiceEl?.remove();
    this.queue = [];
    window.removeEventListener('keydown', this.keyHandler);
    this.endDrag();
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
    if (!this.dead && this.pendingDraw) this.drawFromKey();
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
      case 'relight':
        banner(this.root, `${this.charName(ev.seat as Seat)} keeps a candle lit`, 'var(--candle)');
        sfx('candle');
        await wait(600);
        return;
      case 'relicBreak':
        banner(this.root, `${RELICS.get(ev.id as string)?.name ?? 'A relic'} breaks`, 'var(--accent-2)');
        await wait(500);
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
      case 'terrain': {
        const lane = ev.lane as number;
        if (ev.a) floatNum(this.root, laneX(lane) + 40, ROW_Y.p + 150, terrainView(ev.a as string, {}).name, 'good');
        sfx('place');
        await wait(220);
        return;
      }
      case 'bond': {
        for (const uid of [ev.a, ev.b] as number[]) {
          const at = this.center(uid);
          if (at) floatNum(this.root, at.x, at.y, 'Bond', 'good');
        }
        sfx('card');
        await wait(220);
        return;
      }
      case 'bondShare': {
        const at = this.center(ev.to as number);
        if (at) floatNum(this.root, at.x, at.y - 30, 'Shared', '');
        return;
      }
      case 'later':
        floatNum(this.root, (ev.seat as Seat) === 0 ? 400 : 1200, 600, 'Next turn', 'good');
        await wait(150);
        return;
      case 'laterDue':
        banner(this.root, ability(ev.a as string).text.split('.')[0], 'var(--accent-2)');
        await wait(450);
        return;
      case 'upgrade':
        sfx('card');
        await wait(120);
        return;
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
    this.renderChoice();
    if (this.sel) this.highlight();
  }

  private choiceEl: HTMLDivElement | null = null;
  /** A sheet of options while one of this screen's seats has a choice to make. */
  private renderChoice(): void {
    this.choiceEl?.remove();
    this.choiceEl = null;
    const ch = this.b.choice;
    if (!ch || !this.mine.includes(ch.seat) || this.b.over) return;
    const s = this.b.seats[ch.seat];
    const find = (uid: number) => [...s.hand, ...s.deck, ...s.discard, ...this.b.seats[other(ch.seat)].hand].find((x) => x.uid === uid);
    const sheet = h('div', { class: 'deck-view choice-view' },
      h('div', { class: 'deck-head' }, h('h2', {}, this.app.solo() ? `${this.charName(ch.seat)}: ${ch.prompt}` : ch.prompt)));
    const row = h('div', { class: 'deck-grid' });
    ch.options.forEach((o, i) => {
      const inst = o.uid !== undefined ? find(o.uid) : undefined;
      const el = inst
        ? fullCard(inst.id, { up: inst.up, ab: inst.ab, power: inst.power, health: inst.health, maxHealth: inst.maxHealth, cost: inst.cost, scale: 0.6 })
        : fullCard(o.id, { up: o.up, scale: 0.6 });
      const cell = h('div', { class: 'offer', style: { width: '168px', height: '235px' }, onclick: () => this.act(ch.seat, { t: 'choose', i }) }, el);
      inspectable(cell, () => (inst ? { id: inst.id, opts: { up: inst.up, ab: inst.ab, power: inst.power, health: inst.health } } : { id: o.id, opts: { up: o.up } }));
      row.append(cell);
    });
    sheet.append(row);
    this.root.append(sheet);
    this.choiceEl = sheet;
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
    this.renderTerrain(v);
    this.highlight();
  }

  private terrainEls: HTMLDivElement[] = [];
  /** A strip under each lane that has terrain, naming it, with its rules on hover. */
  private renderTerrain(v: BoardView): void {
    for (const el of this.terrainEls) el.remove();
    this.terrainEls = [];
    (v.terrain ?? []).forEach((t, lane) => {
      this.slots.get(`p${lane}`)?.classList.toggle('has-terrain', !!t);
      if (!t) return;
      const el = h('div', { class: `terrain-strip t-${t.a.replace(/[^a-z0-9]+/gi, '-')}`, style: { left: `${laneX(lane)}px`, top: `${ROW_Y.p + 190}px` } }, t.name);
      hoverTip(el, t.name, t.text);
      this.board.append(el);
      this.terrainEls.push(el);
    });
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
    // Old bells go first: the loop below adds the co-op bell, and the solo bell comes after it.
    for (const old of this.root.querySelectorAll('.bell-obj')) old.remove();
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
      for (const l of s.later ?? []) {
        const what = ability(l.a).text.split('.')[0];
        const chip = h('span', { class: 'chip-later' }, l.turns > 1 ? `In ${l.turns} turns` : 'Next turn');
        hoverTip(chip, l.turns > 1 ? `In ${l.turns} turns` : 'Next turn', `${what}.`);
        chips.append(chip);
      }
      if ((s.c.cardsTurn ?? 0) > 0) {
        const chip = h('span', { class: 'chip-combo' }, `Played ${s.c.cardsTurn}`);
        hoverTip(chip, 'Played this turn', `${s.c.cardsTurn ?? 0} cards, ${s.c.spellsTurn ?? 0} of them spells. Cards that count plays read this.`);
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
      if (mineSeat && !this.app.solo()) {
        const choosing = b.choice?.seat === seat;
        const state = s.rung ? 'rung' : !s.drew || b.over !== null || choosing ? 'off' : 'ready';
        const [main, sub] = s.rung ? ['Waiting', 'Click to take back'] : choosing ? ['Choose first', 'Pick an option'] : state === 'off' ? ['Draw first', 'Deck or Side'] : ['End turn', 'Space'];
        this.root.append(this.bell(state, () => this.act(seat, { t: s.rung ? 'unring' : 'ring' }), main, sub, state === 'ready' && !this.canPlayAny([seat])));
      }
      if (!mineSeat && s.rung) res.append(h('div', { class: 'r-rung' }, 'Rang the bell'));
      panel.append(res);
      panel.append(this.renderHand(seat, mineSeat));
    }
    this.soloBell = null;
    if (this.app.solo()) {
      const allDrew = b.seats.every((x) => !x.alive || x.drew);
      const live = this.mine.filter((x) => b.seats[x].alive);
      const choosing = !!b.choice;
      const go = allDrew && b.over === null && !choosing;
      this.soloBell = this.bell(go ? 'ready' : 'off', () => this.ringAll(), choosing ? 'Choose first' : allDrew ? 'End turn' : 'Draw first', choosing ? 'Pick an option' : allDrew ? 'Space' : 'Deck or Side', go && !this.canPlayAny(live));
      this.soloBell.classList.add('solo');
      this.root.append(this.soloBell);
    }
  }

  private soloBell: HTMLDivElement | null = null;

  /** The bell that ends the turn, with a plate under it naming what it does. It pulses when nothing in hand is playable. */
  private bell(state: 'ready' | 'rung' | 'off', onRing: () => void, main: string, sub: string, idle: boolean): HTMLDivElement {
    const el = h('div', {
      class: `bell-obj ${state} ${idle ? 'idle' : ''}`,
      onclick: () => {
        if (state === 'off') return;
        el.classList.add('ringing');
        onRing();
      },
    },
      h('div', { class: 'bell-sprite' }),
      h('div', { class: 'bell-plate' }, h('div', { class: 'bell-main' }, main), h('div', { class: 'bell-sub' }, sub)),
    );
    hoverTip(el, 'End turn', 'Your creatures attack, then the enemy attacks and moves up. Press Space to ring the bell.');
    return el;
  }

  /** Whether any card in these seats' hands could be paid for right now. */
  private canPlayAny(seats: Seat[]): boolean {
    const b = this.b;
    return seats.some((seat) => {
      const s = b.seats[seat];
      const blood = lanesOf(seat).reduce((n, lane) => n + (b.p[lane] ? sacValue(b.p[lane]!) : 0), 0);
      return s.hand.some((c) => {
        const cost = costOf(b, seat, c);
        return !hasKw(c, 'Unplayable') && cost.energy <= s.energy && cost.bones <= s.bones && cost.blood <= blood;
      });
    });
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
      const el = fullCard(c.id, { up: c.up, ab: c.ab, power: c.power, health: c.health, maxHealth: c.maxHealth, cost: costOf(this.b, seat, c), k: scale, cls: `${picked ? 'picked' : ''} ${cant ? 'cant' : ''}` });
      el.style.setProperty('--s', String(scale));
      el.style.left = `${i * step}px`;
      el.style.top = picked ? '-14px' : '8px';
      if (this.drag?.live && this.drag.uid === c.uid) el.classList.add('dragging');
      el.addEventListener('pointerdown', (e) => this.pressHand(e, seat, c.uid, el));
      el.addEventListener('click', () => (this.suppressClick ? undefined : this.clickHand(seat, c.uid)));
      el.addEventListener('mouseenter', () => !this.drag?.live && inspectCard(c.id, { up: c.up, ab: c.ab, power: c.power, health: c.health, cost: costOf(this.b, seat, c) }, el.getBoundingClientRect()));
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
      const want = this.sel.want;
      if (want !== undefined && options.some((o) => o.lane === want)) {
        this.sel.lane = want;
        return this.advanceSel();
      }
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

  private clickSlot(row: Row, lane: number): boolean {
    if (this.busy) return false;
    const sel = this.sel;
    const need = this.need();
    if (!sel || !need || need.kind === 'ready') return false;
    const valid = this.validRefs(need);
    const hit = valid.find((r) => r.lane === lane && (need.kind === 'tg' && need.spec.row === 'lane' ? true : r.row === row));
    if (!hit) return false;
    if (need.kind === 'sac' && sel.kind === 'card') {
      sel.sac = sel.sac.includes(lane) ? sel.sac.filter((l) => l !== lane) : [...sel.sac, lane];
    } else if (need.kind === 'lane' && sel.kind === 'card') {
      sel.lane = lane;
    } else if (need.kind === 'tg') {
      sel.tg.push(hit);
    }
    this.advanceSel();
    return true;
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
    this.board.classList.toggle('drop-any', !!this.drag?.live && need.kind === 'ready');
    for (const ref of this.drag?.live ? this.dropRefs(need) : this.validRefs(need)) {
      const rows: Row[] = need.kind === 'tg' && need.spec.row === 'lane' ? ['p', 'e'] : [ref.row];
      for (const row of rows) {
        this.slots.get(`${row}${ref.lane}`)?.classList.add('live');
        const c = this.shown?.[row][ref.lane];
        if (c) this.minis.get(c.uid)?.classList.add('target');
      }
    }
  }

  // ------------------------------------------------------------ dragging

  private pressHand(e: PointerEvent, seat: Seat, uid: number, el: HTMLElement): void {
    if (e.button !== 0 || this.busy || !this.mine.includes(seat)) return;
    const r = el.getBoundingClientRect();
    const s = grid.s;
    this.drag = { seat, uid, startX: e.clientX, startY: e.clientY, grabX: (e.clientX - r.left) / s, grabY: (e.clientY - r.top) / s, live: false, ghost: null };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
  }

  private onMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d) return;
    if (!d.live) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 8) return;
      if (!this.beginDrag(d)) return this.endDrag();
    }
    const [x, y] = this.toStage(e.clientX, e.clientY);
    d.ghost!.style.left = `${x - d.grabX}px`;
    d.ghost!.style.top = `${y - d.grabY}px`;
    const ref = this.refAt(e.clientX, e.clientY);
    const need = this.need();
    const ok = ref && need && this.dropRefs(need).some((r) => r.lane === ref.lane && (r.row === ref.row || (need.kind === 'tg' && need.spec.row === 'lane')));
    const slot = ok ? this.slots.get(`${ref.row}${ref.lane}`) ?? null : null;
    if (slot !== this.hoverSlot) {
      this.hoverSlot?.classList.remove('drop-hover');
      slot?.classList.add('drop-hover');
      this.hoverSlot = slot;
    }
  };

  private onUp = (e: PointerEvent): void => {
    const d = this.drag;
    const live = !!d?.live;
    this.endDrag();
    if (!d || !live) return;
    // The click that follows this pointerup must not select the card again.
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false), 0);
    this.drop(e.clientX, e.clientY);
  };

  private onCancel = (): void => {
    const live = !!this.drag?.live;
    this.endDrag();
    if (live) this.cancel();
  };

  private beginDrag(d: NonNullable<BattleScreen['drag']>): boolean {
    const b = this.b;
    if (needsDraw(b, d.seat)) return toast(this.root, 'Draw a card first'), false;
    const c = b.seats[d.seat].hand.find((x) => x.uid === d.uid);
    if (!c) return false;
    const cost = costOf(b, d.seat, c);
    if (b.seats[d.seat].energy < cost.energy) return toast(this.root, 'Not enough energy'), false;
    if (b.seats[d.seat].bones < cost.bones) return toast(this.root, 'Not enough bones'), false;
    hideInspect();
    d.live = true;
    this.sel = { kind: 'card', seat: d.seat, uid: d.uid, sac: [], tg: [] };
    d.ghost = h('div', { class: 'drag-ghost' }, fullCard(c.id, { up: c.up, ab: c.ab, power: c.power, health: c.health, maxHealth: c.maxHealth, cost: c.cost, scale: 0.55 }));
    this.root.append(d.ghost);
    this.renderPanels();
    this.renderPrompt();
    this.highlight();
    return true;
  }

  private endDrag(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    this.drag?.ghost?.remove();
    this.hoverSlot?.classList.remove('drop-hover');
    this.hoverSlot = null;
    this.board.classList.remove('drop-any');
    this.drag = null;
  }

  private drop(x: number, y: number): void {
    const sel = this.sel;
    const need = this.need();
    if (!sel || sel.kind !== 'card' || !need) return this.cancel();
    const [, sy] = this.toStage(x, y);
    // The seat panels start at 618, so anything above that is the board.
    const onBoard = sy < 618;
    const ref = this.refAt(x, y);
    if (need.kind === 'ready') return onBoard ? this.commit() : this.cancel();
    if (need.kind === 'sac') {
      if (ref && ref.row === 'p' && lanesOf(sel.seat).includes(ref.lane)) {
        sel.want = ref.lane;
        if (this.b.p[ref.lane]) this.clickSlot('p', ref.lane);
        else this.advanceSel();
        return;
      }
      return onBoard ? this.advanceSel() : this.cancel();
    }
    if (!ref || !this.clickSlot(ref.row, ref.lane)) this.cancel();
  }

  /** Where a dragged card may land: the same as a click, plus your own lanes for a card that still needs blood. */
  private dropRefs(need: Need): SlotRef[] {
    const sel = this.sel;
    if (need.kind === 'sac' && sel?.kind === 'card') return lanesOf(sel.seat).map((lane) => ({ row: 'p' as Row, lane }));
    return this.validRefs(need);
  }

  private toStage(x: number, y: number): [number, number] {
    const r = this.app.stage.getBoundingClientRect();
    return [(x - r.left) / grid.s, (y - r.top) / grid.s];
  }

  /** The board slot under a window point, through any creature standing in it. */
  private refAt(x: number, y: number): SlotRef | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const node = el as HTMLElement;
      if (node.dataset.row && node.dataset.lane !== undefined) return { row: node.dataset.row as Row, lane: Number(node.dataset.lane) };
      const mini = node.closest<HTMLElement>('.mini');
      if (mini?.dataset.uid) {
        const ref = this.refOf(Number(mini.dataset.uid));
        if (ref) return ref;
      }
    }
    return null;
  }

  private renderPrompt(): void {
    const need = this.need();
    const sel = this.sel;
    let text = '';
    if (sel && need && this.drag?.live) {
      if (need.kind === 'ready') text = 'Drop it on the board to cast it';
      else if (need.kind === 'sac') text = 'Drop it on a creature to sacrifice it there, or in an empty lane';
      else if (need.kind === 'lane') text = 'Drop it in one of your lanes';
      else if (need.kind === 'tg') text = TARGET_PROMPT(need.spec);
      text += '. Drop it back on your hand to cancel.';
    } else if (sel && need) {
      if (need.kind === 'sac') text = `Choose ${need.n} more blood to sacrifice`;
      else if (need.kind === 'lane') text = 'Choose a lane for the creature';
      else if (need.kind === 'tg') text = sel.kind === 'mark' ? 'Choose an enemy in your partner\'s lanes to mark' : TARGET_PROMPT(need.spec);
      text += '. Right click to cancel.';
    } else if (this.game.battle && !this.game.battle.over) {
      const wait = this.mine.filter((s) => needsDraw(this.b, s));
      if (wait.length) text = `Draw a card for ${wait.map((s) => this.charName(s)).join(' and ')}: click a pile, or press D or S.`;
    }
    this.promptEl.textContent = text;
    this.promptEl.style.display = text ? '' : 'none';
  }
}
