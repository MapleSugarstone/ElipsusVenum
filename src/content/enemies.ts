import { defCard, defHalf } from '../engine/registry.ts';

const foe = { pool: 'enemy' as const, rarity: 'special' as const };

defCard({ ...foe, id: 'hunger', name: 'Hunger', power: 0, health: 2 });
defCard({ ...foe, id: 'grub', name: 'Grub', power: 2, health: 2 });
defCard({ ...foe, id: 'rat', name: 'Rat', power: 2, health: 2 });
defCard({ ...foe, id: 'goblin', name: 'Goblin', power: 2, health: 4 });
defCard({ ...foe, id: 'goblin-chief', name: 'Goblin Chief', power: 4, health: 6, kw: [['Leader', 2]] });
defCard({
  ...foe, id: 'slime', name: 'Slime', power: 2, health: 6,
  text: 'When this dies: a Small Slime takes its place.',
  death(c) {
    const lane = c.self?.c.lane ?? -1;
    if (lane >= 0) c.enemySummon('small-slime', lane);
  },
});
defCard({ ...foe, id: 'small-slime', name: 'Small Slime', power: 2, health: 2 });
defCard({ ...foe, id: 'bat', name: 'Bat', power: 2, health: 2, kw: ['Airborne'] });
defCard({ ...foe, id: 'archer', name: 'Archer', power: 2, health: 4, kw: ['Airborne'] });
defCard({ ...foe, id: 'skeleton', name: 'Skeleton', power: 4, health: 2 });
defCard({ ...foe, id: 'half-wall', name: 'Half-Built Wall', power: 0, health: 10, tags: ['terrain'] });
defCard({ ...foe, id: 'knight', name: 'Knight', power: 4, health: 10, kw: ['Shield'] });
defCard({ ...foe, id: 'small-dragon', name: 'Dragon (Small)', power: 6, health: 6, kw: ['Airborne'] });
defCard({
  ...foe, id: 'cultist', name: 'Cultist', power: 0, health: 6,
  text: 'At the start of its turn: this gains 2 power.',
  turnStart(c) {
    c.buff(c.self, 2, 0);
  },
});
defCard({
  ...foe, id: 'spitter', name: 'Spitter', power: 2, health: 4,
  text: 'At the end of its turn: apply 2 Poison to the creature across from it.',
  turnEnd(c) {
    c.status(c.opposite(), 'poison', 2);
  },
});
defCard({ ...foe, id: 'brute', name: 'Brute', power: 8, health: 8 });
defCard({
  ...foe, id: 'mimic', name: 'Mimic', power: 0, health: 8,
  text: 'When struck: this gains 2 power.',
  struck(c) {
    c.buff(c.self, 2, 0);
  },
});

// ------------------------------------------------------------ act 1 halves

const P = (id: string, lane?: number) => (lane === undefined ? { id } : { id, lane });

defHalf({ id: 'grubs', act: 1, tier: 'normal', turns: [[P('grub', 1)], [], [P('grub', 2)], [P('goblin')], [], [P('grub'), P('grub')]], loop: [[P('grub')], []] });
defHalf({ id: 'goblins', act: 1, tier: 'normal', turns: [[P('goblin', 1)], [], [P('goblin', 2)], [], [P('goblin-chief')], []], loop: [[P('goblin')], []] });
defHalf({ id: 'slimes', act: 1, tier: 'normal', turns: [[P('slime', 0)], [], [], [P('slime', 3)], [], [P('small-slime')]], loop: [[P('slime')], [], []] });
defHalf({ id: 'bats', act: 1, tier: 'normal', turns: [[P('bat', 1)], [P('bat', 2)], [], [P('archer')], [], [P('bat')]], loop: [[P('bat')], [], []] });
defHalf({ id: 'rats', act: 1, tier: 'normal', turns: [[P('rat', 0), P('rat', 3)], [], [P('rat')], [], [P('skeleton')], []], loop: [[P('rat'), P('rat')], [], []] });
defHalf({ id: 'wall-archers', act: 1, tier: 'normal', front: [P('half-wall', 1)], turns: [[P('archer', 2)], [], [], [P('archer')], [], [P('spitter')]], loop: [[P('archer')], [], [], []] });
defHalf({ id: 'knight', act: 1, tier: 'elite', turns: [[P('knight', 1)], [], [P('goblin')], [], [P('knight')], []], loop: [[P('goblin')], [], []] });
defHalf({ id: 'cultists', act: 1, tier: 'elite', turns: [[P('cultist', 1), P('cultist', 2)], [], [P('grub')], [], [P('cultist')], []], loop: [[P('grub')], [], [], []] });
defHalf({ id: 'dragonling', act: 1, tier: 'elite', turns: [[P('small-dragon', 1)], [], [P('bat')], [], [P('bat'), P('bat')], []], loop: [[P('bat')], [], []] });
