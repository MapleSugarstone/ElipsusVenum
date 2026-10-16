import { defAbility, defBoss, defCard, defHalf } from '../engine/registry.ts';
import { powerOf } from '../engine/fx.ts';

const foe = { pool: 'enemy' as const, rarity: 'special' as const };

defCard({
  ...foe, id: 'sir-tutorial', name: 'Sir Tutorial', power: 6, health: 20, kw: ['Shield', ['Leader', 2]],
  text: 'At the start of its turn: this gains Shield if it has none.',
  turnStart(c) {
    if (c.self && !(c.self.st.shield ?? 0)) c.status(c.self, 'shield', 1);
  },
});
defCard({ ...foe, id: 'tutorial-steed', name: 'Tutorial Steed', power: 4, health: 12, kw: ['Sprinter'] });

defAbility({
  id: 'rule:lesson', text: 'House rule: at the start of your turn, the enemy creature with the most power gains Shield.',
  turnStart(c) {
    const foes = c.enemies();
    if (foes.length === 0) return;
    const top = foes.reduce((a, x) => (powerOf(c.b, x) > powerOf(c.b, a) ? x : a));
    if (!(top.st.shield ?? 0)) c.status(top, 'shield', 1);
  },
});

const P = (id: string, lane?: number) => (lane === undefined ? { id } : { id, lane });
defHalf({ id: 'tut-1a', act: 1, tier: 'boss', front: [P('knight', 1)], turns: [[P('goblin', 0), P('grub', 2)], [], [P('goblin')], [], [P('knight')]], loop: [[P('goblin')], [], []] });
defHalf({ id: 'tut-1b', act: 1, tier: 'boss', front: [P('archer', 2)], turns: [[P('goblin', 1)], [], [P('archer')], [], [P('goblin-chief')]], loop: [[P('archer')], [], []] });
defHalf({ id: 'tut-2a', act: 1, tier: 'boss', front: [P('sir-tutorial', 3)], turns: [[P('goblin', 1)], [], [], [P('goblin')]], loop: [[P('goblin')], [], []] });
defHalf({ id: 'tut-2b', act: 1, tier: 'boss', front: [P('tutorial-steed', 0)], turns: [[P('archer', 2)], [], [], [P('knight')]], loop: [[P('archer')], [], []] });

defBoss({
  id: 'sir-tutorial', name: 'Sir Tutorial', act: 1,
  phases: [
    { halves: ['tut-1a', 'tut-1b'], line: 'Every game needs a boss that teaches you things. This is him. He is very qualified.' },
    {
      halves: ['tut-2a', 'tut-2b'], rules: ['rule:lesson'],
      line: 'Now he teaches you about bosses. He is the boss. I did not think this part through.',
    },
  ],
});
