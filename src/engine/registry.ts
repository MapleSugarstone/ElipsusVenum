import type { Ctx } from './fx.ts';
import type { AbilityInst, Battle, CardInst, ChoiceOption, Cost, Num, Placement, Row, Seat } from './types.ts';

/** Every trigger a rules line can react to. Each runs with `c.self` set to the card that owns the line. */
export interface Hooks {
  /** A spell resolves, or a creature is played from hand. */
  play?(c: Ctx): void;
  /** A creature enters the board by any route. */
  enter?(c: Ctx): void;
  death?(c: Ctx): void;
  sacrificed?(c: Ctx): void;
  struck?(c: Ctx, by: CardInst | null, n: number, attack: boolean): void;
  kill?(c: Ctx, victim: CardInst): void;
  /** Start of the owning side's turn. */
  turnStart?(c: Ctx): void;
  /** End of the owning side's turn, after its attacks. */
  turnEnd?(c: Ctx): void;
  allyDies?(c: Ctx, dead: CardInst): void;
  foePlaced?(c: Ctx, card: CardInst, lane: number): void;
  /** Power this line adds to `target`, recomputed whenever power is read. */
  powerMod?(c: Ctx, target: CardInst): number;
  /** Seat-level lines (powers, relics, programs). */
  seatPlay?(c: Ctx, card: CardInst): void;
  partnerPlay?(c: Ctx, card: CardInst): void;
  seatSac?(c: Ctx, victim: CardInst): void;
  battleStart?(c: Ctx): void;
  tick?(c: Ctx): void;
  evoke?(c: Ctx): void;
  /** Resolves a pending choice with the option picked. */
  chosen?(c: Ctx, pick: ChoiceOption): void;
  /** Runs when a delayed effect comes due. */
  later?(c: Ctx): void;
  /** Terrain: a creature enters this lane's player or enemy row. `c.lane()` is the lane. */
  terrainEnter?(c: Ctx, card: CardInst): void;
  /** Terrain: the end of the players' turn. */
  terrainEnd?(c: Ctx): void;
  /** Seat: an enemy creature in this seat's half dies. */
  foeDies?(c: Ctx, dead: CardInst): void;
  /** Seat: one of this seat's candles goes out. The seat dies after this hook if no candle is lit. */
  candleOut?(c: Ctx, left: number): void;
  /** Seat: a living seat wins its half. Fires for both seats. */
  halfWon?(c: Ctx, winner: Seat): void;
}

export interface AbilityDef extends Hooks {
  id: string;
  /** Rules text. `{name}` inserts the line's own param of that name. */
  text: string;
  /** Keyword name. The line renders as the bold keyword, followed by its value when it has `p.n`. */
  kw?: string;
  /** Glossary entry for a keyword. */
  tip?: string;
  p?: Num;
  /** Render after the card's other lines. */
  end?: boolean;
}

export interface TargetSpec {
  row: Row | 'lane';
  /** own: the acting seat's lanes (default). any: every active lane. partner: the other seat's lanes. */
  who?: 'own' | 'any' | 'partner';
  need?: 'card' | 'empty' | 'either';
  opt?: boolean;
  ok?(b: Battle, card: CardInst | null, seat: Seat): boolean;
}

export type Pool = 'shared' | 'blue' | 'pistachio' | 'enemy' | 'token' | 'side' | 'curse';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'special';

export interface Upgrade {
  p?: Num;
  power?: number;
  health?: number;
  cost?: Cost;
  kw?: (string | [string, number])[];
}

export interface CardDef {
  id: string;
  name: string;
  kind: 'creature' | 'spell';
  pool: Pool;
  rarity: Rarity;
  cost: Cost;
  power: number;
  health: number;
  tribe?: string;
  ab: AbilityInst[];
  tg: TargetSpec[];
  up?: Upgrade;
  tags: string[];
}

type LineSpec = Hooks & { text: string; p?: Num };

export interface CardSpec extends Hooks {
  id: string;
  name: string;
  kind?: 'creature' | 'spell';
  pool?: Pool;
  rarity?: Rarity;
  cost?: Cost;
  power?: number;
  health?: number;
  tribe?: string;
  kw?: (string | [string, number])[];
  text?: string;
  p?: Num;
  lines?: LineSpec[];
  tg?: TargetSpec[];
  up?: Upgrade;
  tags?: string[];
}

export const ABILITIES = new Map<string, AbilityDef>();
export const CARDS = new Map<string, CardDef>();

const HOOK_NAMES: (keyof Hooks)[] = [
  'play', 'enter', 'death', 'sacrificed', 'struck', 'kill', 'turnStart', 'turnEnd', 'allyDies', 'foePlaced',
  'powerMod', 'seatPlay', 'partnerPlay', 'seatSac', 'battleStart', 'tick', 'evoke', 'chosen', 'later', 'terrainEnter', 'terrainEnd',
  'foeDies', 'candleOut', 'halfWon',
];

export function defAbility(def: AbilityDef): AbilityDef {
  if (ABILITIES.has(def.id)) throw new Error(`duplicate ability ${def.id}`);
  ABILITIES.set(def.id, def);
  return def;
}

/** Every bold term and its rules, for hover help. Keywords add themselves. */
export const GLOSSARY = new Map<string, string>();
export function defTerm(name: string, tip: string): void {
  GLOSSARY.set(name, tip);
}

export function defKeyword(name: string, tip: string, hooks: Hooks & { p?: Num; end?: boolean } = {}): AbilityDef {
  defTerm(name, tip);
  return defAbility({ id: kwId(name), text: '', kw: name, tip, ...hooks });
}

export const kwId = (name: string): string => `kw:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

export function kwInst(entry: string | [string, number]): AbilityInst {
  if (typeof entry === 'string') return { a: kwId(entry) };
  return { a: kwId(entry[0]), p: { n: entry[1] } };
}

function pickHooks(src: Hooks): Hooks {
  const out: Hooks = {};
  for (const name of HOOK_NAMES) if (src[name]) (out as Record<string, unknown>)[name] = src[name];
  return out;
}

export function defCard(spec: CardSpec): CardDef {
  if (CARDS.has(spec.id)) throw new Error(`duplicate card ${spec.id}`);
  const kind = spec.kind ?? (spec.power !== undefined || spec.health !== undefined ? 'creature' : 'spell');
  const ab: AbilityInst[] = (spec.kw ?? []).map(kwInst);
  const lines: LineSpec[] = spec.lines ? [...spec.lines] : [];
  if (spec.text !== undefined) lines.unshift({ text: spec.text, p: spec.p, ...pickHooks(spec) });
  lines.forEach((line, i) => {
    const id = `${spec.id}#${i}`;
    defAbility({ id, text: line.text, p: line.p, ...pickHooks(line) });
    ab.push(line.p ? { a: id, p: { ...line.p } } : { a: id });
  });
  const def: CardDef = {
    id: spec.id,
    name: spec.name,
    kind,
    pool: spec.pool ?? 'shared',
    rarity: spec.rarity ?? 'common',
    cost: spec.cost ?? {},
    power: spec.power ?? 0,
    health: spec.health ?? 0,
    tribe: spec.tribe,
    ab,
    tg: spec.tg ?? [],
    up: spec.up,
    tags: spec.tags ?? [],
  };
  CARDS.set(def.id, def);
  return def;
}

export function card(id: string): CardDef {
  const def = CARDS.get(id);
  if (!def) throw new Error(`unknown card ${id}`);
  return def;
}

export function ability(id: string): AbilityDef {
  const def = ABILITIES.get(id);
  if (!def) throw new Error(`unknown ability ${id}`);
  return def;
}

export interface ItemDef {
  id: string;
  name: string;
  text: string;
  rarity: Rarity;
  tg: TargetSpec[];
  use(c: Ctx): void;
}
export const ITEMS = new Map<string, ItemDef>();
export function defItem(def: ItemDef): ItemDef {
  if (ITEMS.has(def.id)) throw new Error(`duplicate item ${def.id}`);
  ITEMS.set(def.id, def);
  return def;
}

export interface RelicDef extends Hooks {
  id: string;
  name: string;
  text: string;
  rarity: Rarity | 'boss' | 'start';
  pool: Pool;
  /** Run-level effect applied once when the relic is gained. */
  gain?(run: unknown, seat: Seat): void;
  /** Run level, given the event toolbox: the players enter a node of this kind. */
  enterNode?(r: unknown, seat: Seat, kind: string): void;
  /** Run level, given the event toolbox: the players win a battle of this tier. */
  afterWin?(r: unknown, seat: Seat, tier: string): void;
  /** Run level, given the event toolbox: this seat's last candle would go out outside a battle. True keeps it lit. */
  dying?(r: unknown, seat: Seat): boolean;
  /** Treasure chests and elite fights offer this many more relics to choose from. */
  moreRelics?: number;
  /** Treasure chests let this seat take this many more relics. */
  morePicks?: number;
  /** Shops sell this seat cards and items for this many fewer teeth. */
  discount?: number;
}
export const RELICS = new Map<string, RelicDef>();
export function defRelic(def: RelicDef): RelicDef {
  if (RELICS.has(def.id)) throw new Error(`duplicate relic ${def.id}`);
  RELICS.set(def.id, def);
  defAbility({ ...def, id: `relic:${def.id}`, text: def.text });
  return def;
}

export interface HalfDef {
  id: string;
  act: number;
  tier: 'normal' | 'elite' | 'boss';
  /** Cards on the enemy row when the battle starts. */
  front?: Placement[];
  /** Placements into the queue, one list per enemy turn. The first list is placed before turn 1. */
  turns: Placement[][];
  /** Repeats after `turns` runs out. */
  loop?: Placement[][];
}
export interface BossDef {
  id: string;
  name: string;
  act: number;
  /** Each phase replaces both halves. Winning both halves of the last phase wins the battle. */
  phases: { halves: [string, string]; rules?: string[]; line?: string }[];
}
export const BOSSES = new Map<string, BossDef>();
export function defBoss(def: BossDef): BossDef {
  if (BOSSES.has(def.id)) throw new Error(`duplicate boss ${def.id}`);
  BOSSES.set(def.id, def);
  return def;
}

export const HALVES = new Map<string, HalfDef>();
export function defHalf(def: HalfDef): HalfDef {
  if (HALVES.has(def.id)) throw new Error(`duplicate encounter half ${def.id}`);
  HALVES.set(def.id, def);
  return def;
}
