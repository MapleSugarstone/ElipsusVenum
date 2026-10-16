import { defItem } from '../engine/registry.ts';
import { ENEMY } from './helpers.ts';

defItem({
  id: 'placeholder-jar', name: 'Placeholder in a Jar', rarity: 'common', tg: [],
  text: 'Add a Placeholder to your hand.',
  use(c) {
    c.add('placeholder');
  },
});
defItem({
  id: 'pliers', name: 'Pliers', rarity: 'common', tg: [],
  text: 'Move 2 teeth toward your win.',
  use(c) {
    c.scale(2);
  },
});
defItem({
  id: 'scissors', name: 'Scissors', rarity: 'uncommon', tg: [ENEMY],
  text: 'Kill an enemy creature in your lanes.',
  use(c) {
    c.kill(c.target());
  },
});
defItem({
  id: 'hourglass', name: 'Hourglass', rarity: 'uncommon', tg: [],
  text: 'Each enemy creature in your lanes skips its next attack.',
  use(c) {
    for (const e of c.enemies(c.seat)) c.status(e, 'stun', 1);
  },
});
defItem({
  id: 'bone-pouch', name: 'Bone Pouch', rarity: 'common', tg: [],
  text: 'Gain 4 bones.',
  use(c) {
    c.bones(4);
  },
});
defItem({
  id: 'energy-drink', name: 'Energy Drink', rarity: 'common', tg: [],
  text: 'Gain 3 energy.',
  use(c) {
    c.energy(3);
  },
});
defItem({
  id: 'block-tonic', name: 'Block Tonic', rarity: 'common', tg: [],
  text: 'Gain 8 Block.',
  use(c) {
    c.block(8);
  },
});
defItem({
  id: 'poison-flask', name: 'Poison Flask', rarity: 'common', tg: [],
  text: 'Apply 3 Poison to each enemy creature in your lanes.',
  use(c) {
    for (const e of c.enemies(c.seat)) c.status(e, 'poison', 3);
  },
});
defItem({
  id: 'strength-tonic', name: 'Strength Tonic', rarity: 'uncommon', tg: [],
  text: 'Gain 2 Strength.',
  use(c) {
    c.seatStatus('strength', 2);
  },
});
defItem({
  id: 'salve', name: 'Salve', rarity: 'common', tg: [],
  text: 'Move 4 teeth on your scale back toward even.',
  use(c) {
    c.mend(4);
  },
});
defItem({
  id: 'gift-box', name: 'Gift Box', rarity: 'common', tg: [],
  text: 'Your partner gains 2 energy and 2 bones.',
  use(c) {
    c.energy(2, c.partner);
    c.bones(2, c.partner);
  },
});
