// The in-world HUD: the act label, Your Best Friend's speech floating in the void, one pause button, and a plate for
// each character with candles, teeth, relics, and items drawn as objects rather than form controls.
import { CHARACTERS } from '../content/index.ts';
import { QUICK_LINES } from '../content/quicklines.ts';
import { ITEMS, RELICS } from '../engine/registry.ts';
import type { Seat } from '../engine/types.ts';
import type { App } from './app.ts';
import { DeckView } from './deckview.ts';
import { clear, h } from './dom.ts';
import { markTerms } from '../engine/text.ts';

const ROMAN = ['', 'I', 'II', 'III'];

let tipEl: HTMLDivElement | null = null;

/** A hover tip in the game's own style, used in place of the browser's title tooltips. */
export function hoverTip(el: HTMLElement, title: string, text = ''): void {
  el.addEventListener('mouseenter', () => {
    tipEl?.remove();
    const body = h('div', {});
    body.append(...markTerms(text).map((s) => (s.b ? h('b', { style: { display: 'inline', fontSize: 'inherit', color: 'var(--accent-2)' } }, s.t) : document.createTextNode(s.t))));
    tipEl = h('div', { class: 'tip hud-tip' }, h('b', {}, title), body);
    document.getElementById('overlay-root')!.append(tipEl);
    const r = el.getBoundingClientRect();
    const w = 260;
    tipEl.style.left = `${Math.max(4, Math.min(window.innerWidth - w - 4, r.left + r.width / 2 - w / 2))}px`;
    const below = r.bottom + 8;
    tipEl.style.top = below + 120 > window.innerHeight ? `${r.top - 8 - tipEl.offsetHeight}px` : `${below}px`;
  });
  el.addEventListener('mouseleave', () => {
    tipEl?.remove();
    tipEl = null;
  });
}

export function candleRow(n: number, max = Math.max(n, 2)): HTMLDivElement {
  const row = h('div', { class: 'candles' });
  for (let i = 0; i < max; i++) row.append(h('div', { class: `candle ${i < n ? 'lit' : 'out'}` }));
  return row;
}

export function toothCount(n: number): HTMLDivElement {
  return h('div', { class: 'tooth-count' }, h('span', { class: 'tooth win' }), String(n));
}

export class Hud {
  readonly root: HTMLDivElement;
  readonly speech: HTMLDivElement;
  private app: App;
  private act: HTMLDivElement;
  private status: HTMLDivElement;
  private plates: HTMLDivElement;
  private menu: HTMLDivElement | null = null;

  constructor(app: App) {
    this.app = app;
    this.root = h('div', { class: 'hud' });
    this.act = h('div', { class: 'hud-act boil' });
    this.speech = h('div', { class: 'hud-speech' });
    this.status = h('div', { class: 'hud-status' });
    this.plates = h('div', { class: 'hud-plates' });
    const pause = h('button', { class: 'hud-pause', 'aria-label': 'Menu', onclick: () => this.openMenu() }, h('span', {}), h('span', {}), h('span', {}));
    this.root.append(this.act, this.speech, pause, this.status, this.plates);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.menu) this.closeMenu();
    });
  }

  /** Plates show on the map and between fights. A battle draws its own seat panels instead. */
  update(showPlates: boolean): void {
    const g = this.app.session?.game;
    if (!g) return;
    this.act.textContent = `ACT ${ROMAN[Math.min(3, g.run.act)] ?? g.run.act}  ·  FLOOR ${g.run.floor}`;
    this.status.textContent = this.app.session!.kind === 'online' ? this.app.session!.status() : '';
    clear(this.plates);
    if (!showPlates) return;
    for (const seat of [0, 1] as Seat[]) this.plates.append(this.plate(seat));
  }

  private plate(seat: Seat): HTMLDivElement {
    const g = this.app.session!.game;
    const rs = g.run.seats[seat];
    const ch = CHARACTERS[rs.char];
    const plate = h('div', { class: `plate p${seat} ${rs.alive ? '' : 'dead'}` });
    const name = h('button', { class: 'plate-name', onclick: () => DeckView.open(this.app, seat) }, ch.name, h('small', {}, `${rs.deck.length} cards`));
    hoverTip(name, `${ch.name}'s deck`, 'Click to see every card in the deck.');
    plate.append(name);
    const row = h('div', { class: 'plate-row' });
    row.append(rs.alive ? candleRow(rs.candles) : h('span', { class: 'plate-dead' }, 'dead'), toothCount(rs.teeth));
    plate.append(row);
    const relics = h('div', { class: 'plate-relics' });
    for (const id of rs.relics) {
      const r = RELICS.get(id);
      if (!r) continue;
      const icon = h('span', { class: `relic-icon r-${r.rarity}` }, r.name.slice(0, 1));
      hoverTip(icon, r.name, r.text);
      relics.append(icon);
    }
    for (const id of rs.items) {
      if (!id) continue;
      const it = ITEMS.get(id)!;
      const icon = h('span', { class: 'item-icon' }, it.name.slice(0, 1));
      hoverTip(icon, it.name, it.text);
      relics.append(icon);
    }
    if (rs.totem) {
      const icon = h('span', { class: 'relic-icon r-totem' }, 'T');
      hoverTip(icon, `${rs.totem.tribe} totem`, `Every ${rs.totem.tribe} creature in the deck gains ${rs.totem.kw}.`);
      relics.append(icon);
    }
    plate.append(relics);
    return plate;
  }

  openMenu(): void {
    if (this.menu) return this.closeMenu();
    const app = this.app;
    const g = app.session?.game;
    const panel = h('div', { class: 'pause-panel' });
    const stepper = (label: string, get: () => number, set: (v: number) => void, steps: number[], fmt: (v: number) => string) => {
      const val = h('span', { class: 'step-val' });
      const show = () => (val.textContent = fmt(get()));
      const move = (d: number) => {
        const i = steps.findIndex((s) => Math.abs(s - get()) < 1e-6);
        const next = steps[Math.max(0, Math.min(steps.length - 1, (i < 0 ? 0 : i) + d))];
        set(next);
        show();
      };
      show();
      return h('div', { class: 'stepper' }, h('span', { class: 'step-label' }, label), h('button', { class: 'step-btn', onclick: () => move(-1) }, '<'), val, h('button', { class: 'step-btn', onclick: () => move(1) }, '>'));
    };
    const vols = [0, 0.25, 0.5, 0.75, 1];
    panel.append(
      h('div', { class: 'pause-title' }, 'Paused'),
      h('button', { class: 'primary', onclick: () => this.closeMenu() }, 'Resume'),
    );
    if (g) {
      for (const seat of [0, 1] as Seat[]) {
        panel.append(h('button', { onclick: () => (this.closeMenu(), DeckView.open(app, seat)) }, `${CHARACTERS[g.run.seats[seat].char].name}'s deck`));
      }
    }
    panel.append(
      stepper('Music', () => app.prefs.music, (v) => ((app.prefs.music = v), app.savePrefs()), vols, (v) => `${Math.round(v * 100)}%`),
      stepper('Effects', () => app.prefs.sfx, (v) => ((app.prefs.sfx = v), app.savePrefs()), vols, (v) => `${Math.round(v * 100)}%`),
      stepper('Speed', () => app.prefs.speed, (v) => ((app.prefs.speed = v), app.savePrefs()), [1, 0.5, 0.2], (v) => (v === 1 ? 'Normal' : v === 0.5 ? 'Fast' : 'Very fast')),
    );
    if (app.session?.kind === 'online') {
      const say = h('div', { class: 'say-list' }, h('div', { class: 'step-label' }, 'Say to your partner'));
      QUICK_LINES.forEach((line, i) => say.append(h('button', { class: 'say', onclick: () => (app.ping({ say: i }), this.closeMenu()) }, line)));
      panel.append(say);
    }
    if (g?.debug) panel.append(h('button', { onclick: () => (this.closeMenu(), app.toggleDebug()) }, 'Debug tools'));
    panel.append(h('button', { class: 'danger', onclick: () => (this.closeMenu(), app.title()) }, app.session?.kind === 'online' ? 'Leave the run' : 'Save and quit'));
    this.menu = h('div', { class: 'pause-veil', onclick: (e: Event) => e.target === this.menu && this.closeMenu() }, panel);
    app.stage.append(this.menu);
  }

  closeMenu(): void {
    this.menu?.remove();
    this.menu = null;
  }
}
