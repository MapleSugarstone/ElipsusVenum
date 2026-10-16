import { defAbility, defBoss, defCard, defHalf } from '../engine/registry.ts';
import type { Ctx } from '../engine/fx.ts';

const foe = { pool: 'enemy' as const, rarity: 'special' as const };
const P = (id: string, lane?: number) => (lane === undefined ? { id } : { id, lane });

defCard({
  ...foe, id: 'abyss-eye', name: 'Abyss Eye', power: 0, health: 12,
  text: 'At the start of its turn: apply 2 Weak to the creature across from it.',
  turnStart(c) {
    c.status(c.opposite(), 'weak', 2);
  },
});
defCard({ ...foe, id: 'dread-knight', name: 'Dread Knight', power: 8, health: 16, kw: ['Shield'] });
defCard({ ...foe, id: 'venom-bat', name: 'Venom Bat', power: 2, health: 4, kw: ['Airborne', 'Deadly'] });
defCard({ ...foe, id: 'chimera', name: 'Chimera', power: 4, health: 12, kw: ['Triple Strike'] });
defCard({ ...foe, id: 'lich', name: 'Lich', power: 2, health: 12, kw: [['Leader', 2]] });
defCard({
  ...foe, id: 'devourer', name: 'Devourer', power: 10, health: 20,
  text: 'When this kills a creature: it gains 4 health.',
  kill(c) {
    c.buff(c.self, 0, 4);
  },
});
defCard({ ...foe, id: 'unfinished-monster', name: 'Unfinished Monster', power: 6, health: 8 });
defCard({
  ...foe, id: 'void-spider', name: 'Void Spider', power: 4, health: 8,
  text: 'When struck: apply 2 Poison to the attacker.',
  struck(c, by, _n, attack) {
    if (attack && by) c.status(by, 'poison', 2);
  },
});
defCard({
  ...foe, id: 'cult-elder', name: 'Cult Elder', power: 0, health: 10,
  text: 'At the start of its turn: this gains 4 power.',
  turnStart(c) {
    c.buff(c.self, 4, 0);
  },
});

defHalf({ id: 'abyss', act: 3, tier: 'normal', front: [P('abyss-eye', 1)], turns: [[P('void-spider', 2)], [], [], [P('void-spider')], [], []], loop: [[P('void-spider')], [], [], []] });
defHalf({ id: 'dread', act: 3, tier: 'normal', turns: [[P('dread-knight', 1)], [], [], [P('unfinished-monster')], [], []], loop: [[P('unfinished-monster')], [], [], []] });
defHalf({ id: 'venom', act: 3, tier: 'normal', turns: [[P('venom-bat', 0), P('venom-bat', 3)], [], [P('void-spider')], [], [P('venom-bat')], []], loop: [[P('venom-bat')], [], [], []] });
defHalf({ id: 'chimeras', act: 3, tier: 'normal', turns: [[P('chimera', 2)], [], [], [P('unfinished-monster')], [], []], loop: [[P('unfinished-monster')], [], [], []] });
defHalf({ id: 'lich-court', act: 3, tier: 'normal', front: [P('lich', 2)], turns: [[P('skeleton', 1), P('skeleton', 3)], [], [P('skeleton')], [], [P('dread-knight')], []], loop: [[P('skeleton')], [], []] });
defHalf({ id: 'unfinished', act: 3, tier: 'normal', turns: [[P('unfinished-monster', 1)], [], [P('unfinished-monster', 2)], [], [], [P('unfinished-monster')]], loop: [[P('unfinished-monster')], [], [], []] });
defHalf({ id: 'devourer', act: 3, tier: 'elite', turns: [[P('devourer', 1)], [], [P('void-spider')], [], [], [P('venom-bat')]], loop: [[P('void-spider')], [], [], []] });
defHalf({ id: 'elders', act: 3, tier: 'elite', turns: [[P('cult-elder', 1), P('cult-elder', 2)], [], [P('abyss-eye')], [], [], [P('cult-elder')]], loop: [[P('void-spider')], [], [], []] });
defHalf({ id: 'knight-lich', act: 3, tier: 'elite', front: [P('lich', 0)], turns: [[P('dread-knight', 1)], [], [P('skeleton')], [], [P('dread-knight')], []], loop: [[P('skeleton')], [], []] });

// ------------------------------------------------------------ the final boss

const HOUSE_RULES: { text: string; run(c: Ctx): void }[] = [
  {
    text: 'New rule: his creatures have 2 more power this turn.',
    run(c) {
      for (const e of c.enemies()) c.temp(e, 2);
    },
  },
  {
    text: 'New rule: everybody draws a card. Even you. That was a mistake.',
    run(c) {
      for (const seat of [0, 1] as const) if (c.b.seats[seat].alive) c.draw(1, seat);
    },
  },
  {
    text: 'New rule: his creatures heal 4. Because he said so.',
    run(c) {
      for (const e of c.enemies()) c.heal(e, 4);
    },
  },
  {
    text: 'New rule: he forgot the rule. Nothing happens.',
    run() {},
  },
  {
    text: 'New rule: you both get 2 Block. He meant to give it to himself.',
    run(c) {
      for (const seat of [0, 1] as const) if (c.b.seats[seat].alive) c.block(2, seat);
    },
  },
];

function houseRule(c: Ctx): void {
  const rule = HOUSE_RULES[c.rand(HOUSE_RULES.length)];
  c.emit({ k: 'houseRule', text: rule.text });
  rule.run(c);
}

defAbility({
  id: 'rule:ybf', text: 'House rule: at the start of your turn, Your Best Friend makes up a new rule.',
  turnStart(c) {
    houseRule(c);
  },
});

defCard({
  ...foe, id: 'your-best-friend', name: 'Your Best Friend', power: 8, health: 40, kw: ['Shield', ['Leader', 2]],
  text: 'At the start of its turn: this gains Shield if it has none.',
  turnStart(c) {
    if (c.self && !(c.self.st.shield ?? 0)) c.status(c.self, 'shield', 1);
  },
});
defCard({ ...foe, id: 'other-hand', name: 'His Other Hand', power: 6, health: 24, kw: ['Split Strike'] });

defHalf({ id: 'ybf-1a', act: 3, tier: 'boss', front: [P('goblin-chief', 1)], turns: [[P('small-dragon', 2)], [], [P('knight')], [], [P('troll')]], loop: [[P('goblin-again')], [], []] });
defHalf({ id: 'ybf-1b', act: 3, tier: 'boss', front: [P('mirror-knight', 2)], turns: [[P('harpy', 0)], [], [P('wraith')], [], [P('chimera')]], loop: [[P('harpy')], [], []] });
defHalf({ id: 'ybf-2a', act: 3, tier: 'boss', turns: [[P('dread-knight', 1)], [], [P('venom-bat')], [], [P('devourer')]], loop: [[P('unfinished-monster')], [], []] });
defHalf({ id: 'ybf-2b', act: 3, tier: 'boss', front: [P('lich', 3)], turns: [[P('skeleton', 1), P('skeleton', 2)], [], [P('dread-knight')], []], loop: [[P('skeleton')], [], []] });
defHalf({ id: 'ybf-3a', act: 3, tier: 'boss', front: [P('your-best-friend', 3)], turns: [[P('goblin', 1)], [], [], [P('unfinished-monster')]], loop: [[P('goblin')], [], []] });
defHalf({ id: 'ybf-3b', act: 3, tier: 'boss', front: [P('other-hand', 0)], turns: [[P('placeholder-foe', 2)], [], [], [P('unfinished-monster')]], loop: [[P('placeholder-foe')], [], []] });
defCard({ ...foe, id: 'placeholder-foe', name: 'Enemy Placeholder', power: 2, health: 4 });

defBoss({
  id: 'your-best-friend', name: 'Your Best Friend', act: 3,
  phases: [
    { halves: ['ybf-1a', 'ybf-1b'], line: 'Okay. This is the last part. I put all my favorite things in it.' },
    { halves: ['ybf-2a', 'ybf-2b'], rules: ['rule:ybf'], line: 'I am changing the rules now. That is allowed. I checked.' },
    {
      halves: ['ybf-3a', 'ybf-3b'], rules: ['rule:ybf'],
      line: 'Fine. I will do it myself. You were supposed to stay. We were having fun.',
    },
  ],
});
