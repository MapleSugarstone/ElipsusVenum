import { ability, BOSSES, card as cardDef, HALVES, kwId, RELICS, type Hooks } from './registry.ts';
import { randInt, shuffle } from './rng.ts';
import {
  HAND_LIMIT, HALF, LANES, MAX_ENERGY, lanesOf, other, ownerOf,
  type AbilityInst, type Battle, type CardInst, type Ev, type Num, type Placement, type Row, type Seat, type SlotRef,
} from './types.ts';

/** The battle being changed plus the event list the change produces. */
export interface Env {
  b: Battle;
  ev: Ev[];
  /** When set, each event carries a snapshot of the board for the UI to show. */
  snap?: (b: Battle) => unknown;
}

export const DEBUFFS = new Set(['vulnerable', 'weak', 'poison', 'stun', 'glitch']);

// ---------------------------------------------------------------- board queries

export function rowOf(b: Battle, row: Row): (CardInst | null)[] {
  return row === 'p' ? b.p : row === 'e' ? b.e : b.q;
}

export function at(b: Battle, ref: SlotRef): CardInst | null {
  return rowOf(b, ref.row)[ref.lane] ?? null;
}

export function slotOf(b: Battle, uid: number): SlotRef | null {
  for (const row of ['p', 'e', 'q'] as Row[]) {
    const cards = rowOf(b, row);
    for (let lane = 0; lane < LANES; lane++) if (cards[lane]?.uid === uid) return { row, lane };
  }
  return null;
}

export const onBoard = (b: Battle, c: CardInst): boolean => slotOf(b, c.uid) !== null;

/** A lane is active while its player is alive. */
export const laneActive = (b: Battle, lane: number): boolean => b.seats[ownerOf(lane)].alive;

export function hasKw(c: CardInst, name: string): boolean {
  const id = kwId(name);
  return c.ab.some((a) => a.a === id && !a.off);
}

export function kwValue(c: CardInst, name: string): number {
  const id = kwId(name);
  let total = 0;
  for (const a of c.ab) if (a.a === id && !a.off) total += a.p?.n ?? ability(a.a).p?.n ?? 1;
  return total;
}

export function boardCards(b: Battle, row?: Row): CardInst[] {
  const rows: Row[] = row ? [row] : ['p', 'e'];
  const out: CardInst[] = [];
  for (const r of rows) for (const c of rowOf(b, r)) if (c) out.push(c);
  return out;
}

export function paramsOf(inst: AbilityInst): Num {
  const def = ability(inst.a);
  return { ...(def.p ?? {}), ...(inst.p ?? {}) };
}

// ---------------------------------------------------------------- hooks

type HookName = keyof Hooks;

export function fireCard(env: Env, c: CardInst, hook: HookName, ...args: unknown[]): void {
  for (const inst of [...c.ab]) {
    if (inst.off) continue;
    const fn = ability(inst.a)[hook] as ((ctx: Ctx, ...rest: unknown[]) => void) | undefined;
    if (fn) fn(new Ctx(env, c.seat, c, paramsOf(inst), []), ...args);
  }
}

/** Seat-level lines: powers, relics, and the battle's house rules. */
export function fireSeat(env: Env, seat: Seat, hook: HookName, ...args: unknown[]): void {
  const s = env.b.seats[seat];
  const lines: AbilityInst[] = [...s.powers, ...s.relics.filter((r) => RELICS.has(r)).map((r) => ({ a: `relic:${r}` }))];
  for (const inst of lines) {
    const fn = ability(inst.a)[hook] as ((ctx: Ctx, ...rest: unknown[]) => void) | undefined;
    if (fn) fn(new Ctx(env, seat, null, paramsOf(inst), []), ...args);
  }
}

/** Fires on every card still on the board, in lane order, player row first. */
export function fireBoard(env: Env, hook: HookName, filter: (c: CardInst) => boolean, ...args: unknown[]): void {
  for (const c of boardCards(env.b)) {
    if (!filter(c) || !onBoard(env.b, c)) continue;
    fireCard(env, c, hook, ...args);
  }
}

export function powerOf(b: Battle, c: CardInst): number {
  let p = c.power + c.tmp;
  const env: Env = { b, ev: [] };
  for (const src of boardCards(b)) {
    for (const inst of src.ab) {
      if (inst.off) continue;
      const fn = ability(inst.a).powerMod;
      if (fn) p += fn(new Ctx(env, src.seat, src, paramsOf(inst), []), c);
    }
  }
  if (c.side === 'p') {
    for (const inst of b.seats[c.seat].powers) {
      const fn = ability(inst.a).powerMod;
      if (fn) p += fn(new Ctx(env, c.seat, null, paramsOf(inst), []), c);
    }
  }
  return Math.max(0, p);
}

// ---------------------------------------------------------------- instances

export function makeInst(b: Battle, id: string, seat: Seat, side: 'p' | 'e', up = false): CardInst {
  const def = cardDef(id);
  const upg = up ? def.up : undefined;
  const ab = def.ab.map((a) => {
    const copy: AbilityInst = { a: a.a };
    if (a.p) {
      copy.p = { ...a.p };
      if (upg?.p) for (const k of Object.keys(upg.p)) if (k in copy.p) copy.p[k] = upg.p[k];
    }
    return copy;
  });
  if (upg?.kw) for (const k of upg.kw) ab.push(typeof k === 'string' ? { a: kwId(k) } : { a: kwId(k[0]), p: { n: k[1] } });
  const health = upg?.health ?? def.health;
  return {
    uid: ++b.uid,
    id,
    side,
    seat,
    up,
    cost: { ...(upg?.cost ?? def.cost) },
    power: upg?.power ?? def.power,
    health,
    maxHealth: health,
    ab,
    st: {},
    c: {},
    tmp: 0,
  };
}

// ---------------------------------------------------------------- verbs

export function emit(env: Env, ev: Ev): void {
  if (env.snap) ev.view = env.snap(env.b);
  env.ev.push(ev);
}

export function remove(b: Battle, c: CardInst): SlotRef | null {
  const ref = slotOf(b, c.uid);
  if (ref) rowOf(b, ref.row)[ref.lane] = null;
  return ref;
}

export function placePlayer(env: Env, c: CardInst, lane: number, how: 'play' | 'summon'): void {
  const b = env.b;
  c.seat = ownerOf(lane);
  c.side = 'p';
  b.p[lane] = c;
  emit(env, { k: 'enter', uid: c.uid, row: 'p', lane, how });
  fireCard(env, c, 'enter');
}

export function placeEnemy(env: Env, c: CardInst, row: 'e' | 'q', lane: number): void {
  const b = env.b;
  c.seat = ownerOf(lane);
  c.side = 'e';
  rowOf(b, row)[lane] = c;
  emit(env, { k: 'enter', uid: c.uid, row, lane, how: 'foe' });
  if (row === 'e') {
    fireCard(env, c, 'enter');
    fireBoard(env, 'foePlaced', (x) => x.side === 'p', c, lane);
  }
}

/** `attack` marks damage from a creature's attack, which is the only damage Thorns answers. */
export function damage(env: Env, target: CardInst, n: number, src: CardInst | null, attack = false): number {
  const b = env.b;
  if (n <= 0 || !onBoard(b, target)) return 0;
  if ((target.st.vulnerable ?? 0) > 0) n += 2;
  if (b.marks.includes(target.uid)) n += 2;
  if ((target.st.shield ?? 0) > 0) {
    target.st.shield--;
    emit(env, { k: 'shield', uid: target.uid });
    return 0;
  }
  if ((target.st.intangible ?? 0) > 0) n = Math.min(n, 1);
  const armor = kwValue(target, 'Armor');
  if (armor > 0) n = Math.max(0, n - armor);
  if (n <= 0) {
    emit(env, { k: 'armor', uid: target.uid });
    return 0;
  }
  target.health -= n;
  emit(env, { k: 'dmg', uid: target.uid, n, hp: target.health });
  if (src && hasKw(src, 'Deadly') && target.health > 0 && !hasKw(target, 'Steadfast')) {
    target.health = 0;
    emit(env, { k: 'deadly', uid: target.uid });
  }
  fireCard(env, target, 'struck', src, n, attack);
  if (target.health <= 0 && onBoard(b, target)) die(env, target, src);
  return n;
}

export function die(env: Env, c: CardInst, killer: CardInst | null): void {
  const b = env.b;
  const ref = remove(b, c);
  if (!ref) return;
  c.c.lane = ref.lane;
  emit(env, { k: 'die', uid: c.uid, row: ref.row, lane: ref.lane });
  fireCard(env, c, 'death');
  if (c.side === 'p' && b.seats[c.seat].alive) {
    b.seats[c.seat].bones += 1;
    emit(env, { k: 'bones', seat: c.seat, v: b.seats[c.seat].bones });
  }
  fireBoard(env, 'allyDies', (x) => x.side === c.side, c);
  if (c.side === 'p') fireSeat(env, c.seat, 'allyDies', c);
  if (killer && onBoard(b, killer)) fireCard(env, killer, 'kill', c);
  if (c.side === 'p' && killer && killer.side === 'e') scavenge(env, c.seat, ref.lane);
}

/** A Scavenger in the hand of the dead creature's owner jumps into the empty slot for free. */
function scavenge(env: Env, seat: Seat, lane: number): void {
  const b = env.b;
  const s = b.seats[seat];
  if (!s.alive || b.p[lane]) return;
  const i = s.hand.findIndex((h) => hasKw(h, 'Scavenger'));
  if (i < 0) return;
  const [c] = s.hand.splice(i, 1);
  emit(env, { k: 'scavenge', seat, uid: c.uid, lane });
  placePlayer(env, c, lane, 'summon');
}

/** Moves teeth toward `seat`'s win. */
export function scaleWin(env: Env, seat: Seat, n: number): void {
  const s = env.b.seats[seat];
  if (n <= 0 || !s.alive || env.b.over) return;
  if (s.won) {
    // Damage in the turn a half wins still pays teeth. Later turns pay nothing, so nobody stalls to farm.
    if (s.c.wonOn === env.b.turn) {
      s.teeth += n;
      emit(env, { k: 'teeth', seat, n, v: s.teeth });
    }
    return;
  }
  s.scale += n;
  emit(env, { k: 'scale', seat, n, v: s.scale });
  if (s.scale >= s.size) {
    const extra = s.scale - s.size;
    s.scale = s.size;
    if (extra > 0) {
      s.teeth += extra;
      emit(env, { k: 'teeth', seat, n: extra, v: s.teeth });
    }
    winHalf(env, seat);
  }
}

/** Moves teeth toward `seat`'s loss. Block absorbs it unless `pierce` is set. */
export function scaleLoss(env: Env, seat: Seat, n: number, pierce = false): void {
  const s = env.b.seats[seat];
  if (n <= 0 || !s.alive || s.won || env.b.over) return;
  const absorbed = pierce ? 0 : Math.min(s.block, n);
  if (absorbed > 0) {
    s.block -= absorbed;
    n -= absorbed;
    emit(env, { k: 'block', seat, v: s.block, n: -absorbed });
  }
  if (n <= 0) return;
  s.scale -= n;
  emit(env, { k: 'scale', seat, n: -n, v: s.scale });
  if (s.scale <= -s.size) {
    s.candles -= 1;
    s.scale = 0;
    emit(env, { k: 'candle', seat, left: s.candles });
    if (s.candles <= 0) seatDies(env, seat);
    else emit(env, { k: 'scale', seat, n: 0, v: 0 });
  }
}

function clearHalf(env: Env, seat: Seat): CardInst[] {
  const b = env.b;
  const fled: CardInst[] = [];
  for (const lane of lanesOf(seat)) {
    for (const row of ['e', 'q'] as const) {
      const c = rowOf(b, row)[lane];
      if (c) {
        rowOf(b, row)[lane] = null;
        fled.push(c);
        emit(env, { k: 'flee', uid: c.uid, row, lane });
      }
    }
  }
  fled.push(...b.foe[seat].backlog);
  b.foe[seat].backlog = [];
  return fled;
}

function winHalf(env: Env, seat: Seat): void {
  env.b.seats[seat].won = true;
  env.b.seats[seat].c.wonOn = env.b.turn;
  emit(env, { k: 'won', seat });
  clearHalf(env, seat);
  checkOver(env);
}

export function seatDies(env: Env, seat: Seat): void {
  const b = env.b;
  const s = b.seats[seat];
  s.alive = false;
  emit(env, { k: 'dead', seat });
  for (const lane of lanesOf(seat)) {
    const c = b.p[lane];
    if (c) {
      b.p[lane] = null;
      emit(env, { k: 'flee', uid: c.uid, row: 'p', lane });
    }
  }
  const fled = clearHalf(env, seat);
  const mate = b.seats[other(seat)];
  b.foe[seat].redirect = true;
  if (mate.alive && !mate.won) {
    for (const c of fled) {
      c.seat = other(seat);
      b.foe[other(seat)].backlog.push(c);
    }
    emit(env, { k: 'doubled', seat: other(seat), n: fled.length });
  }
  checkOver(env);
}

export function checkOver(env: Env): void {
  const b = env.b;
  if (b.over) return;
  const alive = b.seats.filter((s) => s.alive);
  if (alive.length === 0) b.over = 'loss';
  else if (alive.every((s) => s.won)) {
    const boss = b.boss ? BOSSES.get(b.boss.id) : undefined;
    if (boss && b.boss && b.boss.phase < boss.phases.length) {
      nextPhase(env, boss.phases[b.boss.phase]);
      return;
    }
    b.over = 'win';
  }
  if (b.over) emit(env, { k: 'over', r: b.over });
}

function nextPhase(env: Env, phase: { halves: [string, string]; rules?: string[]; line?: string }): void {
  const b = env.b;
  b.boss!.phase += 1;
  for (const row of ['e', 'q'] as const) {
    for (let lane = 0; lane < LANES; lane++) {
      const c = rowOf(b, row)[lane];
      if (c) {
        rowOf(b, row)[lane] = null;
        emit(env, { k: 'flee', uid: c.uid, row, lane });
      }
    }
  }
  b.foe.forEach((f, i) => {
    f.enc = phase.halves[i];
    f.step = 0;
    f.backlog = [];
    f.redirect = !b.seats[i].alive;
  });
  for (const s of b.seats) {
    if (!s.alive) continue;
    s.won = false;
    s.scale = 0;
  }
  b.rules = [...(phase.rules ?? [])];
  emit(env, { k: 'phase', n: b.boss!.phase, line: phase.line ?? '' });
  for (const seat of [0, 1] as Seat[]) {
    const def = HALVES.get(b.foe[seat].enc);
    for (const pl of def?.front ?? []) placeNow(env, seat, pl, 'e');
  }
  placeAll(env);
}

// ---------------------------------------------------------------- enemy placement

export function nextPlacements(enc: string, step: number): Placement[] {
  const def = HALVES.get(enc);
  if (!def) return [];
  if (step < def.turns.length) return def.turns[step];
  if (!def.loop || def.loop.length === 0) return [];
  return def.loop[(step - def.turns.length) % def.loop.length];
}

/** Places one card for a half, into its lane when free, otherwise into the backlog. A dead half sends it to the partner. */
export function placeNow(env: Env, half: Seat, pl: Placement, row: 'e' | 'q'): void {
  const b = env.b;
  const target: Seat = b.foe[half].redirect ? other(half) : half;
  if (!b.seats[target].alive || b.seats[target].won) return;
  const c = makeInst(b, pl.id, target, 'e');
  const lane = pl.lane !== undefined && target === half ? lanesOf(half)[pl.lane] : -1;
  if (lane >= 0 && !rowOf(b, row)[lane]) placeEnemy(env, c, row, lane);
  else b.foe[target].backlog.push(c);
}

/** Places each half's next script step, then fills empty queue slots from the backlogs. */
export function placeAll(env: Env): void {
  const b = env.b;
  for (const half of [0, 1] as Seat[]) {
    const f = b.foe[half];
    if (b.seats[half].won) continue;
    const pls = nextPlacements(f.enc, f.step);
    f.step += 1;
    for (const pl of pls) placeNow(env, half, pl, 'q');
  }
  for (const half of [0, 1] as Seat[]) {
    const s = b.seats[half];
    const f = b.foe[half];
    if (!s.alive || s.won) continue;
    while (f.backlog.length > 0) {
      const empty = lanesOf(half).filter((l) => !b.q[l]);
      if (empty.length === 0) break;
      const lane = empty[randInt(b.rng, empty.length)];
      const c = f.backlog.shift()!;
      placeEnemy(env, c, 'q', lane);
    }
  }
}

/** Lane damage from a player effect: the enemy creature in the lane, or the lane owner's scale. */
export function hitLane(env: Env, lane: number, n: number, src: CardInst | null): void {
  const b = env.b;
  if (n <= 0 || !laneActive(b, lane)) return;
  const foe = b.e[lane];
  emit(env, { k: 'hit', lane, n });
  if (foe) damage(env, foe, n, src);
  else scaleWin(env, ownerOf(lane), n);
}

export function applyStatus(env: Env, c: CardInst, s: string, n: number): void {
  if (n === 0 || !onBoard(env.b, c)) return;
  if (DEBUFFS.has(s) && n > 0 && (c.st.artifact ?? 0) > 0) {
    c.st.artifact--;
    emit(env, { k: 'status', uid: c.uid, s: 'artifact', v: c.st.artifact });
    return;
  }
  c.st[s] = Math.max(0, (c.st[s] ?? 0) + n);
  if (c.st[s] === 0) delete c.st[s];
  emit(env, { k: 'status', uid: c.uid, s, v: c.st[s] ?? 0 });
}

export function buff(env: Env, c: CardInst, dp: number, dh: number): void {
  if (!onBoard(env.b, c) && !env.b.seats[c.seat].hand.includes(c)) return;
  c.power = Math.max(0, c.power + dp);
  c.health += dh;
  c.maxHealth = Math.max(1, c.maxHealth + dh);
  emit(env, { k: 'buff', uid: c.uid, dp, dh, power: c.power, hp: c.health });
  if (c.health <= 0 && onBoard(env.b, c)) die(env, c, null);
}

export function heal(env: Env, c: CardInst, n: number): void {
  if (n <= 0 || !onBoard(env.b, c)) return;
  const before = c.health;
  c.health = Math.min(c.maxHealth, c.health + n);
  if (c.health !== before) emit(env, { k: 'heal', uid: c.uid, n: c.health - before, hp: c.health });
}

/** Moves a creature within its row. It stops at the seam unless `cross` is set. */
export function moveCard(env: Env, c: CardInst, to: number, cross = false): boolean {
  const b = env.b;
  const ref = slotOf(b, c.uid);
  if (!ref || to < 0 || to >= LANES || to === ref.lane) return false;
  if (!cross && ownerOf(to) !== ownerOf(ref.lane)) return false;
  if (!laneActive(b, to)) return false;
  const row = rowOf(b, ref.row);
  if (row[to]) return false;
  row[ref.lane] = null;
  row[to] = c;
  c.seat = ownerOf(to);
  emit(env, { k: 'move', uid: c.uid, row: ref.row, from: ref.lane, to });
  return true;
}

export function drawCard(env: Env, seat: Seat, from: 'main' | 'side'): CardInst | null {
  const b = env.b;
  const s = b.seats[seat];
  const pile = from === 'main' ? s.deck : s.side;
  if (from === 'main' && pile.length === 0 && s.discard.length > 0) {
    s.deck = shuffle(b.rng, s.discard);
    s.discard = [];
    emit(env, { k: 'reshuffle', seat, n: s.deck.length });
    return drawCard(env, seat, from);
  }
  const c = pile.pop();
  if (!c) return null;
  if (s.hand.length >= HAND_LIMIT) {
    s.discard.push(c);
    emit(env, { k: 'burn', seat, uid: c.uid });
    return null;
  }
  s.hand.push(c);
  emit(env, { k: 'draw', seat, uid: c.uid, from });
  return c;
}

export function addToHand(env: Env, seat: Seat, c: CardInst): void {
  const s = env.b.seats[seat];
  c.seat = seat;
  c.side = 'p';
  if (s.hand.length >= HAND_LIMIT) {
    s.discard.push(c);
    emit(env, { k: 'burn', seat, uid: c.uid });
    return;
  }
  s.hand.push(c);
  emit(env, { k: 'gain', seat, uid: c.uid, id: c.id });
}

export function gainEnergy(env: Env, seat: Seat, n: number): void {
  const s = env.b.seats[seat];
  s.energy = Math.max(0, Math.min(MAX_ENERGY * 2, s.energy + n));
  emit(env, { k: 'energy', seat, v: s.energy, n });
}

export function gainBones(env: Env, seat: Seat, n: number): void {
  const s = env.b.seats[seat];
  s.bones = Math.max(0, s.bones + n);
  emit(env, { k: 'bones', seat, v: s.bones, n });
}

export function gainBlock(env: Env, seat: Seat, n: number): void {
  const s = env.b.seats[seat];
  const frail = (s.st.frail ?? 0) > 0 ? 2 : 0;
  n = Math.max(0, n + (s.st.dexterity ?? 0) - frail);
  if (n <= 0) return;
  s.block += n;
  emit(env, { k: 'block', seat, v: s.block, n });
}

export function addProgram(env: Env, seat: Seat, inst: AbilityInst): void {
  const s = env.b.seats[seat];
  if (s.programs.length >= 3 + (s.c.progCap ?? 0)) {
    const oldest = s.programs.shift()!;
    emit(env, { k: 'evoke', seat, a: oldest.a });
    const fn = ability(oldest.a).evoke;
    if (fn) fn(new Ctx(env, seat, null, paramsOf(oldest), []));
  }
  s.programs.push(inst);
  emit(env, { k: 'program', seat, a: inst.a });
}

// ---------------------------------------------------------------- context

/** The toolbox a rules line receives. `self` is the card that owns the line, or null for seat-level lines. */
export class Ctx {
  readonly env: Env;
  readonly seat: Seat;
  readonly self: CardInst | null;
  readonly p: Num;
  readonly tg: SlotRef[];
  constructor(env: Env, seat: Seat, self: CardInst | null, p: Num, tg: SlotRef[]) {
    this.env = env;
    this.seat = seat;
    this.self = self;
    this.p = p;
    this.tg = tg;
  }

  get b(): Battle {
    return this.env.b;
  }
  get me() {
    return this.env.b.seats[this.seat];
  }
  get partner(): Seat {
    return other(this.seat);
  }

  // queries
  target(i = 0): CardInst | null {
    const ref = this.tg[i];
    return ref ? at(this.b, ref) : null;
  }
  lane(i = 0): number {
    return this.tg[i]?.lane ?? -1;
  }
  laneOf(c: CardInst | null = this.self): number {
    if (!c) return -1;
    return slotOf(this.b, c.uid)?.lane ?? c.c.lane ?? -1;
  }
  opposite(c: CardInst | null = this.self): CardInst | null {
    const lane = this.laneOf(c);
    if (lane < 0 || !c) return null;
    return c.side === 'p' ? this.b.e[lane] : this.b.p[lane];
  }
  /** Creatures in the same row on either side, including across the seam. */
  adjacent(c: CardInst | null = this.self): CardInst[] {
    if (!c) return [];
    const ref = slotOf(this.b, c.uid);
    if (!ref) return [];
    const row = rowOf(this.b, ref.row);
    return [row[ref.lane - 1], row[ref.lane + 1]].filter((x): x is CardInst => !!x);
  }
  allies(seat: Seat = this.seat): CardInst[] {
    return lanesOf(seat).map((l) => this.b.p[l]).filter((x): x is CardInst => !!x);
  }
  allAllies(): CardInst[] {
    return this.b.p.filter((x): x is CardInst => !!x);
  }
  enemies(seat?: Seat): CardInst[] {
    const lanes = seat === undefined ? [...Array(LANES).keys()] : lanesOf(seat);
    return lanes.map((l) => this.b.e[l]).filter((x): x is CardInst => !!x);
  }
  powerOf(c: CardInst): number {
    return powerOf(this.b, c);
  }
  has(c: CardInst, kw: string): boolean {
    return hasKw(c, kw);
  }
  rand(n: number): number {
    return randInt(this.b.rng, n);
  }
  emptyLanes(seat: Seat = this.seat): number[] {
    return lanesOf(seat).filter((l) => !this.b.p[l] && laneActive(this.b, l));
  }
  /** Spell damage after the seat's Strength. */
  spell(n: number): number {
    return Math.max(0, n + (this.me.st.strength ?? 0));
  }

  // verbs
  damage(c: CardInst | null, n: number): number {
    return c ? damage(this.env, c, n, this.self) : 0;
  }
  hit(lane: number, n: number): void {
    hitLane(this.env, lane, n, this.self);
  }
  heal(c: CardInst | null, n: number): void {
    if (c) heal(this.env, c, n);
  }
  buff(c: CardInst | null, dp: number, dh = 0): void {
    if (c) buff(this.env, c, dp, dh);
  }
  /** Changes a creature now and in the run deck for the rest of the run. */
  permanent(c: CardInst | null, dp: number, dh: number): void {
    if (!c) return;
    buff(this.env, c, dp, dh);
    if (c.deck !== undefined && c.side === 'p') this.b.seats[c.seat].perm.push({ d: c.deck, dp, dh });
  }
  temp(c: CardInst | null, dp: number): void {
    if (!c) return;
    c.tmp += dp;
    emit(this.env, { k: 'buff', uid: c.uid, dp, dh: 0, temp: true });
  }
  status(c: CardInst | null, s: string, n: number): void {
    if (c) applyStatus(this.env, c, s, n);
  }
  kill(c: CardInst | null): void {
    if (c && onBoard(this.b, c)) die(this.env, c, this.self);
  }
  move(c: CardInst | null, lane: number, cross = false): boolean {
    return c ? moveCard(this.env, c, lane, cross) : false;
  }
  /** Swaps two creatures in the player row. Control follows the lane. */
  swap(a: CardInst | null, b2: CardInst | null): boolean {
    if (!a || !b2 || a === b2) return false;
    const ra = slotOf(this.b, a.uid);
    const rb = slotOf(this.b, b2.uid);
    if (!ra || !rb || ra.row !== 'p' || rb.row !== 'p') return false;
    this.b.p[ra.lane] = b2;
    this.b.p[rb.lane] = a;
    a.seat = ownerOf(rb.lane);
    b2.seat = ownerOf(ra.lane);
    emit(this.env, { k: 'move', uid: a.uid, row: 'p', from: ra.lane, to: rb.lane });
    emit(this.env, { k: 'move', uid: b2.uid, row: 'p', from: rb.lane, to: ra.lane });
    return true;
  }
  isEdge(lane: number): boolean {
    return lane === 0 || lane === LANES - 1;
  }
  nextToSeam(lane: number): boolean {
    return lane === HALF - 1 || lane === HALF;
  }
  draw(n: number, seat: Seat = this.seat): void {
    for (let i = 0; i < n; i++) drawCard(this.env, seat, 'main');
  }
  add(id: string, n = 1, seat: Seat = this.seat, up = false): CardInst[] {
    const out: CardInst[] = [];
    for (let i = 0; i < n; i++) {
      const c = makeInst(this.b, id, seat, 'p', up);
      addToHand(this.env, seat, c);
      out.push(c);
    }
    return out;
  }
  summon(id: string, lane: number, up = false): CardInst | null {
    if (lane < 0 || lane >= LANES || this.b.p[lane] || !laneActive(this.b, lane)) return null;
    const c = makeInst(this.b, id, ownerOf(lane), 'p', up);
    placePlayer(this.env, c, lane, 'summon');
    return c;
  }
  /** Replaces a creature on the board with a fresh copy of another card. */
  transform(c: CardInst | null, id: string): CardInst | null {
    if (!c) return null;
    const ref = slotOf(this.b, c.uid);
    if (!ref) return null;
    const next = makeInst(this.b, id, c.seat, c.side, c.up);
    next.deck = c.deck;
    rowOf(this.b, ref.row)[ref.lane] = next;
    emit(this.env, { k: 'transform', from: c.uid, uid: next.uid, id, row: ref.row, lane: ref.lane });
    fireCard(this.env, next, 'enter');
    return next;
  }
  enemySummon(id: string, lane: number, row: 'e' | 'q' = 'e'): CardInst | null {
    if (rowOf(this.b, row)[lane] || !laneActive(this.b, lane)) return null;
    const c = makeInst(this.b, id, ownerOf(lane), 'e');
    placeEnemy(this.env, c, row, lane);
    return c;
  }
  energy(n: number, seat: Seat = this.seat): void {
    gainEnergy(this.env, seat, n);
  }
  bones(n: number, seat: Seat = this.seat): void {
    gainBones(this.env, seat, n);
  }
  block(n: number, seat: Seat = this.seat): void {
    gainBlock(this.env, seat, n);
  }
  teeth(n: number, seat: Seat = this.seat): void {
    const s = this.b.seats[seat];
    s.teeth += n;
    emit(this.env, { k: 'teeth', seat, n, v: s.teeth });
  }
  /** Moves teeth toward the seat's win. */
  scale(n: number, seat: Seat = this.seat): void {
    scaleWin(this.env, seat, n);
  }
  /** Moves teeth toward the seat's own loss, ignoring Block. */
  pay(n: number, seat: Seat = this.seat): void {
    scaleLoss(this.env, seat, n, true);
  }
  /** Moves teeth back toward even when the seat is behind. */
  mend(n: number, seat: Seat = this.seat): void {
    const s = this.b.seats[seat];
    if (s.scale >= 0 || n <= 0) return;
    const back = Math.min(n, -s.scale);
    s.scale += back;
    emit(this.env, { k: 'scale', seat, n: back, v: s.scale });
  }
  seatStatus(s: string, n: number, seat: Seat = this.seat): void {
    const st = this.b.seats[seat].st;
    st[s] = (st[s] ?? 0) + n;
    if (st[s] === 0) delete st[s];
    emit(this.env, { k: 'seatStatus', seat, s, v: st[s] ?? 0 });
  }
  foeStatus(s: string, n: number, half: Seat): void {
    const st = this.b.foe[half].st;
    st[s] = Math.max(0, (st[s] ?? 0) + n);
    emit(this.env, { k: 'foeStatus', half, s, v: st[s] });
  }
  addPower(a: string, p?: Num, seat: Seat = this.seat): void {
    const inst: AbilityInst = p ? { a, p: { ...p } } : { a };
    const existing = this.b.seats[seat].powers.find((x) => x.a === a);
    if (existing && existing.p && p && 'n' in p) existing.p.n = (existing.p.n ?? 0) + p.n;
    else this.b.seats[seat].powers.push(inst);
    emit(this.env, { k: 'power', seat, a });
  }
  program(a: string, p?: Num): void {
    addProgram(this.env, this.seat, p ? { a, p: { ...p } } : { a });
  }
  /** Runs each Program's end of turn effect now, leaving the Programs loaded. */
  runPrograms(): void {
    for (const prog of [...this.me.programs]) {
      const fn = ability(prog.a).tick;
      if (fn) fn(new Ctx(this.env, this.seat, null, paramsOf(prog), []));
    }
  }
  /** Runs every Program's Evoke and removes them. Returns how many there were. */
  evokeAll(): number {
    const progs = this.me.programs;
    this.me.programs = [];
    for (const prog of progs) {
      emit(this.env, { k: 'evoke', seat: this.seat, a: prog.a });
      const fn = ability(prog.a).evoke;
      if (fn) fn(new Ctx(this.env, this.seat, null, paramsOf(prog), []));
    }
    return progs.length;
  }
  counter(name: string, n: number, seat: Seat = this.seat): number {
    const c = this.b.seats[seat].c;
    c[name] = (c[name] ?? 0) + n;
    emit(this.env, { k: 'counter', seat, name, v: c[name] });
    return c[name];
  }
  emit(ev: Ev): void {
    emit(this.env, ev);
  }
  halfOf(lane: number): Seat {
    return ownerOf(lane);
  }
  sameHalf(a: number, b2: number): boolean {
    return Math.floor(a / HALF) === Math.floor(b2 / HALF);
  }
}
