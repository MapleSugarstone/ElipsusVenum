import { CHARACTERS } from '../content/index.ts';
import type { Seat } from '../engine/types.ts';
import { createGame } from '../run/game.ts';
import type { Game, GameAction } from '../run/types.ts';
import { setSfxVolume } from '../audio/sfx.ts';
import { music, type TrackId } from '../audio/music.ts';
import { setVolumes } from '../audio/audio.ts';
import { BattleScreen } from './battle.ts';
import { DebugPanel } from './debug.ts';
import { clear, h, toast } from './dom.ts';
import { dissolveIn } from './wipe.ts';
import { ART, grid, snapScale } from './grid.ts';
import { ditherFill, grainTexture, nodeGenre, VoidRenderer } from './void.ts';
import { installSprites } from './sprites.ts';
import { blip } from '../audio/sfx.ts';
import { hideInspect, setStageScale } from './inspect.ts';
import { MapScreen } from './map.ts';
import { NodeScreen } from './node.ts';
import { clearSave, LocalSession, loadSave, type Session, type Update } from './session.ts';
import { OnlineMenu } from './online.ts';
import { Hud } from './hud.ts';
import { QUICK_LINES } from '../content/quicklines.ts';
import type { Presence } from './session.ts';

/** The track for whatever screen the run is on. */
function trackFor(g: Game): TrackId {
  const run = g.run;
  if (run.over) return run.over === 'win' ? 'victory' : 'gameover';
  const act = Math.min(3, Math.max(1, run.act));
  if (run.screen === 'battle') {
    const boss = g.battle?.boss?.id;
    if (boss === 'sir-tutorial') return 'boss_tutorial';
    if (boss === 'the-copycat') return 'boss_copycat';
    if (boss === 'your-best-friend') return 'boss_ybf';
    return run.fight === 'elite' ? 'elite' : 'battle';
  }
  if (run.screen === 'node') {
    const kind = run.node?.kind;
    if (kind === 'rest') return 'rest';
    if (kind === 'merchant') return 'shop';
    if (kind === 'event' || kind === 'stones' || kind === 'mycologist' || kind === 'woodcarver') return 'event';
  }
  return `map${act}` as TrackId;
}

export interface Prefs {
  speed: number;
  sfx: number;
  music: number;
}

const PREFS_KEY = 'elipsusvenum.prefs.v1';

function loadPrefs(): Prefs {
  const base: Prefs = { speed: 1, sfx: 0.6, music: 0.5 };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    for (const k of Object.keys(base) as (keyof Prefs)[]) {
      const v = raw[k];
      if (typeof v === 'number' && v >= 0 && v <= 3) base[k] = v;
    }
  } catch {
    /* defaults */
  }
  return base;
}

interface Screen {
  root: HTMLElement;
  start?(): void;
  onUpdate?(u: Update): void;
  ping?(p: Presence): void;
  destroy(): void;
}

export class App {
  readonly stage: HTMLElement;
  session: Session | null = null;
  prefs: Prefs = loadPrefs();
  private screen: Screen | null = null;
  private screenKind = '';
  private hud: Hud;
  private dealerEl: HTMLDivElement;
  private debug: DebugPanel | null = null;
  private unsub: (() => void) | null = null;
  private unpresence: (() => void) | null = null;
  private void: VoidRenderer;
  private scale = 1;
  private typing: ReturnType<typeof setInterval> | null = null;

  constructor(stage: HTMLElement) {
    this.stage = stage;
    installSprites();
    this.hud = new Hud(this);
    this.dealerEl = this.hud.speech;
    setSfxVolume(this.prefs.sfx);
    setVolumes({ music: this.prefs.music });
    this.void = new VoidRenderer();
    const root = document.documentElement.style;
    root.setProperty('--grain', `url(${grainTexture()})`);
    root.setProperty('--fill-dark', `url(${ditherFill('#0e1105', '#16190d', 0.5)})`);
    root.setProperty('--fill-hot', `url(${ditherFill('#16190d', '#2a1f45', 0.5)})`);
    root.setProperty('--fill-acid', `url(${ditherFill('#d4ba00', '#a08410', 0.25)})`);
    root.setProperty('--fill-acid-hot', `url(${ditherFill('#e8d020', '#d4ba00', 0.4)})`);
    root.setProperty('--fill-blood', `url(${ditherFill('#3a0d0a', '#6b140e', 0.4)})`);
    const noise = document.getElementById('boil-noise');
    let boil = 0;
    // The boil filter's noise steps a few times a second, which reads as clay between stop-motion frames.
    setInterval(() => noise?.setAttribute('seed', String((boil = (boil + 1) % 4) + 1)), 170);
    window.addEventListener('resize', () => this.fit());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2' && this.session?.game.debug) {
        e.preventDefault();
        this.toggleDebug();
      }
    });
    this.fit();
  }

  /** Screenshot mode pins the stage to the window's top edge, panned left by this many pixels, so a capture of the top-left corner can show any part of it. */
  shotMode: number | false = false;
  private dprWatch: MediaQueryList | null = null;
  private onDpr = () => this.fit();

  private base(dx = 0, dy = 0): string {
    // Shakes move in whole art pixels, so the pixel grid never slides by a fraction.
    const p = grid.px;
    return `translate(${Math.round(dx / p) * p}px, ${Math.round(dy / p) * p}px) scale(${this.scale})`;
  }

  fit(): void {
    const dpr = window.devicePixelRatio || 1;
    // A pixel ratio change (browser zoom, another monitor) does not always fire resize.
    this.dprWatch?.removeEventListener('change', this.onDpr);
    this.dprWatch = window.matchMedia(`(resolution: ${dpr}dppx)`);
    this.dprWatch.addEventListener('change', this.onDpr);
    const s = snapScale(window.innerWidth, window.innerHeight, dpr);
    this.scale = s;
    const left = this.shotMode !== false ? -this.shotMode : Math.round(((window.innerWidth - 1600 * s) / 2) * dpr) / dpr;
    const top = this.shotMode !== false ? 0 : Math.round(((window.innerHeight - 900 * s) / 2) * dpr) / dpr;
    grid.s = s;
    grid.left = left;
    grid.top = top;
    grid.px = ART * s;
    this.stage.style.left = `${left}px`;
    this.stage.style.top = `${top}px`;
    this.stage.style.transformOrigin = 'top left';
    this.stage.style.transform = this.base();
    const grain = document.getElementById('grain');
    if (grain) {
      grain.style.backgroundSize = `${160 * grid.px}px`;
      grain.style.backgroundPosition = `${left}px ${top}px`;
    }
    setStageScale(s);
    this.void?.resize();
  }

  /** A short shake of the whole stage that tapers off. Kept small, since big shakes make people sick. */
  shake(px = 5, ms = 220): void {
    const start = performance.now();
    const step = () => {
      const k = 1 - (performance.now() - start) / ms;
      if (k <= 0) {
        this.stage.style.transform = this.base();
        return;
      }
      const dx = (Math.random() * 2 - 1) * px * k;
      const dy = (Math.random() * 2 - 1) * px * k;
      this.stage.style.transform = this.base(dx, dy);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  savePrefs(): void {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      /* storage blocked */
    }
    setSfxVolume(this.prefs.sfx);
    setVolumes({ music: this.prefs.music });
  }

  solo(): boolean {
    return this.session?.mine.length === 2;
  }

  notice(text: string): void {
    toast(this.stage, text);
  }

  /** Your Best Friend speaks: the line types out with a soft blip every other letter. */
  say(line: string): void {
    if (this.typing) clearInterval(this.typing);
    this.dealerEl.textContent = '';
    if (!line) return;
    const full = `Your Best Friend: ${line}`;
    let i = 'Your Best Friend: '.length;
    this.dealerEl.textContent = full.slice(0, i);
    this.typing = setInterval(() => {
      i += 1;
      this.dealerEl.textContent = full.slice(0, i);
      if (i % 2 === 0 && /[a-z]/i.test(full[i - 1] ?? '')) blip(full.charCodeAt(i - 1));
      if (i >= full.length && this.typing) {
        clearInterval(this.typing);
        this.typing = null;
      }
    }, 28);
  }

  send(seat: Seat, a: GameAction): string | null {
    return this.session ? this.session.send(seat, a) : 'no game';
  }

  // ------------------------------------------------------------ screens

  private setScreen(kind: string, screen: Screen): void {
    hideInspect();
    const base = kind.split(':')[0];
    const g = this.session?.game;
    const node = g?.run.node;
    const mode = base === 'battle' ? 'battle' : base === 'map' ? 'map' : base === 'node' ? (node?.kind === 'event' ? 'event' : 'node') : base === 'title' ? 'title' : 'menu';
    const feature = node ? nodeGenre(node.kind === 'reward' || node.kind === 'bossReward' ? 'treasure' : node.kind, g!.run.at ?? 0) : 'glitch';
    this.void.setMode(mode, g ? g.run.act * 31 + g.run.floor + g.run.battles : 1, feature);
    if (base !== this.screenKind.split(':')[0]) dissolveIn();
    this.screen?.destroy();
    clear(this.stage);
    this.screen = screen;
    this.screenKind = kind;
    this.stage.append(screen.root);
    if (this.session) {
      this.stage.append(this.hud.root);
      this.renderTop();
    }
    screen.start?.();
    if (this.debug) this.stage.append(this.debug.root);
  }

  title(): void {
    this.closeSession();
    music.play('title', 1);
    const save = loadSave();
    const root = h('div', { class: 'screen title-screen' });
    const menu = h('div', { class: 'title-menu' });
    if (save) menu.append(h('button', { class: 'primary', onclick: () => this.begin(new LocalSession(save)) }, 'Continue run'));
    menu.append(
      h('button', { onclick: () => this.setup(false) }, 'Solo run'),
      h('button', { onclick: () => this.online() }, 'Co-op online'),
      h('button', { onclick: () => this.setup(true) }, 'Sandbox with debug tools'),
      h('div', { class: 'note' }, 'Solo means you control both halves of the board.'),
    );
    root.append(
      h('div', {}, h('h1', {}, 'ElipsusVenum'), h('div', { class: 'sub' }, 'Your Best Friend built a world and trapped Blue and Doctor Pistachio inside it. Fight across eight lanes, keep your candles lit, and get out together.')),
      menu,
    );
    this.setScreen('title', { root, destroy: () => root.remove() });
  }

  setup(debug: boolean, onStart?: (chars: [string, string]) => void): void {
    const chars: [string, string] = ['blue', 'pistachio'];
    const root = h('div', { class: 'screen setup-screen' });
    const render = () => {
      clear(root);
      root.append(h('h2', {}, debug ? 'Sandbox' : 'Choose your characters'));
      root.append(h('div', { style: { color: 'var(--muted)' } }, 'The left player holds lanes 1 to 4 and the right player holds lanes 5 to 8.'));
      const row = h('div', { class: 'char-row' });
      for (const seat of [0, 1] as Seat[]) {
        const col = h('div', { class: 'char-pick' }, h('h3', {}, seat === 0 ? 'Left half' : 'Right half'));
        for (const ch of Object.values(CHARACTERS)) {
          col.append(
            h(
              'button',
              { class: `char-option ${chars[seat] === ch.id ? 'on' : ''}`, onclick: () => ((chars[seat] = ch.id), render()) },
              h('b', {}, ch.name),
              h('span', {}, ch.id === 'blue' ? 'Knives, prayer, and his King.' : 'Programs, hacks, and villainy.'),
            ),
          );
        }
        row.append(col);
      }
      root.append(row);
      root.append(
        h(
          'div',
          { style: { marginTop: '30px', display: 'flex', gap: '12px' } },
          h('button', { onclick: () => this.title() }, 'Back'),
          h(
            'button',
            {
              class: 'primary',
              onclick: () => {
                if (onStart) return onStart(chars);
                clearSave();
                const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
                this.begin(new LocalSession(createGame({ seed, chars: [...chars], solo: true, debug })));
              },
            },
            'Start',
          ),
        ),
      );
    };
    render();
    this.setScreen('setup', { root, destroy: () => root.remove() });
  }

  online(): void {
    const menu = new OnlineMenu(this);
    this.setScreen('online', menu);
  }

  begin(session: Session): void {
    this.closeSession();
    this.session = session;
    this.unsub = session.subscribe((u) => this.onUpdate(u));
    this.unpresence = session.onPresence((p) => this.onPresence(p));
    this.screenKind = '';
    this.route();
  }

  closeSession(): void {
    this.unsub?.();
    this.unsub = null;
    this.unpresence?.();
    this.unpresence = null;
    this.session?.close();
    this.session = null;
    this.debug?.root.remove();
    this.debug = null;
  }

  private onPresence(p: Presence): void {
    const g = this.session?.game;
    if (!g) return;
    const name = CHARACTERS[g.run.seats[p.seat].char].name;
    if (p.say !== undefined && QUICK_LINES[p.say]) toast(this.stage, `${name}: ${QUICK_LINES[p.say]}`);
    if (p.ping) this.screen?.ping?.(p);
  }

  /** Sends a ping or a quick line to the partner. Solo games have nobody to tell. */
  ping(p: Omit<Presence, 'seat'>): void {
    const s = this.session;
    if (!s || s.kind !== 'online') return;
    s.presence(p, s.mine[0]);
  }

  private onUpdate(u: Update): void {
    if (u.ev.some((e) => e.k === 'relicGain')) music.stinger('relic');
    this.renderTop();
    this.debug?.refresh();
    const kind = this.kindFor(u.g);
    if (kind === this.screenKind && this.screen?.onUpdate) {
      this.screen.onUpdate(u);
      return;
    }
    if (this.screenKind === 'battle' && this.screen?.onUpdate && u.g.run.screen === 'node') {
      // Let the last blows and the victory banner play before the reward screen.
      this.screen.onUpdate(u);
      const delay = 1600 * this.prefs.speed;
      setTimeout(() => this.route(), delay);
      return;
    }
    this.route();
  }

  private kindFor(g: Game): string {
    return g.run.screen === 'node' ? `node:${g.run.node?.kind}:${g.run.at}:${g.run.battles}` : g.run.screen;
  }

  route(): void {
    const g = this.session?.game;
    if (!g) return this.title();
    const kind = this.kindFor(g);
    this.renderTop();
    music.play(trackFor(g), 1.2);
    if (g.run.screen === 'battle') this.setScreen(kind, new BattleScreen(this));
    else if (g.run.screen === 'map') this.setScreen(kind, new MapScreen(this));
    else if (g.run.screen === 'node') this.setScreen(kind, new NodeScreen(this));
    else this.setScreen(kind, this.overScreen(g));
  }

  private overScreen(g: Game): Screen {
    const won = g.run.over === 'win';
    const root = h(
      'div',
      { class: 'screen setup-screen' },
      h('h2', { style: { color: won ? 'var(--candle)' : 'var(--danger)' } }, won ? 'You escaped' : 'The candles went out'),
      h('p', { style: { fontSize: '20px', color: 'var(--muted)' } }, `Act ${Math.min(g.run.act, 3)}, floor ${g.run.floor}. Battles won: ${g.run.battles - (won ? 0 : 1)}.`),
      h('p', { style: { fontSize: '20px', fontFamily: 'var(--font-display)', color: 'var(--warn)' } }, won ? 'Your Best Friend: Wait. You were not supposed to finish it yet.' : 'Your Best Friend: Again? I made some changes. Not really. But again?'),
      h('button', { class: 'primary', onclick: () => (clearSave(), this.title()) }, 'Back to the title'),
    );
    return { root, destroy: () => root.remove() };
  }

  // ------------------------------------------------------------ hud

  renderTop(): void {
    this.hud.update(this.screenKind.split(':')[0] !== 'battle');
  }

  toggleDebug(): void {
    if (this.debug) {
      this.debug.root.remove();
      this.debug = null;
      return;
    }
    this.debug = new DebugPanel(this);
    this.stage.append(this.debug.root);
  }
}
