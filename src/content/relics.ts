import { card, defRelic } from '../engine/registry.ts';
import type { RunSeat } from '../run/types.ts';
import { pray } from './helpers.ts';

defRelic({
  id: 'lucky-tooth', name: 'Lucky Tooth', rarity: 'common', pool: 'shared',
  text: 'At the start of each battle: move 2 teeth toward your win.',
  battleStart(c) {
    c.scale(2);
  },
});
defRelic({
  id: 'bone-charm', name: 'Bone Charm', rarity: 'common', pool: 'shared',
  text: 'At the start of each battle: gain 3 bones.',
  battleStart(c) {
    c.bones(3);
  },
});
defRelic({
  id: 'oil-lamp', name: 'Oil Lamp', rarity: 'common', pool: 'shared',
  text: 'At the start of each battle: gain 6 Block.',
  battleStart(c) {
    c.block(6);
  },
});
defRelic({
  id: 'friendship-bracelet', name: 'Friendship Bracelet', rarity: 'common', pool: 'shared',
  text: 'When your partner plays a spell: gain 1 Block.',
  partnerPlay(c, played) {
    if (card(played.id).kind === 'spell') c.block(1);
  },
});
defRelic({
  id: 'spare-placeholder', name: 'Spare Placeholder', rarity: 'common', pool: 'shared',
  text: 'At the start of each battle: add a Placeholder to your hand.',
  battleStart(c) {
    c.add('placeholder');
  },
});
defRelic({
  id: 'battery-pack', name: 'Battery Pack', rarity: 'uncommon', pool: 'shared',
  text: 'Your maximum energy starts each battle 1 higher.',
  battleStart(c) {
    c.me.maxEnergy += 1;
  },
});
defRelic({
  id: 'sling', name: 'Sling', rarity: 'uncommon', pool: 'shared',
  text: 'At the end of your turn: hit a random lane in your half for 1.',
  turnEnd(c) {
    const lanes = c.seat === 0 ? [0, 1, 2, 3] : [4, 5, 6, 7];
    c.hit(lanes[c.rand(4)], 1);
  },
});
defRelic({
  id: 'walkie-talkie', name: 'Walkie-Talkie', rarity: 'uncommon', pool: 'shared',
  text: 'At the start of each battle: your partner draws 1 card.',
  battleStart(c) {
    if (c.b.seats[c.partner].alive) c.draw(1, c.partner);
  },
});
defRelic({
  id: 'grave-dirt', name: 'Grave Dirt', rarity: 'uncommon', pool: 'shared',
  text: 'When one of your creatures dies: gain 1 more bone.',
  allyDies(c, dead) {
    if (dead.seat === c.seat) c.bones(1);
  },
});
defRelic({
  id: 'tin-crown', name: 'Tin Crown', rarity: 'rare', pool: 'blue',
  text: 'At the start of each battle: Pray 4.',
  battleStart(c) {
    pray(c, 4);
  },
});
defRelic({
  id: 'save-file', name: 'Save File', rarity: 'rare', pool: 'pistachio',
  text: 'At the start of each battle: Load Firewall.',
  battleStart(c) {
    c.program('prog:firewall');
  },
});
defRelic({
  id: 'spare-candle', name: 'Spare Candle', rarity: 'boss', pool: 'shared',
  text: 'Gain 1 candle when you take this.',
  gain(run, seat) {
    (run as { seats: RunSeat[] }).seats[seat].candles += 1;
  },
});
defRelic({
  id: 'overcharger', name: 'Overcharger', rarity: 'boss', pool: 'shared',
  text: 'Your maximum energy starts each battle 2 higher.',
  battleStart(c) {
    c.me.maxEnergy += 2;
  },
});
defRelic({
  id: 'family-photo', name: 'Family Photo', rarity: 'boss', pool: 'shared',
  text: 'At the start of each battle: you and your partner each gain 6 Block and draw 1 card.',
  battleStart(c) {
    c.block(6);
    c.draw(1);
    if (c.b.seats[c.partner].alive) {
      c.block(6, c.partner);
      c.draw(1, c.partner);
    }
  },
});
