import { card, defRelic } from '../engine/registry.ts';

defRelic({
  id: 'tin-whistle', name: 'Tin Whistle', rarity: 'common', pool: 'shared',
  text: 'When one of your partner\'s creatures dies: gain 1 bone.',
  allyDies(c, dead) {
    if (dead.side === 'p' && dead.seat === c.partner) c.bones(1);
  },
});
defRelic({
  id: 'rusty-key', name: 'Rusty Key', rarity: 'common', pool: 'shared',
  text: 'On your first turn of each battle: gain 2 energy.',
  turnStart(c) {
    if (c.b.turn === 1) c.energy(2);
  },
});
defRelic({
  id: 'spare-bones', name: 'Spare Bones', rarity: 'common', pool: 'shared',
  text: 'At the start of each battle: you and your partner each gain 2 bones.',
  battleStart(c) {
    c.bones(2);
    if (c.b.seats[c.partner].alive) c.bones(2, c.partner);
  },
});
defRelic({
  id: 'pocket-knife', name: 'Pocket Knife', rarity: 'common', pool: 'blue',
  text: 'At the start of each battle: add 2 Knives to your hand.',
  battleStart(c) {
    c.add('knife', 2);
  },
});
defRelic({
  id: 'joystick', name: 'Joystick', rarity: 'common', pool: 'pistachio',
  text: 'At the start of each battle: Load Virus.',
  battleStart(c) {
    c.program('prog:virus');
  },
});
defRelic({
  id: 'medal', name: 'Medal of Size', rarity: 'uncommon', pool: 'shared',
  text: 'When you play a creature that costs 3 or more blood: it gains 4 health.',
  seatPlay(c, played) {
    if (card(played.id).kind === 'creature' && (played.cost.blood ?? 0) >= 3) c.buff(played, 0, 4);
  },
});
defRelic({
  id: 'hound-collar', name: 'Hound Collar', rarity: 'rare', pool: 'shared',
  text: 'At the start of each battle: summon a Hound in your first empty lane.',
  battleStart(c) {
    const lane = c.emptyLanes()[0];
    if (lane !== undefined) c.summon('hound', lane);
  },
});
defRelic({
  id: 'paper-crown', name: 'Paper Crown', rarity: 'rare', pool: 'blue',
  text: 'King cards cost 1 less energy.',
  battleStart(c) {
    c.me.c.kingLess = (c.me.c.kingLess ?? 0) + 1;
  },
});
defRelic({
  id: 'debug-console', name: 'Debug Console', rarity: 'rare', pool: 'pistachio',
  text: 'You can run 4 Programs instead of 3.',
  battleStart(c) {
    c.me.c.progCap = (c.me.c.progCap ?? 0) + 1;
  },
});
defRelic({
  id: 'matching-scarves', name: 'Matching Scarves', rarity: 'uncommon', pool: 'shared',
  text: 'At the start of your turn: if your partner\'s scale is behind yours, they gain 2 Block.',
  turnStart(c) {
    const mate = c.b.seats[c.partner];
    if (mate.alive && mate.scale < c.me.scale) c.block(2, c.partner);
  },
});
