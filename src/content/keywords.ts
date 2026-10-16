import { defKeyword, defTerm } from '../engine/registry.ts';

// Keywords the engine reads directly. Their lines only carry the glossary text.
defKeyword('Airborne', 'Attacks the scale directly unless the creature opposite has Reach.');
defKeyword('Reach', 'Blocks attacks from Airborne creatures.');
defKeyword('Submerge', 'Attacks aimed at this pass over it and hit the scale.');
defKeyword('Burrower', 'When an enemy attacks an empty lane in your half, this moves there to take the hit.');
defKeyword('Split Strike', 'Attacks the lanes to its left and right instead of its own lane.');
defKeyword('Triple Strike', 'Attacks the lanes to its left and right as well as its own lane.');
defKeyword('Deadly', 'Any damage this deals to a creature kills it.');
defKeyword('Steadfast', 'Deadly does not kill this.');
defKeyword('Spare Lives', 'Sacrificing this does not kill it.');
defKeyword('Offering', 'Sacrificing this pays 3 blood instead of 1.');
defKeyword('Exhaust', 'After you play this, remove it until the battle ends.', { end: true });
defKeyword('Ethereal', 'If this is in your hand at the end of your turn, remove it until the battle ends.', { end: true });
defKeyword('Unplayable', 'This cannot be played.', { end: true });
defKeyword('Armor', 'Takes that much less damage from each hit.', { p: { n: 2 } });
defKeyword('Repulsive', 'Enemies do not attack this. An attack aimed at it does nothing.');
defKeyword('Scavenger', 'When one of your creatures dies to an enemy attack, this jumps from your hand into its empty slot for free.');

defKeyword('Thorns', 'When a creature attacks this, deal that much damage to the attacker.', {
  p: { n: 2 },
  struck(c, by, _n, attack) {
    if (attack && by && c.self) c.damage(by, c.p.n);
  },
});

defKeyword('Guardian', 'When an enemy enters the slot across from an empty lane in your half, this moves into that lane.', {
  foePlaced(c, _card, lane) {
    const self = c.self;
    if (!self || self.side !== 'p') return;
    if (c.halfOf(lane) !== c.halfOf(c.laneOf(self)) || c.b.p[lane]) return;
    c.move(self, lane);
  },
});

defKeyword('Sprinter', 'At the end of your turn, this moves one lane. It turns around when it cannot move.', {
  turnEnd(c) {
    const self = c.self;
    if (!self) return;
    const lane = c.laneOf(self);
    const dir = self.c.dir ?? 1;
    if (c.move(self, lane + dir)) return;
    self.c.dir = -dir;
    c.move(self, lane - dir);
  },
});

defKeyword('Leader', 'Adjacent allies have that much more power.', {
  p: { n: 2 },
  powerMod(c, target) {
    if (!c.self || target.side !== c.self.side) return 0;
    return c.adjacent(c.self).includes(target) ? c.p.n : 0;
  },
});

defKeyword('Stench', 'The creature across from this has that much less power.', {
  p: { n: 2 },
  powerMod(c, target) {
    return c.self && c.opposite(c.self) === target ? -c.p.n : 0;
  },
});

defKeyword('Returning', 'When this dies, add a fresh copy of it to your hand.', {
  death(c) {
    const self = c.self;
    if (self && self.side === 'p' && c.me.alive) c.add(self.id, 1, self.seat, self.up);
  },
});

defKeyword('Shield', 'Blocks the next instance of damage to this.', {
  p: { n: 1 },
  enter(c) {
    if (c.self) c.self.st.shield = (c.self.st.shield ?? 0) + c.p.n;
  },
});

defKeyword('Brittle', 'At the end of its turn, this dies.', {
  turnEnd(c) {
    c.kill(c.self);
  },
});

defKeyword('Regenerate', 'At the end of its turn, this heals that much health.', {
  p: { n: 2 },
  turnEnd(c) {
    c.heal(c.self, c.p.n);
  },
});

// Terms that appear in rules text without being keywords.
defTerm('Hit', 'Deal damage to the enemy creature in that lane. If the lane has no enemy creature, the damage moves teeth on that lane\'s scale instead.');
defTerm('Block', 'Absorbs damage that enemies in your lanes would deal to your scale. It clears at the start of your turn.');
defTerm('Vulnerable', 'Takes 2 extra damage from each hit. Drops by 1 at the end of each of its turns.');
defTerm('Weak', 'Deals 2 less damage when it attacks. Drops by 1 at the end of each of its turns.');
defTerm('Poison', 'Loses that much health at the end of its turn, then Poison drops by 1.');
defTerm('Stun', 'Skips its next attack.');
defTerm('Strength', 'Each point adds 1 damage to your spells.');
defTerm('Dexterity', 'Each point adds 1 to the Block you gain.');
defTerm('Frail', 'Gains 2 less Block from each card. Drops by 1 at the end of your turn.');
defTerm('Artifact', 'Stops the next debuff.');
defTerm('Teeth', 'Damage past your winning lead becomes teeth, which you spend on the map.');
defTerm('Pray', 'Gain that much Devotion. At 10 Devotion it resets, and the King answers: you become Blessed until the end of your turn.');
defTerm('Blessed', 'Gain 3 energy when it starts. King cards cost no energy while you are Blessed.');
defTerm('Load', 'Start running a Program. You can run 3. Loading a fourth runs the oldest one\'s Evoke and removes it.');
defTerm('Evoke', 'What a Program does when it is removed by loading a fourth.');
defTerm('Glitch', 'A creature with Glitch has no rules text for the rest of the battle.');
defTerm('Ghost', 'A dead player can help once per turn: give the partner 1 bone, or mark an enemy so it takes 2 extra damage this turn.');
defTerm('Grows', 'At the start of your turn after this has spent a full turn on the board, it turns into the named card.');
