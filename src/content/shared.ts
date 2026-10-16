import { defAbility, defCard, ITEMS } from '../engine/registry.ts';
import type { Ctx } from '../engine/fx.ts';
import { ALLY, ANY_ALLY, ANY_EMPTY, EMPTY, ENEMY, LANE, PARTNER_EMPTY, grows } from './helpers.ts';

// ------------------------------------------------------------ side deck and tokens

defCard({ id: 'placeholder', name: 'Placeholder', pool: 'side', rarity: 'special', power: 0, health: 2, tags: ['side'] });
defCard({ id: 'bee', name: 'Bee', pool: 'token', rarity: 'special', power: 2, health: 2, tribe: 'Insect', kw: ['Airborne'], tags: ['token'] });
defCard({ id: 'rabbit', name: 'Rabbit', pool: 'token', rarity: 'special', power: 0, health: 2, tags: ['token'] });
defCard({ id: 'dam', name: 'Dam', pool: 'token', rarity: 'special', power: 0, health: 4, tags: ['token', 'terrain'] });
defCard({ id: 'tail', name: 'Tail', pool: 'token', rarity: 'special', power: 0, health: 4, tags: ['token'] });
defCard({ id: 'gecko', name: 'Gecko', rarity: 'common', power: 2, health: 2, tribe: 'Reptile' });

// ------------------------------------------------------------ creatures

defCard({ id: 'weasel', name: 'Weasel', cost: { blood: 1 }, power: 2, health: 6, tribe: 'Canine' });
defCard({ id: 'leapfrog', name: 'Leapfrog', cost: { blood: 1 }, power: 2, health: 4, tribe: 'Reptile', kw: ['Reach'] });
defCard({ id: 'wolf', name: 'Wolf', cost: { blood: 2 }, power: 6, health: 4, tribe: 'Canine' });
defCard({
  id: 'wolf-pup', name: 'Wolf Pup', cost: { blood: 1 }, power: 2, health: 2, tribe: 'Canine',
  text: 'Grows into a Wolf.', ...grows('wolf'),
});
defCard({ id: 'bear', name: 'Bear', rarity: 'uncommon', cost: { blood: 3 }, power: 8, health: 12, tribe: 'Canine' });
defCard({ id: 'crow', name: 'Crow', cost: { blood: 2 }, power: 4, health: 6, tribe: 'Avian', kw: ['Airborne'] });
defCard({ id: 'sparrow', name: 'Sparrow', cost: { blood: 1 }, power: 2, health: 4, tribe: 'Avian', kw: ['Airborne'] });
defCard({
  id: 'hive', name: 'Hive', cost: { blood: 1 }, power: 0, health: 6, tribe: 'Insect',
  text: 'When struck: add a Bee to your hand.',
  struck(c) {
    c.add('bee');
  },
});
defCard({ id: 'mole', name: 'Mole', cost: { blood: 1 }, power: 0, health: 8, kw: ['Burrower'] });
defCard({ id: 'porcupine', name: 'Porcupine', cost: { blood: 1 }, power: 2, health: 4, kw: [['Thorns', 2]] });
defCard({ id: 'adder', name: 'Adder', rarity: 'uncommon', cost: { blood: 2 }, power: 2, health: 2, tribe: 'Reptile', kw: ['Deadly'] });
defCard({ id: 'cat', name: 'Cat', rarity: 'uncommon', cost: { blood: 1 }, power: 0, health: 2, kw: ['Spare Lives'] });
defCard({ id: 'goat', name: 'Goat', rarity: 'rare', cost: { blood: 1 }, power: 0, health: 2, tribe: 'Hooved', kw: ['Offering'] });
defCard({
  id: 'warren', name: 'Warren', cost: { blood: 1 }, power: 0, health: 4,
  text: 'When played: add a Rabbit to your hand.',
  play(c) {
    c.add('rabbit');
  },
});
defCard({ id: 'elk', name: 'Elk', cost: { blood: 2 }, power: 4, health: 8, tribe: 'Hooved', kw: ['Sprinter'] });
defCard({
  id: 'fawn', name: 'Fawn', cost: { blood: 1 }, power: 2, health: 2, tribe: 'Hooved', kw: ['Sprinter'],
  text: 'Grows into an Elk.', ...grows('elk'),
});
defCard({ id: 'coyote', name: 'Coyote', cost: { bones: 4 }, power: 4, health: 2, tribe: 'Canine' });
defCard({ id: 'vulture', name: 'Vulture', rarity: 'uncommon', cost: { bones: 8 }, power: 6, health: 6, tribe: 'Avian', kw: ['Airborne'] });
defCard({ id: 'hound', name: 'Hound', cost: { blood: 2 }, power: 4, health: 6, tribe: 'Canine', kw: ['Guardian'] });
defCard({ id: 'alpha', name: 'Alpha', rarity: 'uncommon', cost: { bones: 5 }, power: 2, health: 4, tribe: 'Canine', kw: [['Leader', 2]] });
defCard({
  id: 'skink', name: 'Skink', cost: { blood: 1 }, power: 2, health: 4, tribe: 'Reptile',
  text: 'When struck the first time: this moves to an adjacent empty lane and leaves a Tail behind.',
  struck(c) {
    const self = c.self;
    if (!self || self.c.dropped || self.health <= 0) return;
    const lane = c.laneOf(self);
    for (const to of [lane - 1, lane + 1]) {
      if (c.move(self, to)) {
        self.c.dropped = 1;
        c.summon('tail', lane);
        return;
      }
    }
  },
});
defCard({ id: 'opossum', name: 'Opossum', cost: { bones: 2 }, power: 2, health: 2 });
defCard({
  id: 'rat-pile', name: 'Rat Pile', cost: { blood: 2 }, power: 4, health: 2,
  text: 'When this dies: gain 4 bones.',
  death(c) {
    c.bones(4);
  },
});
defCard({
  id: 'field-mice', name: 'Field Mice', rarity: 'uncommon', cost: { blood: 2 }, power: 4, health: 4,
  text: 'When played: add a Field Mouse to your hand.',
  play(c) {
    c.add('field-mouse', 1, c.seat, c.self?.up ?? false);
  },
});
defCard({ id: 'field-mouse', name: 'Field Mouse', pool: 'token', rarity: 'special', cost: { blood: 2 }, power: 4, health: 4, up: { power: 5 } });
defCard({ id: 'turtle', name: 'Snapping Turtle', cost: { blood: 2 }, power: 2, health: 12, tribe: 'Reptile' });
defCard({ id: 'mantis', name: 'Mantis', rarity: 'uncommon', cost: { blood: 1 }, power: 2, health: 2, tribe: 'Insect', kw: ['Split Strike'] });
defCard({ id: 'mantis-saint', name: 'Many-Armed Mantis', rarity: 'rare', cost: { blood: 1 }, power: 2, health: 2, tribe: 'Insect', kw: ['Triple Strike'] });
defCard({ id: 'cockroach', name: 'Cockroach', cost: { bones: 4 }, power: 2, health: 2, tribe: 'Insect', kw: ['Returning'] });
defCard({ id: 'skunk', name: 'Skunk', cost: { blood: 1 }, power: 0, health: 6, kw: [['Stench', 2]] });
defCard({
  id: 'beaver', name: 'Beaver', cost: { blood: 2 }, power: 2, health: 6,
  text: 'When played: put a Dam in each adjacent empty lane in your half.',
  play(c) {
    const lane = c.laneOf();
    for (const l of [lane - 1, lane + 1]) if (l >= 0 && c.sameHalf(l, lane)) c.summon('dam', l);
  },
});
defCard({ id: 'shark', name: 'Shark', rarity: 'uncommon', cost: { blood: 3 }, power: 8, health: 4, kw: ['Submerge'] });
defCard({ id: 'kingfisher', name: 'Kingfisher', cost: { blood: 1 }, power: 2, health: 2, tribe: 'Avian', kw: ['Airborne', 'Submerge'] });
defCard({
  id: 'pack-rat', name: 'Pack Rat', rarity: 'rare', cost: { blood: 2 }, power: 4, health: 4,
  text: 'When played: gain a random item.',
  play(c) {
    giveItem(c);
  },
});
defCard({ id: 'moose', name: 'Moose', rarity: 'uncommon', cost: { blood: 3 }, power: 6, health: 14, tribe: 'Hooved' });
defCard({
  id: 'ant', name: 'Ant', cost: { blood: 1 }, power: 0, health: 4, tribe: 'Insect',
  text: 'This has 2 power for each Ant in your lanes.',
  powerMod(c, target) {
    if (target !== c.self) return 0;
    return 2 * c.allies(target.seat).filter((x) => x.id === 'ant' || x.id === 'ant-queen').length;
  },
});
defCard({
  id: 'ant-queen', name: 'Ant Queen', rarity: 'uncommon', cost: { blood: 2 }, power: 0, health: 6, tribe: 'Insect',
  lines: [
    {
      text: 'This has 2 power for each Ant in your lanes.',
      powerMod(c, target) {
        if (target !== c.self) return 0;
        return 2 * c.allies(target.seat).filter((x) => x.id === 'ant' || x.id === 'ant-queen').length;
      },
    },
    {
      text: 'When played: add an Ant to your hand.',
      play(c) {
        c.add('ant');
      },
    },
  ],
});
defCard({ id: 'mixed-beast', name: 'Mixed-Up Beast', rarity: 'rare', cost: { blood: 2 }, power: 6, health: 6, tribe: 'Any' });

// Support creatures
defCard({
  id: 'medic-mouse', name: 'Medic Mouse', rarity: 'uncommon', cost: { blood: 1 }, power: 0, health: 4, tags: ['support'],
  text: 'At the end of your turn: heal each adjacent creature by 2.',
  turnEnd(c) {
    for (const x of c.adjacent()) c.heal(x, 2);
  },
});
defCard({
  id: 'pigeon', name: 'Courier Pigeon', cost: { blood: 1 }, power: 2, health: 2, tribe: 'Avian', kw: ['Airborne'], tags: ['support'],
  text: 'When played: your partner draws 1 card.',
  play(c) {
    if (c.b.seats[c.partner].alive) c.draw(1, c.partner);
  },
});
defCard({
  id: 'battery-beetle', name: 'Battery Beetle', rarity: 'uncommon', cost: { bones: 3 }, power: 0, health: 4, tribe: 'Insect', tags: ['support'],
  text: 'At the start of your turn: your partner gains 1 energy.',
  turnStart(c) {
    if (c.b.seats[c.partner].alive) c.energy(1, c.partner);
  },
});
defCard({
  id: 'grave-robin', name: 'Grave Robin', cost: { blood: 1 }, power: 2, health: 4, tribe: 'Avian', tags: ['support'],
  text: 'When another of your creatures dies: your partner gains 1 bone.',
  allyDies(c, dead) {
    if (dead.seat === c.seat && dead !== c.self && c.b.seats[c.partner].alive) c.bones(1, c.partner);
  },
});
defCard({
  id: 'herald', name: 'Herald', rarity: 'uncommon', cost: { blood: 2 }, power: 2, health: 6, tags: ['support'], kw: [['Leader', 2]],
});

// ------------------------------------------------------------ spells

defCard({
  id: 'jab', name: 'Jab', cost: { energy: 1 }, p: { n: 3 }, up: { p: { n: 4 } }, tg: [LANE],
  text: 'Hit a lane for {n}.',
  play(c) {
    c.hit(c.lane(), c.spell(c.p.n));
  },
});
defCard({
  id: 'brace', name: 'Brace', cost: { energy: 1 }, p: { n: 3 }, up: { p: { n: 5 } },
  text: 'Gain {n} Block.',
  play(c) {
    c.block(c.p.n);
  },
});
defCard({
  id: 'haymaker', name: 'Haymaker', cost: { energy: 2 }, p: { n: 4, v: 2 }, up: { p: { n: 5, v: 3 } }, tg: [ENEMY],
  text: 'Deal {n} damage to an enemy creature. Apply {v} Vulnerable.',
  play(c) {
    const t = c.target();
    c.damage(t, c.spell(c.p.n));
    c.status(t, 'vulnerable', c.p.v);
  },
});
defCard({
  id: 'sweep', name: 'Sweep', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } },
  text: 'Deal {n} damage to each enemy creature in your lanes.',
  play(c) {
    for (const e of c.enemies(c.seat)) c.damage(e, c.spell(c.p.n));
  },
});
defCard({
  id: 'iron-skin', name: 'Iron Skin', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 4 }, up: { p: { n: 6 } },
  text: 'Gain {n} Block. Draw 1 card.',
  play(c) {
    c.block(c.p.n);
    c.draw(1);
  },
});
defCard({
  id: 'pommel', name: 'Pommel Blow', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tg: [LANE],
  text: 'Hit a lane for {n}. Draw 1 card.',
  play(c) {
    c.hit(c.lane(), c.spell(c.p.n));
    c.draw(1);
  },
});
defAbility({
  id: 'pw:rally', text: 'Your creatures have {n} more power.', p: { n: 1 },
  powerMod(c, target) {
    return target.side === 'p' && target.seat === c.seat ? c.p.n : 0;
  },
});
defCard({
  id: 'rally', name: 'Rally', rarity: 'uncommon', cost: { energy: 2 }, p: { n: 1 }, up: { p: { n: 2 } }, tags: ['power'],
  text: 'For the rest of the battle, your creatures have {n} more power.',
  play(c) {
    c.addPower('pw:rally', { n: c.p.n });
  },
});
defCard({
  id: 'toxin-dart', name: 'Toxin Dart', cost: { energy: 1 }, p: { n: 3 }, up: { p: { n: 5 } }, tg: [ENEMY],
  text: 'Apply {n} Poison to an enemy creature.',
  play(c) {
    c.status(c.target(), 'poison', c.p.n);
  },
});
defAbility({
  id: 'pw:noxious', text: 'At the start of your turn: apply {n} Poison to each enemy creature in your lanes.', p: { n: 1 },
  turnStart(c) {
    for (const e of c.enemies(c.seat)) c.status(e, 'poison', c.p.n);
  },
});
defCard({
  id: 'noxious-cloud', name: 'Noxious Cloud', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 1 }, up: { p: { n: 2 } }, tags: ['power'],
  text: 'For the rest of the battle, at the start of your turn: apply {n} Poison to each enemy creature in your lanes.',
  play(c) {
    c.addPower('pw:noxious', { n: c.p.n });
  },
});
defCard({
  id: 'backflip', name: 'Backflip', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 4 } },
  text: 'Gain {n} Block. Draw 1 card.',
  play(c) {
    c.block(c.p.n);
    c.draw(1);
  },
});
defCard({
  id: 'bloodletting', name: 'Bloodletting', rarity: 'uncommon', cost: { energy: 0 }, p: { n: 2, e: 2 }, up: { p: { e: 3 } },
  text: 'Move {n} teeth toward your loss. Gain {e} energy.',
  play(c) {
    c.pay(c.p.n);
    c.energy(c.p.e);
  },
});
defCard({
  id: 'blood-rite', name: 'Blood Rite', rarity: 'uncommon', cost: { blood: 1 }, p: { e: 2, d: 2 }, up: { p: { e: 3 } }, kw: ['Exhaust'],
  text: 'Gain {e} energy. Draw {d} cards.',
  play(c) {
    c.energy(c.p.e);
    c.draw(c.p.d);
  },
});
defCard({
  id: 'bone-reading', name: 'Bone Reading', cost: { bones: 3 }, p: { d: 2 }, up: { p: { d: 3 } },
  text: 'Draw {d} cards.',
  play(c) {
    c.draw(c.p.d);
  },
});
defCard({
  id: 'shove', name: 'Shove', cost: { energy: 0 }, tg: [ALLY, EMPTY],
  text: 'Move one of your creatures to an empty lane in your half.',
  play(c) {
    c.move(c.target(0), c.lane(1));
  },
});
defCard({
  id: 'crossover', name: 'Crossover', cost: { energy: 1 }, tg: [ALLY, PARTNER_EMPTY], tags: ['support'],
  text: 'Move one of your creatures to an empty lane in your partner\'s half. It becomes theirs.',
  play(c) {
    c.move(c.target(0), c.lane(1), true);
  },
});
defCard({
  id: 'hand-me-down', name: 'Hand-Me-Down', cost: { energy: 0 }, p: { n: 3 }, up: { p: { n: 5 } }, kw: ['Exhaust'], tags: ['support'],
  text: 'Your partner gains {n} bones.',
  play(c) {
    c.bones(c.p.n, c.partner);
  },
});
defCard({
  id: 'spare-battery', name: 'Spare Battery', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tags: ['support'],
  text: 'Your partner gains {n} energy.',
  play(c) {
    c.energy(c.p.n, c.partner);
  },
});
defCard({
  id: 'pep-talk', name: 'Pep Talk', cost: { energy: 1 }, p: { n: 4 }, up: { p: { n: 6 } }, tg: [ANY_ALLY], tags: ['support'],
  text: 'A creature in any lane has {n} more power this turn.',
  play(c) {
    c.temp(c.target(), c.p.n);
  },
});
defCard({
  id: 'air-drop', name: 'Air Drop', cost: { energy: 1 }, tg: [ANY_EMPTY], tags: ['support'],
  text: 'Summon a Gecko in an empty slot in any lane.',
  play(c) {
    c.summon('gecko', c.lane());
  },
});
defCard({
  id: 'cover-fire', name: 'Cover Fire', cost: { energy: 1 }, p: { n: 5 }, up: { p: { n: 7 } }, tags: ['support'],
  text: 'Your partner gains {n} Block.',
  play(c) {
    c.block(c.p.n, c.partner);
  },
});
defCard({
  id: 'double-up', name: 'Double Up', rarity: 'rare', cost: { energy: 2 }, up: { cost: { energy: 1 } }, kw: ['Exhaust'], tags: ['support'],
  text: 'Your partner\'s next spell is played twice.',
  play(c) {
    c.counter('twice', 1, c.partner);
  },
});
defCard({
  id: 'blood-pact', name: 'Blood Pact', rarity: 'uncommon', cost: { blood: 1 }, p: { n: 2 }, tags: ['support'],
  text: 'Your partner\'s next blood card costs {n} less blood.',
  play(c) {
    c.b.seats[c.partner].c.bloodLess = c.p.n;
    c.emit({ k: 'counter', seat: c.partner, name: 'bloodLess', v: c.p.n });
  },
});
defCard({
  id: 'catalyst', name: 'Catalyst', rarity: 'uncommon', cost: { energy: 1 }, tg: [ENEMY], up: { kw: [] },
  text: 'Double the Poison on an enemy creature.',
  play(c) {
    const t = c.target();
    if (t) c.status(t, 'poison', t.st.poison ?? 0);
  },
});
defCard({
  id: 'disarm', name: 'Disarm', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 4 } }, tg: [ENEMY], kw: ['Exhaust'],
  text: 'An enemy creature loses {n} power.',
  play(c) {
    c.buff(c.target(), -c.p.n, 0);
  },
});
defCard({
  id: 'feint', name: 'Feint', cost: { energy: 0 }, p: { n: 2, w: 1 }, up: { p: { n: 3, w: 2 } }, tg: [LANE],
  text: 'Hit a lane for {n}. Apply {w} Weak to the enemy creature there.',
  play(c) {
    const foe = c.b.e[c.lane()];
    c.hit(c.lane(), c.spell(c.p.n));
    if (foe) c.status(foe, 'weak', c.p.w);
  },
});
defCard({
  id: 'footwork', name: 'Footwork', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tags: ['power'],
  text: 'Gain {n} Dexterity.',
  play(c) {
    c.seatStatus('dexterity', c.p.n);
  },
});
defCard({
  id: 'shockwave', name: 'Shockwave', rarity: 'uncommon', cost: { energy: 2 }, p: { n: 2 }, up: { p: { n: 3 } }, kw: ['Exhaust'],
  text: 'Apply {n} Weak and {n} Vulnerable to each enemy creature in your lanes.',
  play(c) {
    for (const e of c.enemies(c.seat)) {
      c.status(e, 'weak', c.p.n);
      c.status(e, 'vulnerable', c.p.n);
    }
  },
});
defCard({
  id: 'bulwark', name: 'Bulwark', rarity: 'rare', cost: { energy: 2 }, p: { n: 10 }, up: { p: { n: 14 } }, kw: ['Exhaust'],
  text: 'Gain {n} Block.',
  play(c) {
    c.block(c.p.n);
  },
});
defCard({
  id: 'reinforce', name: 'Reinforce', cost: { energy: 1 }, p: { n: 4 }, up: { p: { n: 6 } }, tg: [ANY_ALLY], tags: ['support'],
  text: 'A creature in any lane gains {n} health.',
  play(c) {
    c.buff(c.target(), 0, c.p.n);
  },
});
defCard({
  id: 'steady-hands', name: 'Steady Hands', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 3 }, up: { p: { n: 5 } }, tags: ['support'],
  text: 'Move {n} teeth on your partner\'s scale back toward even.',
  play(c) {
    c.mend(c.p.n, c.partner);
  },
});
defCard({
  id: 'war-cry', name: 'War Cry', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tags: ['support'],
  text: 'Your partner\'s creatures have {n} more power this turn.',
  play(c) {
    for (const x of c.allies(c.partner)) c.temp(x, c.p.n);
  },
});

/** Puts a random item from the common pool into the seat's first empty item slot. */
export function giveItem(c: Ctx): void {
  const slots = c.me.items;
  const free = slots.indexOf(null);
  if (free < 0) return;
  const pool = [...ITEMS.values()].filter((i) => i.rarity === 'common').map((i) => i.id).sort();
  if (pool.length === 0) return;
  slots[free] = pool[c.rand(pool.length)];
  c.emit({ k: 'itemGain', seat: c.seat, id: slots[free] });
}
