// Relics that use the seat hooks for candles, enemy deaths, and won halves, the run-level relic hooks, and the relics
// that only events give.
import type { Ctx } from '../engine/fx.ts';
import { ABILITIES, CARDS, card, defRelic } from '../engine/registry.ts';
import type { RunCtx } from '../run/events.ts';
import { pray } from './helpers.ts';

const rc = (r: unknown): RunCtx => r as RunCtx;
/** True the first time a seat asks for `key` in a battle. */
const firstTime = (c: Ctx, key: string): boolean => {
  if (c.me.c[key]) return false;
  c.me.c[key] = 1;
  return true;
};
/** True the first time a seat asks for `key` in a turn. */
const oncePerTurn = (c: Ctx, key: string): boolean => {
  if (c.me.c[key] === c.b.turn) return false;
  c.me.c[key] = c.b.turn;
  return true;
};
const randomOf = <T>(c: Ctx, list: T[]): T | undefined => (list.length ? list[c.rand(list.length)] : undefined);
const randomLaneOfHalf = (c: Ctx): number => c.seat * 4 + c.rand(4);

// ---------------------------------------------------------------- common

defRelic({
  id: 'sticky-note', name: 'Sticky Note', rarity: 'common', pool: 'shared',
  text: 'On your first turn of each battle: a random card in your hand costs 0 this turn.',
  turnStart(c) {
    const pick = c.b.turn === 1 ? randomOf(c, c.me.hand) : undefined;
    if (pick) c.freeThisTurn(pick);
  },
});
defRelic({
  id: 'bent-spoon', name: 'Bent Spoon', rarity: 'common', pool: 'shared',
  text: 'When an enemy creature in your half dies: gain 2 Block.',
  foeDies(c) {
    c.block(2);
  },
});
defRelic({
  id: 'tally-marks', name: 'Tally Marks', rarity: 'common', pool: 'shared',
  text: 'When you play your third card in a turn: draw 1 card.',
  seatPlay(c) {
    if (c.played() === 3) c.draw(1);
  },
});
defRelic({
  id: 'bubble-wrap', name: 'Bubble Wrap', rarity: 'common', pool: 'shared',
  text: 'When you play your first creature of each battle: it gains Shield.',
  seatPlay(c, played) {
    if (card(played.id).kind === 'creature' && firstTime(c, 'bubbleWrap')) c.status(played, 'shield', 1);
  },
});
defRelic({
  id: 'pencil-shavings', name: 'Pencil Shavings', rarity: 'common', pool: 'shared',
  text: 'At the end of your turn: if you played no cards this turn, gain 6 Block.',
  turnEnd(c) {
    if (c.played() === 0) c.block(6);
  },
});
defRelic({
  id: 'piggy-bank', name: 'Piggy Bank', rarity: 'common', pool: 'shared',
  text: 'When you win a battle: gain 3 teeth.',
  afterWin(r, seat) {
    rc(r).teeth(seat, 3);
  },
});
defRelic({
  id: 'night-light', name: 'Night Light', rarity: 'common', pool: 'shared',
  text: 'When one of your candles goes out: gain 10 Block.',
  candleOut(c) {
    c.block(10);
  },
});
defRelic({
  id: 'glue-stick', name: 'Glue Stick', rarity: 'common', pool: 'shared',
  text: 'When you play a creature: it and each creature next to it gain 1 health.',
  seatPlay(c, played) {
    if (card(played.id).kind !== 'creature') return;
    c.buff(played, 0, 1);
    for (const x of c.adjacent(played)) c.buff(x, 0, 1);
  },
});
defRelic({
  id: 'coupon-book', name: 'Coupon Book', rarity: 'common', pool: 'shared', discount: 2,
  text: 'Shops sell you cards and items for 2 fewer teeth.',
});
defRelic({
  id: 'scarecrow', name: 'Scarecrow', rarity: 'common', pool: 'shared',
  text: 'At the start of each battle: dig a Pit in a random lane in your half.',
  battleStart(c) {
    c.terrain(randomLaneOfHalf(c), 'terrain:pit', { n: 6 });
  },
});

// ---------------------------------------------------------------- uncommon

defRelic({
  id: 'bookmark', name: 'Bookmark', rarity: 'uncommon', pool: 'shared',
  text: 'When you enter a rest site: upgrade a random card in your deck.',
  enterNode(r, seat, kind) {
    if (kind === 'rest') rc(r).upgradeRandom(seat);
  },
});
defRelic({
  id: 'metronome', name: 'Metronome', rarity: 'uncommon', pool: 'shared',
  text: 'At the start of every third turn: gain 2 energy.',
  turnStart(c) {
    if (c.b.turn % 3 === 0) c.energy(2);
  },
});
defRelic({
  id: 'egg-timer', name: 'Egg Timer', rarity: 'uncommon', pool: 'shared',
  text: 'On your third turn of each battle: draw 2 cards and gain 2 energy.',
  turnStart(c) {
    if (c.b.turn !== 3) return;
    c.draw(2);
    c.energy(2);
  },
});
defRelic({
  id: 'tin-can-phone', name: 'Tin Can Phone', rarity: 'uncommon', pool: 'shared',
  text: 'Once per turn, when your partner plays a creature: gain 1 energy.',
  partnerPlay(c, played) {
    if (card(played.id).kind === 'creature' && oncePerTurn(c, 'tinCan')) c.energy(1);
  },
});
defRelic({
  id: 'matchbook', name: 'Matchbook', rarity: 'uncommon', pool: 'shared',
  text: 'When one of your candles goes out: deal 5 damage to each enemy creature in your half.',
  candleOut(c) {
    for (const e of c.enemies(c.seat)) c.damage(e, 5);
  },
});
defRelic({
  id: 'duct-tape', name: 'Duct Tape', rarity: 'uncommon', pool: 'shared',
  text: 'At the end of your turn: your creature with the least health gains 2 health.',
  turnEnd(c) {
    const mine = c.allies();
    if (mine.length) c.buff(mine.reduce((a, b) => (b.health < a.health ? b : a)), 0, 2);
  },
});
defRelic({
  id: 'participation-trophy', name: 'Participation Trophy', rarity: 'uncommon', pool: 'shared',
  text: 'When you win your half: your partner gains 6 Block and 2 energy.',
  halfWon(c, winner) {
    const mate = c.b.seats[c.partner];
    if (winner !== c.seat || !mate.alive || mate.won) return;
    c.block(6, c.partner);
    c.energy(2, c.partner);
  },
});
defRelic({
  id: 'foam-finger', name: 'Foam Finger', rarity: 'uncommon', pool: 'shared',
  text: 'When your partner wins their half: draw 2 cards and gain 2 energy.',
  halfWon(c, winner) {
    if (winner !== c.partner || c.me.won) return;
    c.draw(2);
    c.energy(2);
  },
});
defRelic({
  id: 'treasure-map', name: 'Treasure Map', rarity: 'uncommon', pool: 'shared', moreRelics: 2,
  text: 'Treasure chests and elite fights offer you 2 more relics to choose from.',
});
defRelic({
  id: 'loaded-die', name: 'Loaded Die', rarity: 'uncommon', pool: 'shared',
  text: 'When a coin decides between your vote and your partner\'s: it picks yours.',
});
defRelic({
  id: 'marrow-spoon', name: 'Marrow Spoon', rarity: 'uncommon', pool: 'shared',
  text: 'When you sacrifice a creature: gain 1 energy.',
  seatSac(c) {
    c.energy(1);
  },
});
defRelic({
  id: 'static-shock', name: 'Static Shock', rarity: 'uncommon', pool: 'shared',
  text: 'When you play a spell that costs 2 or more energy: deal 3 damage to a random enemy creature in your half.',
  seatPlay(c, played) {
    if (card(played.id).kind !== 'spell' || (played.cost.energy ?? 0) < 2) return;
    const foe = randomOf(c, c.enemies(c.seat));
    if (foe) c.damage(foe, 3);
  },
});
defRelic({
  id: 'snow-globe', name: 'Snow Globe', rarity: 'uncommon', pool: 'shared',
  text: 'On your first turn of each battle: Stun a random enemy creature in your half.',
  turnStart(c) {
    const foe = c.b.turn === 1 ? randomOf(c, c.enemies(c.seat)) : undefined;
    if (foe) c.status(foe, 'stun', 1);
  },
});
defRelic({
  id: 'bucket-of-sand', name: 'Bucket of Sand', rarity: 'uncommon', pool: 'shared',
  text: 'At the start of each battle: a random lane in your half becomes High Ground.',
  battleStart(c) {
    c.terrain(randomLaneOfHalf(c), 'terrain:high-ground', { n: 2 });
  },
});
defRelic({
  id: 'hand-me-downs', name: 'Hand-Me-Downs', rarity: 'uncommon', pool: 'shared',
  text: 'When one of your creatures dies: a random creature of your partner\'s gains 2 power.',
  allyDies(c, dead) {
    if (dead.side !== 'p' || dead.seat !== c.seat) return;
    const heir = randomOf(c, c.allies(c.partner));
    if (heir) c.buff(heir, 2, 0);
  },
});

// ---------------------------------------------------------------- rare

defRelic({
  id: 'second-controller', name: 'Second Controller', rarity: 'rare', pool: 'shared',
  text: 'At the start of your turn: if your partner is dead, gain 2 energy and draw 1 card.',
  turnStart(c) {
    if (c.b.seats[c.partner].alive) return;
    c.energy(2);
    c.draw(1);
  },
});
defRelic({
  id: 'clone-stamp', name: 'Clone Stamp', rarity: 'rare', pool: 'shared',
  text: 'When you play your first creature of each battle: add a copy of it to your hand.',
  seatPlay(c, played) {
    if (card(played.id).kind === 'creature' && firstTime(c, 'cloneStamp')) c.add(played.id, 1, c.seat, played.up);
  },
});
defRelic({
  id: 'overdue-book', name: 'Overdue Library Book', rarity: 'rare', pool: 'shared',
  text: 'At the start of each battle: add a random rare card to your hand. It is Ethereal.',
  battleStart(c) {
    const pool = [...CARDS.values()].filter((x) => (x.pool === 'shared' || x.pool === c.me.char) && x.rarity === 'rare').map((x) => x.id).sort();
    const id = randomOf(c, pool);
    if (!id) return;
    for (const inst of c.add(id)) c.grant(inst, 'Ethereal');
  },
});

// ---------------------------------------------------------------- Blue

defRelic({
  id: 'prayer-beads', name: 'Prayer Beads', rarity: 'common', pool: 'blue',
  text: 'At the end of your turn: Pray 1 for each spell you played this turn.',
  turnEnd(c) {
    const n = c.played('spell');
    if (n > 0) pray(c, n);
  },
});
defRelic({
  id: 'whetstone', name: 'Whetstone', rarity: 'uncommon', pool: 'blue',
  text: 'Your Knives deal 1 more damage.',
  battleStart(c) {
    c.me.c.sharpen = (c.me.c.sharpen ?? 0) + 1;
  },
});
defRelic({
  id: 'altar-candle', name: 'Altar Candle', rarity: 'uncommon', pool: 'blue',
  text: 'When you play a creature: Pray 1.',
  seatPlay(c, played) {
    if (card(played.id).kind === 'creature') pray(c, 1);
  },
});
defRelic({
  id: 'royal-seal', name: 'Royal Seal', rarity: 'rare', pool: 'blue',
  text: 'When you become Blessed: your partner gains 3 energy and draws 1 card.',
});

// ---------------------------------------------------------------- Doctor Pistachio

defRelic({
  id: 'cursor', name: 'Cursor', rarity: 'common', pool: 'pistachio',
  text: 'At the start of each battle: Load a random Program.',
  battleStart(c) {
    const id = randomOf(c, [...ABILITIES.keys()].filter((k) => k.startsWith('prog:')).sort());
    if (id) c.program(id);
  },
});
defRelic({
  id: 'cooling-fan', name: 'Cooling Fan', rarity: 'uncommon', pool: 'pistachio',
  text: 'At the end of your turn: if you run 3 or more Programs, gain 5 Block.',
  turnEnd(c) {
    if (c.me.programs.length >= 3) c.block(5);
  },
});
defRelic({
  id: 'mainframe', name: 'Mainframe', rarity: 'rare', pool: 'pistachio',
  text: 'At the start of your turn: run your Programs\' end of turn effects.',
  turnStart(c) {
    c.runPrograms();
  },
});

// ---------------------------------------------------------------- boss

defRelic({
  id: 'cursed-controller', name: 'Cursed Controller', rarity: 'boss', pool: 'shared',
  text: 'At the start of your turn: gain 1 energy. At the start of each battle: add 2 Bugs to your hand.',
  turnStart(c) {
    c.energy(1);
  },
  battleStart(c) {
    c.add('bug', 2);
  },
});
defRelic({
  id: 'extra-life', name: 'Extra Life', rarity: 'boss', pool: 'shared', discount: -3,
  text: 'Gain 1 candle when you take this. Shops sell you cards and items for 3 more teeth.',
  gain(run, seat) {
    (run as { seats: { candles: number }[] }).seats[seat].candles += 1;
  },
});
defRelic({
  id: 'big-red-button', name: 'Big Red Button', rarity: 'boss', pool: 'shared',
  text: 'At the start of your turn: deal 1 damage to every enemy creature.',
  turnStart(c) {
    for (const e of c.enemies()) c.damage(e, 1);
  },
});

// ---------------------------------------------------------------- from events only

defRelic({
  id: 'unused-respawn', name: 'Unused Respawn', rarity: 'special', pool: 'shared',
  text: 'The first time your last candle would go out: it stays lit, and this relic breaks.',
  candleOut(c, left) {
    if (left > 0) return;
    c.relight(1);
    c.breakRelic('unused-respawn');
  },
  dying(r, seat) {
    rc(r).loseRelic(seat, 'unused-respawn');
    return true;
  },
});
defRelic({
  id: 'coin-return', name: 'Coin Return', rarity: 'special', pool: 'shared',
  text: 'When you enter a shop: gain 4 teeth.',
  enterNode(r, seat, kind) {
    if (kind === 'merchant') rc(r).teeth(seat, 4);
  },
});
defRelic({
  id: 'mimic-tooth', name: 'Mimic Tooth', rarity: 'special', pool: 'shared', morePicks: 1,
  text: 'Treasure chests let you take 1 more relic.',
});
defRelic({
  id: 'wrapped-present', name: 'Wrapped Present', rarity: 'special', pool: 'shared',
  text: 'When you win an elite or boss fight: this opens into a random rare relic.',
  afterWin(r, seat, tier) {
    if (tier === 'normal') return;
    rc(r).loseRelic(seat, 'wrapped-present');
    rc(r).relic(seat, 'rare');
  },
});
defRelic({
  id: 'honest-badge', name: 'Honest Badge', rarity: 'special', pool: 'shared', discount: 3,
  text: 'Shops sell you cards and items for 3 fewer teeth.',
});
defRelic({
  id: 'dog-whistle', name: 'Dog Whistle', rarity: 'special', pool: 'shared',
  text: 'At the start of each battle: summon a Wolf Pup in your first empty lane.',
  battleStart(c) {
    const lane = c.emptyLanes()[0];
    if (lane !== undefined) c.summon('wolf-pup', lane);
  },
});
