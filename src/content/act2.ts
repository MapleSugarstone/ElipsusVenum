import { defAbility, defBoss, defCard, defHalf } from '../engine/registry.ts';
import { powerOf } from '../engine/fx.ts';
import { lanesOf, type Seat } from '../engine/types.ts';

const foe = { pool: 'enemy' as const, rarity: 'special' as const };
const P = (id: string, lane?: number) => (lane === undefined ? { id } : { id, lane });

defCard({ ...foe, id: 'orc', name: 'Orc', power: 4, health: 8 });
defCard({ ...foe, id: 'goblin-again', name: 'Goblin (Again)', power: 4, health: 4 });
defCard({
  ...foe, id: 'orc-shaman', name: 'Orc Shaman', power: 2, health: 6,
  text: 'At the start of its turn: each other enemy creature in its half heals 2.',
  turnStart(c) {
    const self = c.self;
    if (!self) return;
    for (const e of c.enemies(self.seat)) if (e !== self) c.heal(e, 2);
  },
});
defCard({ ...foe, id: 'wraith', name: 'Wraith', power: 4, health: 4, kw: ['Airborne', 'Submerge'] });
defCard({ ...foe, id: 'golem', name: 'Golem', power: 2, health: 12, kw: [['Armor', 1]] });
defCard({
  ...foe, id: 'bomb-imp', name: 'Bomb Imp', power: 2, health: 4,
  text: 'When this dies: deal 4 damage to the creature across from it.',
  death(c) {
    const lane = c.self?.c.lane ?? -1;
    if (lane >= 0) c.damage(c.b.p[lane], 4);
  },
});
defCard({
  ...foe, id: 'necromancer', name: 'Necromancer', power: 0, health: 8,
  text: 'At the start of its turn: summon a Skeleton into an empty queue slot in its half.',
  turnStart(c) {
    const self = c.self;
    if (!self) return;
    const empty = lanesOf(self.seat).filter((l) => !c.b.q[l]);
    if (empty.length) c.enemySummon('skeleton', empty[c.rand(empty.length)], 'q');
  },
});
defCard({ ...foe, id: 'mirror-knight', name: 'Mirror Knight', power: 4, health: 10, kw: ['Shield', ['Thorns', 2]] });
defCard({ ...foe, id: 'harpy', name: 'Harpy', power: 4, health: 6, kw: ['Airborne'] });
defCard({ ...foe, id: 'troll', name: 'Troll', power: 8, health: 14, kw: [['Regenerate', 4]] });

defHalf({ id: 'orc-camp', act: 2, tier: 'normal', turns: [[P('orc', 1)], [], [P('goblin-again', 2)], [], [P('orc')], []], loop: [[P('goblin-again')], [], []] });
defHalf({ id: 'haunted', act: 2, tier: 'normal', turns: [[P('wraith', 0)], [P('wraith', 3)], [], [], [P('wraith')], []], loop: [[P('wraith')], [], [], []] });
defHalf({ id: 'quarry', act: 2, tier: 'normal', front: [P('golem', 1)], turns: [[P('goblin-again', 2)], [], [], [P('golem')], [], []], loop: [[P('goblin-again')], [], [], []] });
defHalf({ id: 'necro', act: 2, tier: 'normal', front: [P('necromancer', 3)], turns: [[P('skeleton', 1)], [], [], [P('orc')], [], []], loop: [[P('skeleton')], [], [], []] });
defHalf({ id: 'harpies', act: 2, tier: 'normal', turns: [[P('harpy', 1)], [], [P('harpy', 2)], [], [P('goblin-again')], []], loop: [[P('harpy')], [], [], []] });
defHalf({ id: 'bombers', act: 2, tier: 'normal', turns: [[P('bomb-imp', 0), P('bomb-imp', 2)], [], [P('orc')], [], [P('bomb-imp')], []], loop: [[P('bomb-imp')], [], []] });
defHalf({ id: 'troll', act: 2, tier: 'elite', turns: [[P('troll', 1)], [], [P('goblin-again')], [], [P('orc')], []], loop: [[P('goblin-again')], [], []] });
defHalf({ id: 'mirror-hall', act: 2, tier: 'elite', front: [P('mirror-knight', 2)], turns: [[P('goblin-again', 0)], [], [P('mirror-knight')], [], [], []], loop: [[P('goblin-again')], [], []] });
defHalf({ id: 'shaman-band', act: 2, tier: 'elite', front: [P('orc-shaman', 3)], turns: [[P('orc', 1)], [], [P('orc')], [], [P('orc-shaman')], []], loop: [[P('orc')], [], [], []] });

// ------------------------------------------------------------ act 2 boss

defCard({
  ...foe, id: 'the-copycat', name: 'The Copycat', power: 4, health: 20, kw: ['Shield'],
  text: 'At the start of its turn: this takes the power of the strongest creature in the player row.',
  turnStart(c) {
    const self = c.self;
    if (!self) return;
    const mine = c.allAllies();
    if (mine.length === 0) return;
    const top = Math.max(...mine.map((x) => powerOf(c.b, x)));
    if (top !== self.power) c.buff(self, top - self.power, 0);
  },
});

defAbility({
  id: 'rule:copycat', text: 'House rule: every third turn, each half gets an enemy copy of its strongest creature in the queue.',
  turnEnd(c) {
    if (c.b.turn % 3 !== 0) return;
    for (const half of [0, 1] as Seat[]) {
      const s = c.b.seats[half];
      if (!s.alive || s.won) continue;
      const mine = c.allies(half);
      if (mine.length === 0) continue;
      const top = mine.reduce((a, x) => (powerOf(c.b, x) > powerOf(c.b, a) ? x : a));
      const empty = lanesOf(half).filter((l) => !c.b.q[l]);
      if (empty.length) c.enemySummon(top.id, empty[c.rand(empty.length)], 'q');
    }
  },
});

defHalf({ id: 'copy-1a', act: 2, tier: 'boss', front: [P('orc', 1)], turns: [[P('harpy', 2)], [], [P('orc')], [], [P('troll')]], loop: [[P('goblin-again')], [], []] });
defHalf({ id: 'copy-1b', act: 2, tier: 'boss', front: [P('golem', 2)], turns: [[P('wraith', 0)], [], [P('orc')], [], [P('mirror-knight')]], loop: [[P('wraith')], [], []] });
defHalf({ id: 'copy-2a', act: 2, tier: 'boss', front: [P('the-copycat', 3)], turns: [[P('goblin-again', 1)], [], [], [P('orc')]], loop: [[P('goblin-again')], [], []] });
defHalf({ id: 'copy-2b', act: 2, tier: 'boss', front: [P('mirror-knight', 0)], turns: [[P('harpy', 2)], [], [], [P('orc')]], loop: [[P('harpy')], [], []] });

defBoss({
  id: 'the-copycat', name: 'The Copycat', act: 2,
  phases: [
    { halves: ['copy-1a', 'copy-1b'], line: 'This castle is original. I made it. Do not look too closely at it.' },
    {
      halves: ['copy-2a', 'copy-2b'], rules: ['rule:copycat'],
      line: 'This is the Copycat. It copies your best stuff. I came up with that myself. Mostly.',
    },
  ],
});
