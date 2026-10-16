import { defAbility, defCard, defRelic } from '../engine/registry.ts';
import type { Ctx } from '../engine/fx.ts';
import { ENEMY, LANE, pray } from './helpers.ts';

const knifeDamage = (c: Ctx, n: number): number => c.spell(n + (c.me.c.sharpen ?? 0));

defCard({
  id: 'knife', name: 'Knife', pool: 'token', rarity: 'special', cost: { energy: 0 }, p: { n: 2 }, tg: [LANE],
  kw: ['Ethereal', 'Exhaust'], tags: ['token', 'knife'],
  text: 'Hit a lane for {n}.',
  play(c) {
    c.hit(c.lane(), knifeDamage(c, c.p.n));
  },
});

defCard({
  id: 'throwing-knives', name: 'Throwing Knives', pool: 'blue', cost: { energy: 1 }, p: { n: 3 }, up: { p: { n: 4 } }, tags: ['knife'],
  text: 'Add {n} Knives to your hand.',
  play(c) {
    c.add('knife', c.p.n);
  },
});
defCard({
  id: 'hidden-blade', name: 'Hidden Blade', pool: 'blue', cost: { energy: 1 }, p: { b: 3, n: 1 }, up: { p: { n: 2 } }, tags: ['knife'],
  text: 'Gain {b} Block. Add {n} Knife to your hand.',
  play(c) {
    c.block(c.p.b);
    c.add('knife', c.p.n);
  },
});
defAbility({ id: 'pw:whetstone', text: 'Your Knives deal {n} more damage.', p: { n: 2 } });
defCard({
  id: 'whetstone', name: 'Whetstone', pool: 'blue', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tags: ['power', 'knife'],
  text: 'For the rest of the battle, your Knives deal {n} more damage.',
  play(c) {
    c.counter('sharpen', c.p.n);
    c.addPower('pw:whetstone', { n: c.p.n });
  },
});
defCard({
  id: 'knife-juggler', name: 'Knife Juggler', pool: 'blue', cost: { blood: 1 }, power: 2, health: 4, tags: ['knife'],
  text: 'At the end of your turn: add a Knife to your hand.',
  turnEnd(c) {
    c.add('knife');
  },
});
defCard({
  id: 'fan-of-knives', name: 'Fan of Knives', pool: 'blue', rarity: 'uncommon', cost: { energy: 2 }, p: { n: 2 }, up: { p: { n: 3 } }, tags: ['knife'],
  text: 'Hit each lane in your half for {n}.',
  play(c) {
    for (const lane of c.seat === 0 ? [0, 1, 2, 3] : [4, 5, 6, 7]) c.hit(lane, knifeDamage(c, c.p.n));
  },
});
defCard({
  id: 'sharp-word', name: 'Sharp Word', pool: 'blue', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tags: ['knife', 'support'],
  text: 'Your partner adds {n} Knives to their hand.',
  play(c) {
    c.add('knife', c.p.n, c.partner);
  },
});

defCard({
  id: 'kneel', name: 'Kneel', pool: 'blue', cost: { energy: 0 }, p: { n: 3, b: 2 }, up: { p: { n: 4, b: 3 } }, tags: ['prayer'],
  text: 'Pray {n}. Gain {b} Block.',
  play(c) {
    pray(c, c.p.n);
    c.block(c.p.b);
  },
});
defCard({
  id: 'vigil', name: 'Vigil', pool: 'blue', cost: { energy: 1 }, p: { n: 3 }, up: { p: { n: 4 } }, tags: ['prayer'],
  text: 'Pray {n}. Draw 1 card.',
  play(c) {
    pray(c, c.p.n);
    c.draw(1);
  },
});
defAbility({
  id: 'pw:psalm', text: 'At the start of your turn: Pray {n}.', p: { n: 1 },
  turnStart(c) {
    pray(c, c.p.n);
  },
});
defCard({
  id: 'psalm', name: 'Psalm', pool: 'blue', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tags: ['power', 'prayer'],
  text: 'For the rest of the battle, at the start of your turn: Pray {n}.',
  play(c) {
    c.addPower('pw:psalm', { n: c.p.n });
  },
});
defCard({
  id: 'kings-wrath', name: 'The King\'s Wrath', pool: 'blue', rarity: 'rare', cost: { energy: 3 }, tg: [ENEMY], kw: ['Exhaust'],
  up: { cost: { energy: 2 } }, tags: ['king'],
  text: 'Kill an enemy creature.',
  play(c) {
    c.kill(c.target());
  },
});
defCard({
  id: 'kings-decree', name: 'The King\'s Decree', pool: 'blue', rarity: 'uncommon', cost: { energy: 2 }, p: { n: 4 }, up: { p: { n: 6 } }, tags: ['king'],
  text: 'Each enemy creature in your lanes has {n} less power until the end of its next turn.',
  play(c) {
    for (const e of c.enemies(c.seat)) c.temp(e, -c.p.n);
  },
});
defCard({
  id: 'kings-shelter', name: 'The King\'s Shelter', pool: 'blue', cost: { energy: 2 }, p: { n: 4 }, up: { p: { n: 6 } }, tags: ['king', 'support'],
  text: 'You and your partner each gain {n} Block.',
  play(c) {
    c.block(c.p.n);
    c.block(c.p.n, c.partner);
  },
});
defCard({
  id: 'royal-guard', name: 'Royal Guard', pool: 'blue', rarity: 'uncommon', cost: { blood: 2 }, power: 4, health: 8, kw: ['Guardian'],
});
defCard({
  id: 'oathsworn', name: 'Oathsworn', pool: 'blue', cost: { blood: 1 }, power: 2, health: 4, tags: ['prayer'],
  text: 'While you are Blessed, this has 4 more power.',
  powerMod(c, target) {
    return target === c.self && (c.me.c.blessed ?? 0) > 0 ? 4 : 0;
  },
});

defRelic({
  id: 'signet-ring', name: 'Signet Ring', rarity: 'start', pool: 'blue',
  text: 'At the start of your turn: add a Knife to your hand.',
  turnStart(c) {
    c.add('knife', 1);
  },
});
