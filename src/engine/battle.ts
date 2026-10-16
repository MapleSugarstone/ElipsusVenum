import {
  Ctx, at, checkOver, damage, die, drawCard, emit, fireBoard, fireCard, fireSeat, hasKw, kwValue, laneActive,
  makeInst, placeAll, placeEnemy, placeNow, placePlayer, powerOf, remove, scaleLoss, scaleWin, moveCard, gainBones,
  paramsOf, type Env,
} from './fx.ts';
import { ability, BOSSES, card as cardDef, HALVES, ITEMS, kwId, type TargetSpec } from './registry.ts';
import { seedRng, shuffle } from './rng.ts';
import {
  HALF, LANES, MAX_ENERGY, SCALE_SIZE, SEATS, lanesOf, other, ownerOf,
  type AbilityInst, type Battle, type BattleAction, type CardInst, type Cost, type Ev, type FoeHalf,
  type Seat, type SeatState, type SlotRef,
} from './types.ts';

/** A card in a run deck. `d` is its stable id within the run. */
export interface DeckCard {
  d: number;
  id: string;
  up?: boolean;
  /** Permanent stat changes from the map. */
  dp?: number;
  dh?: number;
  /** Rules lines added on the map, such as a moved line or a totem keyword. */
  ab?: AbilityInst[];
}

export interface SeatSetup {
  char: string;
  alive: boolean;
  candles: number;
  deck: DeckCard[];
  side: string;
  sideCount: number;
  relics: string[];
  items: (string | null)[];
  /** Keyword lines a totem grants to creatures of one tribe. */
  totem?: { tribe: string; kw: string };
}

export interface BattleSetup {
  seed: number;
  seats: [SeatSetup, SeatSetup];
  halves: [string, string];
  boss?: string;
  rules?: string[];
  size?: number;
}

export interface Result {
  b: Battle;
  ev: Ev[];
  error?: string;
}

const MAX_ROUNDS = 60;

// ---------------------------------------------------------------- creation

function deckInst(b: Battle, seat: Seat, dc: DeckCard, totem?: { tribe: string; kw: string }): CardInst {
  const c = makeInst(b, dc.id, seat, 'p', !!dc.up);
  c.deck = dc.d;
  if (dc.dp) c.power = Math.max(0, c.power + dc.dp);
  if (dc.dh) {
    c.health += dc.dh;
    c.maxHealth += dc.dh;
  }
  if (dc.ab) for (const a of dc.ab) c.ab.push({ a: a.a, ...(a.p ? { p: { ...a.p } } : {}) });
  const def = cardDef(dc.id);
  if (totem && def.tribe === totem.tribe && !c.ab.some((a) => a.a === kwId(totem.kw))) c.ab.push({ a: kwId(totem.kw) });
  return c;
}

function seatState(b: Battle, seat: Seat, s: SeatSetup, size: number): SeatState {
  const st: SeatState = {
    char: s.char,
    alive: s.alive,
    won: false,
    scale: 0,
    size,
    candles: s.candles,
    teeth: 0,
    hand: [],
    deck: [],
    side: [],
    discard: [],
    exhaust: [],
    bones: 0,
    energy: 0,
    maxEnergy: 0,
    block: 0,
    drew: false,
    rung: !s.alive,
    ghost: false,
    st: {},
    c: {},
    powers: [],
    programs: [],
    relics: [...s.relics],
    items: [...s.items],
    perm: [],
  };
  st.deck = shuffle(b.rng, s.deck.map((dc) => deckInst(b, seat, dc, s.totem)));
  for (let i = 0; i < s.sideCount; i++) st.side.push(makeInst(b, s.side, seat, 'p'));
  return st;
}

export function createBattle(setup: BattleSetup): Result {
  const size = setup.size ?? SCALE_SIZE;
  const boss = setup.boss ? BOSSES.get(setup.boss) : undefined;
  if (boss) {
    setup = { ...setup, halves: boss.phases[0].halves, rules: [...(setup.rules ?? []), ...(boss.phases[0].rules ?? [])] };
  }
  const b: Battle = {
    v: 1,
    rng: seedRng(setup.seed),
    turn: 0,
    uid: 0,
    over: null,
    p: Array(LANES).fill(null),
    e: Array(LANES).fill(null),
    q: Array(LANES).fill(null),
    seats: undefined as unknown as Battle['seats'],
    foe: setup.halves.map((enc): FoeHalf => ({ enc, step: 0, backlog: [], st: {}, redirect: false })) as [FoeHalf, FoeHalf],
    boss: setup.boss ? { id: setup.boss, phase: 1, c: {} } : null,
    marks: [],
    rules: [...(setup.rules ?? [])],
  };
  b.seats = [seatState(b, 0, setup.seats[0], size), seatState(b, 1, setup.seats[1], size)];
  const env: Env = { b, ev: [] };
  for (const seat of SEATS) {
    if (!b.seats[seat].alive) b.foe[seat].redirect = true;
  }
  for (const seat of SEATS) {
    const s = b.seats[seat];
    if (!s.alive) continue;
    for (let i = 0; i < 3; i++) drawCard(env, seat, 'main');
    drawCard(env, seat, 'side');
  }
  for (const seat of SEATS) if (b.seats[seat].alive) fireSeat(env, seat, 'battleStart');
  for (const rule of b.rules) runRule(env, rule, 'battleStart');
  for (const seat of SEATS) {
    const def = HALVES.get(b.foe[seat].enc);
    if (!def?.front) continue;
    for (const pl of def.front) placeNow(env, seat, pl, 'e');
  }
  placeAll(env);
  startTurn(env);
  return { b, ev: env.ev };
}

function runRule(env: Env, id: string, hook: 'battleStart' | 'turnStart' | 'turnEnd'): void {
  const fn = ability(id)[hook];
  if (fn) fn(new Ctx(env, 0, null, ability(id).p ?? {}, []));
}

// ---------------------------------------------------------------- legality

export function needsDraw(b: Battle, seat: Seat): boolean {
  const s = b.seats[seat];
  return s.alive && !s.drew;
}

/** Blood a creature pays when sacrificed. */
export const sacValue = (c: CardInst): number => (hasKw(c, 'Offering') ? 3 : 1);

export function costOf(b: Battle, seat: Seat, c: CardInst): Required<Cost> {
  const s = b.seats[seat];
  let blood = c.cost.blood ?? 0;
  let energy = c.cost.energy ?? 0;
  let bones = c.cost.bones ?? 0;
  if (blood > 0) blood = Math.max(0, blood - (s.c.bloodLess ?? 0));
  if (energy > 0) energy = Math.max(0, energy - (s.c.energyLess ?? 0));
  if (bones > 0) bones = Math.max(0, bones - (s.c.bonesLess ?? 0));
  if (cardDef(c.id).tags.includes('king')) {
    if ((s.c.blessed ?? 0) > 0) energy = 0;
    else energy = Math.max(0, energy - (s.c.kingLess ?? 0));
  }
  return { blood, energy, bones };
}

export function targetOk(b: Battle, seat: Seat, spec: TargetSpec, ref: SlotRef | undefined): string | null {
  if (!ref) return spec.opt ? null : 'missing target';
  if (ref.lane < 0 || ref.lane >= LANES) return 'bad lane';
  if (!laneActive(b, ref.lane)) return 'inactive lane';
  const who = spec.who ?? 'own';
  if (who === 'own' && ownerOf(ref.lane) !== seat) return 'not your lane';
  if (who === 'partner' && ownerOf(ref.lane) === seat) return 'not your partner\'s lane';
  if (spec.row !== 'lane' && ref.row !== spec.row) return 'wrong row';
  const c = spec.row === 'lane' ? null : at(b, ref);
  const need = spec.need ?? (spec.row === 'lane' ? 'either' : 'card');
  if (need === 'card' && !c) return 'no creature there';
  if (need === 'empty' && c) return 'slot is taken';
  if (spec.ok && !spec.ok(b, c, seat)) return 'not a legal target';
  return null;
}

export function legal(b: Battle, seat: Seat, a: BattleAction): string | null {
  if (b.over) return 'battle is over';
  const s = b.seats[seat];
  if (a.t === 'ghost') {
    if (s.alive) return 'only a dead player gets a ghost turn';
    if (s.ghost) return 'ghost turn already used';
    const mate = b.seats[other(seat)];
    if (!mate.alive) return 'no one to help';
    if (a.kind === 'mark') {
      if (!a.tg || a.tg.row !== 'e' || !at(b, a.tg) || ownerOf(a.tg.lane) !== other(seat)) return 'mark an enemy creature';
    }
    return null;
  }
  if (!s.alive) return 'you are dead';
  if (s.rung && a.t !== 'unring') return 'you rang your bell';
  switch (a.t) {
    case 'draw': {
      if (s.drew) return 'already drew';
      if (a.from === 'main' && s.deck.length + s.discard.length === 0) return 'deck is empty';
      if (a.from === 'side' && s.side.length === 0) return 'side deck is empty';
      return null;
    }
    case 'ring':
      return s.drew ? null : 'draw first';
    case 'unring':
      return s.rung ? null : 'bell not rung';
    case 'item': {
      const id = s.items[a.slot];
      if (!id) return 'no item there';
      const def = ITEMS.get(id);
      if (!def) return 'unknown item';
      for (let i = 0; i < def.tg.length; i++) {
        const err = targetOk(b, seat, def.tg[i], a.tg?.[i]);
        if (err) return err;
      }
      return null;
    }
    case 'play': {
      if (!s.drew) return 'draw first';
      const c = s.hand.find((x) => x.uid === a.uid);
      if (!c) return 'card not in hand';
      if (hasKw(c, 'Unplayable')) return 'this card cannot be played';
      const def = cardDef(c.id);
      const cost = costOf(b, seat, c);
      if (s.energy < cost.energy) return 'not enough energy';
      if (s.bones < cost.bones) return 'not enough bones';
      const sac = a.sac ?? [];
      if (cost.blood > 0 || sac.length > 0) {
        if (new Set(sac).size !== sac.length) return 'duplicate sacrifice';
        let total = 0;
        let least = Infinity;
        for (const lane of sac) {
          if (ownerOf(lane) !== seat) return 'sacrifice only your own creatures';
          const v = b.p[lane];
          if (!v) return 'nothing to sacrifice there';
          const val = sacValue(v);
          total += val;
          least = Math.min(least, val);
        }
        if (total < cost.blood) return 'not enough blood';
        if (sac.length > 0 && total - least >= cost.blood) return 'too many sacrifices';
      }
      if (def.kind === 'creature') {
        if (a.lane === undefined || ownerOf(a.lane) !== seat) return 'choose one of your lanes';
        const occupant = b.p[a.lane];
        if (occupant && !(sac.includes(a.lane) && !hasKw(occupant, 'Spare Lives'))) return 'that lane is taken';
      }
      for (let i = 0; i < def.tg.length; i++) {
        const err = targetOk(b, seat, def.tg[i], a.tg?.[i]);
        if (err) return err;
      }
      return null;
    }
  }
}

// ---------------------------------------------------------------- actions

export function decision(b: Battle): { kind: 'over'; r: 'win' | 'loss' } | { kind: 'play'; waiting: Seat[] } {
  if (b.over) return { kind: 'over', r: b.over };
  return { kind: 'play', waiting: SEATS.filter((s) => b.seats[s].alive && !b.seats[s].rung) };
}

export function applyBattle(prev: Battle, seat: Seat, a: BattleAction, snap?: (b: Battle) => unknown): Result {
  const err = legal(prev, seat, a);
  if (err) return { b: prev, ev: [{ k: 'refuse', seat, why: err }], error: err };
  const b = structuredClone(prev);
  const env: Env = { b, ev: [], snap };
  act(env, seat, a);
  return { b, ev: env.ev };
}

/** Applies an action that is already known to be legal, changing `b` in place. */
export function applyInPlace(b: Battle, seat: Seat, a: BattleAction, snap?: (b: Battle) => unknown): Ev[] {
  const env: Env = { b, ev: [], snap };
  act(env, seat, a);
  return env.ev;
}

function act(env: Env, seat: Seat, a: BattleAction): void {
  const b = env.b;
  const s = b.seats[seat];
  switch (a.t) {
    case 'draw':
      drawCard(env, seat, a.from);
      s.drew = true;
      return;
    case 'ring':
      s.rung = true;
      emit(env, { k: 'bell', seat, on: true });
      if (SEATS.every((x) => !b.seats[x].alive || b.seats[x].rung)) resolveRound(env);
      return;
    case 'unring':
      s.rung = false;
      emit(env, { k: 'bell', seat, on: false });
      return;
    case 'item': {
      const id = s.items[a.slot]!;
      s.items[a.slot] = null;
      emit(env, { k: 'item', seat, id });
      ITEMS.get(id)!.use(new Ctx(env, seat, null, {}, a.tg ?? []));
      checkOver(env);
      return;
    }
    case 'ghost': {
      s.ghost = true;
      const mate = other(seat);
      if (a.kind === 'bone') gainBones(env, mate, 1);
      else if (a.tg) {
        const c = at(b, a.tg);
        if (c) b.marks.push(c.uid);
        emit(env, { k: 'mark', uid: c?.uid });
      }
      emit(env, { k: 'ghost', seat, kind: a.kind });
      return;
    }
    case 'play':
      playCard(env, seat, a);
      return;
  }
}

function playCard(env: Env, seat: Seat, a: Extract<BattleAction, { t: 'play' }>): void {
  const b = env.b;
  const s = b.seats[seat];
  const idx = s.hand.findIndex((x) => x.uid === a.uid);
  const c = s.hand[idx];
  const def = cardDef(c.id);
  const cost = costOf(b, seat, c);
  s.hand.splice(idx, 1);
  s.energy -= cost.energy;
  s.bones -= cost.bones;
  if (cost.energy || cost.bones) emit(env, { k: 'pay', seat, energy: s.energy, bones: s.bones });
  if ((c.cost.blood ?? 0) > 0 && s.c.bloodLess) s.c.bloodLess = 0;
  if ((c.cost.energy ?? 0) > 0 && s.c.energyLess) s.c.energyLess = 0;
  if ((c.cost.bones ?? 0) > 0 && s.c.bonesLess) s.c.bonesLess = 0;
  for (const lane of a.sac ?? []) {
    const v = b.p[lane];
    if (!v) continue;
    emit(env, { k: 'sac', uid: v.uid, lane });
    fireCard(env, v, 'sacrificed');
    fireSeat(env, seat, 'seatSac', v);
    if (hasKw(v, 'Spare Lives')) continue;
    die(env, v, null);
  }
  emit(env, { k: 'play', seat, uid: c.uid, id: c.id, lane: a.lane ?? null });
  const tg = a.tg ?? [];
  const twice = def.kind === 'spell' && (s.c.twice ?? 0) > 0;
  if (twice) s.c.twice -= 1;
  if (def.kind === 'creature') {
    placePlayer(env, c, a.lane!, 'play');
    for (const inst of [...c.ab]) {
      const fn = ability(inst.a).play;
      if (fn && !inst.off) fn(new Ctx(env, seat, c, paramsOf(inst), tg));
    }
  } else {
    for (let i = 0; i < (twice ? 2 : 1); i++) {
      for (const inst of [...c.ab]) {
        const fn = ability(inst.a).play;
        if (fn && !inst.off) fn(new Ctx(env, seat, c, paramsOf(inst), tg));
      }
    }
    if (hasKw(c, 'Exhaust') || def.tags.includes('token')) {
      s.exhaust.push(c);
      emit(env, { k: 'exhaust', seat, uid: c.uid });
    } else s.discard.push(c);
  }
  s.c.playedTurn = b.turn;
  fireSeat(env, seat, 'seatPlay', c);
  fireBoard(env, 'seatPlay', (x) => x.side === 'p' && x.seat === seat && x !== c, c);
  if (b.seats[other(seat)].alive) {
    fireSeat(env, other(seat), 'partnerPlay', c);
    fireBoard(env, 'partnerPlay', (x) => x.side === 'p' && x.seat === other(seat), c);
  }
  checkOver(env);
}

// ---------------------------------------------------------------- the round

export function strikeLanes(c: CardInst, lane: number): number[] {
  let lanes = [lane];
  if (hasKw(c, 'Triple Strike')) lanes = [lane - 1, lane, lane + 1];
  else if (hasKw(c, 'Split Strike')) lanes = [lane - 1, lane + 1];
  return lanes.filter((l) => l >= 0 && l < LANES);
}

function attack(env: Env, c: CardInst, lane: number): void {
  const b = env.b;
  if ((c.st.stun ?? 0) > 0) {
    c.st.stun -= 1;
    if (!c.st.stun) delete c.st.stun;
    emit(env, { k: 'stunned', uid: c.uid });
    return;
  }
  let power = powerOf(b, c);
  if ((c.st.weak ?? 0) > 0) power = Math.max(0, power - 2);
  if (power <= 0) return;
  const lanes = strikeLanes(c, lane).filter((l) => laneActive(b, l));
  if (lanes.length === 0) return;
  emit(env, { k: 'attack', uid: c.uid, lane, to: lanes, side: c.side });
  for (const t of lanes) {
    if (b.over || !onBoardUid(b, c)) return;
    const defender = c.side === 'p' ? b.e[t] : b.p[t];
    if (defender && hasKw(defender, 'Repulsive')) continue;
    if (c.side === 'p') {
      let foe = b.e[t];
      if (foe && hasKw(c, 'Airborne') && !hasKw(foe, 'Reach')) foe = null;
      if (foe && hasKw(foe, 'Submerge')) foe = null;
      if (foe) damage(env, foe, power, c, true);
      else scaleWin(env, ownerOf(t), power);
    } else {
      let mine = b.p[t];
      if (!mine) mine = burrow(env, t);
      if (mine && hasKw(c, 'Airborne') && !hasKw(mine, 'Reach')) mine = null;
      if (mine && hasKw(mine, 'Submerge')) mine = null;
      if (mine) damage(env, mine, power, c, true);
      else scaleLoss(env, ownerOf(t), power);
    }
  }
}

const onBoardUid = (b: Battle, c: CardInst): boolean =>
  b.p.some((x) => x?.uid === c.uid) || b.e.some((x) => x?.uid === c.uid);

function burrow(env: Env, lane: number): CardInst | null {
  const b = env.b;
  for (const l of lanesOf(ownerOf(lane))) {
    const c = b.p[l];
    if (c && l !== lane && hasKw(c, 'Burrower') && moveCard(env, c, lane)) return c;
  }
  return null;
}

function tickStatuses(env: Env, side: 'p' | 'e'): void {
  const b = env.b;
  for (const c of (side === 'p' ? b.p : b.e).filter((x): x is CardInst => !!x)) {
    c.tmp = 0;
    const poison = c.st.poison ?? 0;
    if (poison > 0) {
      damage(env, c, poison, null);
      if (c.st.poison) c.st.poison -= 1;
    }
    for (const s of ['vulnerable', 'weak', 'intangible']) {
      if (c.st[s]) {
        c.st[s] -= 1;
        if (!c.st[s]) delete c.st[s];
      }
    }
    if (c.st.poison === 0) delete c.st.poison;
    if (b.over) return;
  }
}

function resolveRound(env: Env): void {
  const b = env.b;
  emit(env, { k: 'combat', turn: b.turn });
  for (let lane = 0; lane < LANES && !b.over; lane++) {
    const c = b.p[lane];
    if (c && laneActive(b, lane)) attack(env, c, lane);
  }
  if (b.over) return;
  playerTurnEnd(env);
  if (b.over) return;
  enemyTurn(env);
  if (b.over) return;
  if (b.turn >= MAX_ROUNDS) {
    for (const seat of SEATS) if (b.seats[seat].alive && !b.seats[seat].won) scaleLoss(env, seat, 99);
    if (b.over) return;
  }
  startTurn(env);
}

function playerTurnEnd(env: Env): void {
  const b = env.b;
  fireBoard(env, 'turnEnd', (c) => c.side === 'p');
  for (const seat of SEATS) {
    const s = b.seats[seat];
    if (!s.alive) continue;
    for (const prog of [...s.programs]) {
      const fn = ability(prog.a).tick;
      if (fn) fn(new Ctx(env, seat, null, paramsOf(prog), []));
      if (b.over) return;
    }
    fireSeat(env, seat, 'turnEnd');
    const keep: CardInst[] = [];
    for (const c of s.hand) {
      if (hasKw(c, 'Ethereal')) {
        s.exhaust.push(c);
        emit(env, { k: 'fade', seat, uid: c.uid });
      } else keep.push(c);
    }
    s.hand = keep;
    for (const st of ['frail', 'weak', 'vulnerable']) {
      if (s.st[st]) {
        s.st[st] -= 1;
        if (!s.st[st]) delete s.st[st];
      }
    }
    if ((s.c.blessed ?? 0) > 0) s.c.blessed = 0;
  }
  for (const rule of b.rules) runRule(env, rule, 'turnEnd');
  tickStatuses(env, 'p');
}

function enemyTurn(env: Env): void {
  const b = env.b;
  emit(env, { k: 'foeTurn', turn: b.turn });
  for (let lane = 0; lane < LANES; lane++) {
    const half = ownerOf(lane);
    if (!laneActive(b, lane) || b.seats[half].won) continue;
    const queued = b.q[lane];
    if (queued && !b.e[lane]) {
      b.q[lane] = null;
      emit(env, { k: 'advance', uid: queued.uid, lane });
      placeEnemy(env, queued, 'e', lane);
    }
  }
  fireBoard(env, 'turnStart', (c) => c.side === 'e');
  for (let lane = 0; lane < LANES && !b.over; lane++) {
    const c = b.e[lane];
    if (c) attack(env, c, lane);
  }
  if (b.over) return;
  fireBoard(env, 'turnEnd', (c) => c.side === 'e');
  tickStatuses(env, 'e');
  if (b.over) return;
  for (const half of SEATS) {
    const f = b.foe[half];
    const poison = f.st.poison ?? 0;
    if (poison > 0 && b.seats[half].alive) {
      emit(env, { k: 'foePoison', half, n: poison });
      scaleWin(env, half, poison);
      f.st.poison = poison - 1;
    }
  }
  if (b.over) return;
  placeAll(env);
}

function startTurn(env: Env): void {
  const b = env.b;
  b.turn += 1;
  b.marks = [];
  emit(env, { k: 'turn', turn: b.turn });
  for (const seat of SEATS) {
    const s = b.seats[seat];
    s.ghost = false;
    if (!s.alive) continue;
    s.maxEnergy = Math.min(MAX_ENERGY, s.maxEnergy + 1);
    s.energy = s.maxEnergy;
    if (!(s.c.keepBlock ?? 0)) s.block = 0;
    s.rung = false;
    s.drew = false;
    if (s.deck.length + s.discard.length + s.side.length === 0) {
      s.drew = true;
      s.c.starve = (s.c.starve ?? 0) + 1;
      if (!s.won) {
        const hunger = makeInst(b, 'hunger', seat, 'e');
        hunger.power = 2 * s.c.starve;
        b.foe[seat].backlog.unshift(hunger);
        emit(env, { k: 'starve', seat, n: s.c.starve });
      }
    }
  }
  fireBoard(env, 'turnStart', (c) => c.side === 'p');
  for (const seat of SEATS) if (b.seats[seat].alive) fireSeat(env, seat, 'turnStart');
  for (const rule of b.rules) runRule(env, rule, 'turnStart');
  checkOver(env);
}

// ---------------------------------------------------------------- results

export interface BattleOutcome {
  r: 'win' | 'loss';
  seats: { alive: boolean; candles: number; teeth: number; items: (string | null)[] }[];
}

export function outcome(b: Battle): BattleOutcome | null {
  if (!b.over) return null;
  return {
    r: b.over,
    seats: b.seats.map((s) => ({ alive: s.alive, candles: s.candles, teeth: s.teeth, items: [...s.items] })),
  };
}

export { remove, HALF, kwValue };
