// Enemies with their own mechanics, so each act plays differently: terrain they leave in your lanes, bonds between them,
// eggs that hatch, thieves, and curses. Also the Mimic Hoard, the boss inside the Suspicious Chest.
import { defAbility, defBoss, defCard, defHalf } from '../engine/registry.ts';
import type { Ctx } from '../engine/fx.ts';
import { lanesOf, type CardInst, type Seat } from '../engine/types.ts';

const foe = { pool: 'enemy' as const, rarity: 'special' as const };
const P = (id: string, lane?: number) => (lane === undefined ? { id } : { id, lane });
const half = (c: Ctx): Seat => c.self?.seat ?? 0;

// ---------------------------------------------------------------- terrain enemies leave

defAbility({
  id: 'terrain:spikes', text: 'Spikes. The next creature of yours that enters this lane takes {n} damage, then the Spikes break.', p: { n: 4 },
  terrainEnter(c, card) {
    if (card.side !== 'p') return;
    c.damage(card, c.p.n);
    c.clearTerrain(c.lane());
  },
});
defAbility({
  id: 'terrain:cinders', text: 'Cinders. At the end of your turn: deal {n} damage to your creature in this lane.', p: { n: 2 },
  terrainEnd(c) {
    c.damage(c.b.p[c.lane()], c.p.n);
  },
});
defAbility({
  id: 'terrain:web', text: 'Web. Your creature in this lane has {n} less power.', p: { n: 2 },
  powerMod(c, target) {
    return target.side === 'p' && c.b.p[c.lane()] === target ? -c.p.n : 0;
  },
});

// ---------------------------------------------------------------- act 1

defCard({
  ...foe, id: 'goblin-trapper', name: 'Goblin Trapper', power: 2, health: 4, p: { n: 4 },
  text: 'When this enters: put Spikes in an empty lane of the player across. They deal {n} damage.',
  enter(c) {
    if (c.self?.side !== 'e') return;
    const open = lanesOf(half(c)).filter((l) => !c.b.p[l] && !c.terrainAt(l));
    if (open.length) c.terrain(open[c.rand(open.length)], 'terrain:spikes', { n: c.p.n });
  },
});
defCard({
  ...foe, id: 'twin-goblin', name: 'Goblin Twin', power: 3, health: 4,
  text: 'When this enters: it bonds with another Goblin Twin in its row.',
  enter(c) {
    const self = c.self;
    if (!self || self.side !== 'e') return;
    const mate = c.b.e.find((x): x is CardInst => !!x && x !== self && x.id === 'twin-goblin' && !x.c.bond);
    if (mate) c.bond(self, mate);
  },
});
defCard({
  ...foe, id: 'dragon-egg', name: 'Dragon Egg', power: 0, health: 6,
  text: 'At the start of its second turn: this hatches into a Dragon (Small).',
  turnStart(c) {
    const self = c.self;
    if (!self) return;
    self.c.age = (self.c.age ?? 0) + 1;
    if (self.c.age >= 2) c.transform(self, 'small-dragon');
  },
});

// ---------------------------------------------------------------- act 2

defCard({
  ...foe, id: 'arsonist', name: 'Arsonist Imp', power: 2, health: 4, p: { n: 2 },
  text: 'At the end of its turn: light Cinders in the lane across from it. They deal {n} damage.',
  turnEnd(c) {
    const lane = c.laneOf();
    if (lane >= 0 && c.terrainAt(lane) !== 'terrain:cinders') c.terrain(lane, 'terrain:cinders', { n: c.p.n });
  },
});
defCard({
  ...foe, id: 'banshee', name: 'Banshee', power: 3, health: 6, kw: ['Airborne'], p: { n: 2 },
  text: 'At the end of its turn: your creatures in its half have {n} less power during your next turn.',
  turnEnd(c) {
    for (const x of c.allies(half(c))) c.temp(x, -c.p.n);
  },
});
/** Steals from the player across when nothing stands in the way. */
function rob(c: Ctx, n: number): void {
  const lane = c.laneOf();
  if (lane < 0 || c.b.p[lane]) return;
  c.teeth(-n, half(c));
}
defCard({
  ...foe, id: 'pickpocket', name: 'Pickpocket', power: 2, health: 3, p: { n: 3 },
  text: 'At the end of its turn: if no creature is across from it, the player across loses {n} teeth.',
  turnEnd(c) {
    rob(c, c.p.n);
  },
});

// ---------------------------------------------------------------- act 3

defCard({
  ...foe, id: 'hex-witch', name: 'Hex Witch', power: 2, health: 6,
  text: 'At the end of its turn: the player across adds a Bug to their hand.',
  turnEnd(c) {
    if (c.b.seats[half(c)].alive) c.add('bug', 1, half(c));
  },
});
defCard({
  ...foe, id: 'web-weaver', name: 'Web Weaver', power: 1, health: 6, p: { n: 2 },
  text: 'At the end of its turn: spin a Web in the lane across from it. It takes {n} power.',
  turnEnd(c) {
    const lane = c.laneOf();
    if (lane >= 0 && c.terrainAt(lane) !== 'terrain:web') c.terrain(lane, 'terrain:web', { n: c.p.n });
  },
});
defCard({
  ...foe, id: 'void-tendril', name: 'Void Tendril', power: 3, health: 8,
  text: 'When this enters: it bonds with the enemy creature with the most health in its half.',
  enter(c) {
    const self = c.self;
    if (!self || self.side !== 'e') return;
    const others = c.enemies(half(c)).filter((x) => x !== self && !x.c.bond);
    if (!others.length) return;
    c.bond(self, others.reduce((a, x) => (x.health > a.health ? x : a)));
  },
});
defCard({
  ...foe, id: 'eraser', name: 'The Eraser', power: 4, health: 8,
  text: 'When this enters: the creature across from it loses its rules text for the rest of the battle.',
  enter(c) {
    const t = c.opposite();
    if (!t || c.self?.side !== 'e') return;
    for (const a of t.ab) a.off = true;
    t.st.glitch = 1;
    c.emit({ k: 'status', uid: t.uid, s: 'glitch', v: 1 });
  },
});

// ---------------------------------------------------------------- the Mimic Hoard

defCard({
  ...foe, id: 'coin-mimic', name: 'Coin Mimic', power: 1, health: 3, p: { n: 2 },
  text: 'When this dies: the player across gains {n} teeth.',
  death(c) {
    c.teeth(c.p.n, half(c));
  },
});
defCard({
  ...foe, id: 'greedy-mimic', name: 'Greedy Mimic', power: 2, health: 6, p: { n: 3 },
  text: 'At the end of its turn: if no creature is across from it, the player across loses {n} teeth.',
  turnEnd(c) {
    rob(c, c.p.n);
  },
});
defCard({
  ...foe, id: 'mimic-king', name: 'The Mimic King', power: 4, health: 20, kw: [['Armor', 1]],
  text: 'At the start of its turn: a Coin Mimic fills an empty queue slot in its half.',
  turnStart(c) {
    const empty = lanesOf(half(c)).filter((l) => !c.b.q[l]);
    if (empty.length) c.enemySummon('coin-mimic', empty[c.rand(empty.length)], 'q');
  },
});
defAbility({
  id: 'rule:hoard', text: 'House rule: at the start of your turn, each enemy creature with no creature across from it gains {n} power.', p: { n: 1 },
  turnStart(c) {
    for (let lane = 0; lane < c.b.e.length; lane++) {
      const e = c.b.e[lane];
      if (e && !c.b.p[lane]) c.buff(e, c.p.n, 0);
    }
  },
});
defHalf({ id: 'hoard-1a', act: 0, tier: 'boss', front: [P('mimic', 1)], turns: [[P('coin-mimic', 0), P('coin-mimic', 3)], [], [P('mimic')], [], [P('greedy-mimic')]], loop: [[P('coin-mimic')], [], []] });
defHalf({ id: 'hoard-1b', act: 0, tier: 'boss', front: [P('greedy-mimic', 2)], turns: [[P('coin-mimic', 1)], [], [P('mimic')], [], [P('coin-mimic'), P('coin-mimic')]], loop: [[P('mimic')], [], []] });
defHalf({ id: 'hoard-2a', act: 0, tier: 'boss', front: [P('mimic-king', 1)], turns: [[P('greedy-mimic', 2)], [], [], [P('mimic')]], loop: [[P('greedy-mimic')], [], []] });
defHalf({ id: 'hoard-2b', act: 0, tier: 'boss', front: [P('mimic', 1), P('mimic', 2)], turns: [[P('coin-mimic', 0)], [], [P('greedy-mimic')], []], loop: [[P('mimic')], [], []] });
defBoss({
  id: 'mimic-hoard', name: 'The Mimic Hoard', act: 0,
  phases: [
    { halves: ['hoard-1a', 'hoard-1b'], line: 'Surprise. All of the chests were mimics. I thought that would be funny.' },
    { halves: ['hoard-2a', 'hoard-2b'], rules: ['rule:hoard'], line: 'This is the Mimic King. He is the biggest chest. He has the most teeth.' },
  ],
});

// ---------------------------------------------------------------- encounters

defHalf({ id: 'trappers', act: 1, tier: 'normal', turns: [[P('goblin-trapper', 1)], [], [P('goblin', 2)], [], [P('goblin-trapper')], []], loop: [[P('goblin')], [], []] });
defHalf({ id: 'twins', act: 1, tier: 'normal', turns: [[P('twin-goblin', 1), P('twin-goblin', 2)], [], [], [P('rat')], [], [P('twin-goblin'), P('twin-goblin')]], loop: [[P('rat')], [], []] });
defHalf({ id: 'nest', act: 1, tier: 'elite', front: [P('dragon-egg', 1), P('dragon-egg', 2)], turns: [[P('bat', 0)], [], [P('bat')], [], [P('dragon-egg')], []], loop: [[P('bat')], [], []] });
defHalf({ id: 'arsonists', act: 2, tier: 'normal', turns: [[P('arsonist', 1)], [], [P('orc', 2)], [], [P('arsonist')], []], loop: [[P('goblin-again')], [], []] });
defHalf({ id: 'banshees', act: 2, tier: 'normal', turns: [[P('banshee', 2)], [], [P('wraith', 1)], [], [P('banshee')], []], loop: [[P('wraith')], [], [], []] });
defHalf({ id: 'thieves', act: 2, tier: 'normal', turns: [[P('pickpocket', 0), P('pickpocket', 3)], [], [P('orc')], [], [P('pickpocket')], []], loop: [[P('pickpocket')], [], []] });
defHalf({ id: 'gang', act: 2, tier: 'elite', front: [P('arsonist', 1)], turns: [[P('banshee', 2)], [], [P('pickpocket')], [], [P('troll')], []], loop: [[P('arsonist')], [], []] });
defHalf({ id: 'hexes', act: 3, tier: 'normal', front: [P('hex-witch', 2)], turns: [[P('void-spider', 1)], [], [], [P('hex-witch')], [], []], loop: [[P('void-spider')], [], []] });
defHalf({ id: 'weavers', act: 3, tier: 'normal', turns: [[P('web-weaver', 1), P('web-weaver', 2)], [], [P('venom-bat')], [], [P('void-tendril')], []], loop: [[P('web-weaver')], [], []] });
defHalf({ id: 'tendrils', act: 3, tier: 'normal', front: [P('abyss-eye', 2)], turns: [[P('void-tendril', 1)], [], [P('void-tendril')], [], [P('eraser')], []], loop: [[P('void-tendril')], [], []] });
defHalf({ id: 'erasers', act: 3, tier: 'elite', turns: [[P('eraser', 1), P('eraser', 2)], [], [P('hex-witch')], [], [P('dread-knight')], []], loop: [[P('eraser')], [], []] });
