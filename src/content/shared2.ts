import { defAbility, defCard } from '../engine/registry.ts';
import { lanesOf } from '../engine/types.ts';
import { ALLY, ANY_ALLY, ANY_LANE, ENEMY, LANE } from './helpers.ts';

// ------------------------------------------------------------ positioning creatures

defCard({
  id: 'flanker', name: 'Flanker', rarity: 'uncommon', cost: { blood: 2 }, power: 4, health: 4, tribe: 'Canine',
  text: 'While no creature is next to this, it has 4 more power.',
  powerMod(c, target) {
    return target === c.self && c.adjacent().length === 0 ? 4 : 0;
  },
});
defCard({
  id: 'phalanx-beetle', name: 'Phalanx Beetle', cost: { blood: 1 }, power: 2, health: 6, tribe: 'Insect',
  text: 'This has 2 more power for each creature next to it.',
  powerMod(c, target) {
    return target === c.self ? 2 * c.adjacent().length : 0;
  },
});
defCard({
  id: 'corner-archer', name: 'Corner Archer', rarity: 'uncommon', cost: { blood: 1 }, power: 2, health: 4,
  text: 'While this is in lane 1 or lane 8, it has 4 more power.',
  powerMod(c, target) {
    return target === c.self && c.isEdge(c.laneOf()) ? 4 : 0;
  },
});
defCard({
  id: 'bridge-troll', name: 'Bridge Troll', rarity: 'uncommon', cost: { blood: 2 }, power: 4, health: 10, tags: ['support'],
  text: 'While this is next to the seam, it and the creature across the seam each have 3 more power.',
  powerMod(c, target) {
    const self = c.self;
    if (!self) return 0;
    const lane = c.laneOf(self);
    if (!c.nextToSeam(lane)) return 0;
    if (target === self) return 3;
    const across = lane === 3 ? 4 : 3;
    return c.b.p[across] === target ? 3 : 0;
  },
});
defCard({
  id: 'rook', name: 'Rook', rarity: 'uncommon', cost: { blood: 2 }, power: 2, health: 12, kw: ['Guardian', 'Reach'],
});
defCard({
  id: 'sapper', name: 'Sapper', cost: { bones: 3 }, power: 2, health: 4,
  text: 'When this dies: deal 4 damage to the creature across from it.',
  death(c) {
    const lane = c.self?.c.lane ?? -1;
    if (lane >= 0) c.damage(c.b.e[lane], 4);
  },
});
defCard({
  id: 'armadillo', name: 'Armadillo', cost: { blood: 1 }, power: 0, health: 6, kw: [['Armor', 2]],
});
defCard({ id: 'stink-bug', name: 'Stink Bug', cost: { bones: 2 }, power: 0, health: 6, tribe: 'Insect', kw: ['Repulsive'] });
defCard({ id: 'grave-maggots', name: 'Grave Maggots', rarity: 'uncommon', cost: { bones: 4 }, power: 2, health: 4, tribe: 'Insect', kw: ['Scavenger'] });
defCard({
  id: 'raccoon', name: 'Raccoon', rarity: 'uncommon', cost: { blood: 1 }, power: 2, health: 4,
  text: 'When played: gain 3 bones.',
  play(c) {
    c.bones(3);
  },
});
defCard({
  id: 'wolverine', name: 'Wolverine', rarity: 'rare', cost: { blood: 2 }, power: 4, health: 8, tribe: 'Canine',
  text: 'This has 4 more power while it is damaged.',
  powerMod(c, target) {
    return target === c.self && target.health < target.maxHealth ? 4 : 0;
  },
});
defCard({
  id: 'owl', name: 'Night Owl', cost: { blood: 2 }, power: 4, health: 4, tribe: 'Avian', kw: ['Airborne', 'Reach'],
});

// ------------------------------------------------------------ support creatures

defCard({
  id: 'courier-bat', name: 'Courier Bat', cost: { bones: 2 }, power: 2, health: 2, tribe: 'Avian', kw: ['Airborne'], tags: ['support'],
  text: 'When this dies: your partner gains 3 bones.',
  death(c) {
    if (c.b.seats[c.partner].alive) c.bones(3, c.partner);
  },
});
defCard({
  id: 'drummer', name: 'War Drummer', rarity: 'uncommon', cost: { blood: 2 }, power: 2, health: 6, tags: ['support'],
  text: 'At the start of your turn: your partner\'s creatures have 2 more power this turn.',
  turnStart(c) {
    if (!c.b.seats[c.partner].alive) return;
    for (const x of c.allies(c.partner)) c.temp(x, 2);
  },
});
defCard({
  id: 'totem-pole', name: 'Totem Pole', rarity: 'uncommon', cost: { blood: 1 }, power: 0, health: 8, tags: ['support'],
  text: 'At the start of your turn: the creature across the seam from your side gains Shield if it has none.',
  turnStart(c) {
    const lane = c.seat === 0 ? 4 : 3;
    const t = c.b.p[lane];
    if (t && !(t.st.shield ?? 0)) c.status(t, 'shield', 1);
  },
});
defCard({
  id: 'squire', name: 'Squire', cost: { blood: 1 }, power: 2, health: 4, tags: ['support'],
  text: 'When played: give a creature in any lane 2 power.',
  tg: [ANY_ALLY],
  play(c) {
    c.buff(c.target(), 2, 0);
  },
});

// ------------------------------------------------------------ spells, attack

defCard({
  id: 'clothesline', name: 'Clothesline', cost: { energy: 2 }, p: { n: 5, w: 2 }, up: { p: { n: 6, w: 3 } }, tg: [ENEMY],
  text: 'Deal {n} damage to an enemy creature. Apply {w} Weak.',
  play(c) {
    const t = c.target();
    c.damage(t, c.spell(c.p.n));
    c.status(t, 'weak', c.p.w);
  },
});
defCard({
  id: 'uppercut', name: 'Uppercut', rarity: 'uncommon', cost: { energy: 2 }, p: { n: 5, v: 1 }, up: { p: { v: 2 } }, tg: [ENEMY],
  text: 'Deal {n} damage to an enemy creature. Apply {v} Weak and {v} Vulnerable.',
  play(c) {
    const t = c.target();
    c.damage(t, c.spell(c.p.n));
    c.status(t, 'weak', c.p.v);
    c.status(t, 'vulnerable', c.p.v);
  },
});
defCard({
  id: 'bludgeon', name: 'Bludgeon', rarity: 'rare', cost: { energy: 3 }, p: { n: 12 }, up: { p: { n: 16 } }, tg: [ENEMY],
  text: 'Deal {n} damage to an enemy creature.',
  play(c) {
    c.damage(c.target(), c.spell(c.p.n));
  },
});
defCard({
  id: 'dropkick', name: 'Dropkick', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 3 }, up: { p: { n: 5 } }, tg: [ENEMY],
  text: 'Deal {n} damage to an enemy creature. If it was Vulnerable, gain 1 energy and draw 1 card.',
  play(c) {
    const t = c.target();
    const weak = (t?.st.vulnerable ?? 0) > 0;
    c.damage(t, c.spell(c.p.n));
    if (weak) {
      c.energy(1);
      c.draw(1);
    }
  },
});
defCard({
  id: 'bad-temper', name: 'Bad Temper', cost: { energy: 0 }, p: { n: 2 }, up: { p: { n: 3 } }, tg: [LANE],
  text: 'Hit a lane for {n}. Put a copy of this into your discard pile.',
  play(c) {
    c.hit(c.lane(), c.spell(c.p.n));
    const copy = c.add('bad-temper', 1, c.seat, c.self?.up ?? false)[0];
    const hand = c.me.hand;
    const i = hand.indexOf(copy);
    if (i >= 0) {
      hand.splice(i, 1);
      c.me.discard.push(copy);
    }
  },
});
defCard({
  id: 'dash', name: 'Dash', rarity: 'uncommon', cost: { energy: 2 }, p: { n: 5 }, up: { p: { n: 7 } }, tg: [LANE],
  text: 'Gain {n} Block. Hit a lane for {n}.',
  play(c) {
    c.block(c.p.n);
    c.hit(c.lane(), c.spell(c.p.n));
  },
});
defCard({
  id: 'signal-flare', name: 'Signal Flare', cost: { energy: 1 }, p: { n: 3 }, up: { p: { n: 5 } }, tg: [ANY_LANE], tags: ['support'],
  text: 'Hit any lane for {n}, even one in your partner\'s half.',
  play(c) {
    c.hit(c.lane(), c.spell(c.p.n));
  },
});
defCard({
  id: 'feed', name: 'Feed', rarity: 'rare', cost: { energy: 1 }, p: { n: 5, h: 3 }, up: { p: { n: 6, h: 4 } }, tg: [ENEMY, { ...ALLY, opt: true }], kw: ['Exhaust'],
  text: 'Deal {n} damage to an enemy creature. If this kills it, one of your creatures gains {h} health for the rest of the run.',
  play(c) {
    const t = c.target(0);
    const mine = c.target(1);
    c.damage(t, c.spell(c.p.n));
    if (t && t.health <= 0 && mine) c.permanent(mine, 0, c.p.h);
  },
});
defCard({
  id: 'bouncing-flask', name: 'Bouncing Flask', rarity: 'uncommon', cost: { energy: 2 }, p: { n: 2, k: 3 }, up: { p: { k: 4 } },
  text: 'Apply {n} Poison to a random enemy creature in your lanes, {k} times.',
  play(c) {
    for (let i = 0; i < c.p.k; i++) {
      const foes = c.enemies(c.seat);
      if (foes.length) c.status(foes[c.rand(foes.length)], 'poison', c.p.n);
    }
  },
});
defCard({
  id: 'terror', name: 'Terror', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 3 }, up: { cost: { energy: 0 } }, tg: [ENEMY], kw: ['Exhaust'],
  text: 'Apply {n} Vulnerable to an enemy creature.',
  play(c) {
    c.status(c.target(), 'vulnerable', c.p.n);
  },
});

// ------------------------------------------------------------ spells, defense and tempo

defCard({
  id: 'leg-sweep', name: 'Leg Sweep', rarity: 'uncommon', cost: { energy: 2 }, p: { w: 2, b: 5 }, up: { p: { w: 3, b: 6 } }, tg: [ENEMY],
  text: 'Apply {w} Weak to an enemy creature. Gain {b} Block.',
  play(c) {
    c.status(c.target(), 'weak', c.p.w);
    c.block(c.p.b);
  },
});
defCard({
  id: 'grit', name: 'Grit', cost: { energy: 1 }, p: { n: 5 }, up: { p: { n: 7 } },
  text: 'Gain {n} Block. Remove a random other card in your hand until the battle ends.',
  play(c) {
    c.block(c.p.n);
    const hand = c.me.hand;
    if (hand.length) {
      const [gone] = hand.splice(c.rand(hand.length), 1);
      c.me.exhaust.push(gone);
      c.emit({ k: 'exhaust', seat: c.seat, uid: gone.uid });
    }
  },
});
defCard({
  id: 'blur', name: 'Blur', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 4 }, up: { p: { n: 6 } },
  text: 'Gain {n} Block. Your Block does not clear at the start of your next turn.',
  play(c) {
    c.block(c.p.n);
    c.me.c.keepBlock = 1;
    c.emit({ k: 'counter', seat: c.seat, name: 'keepBlock', v: 1 });
  },
});
defAbility({
  id: 'pw:fortify', text: 'Your Block does not clear at the start of your turn.',
  turnStart(c) {
    c.me.c.keepBlock = 1;
  },
});
defCard({
  id: 'fortify', name: 'Fortify', rarity: 'rare', cost: { energy: 3 }, up: { cost: { energy: 2 } }, tags: ['power'],
  text: 'For the rest of the battle, your Block does not clear at the start of your turn.',
  play(c) {
    c.me.c.keepBlock = 1;
    c.addPower('pw:fortify');
  },
});
defCard({
  id: 'adrenaline', name: 'Adrenaline', rarity: 'rare', cost: { energy: 0 }, p: { e: 1, d: 2 }, up: { p: { e: 2 } }, kw: ['Exhaust'],
  text: 'Gain {e} energy. Draw {d} cards.',
  play(c) {
    c.energy(c.p.e);
    c.draw(c.p.d);
  },
});
defCard({
  id: 'sharpen-up', name: 'Sharpen Up', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tags: ['power'],
  text: 'Gain {n} Strength.',
  play(c) {
    c.seatStatus('strength', c.p.n);
  },
});

// ------------------------------------------------------------ spells, support and positioning

defCard({
  id: 'swap-places', name: 'Swap Places', cost: { energy: 0 }, tg: [ALLY, ALLY],
  text: 'Swap two of your creatures.',
  play(c) {
    c.swap(c.target(0), c.target(1));
  },
});
defCard({
  id: 'trade-places', name: 'Trade Places', rarity: 'uncommon', cost: { energy: 0 }, tags: ['support'],
  text: 'Swap your creature next to the seam with your partner\'s creature next to the seam.',
  play(c) {
    c.swap(c.b.p[3], c.b.p[4]);
  },
});
defCard({
  id: 'rotation', name: 'Rotation', cost: { energy: 1 }, up: { cost: { energy: 0 } },
  text: 'Move each of your creatures one lane toward the seam. A creature that cannot move stays.',
  play(c) {
    const lanes = lanesOf(c.seat);
    const order = c.seat === 0 ? [...lanes].reverse() : lanes;
    const step = c.seat === 0 ? 1 : -1;
    for (const lane of order) {
      const x = c.b.p[lane];
      if (x) c.move(x, lane + step);
    }
  },
});
defCard({
  id: 'lend-a-hand', name: 'Lend a Hand', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, kw: ['Exhaust'], tags: ['support'],
  text: 'Your partner draws {n} cards.',
  play(c) {
    if (c.b.seats[c.partner].alive) c.draw(c.p.n, c.partner);
  },
});
defCard({
  id: 'charge-up', name: 'Charge Up', rarity: 'rare', cost: { energy: 2 }, p: { n: 1 }, up: { p: { n: 2 } }, kw: ['Exhaust'], tags: ['support'],
  text: 'Your partner\'s creatures each gain {n} power.',
  play(c) {
    for (const x of c.allies(c.partner)) c.buff(x, c.p.n, 0);
  },
});
defCard({
  id: 'formation', name: 'Formation', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tags: ['support'],
  text: 'The creatures in lanes 4 and 5 each gain {n} power and {n} health.',
  play(c) {
    c.buff(c.b.p[3], c.p.n, c.p.n);
    c.buff(c.b.p[4], c.p.n, c.p.n);
  },
});
defCard({
  id: 'shield-wall', name: 'Shield Wall', rarity: 'uncommon', cost: { energy: 2 }, up: { cost: { energy: 1 } }, tags: ['support'],
  text: 'Each creature in lanes 3 to 6 gains Shield.',
  play(c) {
    for (const lane of [2, 3, 4, 5]) {
      const x = c.b.p[lane];
      if (x) c.status(x, 'shield', 1);
    }
  },
});
defCard({
  id: 'share-the-load', name: 'Share the Load', cost: { energy: 0 }, p: { n: 3 }, up: { p: { n: 5 } }, tags: ['support'],
  text: 'Move {n} teeth from your partner\'s scale toward even, and {n} teeth on yours toward your loss.',
  play(c) {
    const mate = c.b.seats[c.partner];
    if (mate.scale >= 0) return;
    const n = Math.min(c.p.n, -mate.scale);
    c.mend(n, c.partner);
    c.pay(n);
  },
});
