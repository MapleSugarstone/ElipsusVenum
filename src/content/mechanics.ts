// Cards built on the newer mechanics: terrain on lanes, choices, combos that count plays, effects that wait for a later
// turn, bonds that share damage, and spells paid for in blood or bones.
import { CARDS, defAbility, defCard, defTerm, type TargetSpec } from '../engine/registry.ts';
import type { Ctx } from '../engine/fx.ts';
import { lanesOf } from '../engine/types.ts';
import { ANY_ALLY, ANY_LANE, ENEMY, LANE, pray } from './helpers.ts';

const PARTNER_ALLY: TargetSpec = { row: 'p', who: 'partner' };
const PARTNER_ALLY_OPT: TargetSpec = { row: 'p', who: 'partner', opt: true };

defTerm('Bond', 'Two bonded creatures share damage: when one takes damage, half of it, rounded down, goes to the other instead. A bond ends when either dies.');

// ---------------------------------------------------------------- terrain

defAbility({
  id: 'terrain:pit', text: 'Pit. The next enemy creature that enters this lane takes {n} damage, then the Pit fills in.', p: { n: 6 },
  terrainEnter(c, card) {
    if (card.side !== 'e') return;
    c.damage(card, c.p.n);
    c.clearTerrain(c.lane());
  },
});
defAbility({
  id: 'terrain:bonfire', text: 'Bonfire. At the end of your turn: deal {n} damage to the enemy creature in this lane.', p: { n: 2 },
  terrainEnd(c) {
    c.damage(c.b.e[c.lane()], c.p.n);
  },
});
defAbility({
  id: 'terrain:high-ground', text: 'High Ground. Your creature in this lane has {n} more power.', p: { n: 2 },
  powerMod(c, target) {
    return target.side === 'p' && c.b.p[c.lane()] === target ? c.p.n : 0;
  },
});
defAbility({
  id: 'terrain:mud', text: 'Mud. The enemy creature in this lane has {n} less power.', p: { n: 2 },
  powerMod(c, target) {
    return target.side === 'e' && c.b.e[c.lane()] === target ? -c.p.n : 0;
  },
});
defAbility({
  id: 'terrain:shrine', text: 'Shrine. At the end of your turn: if you have a creature in this lane, Pray {n}.', p: { n: 2 },
  terrainEnd(c) {
    if (c.b.p[c.lane()]) pray(c, c.p.n);
  },
});
defAbility({
  id: 'terrain:server-rack', text: 'Server Rack. At the end of your turn: if you have a creature in this lane, run your Programs\' end of turn effects.',
  terrainEnd(c) {
    if (c.b.p[c.lane()]) c.runPrograms();
  },
});

defCard({
  id: 'pitfall', name: 'Pitfall', cost: { energy: 1 }, p: { n: 6 }, up: { p: { n: 9 } }, tg: [LANE],
  text: 'Dig a Pit in one of your lanes. It deals {n} damage.',
  play(c) {
    c.terrain(c.lane(), 'terrain:pit', { n: c.p.n });
  },
});
defCard({
  id: 'bonfire', name: 'Bonfire', rarity: 'uncommon', cost: { energy: 2 }, p: { n: 2 }, up: { p: { n: 3 } }, tg: [LANE],
  text: 'Light a Bonfire in one of your lanes. It deals {n} damage.',
  play(c) {
    c.terrain(c.lane(), 'terrain:bonfire', { n: c.p.n });
  },
});
defCard({
  id: 'high-ground', name: 'High Ground', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tg: [LANE],
  text: 'Raise High Ground in one of your lanes. It gives {n} power.',
  play(c) {
    c.terrain(c.lane(), 'terrain:high-ground', { n: c.p.n });
  },
});
defCard({
  id: 'mudslide', name: 'Mudslide', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tg: [ANY_LANE], tags: ['support'],
  text: 'Spread Mud in any lane. It takes {n} power.',
  play(c) {
    c.terrain(c.lane(), 'terrain:mud', { n: c.p.n });
  },
});
defCard({
  id: 'groundskeeper', name: 'Groundskeeper', cost: { blood: 1 }, power: 1, health: 5, p: { n: 2 },
  text: 'When played: raise High Ground in its lane. It gives {n} power.',
  play(c) {
    c.terrain(c.laneOf(), 'terrain:high-ground', { n: c.p.n });
  },
});
defCard({
  id: 'firebug', name: 'Firebug', cost: { bones: 2 }, power: 1, health: 2, tribe: 'Insect', p: { n: 2 },
  text: 'When this dies: light a Bonfire in its lane. It deals {n} damage.',
  death(c) {
    const lane = c.self?.c.lane ?? -1;
    if (lane >= 0) c.terrain(lane, 'terrain:bonfire', { n: c.p.n });
  },
});
defCard({
  id: 'kings-shrine', name: 'The King\'s Shrine', pool: 'blue', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tg: [LANE], tags: ['king'],
  text: 'Raise a Shrine in one of your lanes. It prays {n}.',
  play(c) {
    c.terrain(c.lane(), 'terrain:shrine', { n: c.p.n });
  },
});
defCard({
  id: 'server-rack', name: 'Server Rack', pool: 'pistachio', rarity: 'rare', cost: { energy: 2 }, up: { cost: { energy: 1 } }, tg: [LANE], tags: ['program'],
  text: 'Install a Server Rack in one of your lanes.',
  play(c) {
    c.terrain(c.lane(), 'terrain:server-rack');
  },
});

// ---------------------------------------------------------------- choices

defCard({
  id: 'rummage', name: 'Rummage', cost: { energy: 1 }, p: { n: 3 }, up: { p: { n: 4 } },
  text: 'Look at the top {n} cards of your deck. Put 1 of them into your hand.',
  play(c) {
    c.choose(c.topOfDeck(c.p.n).map((x) => ({ uid: x.uid, id: x.id, up: x.up })), 'rummage#0', 'Put one into your hand');
  },
  chosen(c, pick) {
    if (pick.uid !== undefined) c.fromDeck(pick.uid);
  },
});
defCard({
  id: 'fortune-teller', name: 'Fortune Teller', rarity: 'uncommon', cost: { blood: 1 }, power: 1, health: 3, p: { n: 3 },
  text: 'When played: look at the top {n} cards of your deck. Put 1 of them into your hand.',
  play(c) {
    c.choose(c.topOfDeck(c.p.n).map((x) => ({ uid: x.uid, id: x.id, up: x.up })), 'fortune-teller#0', 'Put one into your hand');
  },
  chosen(c, pick) {
    if (pick.uid !== undefined) c.fromDeck(pick.uid);
  },
});

/** `n` different spells from the seat's pools, picked with the battle's random numbers. */
function spellOffer(c: Ctx, n: number): string[] {
  const pool = [...CARDS.values()]
    .filter((d) => d.kind === 'spell' && (d.pool === 'shared' || d.pool === c.me.char) && d.rarity !== 'special')
    .map((d) => d.id);
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(c.rand(pool.length), 1)[0]);
  return out;
}
defCard({
  id: 'inspiration', name: 'Inspiration', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 3 }, up: { cost: { energy: 0 } }, kw: ['Exhaust'],
  text: 'Choose 1 of {n} random spells and add it to your hand. It costs no energy this turn.',
  play(c) {
    c.choose(spellOffer(c, c.p.n).map((id) => ({ id })), 'inspiration#0', 'Add one to your hand');
  },
  chosen(c, pick) {
    const made = c.add(pick.id)[0];
    if (made) c.freeThisTurn(made);
  },
});
defCard({
  id: 'pass-it-on', name: 'Pass It On', cost: { energy: 0 }, p: { n: 1 }, up: { p: { n: 2 } }, tags: ['support'],
  text: 'Draw {n} card. Then give a card from your hand to your partner.',
  play(c) {
    c.draw(c.p.n);
    if (!c.b.seats[c.partner].alive) return;
    c.choose(c.me.hand.map((x) => ({ uid: x.uid, id: x.id, up: x.up })), 'pass-it-on#0', 'Give one to your partner');
  },
  chosen(c, pick) {
    if (pick.uid !== undefined) c.give(pick.uid, c.partner);
  },
});
defCard({
  id: 'refit', name: 'Refit', cost: { energy: 1 }, p: { b: 4 }, up: { p: { b: 6 } },
  text: 'Gain {b} Block. Upgrade a card in your hand for the rest of the battle.',
  play(c) {
    c.block(c.p.b);
    const options = c.me.hand.filter((x) => !x.up && CARDS.get(x.id)?.up);
    c.choose(options.map((x) => ({ uid: x.uid, id: x.id })), 'refit#0', 'Upgrade one for this battle');
  },
  chosen(c, pick) {
    c.upgrade(c.me.hand.find((x) => x.uid === pick.uid) ?? null);
  },
});
defCard({
  id: 'git-clone', name: 'Git Clone', pool: 'pistachio', rarity: 'uncommon', cost: { energy: 1 }, up: { cost: { energy: 0 } }, tags: ['support'],
  text: 'Choose a card in your hand. Your partner adds a copy of it to their hand.',
  play(c) {
    if (!c.b.seats[c.partner].alive) return;
    c.choose(c.me.hand.map((x) => ({ uid: x.uid, id: x.id, up: x.up })), 'git-clone#0', 'Copy one for your partner');
  },
  chosen(c, pick) {
    c.add(pick.id, 1, c.partner, !!pick.up);
  },
});

// ---------------------------------------------------------------- combos

defCard({
  id: 'flurry', name: 'Flurry', rarity: 'uncommon', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tg: [LANE],
  text: 'Hit a lane for {n} once for each spell you played this turn.',
  play(c) {
    for (let i = 0; i < c.played('spell'); i++) c.hit(c.lane(), c.spell(c.p.n));
  },
});
defCard({
  id: 'tag-team', name: 'Tag Team', cost: { energy: 1 }, p: { n: 4 }, up: { p: { n: 6 } }, tg: [ENEMY], tags: ['support'],
  text: 'Deal {n} damage to an enemy creature. If your partner played a card this turn, deal it again.',
  play(c) {
    const t = c.target();
    c.damage(t, c.spell(c.p.n));
    if (c.partnerPlayed() > 0) c.damage(t, c.spell(c.p.n));
  },
});
defCard({
  id: 'finisher', name: 'Finisher', rarity: 'rare', cost: { energy: 2 }, p: { n: 2 }, up: { p: { n: 3 } }, tg: [ENEMY],
  text: 'Deal {n} damage to an enemy creature for each card you played this turn.',
  play(c) {
    c.damage(c.target(), c.spell(c.p.n * c.played()));
  },
});
defCard({
  id: 'second-act', name: 'Second Act', cost: { energy: 1 }, p: { n: 2, d: 1 }, up: { p: { n: 3 } },
  text: 'If you played a creature this turn, gain {n} energy and draw {d} card.',
  play(c) {
    if (c.played('creature') === 0) return;
    c.energy(c.p.n);
    c.draw(c.p.d);
  },
});
defCard({
  id: 'show-off', name: 'Show-Off', rarity: 'uncommon', cost: { blood: 1 }, power: 1, health: 4, p: { n: 1 },
  text: 'At the end of your turn: this gains {n} power for each card you played this turn.',
  turnEnd(c) {
    const n = c.p.n * c.played();
    if (n > 0) c.buff(c.self, n, 0);
  },
});

// ---------------------------------------------------------------- next turn

defCard({
  id: 'wind-up', name: 'Wind Up', cost: { energy: 1 }, p: { n: 8 }, up: { p: { n: 11 } }, tg: [LANE],
  text: 'Next turn, hit this lane for {n}.',
  play(c) {
    c.later('wind-up#0');
  },
  later(c) {
    c.hit(c.lane(), c.spell(c.p.n));
  },
});
defCard({
  id: 'slow-burn', name: 'Slow Burn', rarity: 'uncommon', cost: { energy: 2 }, p: { n: 5 }, up: { p: { n: 7 } },
  text: 'Next turn, deal {n} damage to each enemy creature in your lanes.',
  play(c) {
    c.later('slow-burn#0');
  },
  later(c) {
    for (const e of c.enemies(c.seat)) c.damage(e, c.spell(c.p.n));
  },
});
defCard({
  id: 'care-package', name: 'Care Package', cost: { energy: 1 }, p: { e: 1, n: 1 }, up: { p: { e: 2 } }, tags: ['support'],
  text: 'Next turn, your partner gains {e} energy and draws {n} card.',
  play(c) {
    c.later('care-package#0');
  },
  later(c) {
    if (!c.b.seats[c.partner].alive) return;
    c.energy(c.p.e, c.partner);
    c.draw(c.p.n, c.partner);
  },
});
defCard({
  id: 'nest-egg', name: 'Nest Egg', rarity: 'uncommon', cost: { energy: 1 }, p: { t: 2, n: 3, d: 2 }, up: { p: { n: 4 } },
  text: 'In {t} turns, gain {n} energy and draw {d} cards.',
  play(c) {
    c.later('nest-egg#0', c.p.t);
  },
  later(c) {
    c.energy(c.p.n);
    c.draw(c.p.d);
  },
});
defCard({
  id: 'cron-job', name: 'Cron Job', pool: 'pistachio', rarity: 'uncommon', cost: { energy: 1 }, up: { cost: { energy: 0 } }, tags: ['program'],
  text: 'Next turn and the turn after, run your Programs\' end of turn effects.',
  play(c) {
    c.later('cron-job#0', 1);
    c.later('cron-job#0', 2);
  },
  later(c) {
    c.runPrograms();
  },
});

// ---------------------------------------------------------------- bonds

defCard({
  id: 'blood-brothers', name: 'Blood Brothers', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 4 } }, tg: [{ row: 'p' }, PARTNER_ALLY], tags: ['support'],
  text: 'Bond a creature of yours with one of your partner\'s. Each gains {n} health.',
  play(c) {
    const a = c.target(0), b = c.target(1);
    if (c.bond(a, b)) {
      c.buff(a, 0, c.p.n);
      c.buff(b, 0, c.p.n);
    }
  },
});
defCard({
  id: 'lovebirds', name: 'Lovebirds', rarity: 'uncommon', cost: { blood: 2 }, power: 3, health: 5, tribe: 'Avian', kw: ['Airborne'], tg: [PARTNER_ALLY_OPT], tags: ['support'],
  text: 'When played: bond this with a creature in your partner\'s lanes.',
  play(c) {
    c.bond(c.self, c.target());
  },
});
defCard({
  id: 'stone-pact', name: 'Stone Pact', rarity: 'uncommon', cost: { bones: 3 }, p: { n: 6 }, up: { p: { n: 9 } }, tg: [ENEMY, ENEMY],
  text: 'Bond two enemy creatures. Deal {n} damage to the first.',
  play(c) {
    c.bond(c.target(0), c.target(1));
    c.damage(c.target(0), c.spell(c.p.n));
  },
});

// ---------------------------------------------------------------- spells paid in blood and bones

defCard({
  id: 'blood-offering', name: 'Blood Offering', cost: { blood: 1 }, p: { n: 2, d: 2 }, up: { p: { d: 3 } },
  text: 'Gain {n} energy and draw {d} cards.',
  play(c) {
    c.energy(c.p.n);
    c.draw(c.p.d);
  },
});
defCard({
  id: 'transfusion', name: 'Transfusion', cost: { blood: 1 }, p: { n: 2, h: 4 }, up: { p: { n: 3, h: 6 } }, tg: [ANY_ALLY], tags: ['support'],
  text: 'Give a creature in any lane {n} power and {h} health.',
  play(c) {
    c.buff(c.target(), c.p.n, c.p.h);
  },
});
defCard({
  id: 'last-rites', name: 'Last Rites', rarity: 'rare', cost: { blood: 2 }, up: { cost: { blood: 1 } }, tg: [ENEMY],
  text: 'Kill an enemy creature.',
  play(c) {
    c.kill(c.target());
  },
});
defCard({
  id: 'bone-storm', name: 'Bone Storm', rarity: 'uncommon', cost: { bones: 4 }, p: { n: 3 }, up: { p: { n: 4 } },
  text: 'Hit each lane in your half for {n}.',
  play(c) {
    for (const lane of lanesOf(c.seat)) c.hit(lane, c.spell(c.p.n));
  },
});
defCard({ id: 'bone-servant', name: 'Bone Servant', pool: 'token', rarity: 'special', cost: { bones: 1 }, power: 2, health: 2, kw: ['Brittle'] });
defCard({
  id: 'raise-the-dead', name: 'Raise the Dead', rarity: 'uncommon', cost: { bones: 3 }, up: { cost: { bones: 2 } },
  text: 'Summon a Bone Servant in each empty lane in your half.',
  play(c) {
    for (const lane of c.emptyLanes()) c.summon('bone-servant', lane);
  },
});
defCard({
  id: 'pledge', name: 'Pledge', pool: 'blue', cost: { blood: 1 }, p: { n: 3, k: 2 }, up: { p: { k: 3 } }, tags: ['knife'],
  text: 'Pray {n}. Add {k} Knives to your hand.',
  play(c) {
    pray(c, c.p.n);
    c.add('knife', c.p.k);
  },
});
