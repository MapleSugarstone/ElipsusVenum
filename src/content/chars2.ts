import { defAbility, defCard } from '../engine/registry.ts';
import { lanesOf } from '../engine/types.ts';
import { ANY_ALLY, ENEMY, LANE, pray } from './helpers.ts';

// ------------------------------------------------------------ Blue

defCard({
  id: 'dagger-rain', name: 'Dagger Rain', pool: 'blue', rarity: 'uncommon', cost: { energy: 1 }, tags: ['knife'],
  text: 'Add a Knife to your hand for each enemy creature in your lanes.',
  play(c) {
    const n = c.enemies(c.seat).length;
    if (n) c.add('knife', n);
  },
});
defAbility({
  id: 'pw:knife-guard', text: 'When you play a Knife: gain {n} Block.', p: { n: 1 },
  seatPlay(c, card) {
    if (card.id === 'knife') c.block(c.p.n);
  },
});
defCard({
  id: 'kingsguard-oath', name: 'Kingsguard Oath', pool: 'blue', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 1 }, up: { p: { n: 2 } }, tags: ['power', 'knife'],
  text: 'For the rest of the battle, when you play a Knife: gain {n} Block.',
  play(c) {
    c.addPower('pw:knife-guard', { n: c.p.n });
  },
});
defAbility({
  id: 'pw:beads', text: 'When you play a Knife: Pray {n}.', p: { n: 1 },
  seatPlay(c, card) {
    if (card.id === 'knife') pray(c, c.p.n);
  },
});
defCard({
  id: 'prayer-beads', name: 'Prayer Beads', pool: 'blue', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 1 }, up: { cost: { energy: 0 } }, tags: ['power', 'prayer', 'knife'],
  text: 'For the rest of the battle, when you play a Knife: Pray {n}.',
  play(c) {
    c.addPower('pw:beads', { n: c.p.n });
  },
});
defCard({
  id: 'assassinate', name: 'Assassinate', pool: 'blue', rarity: 'rare', cost: { energy: 2 }, p: { n: 6 }, up: { p: { n: 9 } }, tg: [ENEMY],
  text: 'Deal {n} damage to an enemy creature. If you are Blessed, kill it instead.',
  play(c) {
    const t = c.target();
    if ((c.me.c.blessed ?? 0) > 0) c.kill(t);
    else c.damage(t, c.spell(c.p.n));
  },
});
defCard({
  id: 'crowns-mercy', name: 'The Crown\'s Mercy', pool: 'blue', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 3 }, up: { p: { n: 5 } }, tags: ['king', 'support'],
  text: 'Move {n} teeth back toward even on your scale and on your partner\'s.',
  play(c) {
    c.mend(c.p.n);
    c.mend(c.p.n, c.partner);
  },
});
defCard({
  id: 'divine-right', name: 'Divine Right', pool: 'blue', rarity: 'rare', cost: { energy: 3 }, p: { n: 2 }, up: { p: { n: 3 } }, kw: ['Exhaust'], tags: ['king'],
  text: 'Your creatures each gain {n} power and {n} health.',
  play(c) {
    for (const x of c.allies()) c.buff(x, c.p.n, c.p.n);
  },
});
defCard({
  id: 'martyr', name: 'Martyr', pool: 'blue', cost: { blood: 1 }, power: 0, health: 4, tags: ['prayer'],
  text: 'When this dies: Pray 5.',
  death(c) {
    pray(c, 5);
  },
});
defCard({
  id: 'herald-of-the-king', name: 'Herald of the King', pool: 'blue', rarity: 'uncommon', cost: { blood: 2 }, power: 4, health: 6, tags: ['prayer'],
  text: 'When played: Pray 3.',
  play(c) {
    pray(c, 3);
  },
});
defCard({
  id: 'knight-errant', name: 'Knight Errant', pool: 'blue', rarity: 'uncommon', cost: { blood: 2 }, power: 4, health: 8, tags: ['support'],
  text: 'When played: your partner gains 4 Block.',
  play(c) {
    if (c.b.seats[c.partner].alive) c.block(4, c.partner);
  },
});
defCard({
  id: 'kings-ransom', name: 'The King\'s Ransom', pool: 'blue', rarity: 'rare', cost: { energy: 1 }, p: { n: 2 }, kw: ['Exhaust'], tags: ['king', 'support'],
  text: 'You and your partner each gain {n} energy.',
  play(c) {
    c.energy(c.p.n);
    if (c.b.seats[c.partner].alive) c.energy(c.p.n, c.partner);
  },
});

// ------------------------------------------------------------ Doctor Pistachio

defCard({
  id: 'multitask', name: 'Multitask', pool: 'pistachio', rarity: 'uncommon', cost: { energy: 2 }, up: { cost: { energy: 1 } }, tags: ['program'],
  text: 'Load 2 random Programs.',
  play(c) {
    const progs = ['prog:firewall', 'prog:exploit', 'prog:virus', 'prog:botnet'];
    for (let i = 0; i < 2; i++) c.program(progs[c.rand(progs.length)]);
  },
});
defCard({
  id: 'overclock', name: 'Overclock', pool: 'pistachio', rarity: 'uncommon', cost: { energy: 1 }, up: { cost: { energy: 0 } }, tags: ['program'],
  text: 'Each of your Programs runs its end of turn effect now.',
  play(c) {
    c.runPrograms();
  },
});
defCard({
  id: 'speedrun', name: 'Speedrun', pool: 'pistachio', cost: { energy: 1 }, p: { n: 4 }, up: { p: { n: 6 } }, tg: [LANE],
  text: 'Hit a lane for {n}. If this is the first card you played this turn, draw 1 card.',
  play(c) {
    const first = (c.me.c.playedTurn ?? -1) !== c.b.turn;
    c.hit(c.lane(), c.spell(c.p.n));
    if (first) c.draw(1);
  },
});
defCard({
  id: 'rage-quit', name: 'Rage Quit', pool: 'pistachio', rarity: 'uncommon', cost: { energy: 1 }, tg: [{ row: 'p' }],
  text: 'Kill one of your creatures. Hit each lane in your half for its power.',
  play(c) {
    const t = c.target();
    if (!t) return;
    const n = c.powerOf(t);
    c.kill(t);
    for (const lane of lanesOf(c.seat)) c.hit(lane, n);
  },
});
defCard({
  id: 'save-scum', name: 'Save Scum', pool: 'pistachio', rarity: 'rare', cost: { energy: 2 }, p: { n: 6 }, up: { p: { n: 9 } }, kw: ['Exhaust'],
  text: 'Move {n} teeth on your scale back toward even.',
  play(c) {
    c.mend(c.p.n);
  },
});
defAbility({
  id: 'pw:boss-music', text: 'At the start of your turn: if your scale is behind, gain {n} energy.', p: { n: 1 },
  turnStart(c) {
    if (c.me.scale < 0) c.energy(c.p.n);
  },
});
defCard({
  id: 'boss-music', name: 'Boss Music', pool: 'pistachio', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 1 }, up: { p: { n: 2 } }, tags: ['power'],
  text: 'For the rest of the battle, at the start of your turn: if your scale is behind, gain {n} energy.',
  play(c) {
    c.addPower('pw:boss-music', { n: c.p.n });
  },
});
defCard({
  id: 'henchman', name: 'Henchman', pool: 'pistachio', cost: { energy: 2 }, power: 4, health: 4, tribe: 'Machine',
  text: 'When played: summon a Minion in an empty lane next to this.',
  play(c) {
    const lane = c.laneOf();
    for (const l of [lane - 1, lane + 1]) {
      if (l >= 0 && c.sameHalf(l, lane) && !c.b.p[l]) {
        c.summon('minion', l);
        return;
      }
    }
  },
});
defCard({
  id: 'mad-scientist', name: 'Mad Scientist', pool: 'pistachio', rarity: 'rare', cost: { energy: 3 }, power: 2, health: 6,
  text: 'At the end of your turn: Load a random Program.',
  turnEnd(c) {
    const progs = ['prog:firewall', 'prog:exploit', 'prog:virus', 'prog:botnet'];
    c.program(progs[c.rand(progs.length)]);
  },
});
defCard({
  id: 'remote-control', name: 'Remote Control', pool: 'pistachio', rarity: 'uncommon', cost: { energy: 1 }, tg: [ANY_ALLY, { row: 'p', who: 'any', need: 'empty' }], tags: ['support'],
  text: 'Move a creature in any lane to any empty slot, even across the seam.',
  play(c) {
    c.move(c.target(0), c.lane(1), true);
  },
});
defCard({
  id: 'firmware-update', name: 'Firmware Update', pool: 'pistachio', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tags: ['support'],
  text: 'Your partner\'s creatures each gain {n} health.',
  play(c) {
    for (const x of c.allies(c.partner)) c.buff(x, 0, c.p.n);
  },
});
