import { describe, expect, it } from 'vitest';
import { autoplay } from '../src/ai/bot.ts';
import { applyBattle, applyInPlace, legal } from '../src/engine/battle.ts';
import { digest } from '../src/engine/digest.ts';
import { blankBattle, give, put, starterBattle } from './util.ts';

const ringBoth = (b: ReturnType<typeof blankBattle>) => {
  applyInPlace(b, 0, { t: 'ring' });
  applyInPlace(b, 1, { t: 'ring' });
};

describe('battles', () => {
  it('the bot plays starter battles to the end', () => {
    const results: string[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const b = starterBattle(seed);
      autoplay(b, 3000, { limit: 120 });
      expect(b.over).not.toBeNull();
      results.push(b.over!);
    }
    expect(results.length).toBe(6);
  });

  it('replays to the same digest from the same seed', () => {
    const a = starterBattle(42);
    const b = starterBattle(42);
    autoplay(a, 3000, { limit: 80 });
    autoplay(b, 3000, { limit: 80 });
    expect(digest(a)).toBe(digest(b));
  });

  it('refuses an illegal action without changing state', () => {
    const b = starterBattle(3);
    const before = digest(b);
    const r = applyBattle(b, 0, { t: 'ring' });
    expect(r.error).toBe('draw first');
    expect(digest(r.b)).toBe(before);
  });
});

describe('the scale', () => {
  it('a half wins when its scale reaches the size, and the overflow becomes teeth', () => {
    const b = blankBattle();
    put(b, 'bear', 'p', 0);
    put(b, 'bear', 'p', 1);
    b.seats[0].scale = b.seats[0].size - 3;
    ringBoth(b);
    expect(b.seats[0].won).toBe(true);
    expect(b.seats[0].teeth).toBe(5 + 8);
    expect(b.over).toBeNull();
  });

  it('losing the scale snuffs a candle and resets it to even', () => {
    const b = blankBattle();
    put(b, 'brute', 'e', 0);
    b.seats[0].scale = 4 - b.seats[0].size;
    ringBoth(b);
    expect(b.seats[0].candles).toBe(1);
    expect(b.seats[0].scale).toBe(0);
    expect(b.seats[0].alive).toBe(true);
  });

  it('Block absorbs damage before the scale moves', () => {
    const b = blankBattle();
    put(b, 'goblin', 'e', 0);
    b.seats[0].block = 1;
    ringBoth(b);
    expect(b.seats[0].scale).toBe(-1);
  });

  it('a player whose last candle goes out dies, and their enemies move to the partner', () => {
    const b = blankBattle();
    put(b, 'brute', 'e', 0);
    put(b, 'goblin', 'q', 1);
    b.seats[0].candles = 1;
    b.seats[0].scale = 1 - b.seats[0].size;
    ringBoth(b);
    expect(b.seats[0].alive).toBe(false);
    expect(b.e[0]).toBeNull();
    const partnerFoes = [...b.foe[1].backlog, ...[4, 5, 6, 7].map((l) => b.q[l]).filter(Boolean)];
    expect(partnerFoes.length).toBeGreaterThanOrEqual(1);
    expect(legal(b, 0, { t: 'ghost', kind: 'bone' })).toBeNull();
  });

  it('the battle is lost when both players are dead', () => {
    const b = blankBattle();
    put(b, 'brute', 'e', 0);
    put(b, 'brute', 'e', 5);
    for (const s of b.seats) {
      s.candles = 1;
      s.scale = 1 - s.size;
    }
    ringBoth(b);
    expect(b.over).toBe('loss');
  });
});

describe('creature rules', () => {
  it('Airborne attacks pass over creatures without Reach', () => {
    const b = blankBattle();
    put(b, 'sparrow', 'p', 0);
    put(b, 'goblin', 'e', 0);
    put(b, 'sparrow', 'p', 1);
    put(b, 'leapfrog', 'e', 1);
    ringBoth(b);
    expect(b.seats[0].scale).toBeGreaterThanOrEqual(2 - 2);
    expect(b.e[1]!.health).toBe(2);
  });

  it('two Thorns creatures do not trade damage forever', () => {
    const b = blankBattle();
    put(b, 'porcupine', 'p', 0);
    const foe = put(b, 'porcupine', 'e', 0);
    foe.side = 'e';
    ringBoth(b);
    expect(b.turn).toBe(2);
  });

  it('blood costs need exactly enough sacrifices', () => {
    const b = blankBattle();
    put(b, 'placeholder', 'p', 0);
    put(b, 'placeholder', 'p', 1);
    put(b, 'placeholder', 'p', 2);
    const wolf = give(b, 0, 'wolf');
    expect(legal(b, 0, { t: 'play', uid: wolf.uid, lane: 0, sac: [0] })).toBe('not enough blood');
    expect(legal(b, 0, { t: 'play', uid: wolf.uid, lane: 0, sac: [0, 1, 2] })).toBe('too many sacrifices');
    expect(legal(b, 0, { t: 'play', uid: wolf.uid, lane: 0, sac: [0, 1] })).toBeNull();
    applyInPlace(b, 0, { t: 'play', uid: wolf.uid, lane: 0, sac: [0, 1] });
    expect(b.p[0]?.id).toBe('wolf');
    expect(b.seats[0].bones).toBe(2);
  });

  it('a player cannot play into the partner\'s lanes', () => {
    const b = blankBattle();
    const g = give(b, 0, 'gecko');
    expect(legal(b, 0, { t: 'play', uid: g.uid, lane: 5 })).toBe('choose one of your lanes');
  });

  it('Leader buffs across the seam', () => {
    const b = blankBattle();
    put(b, 'alpha', 'p', 3);
    const mate = put(b, 'gecko', 'p', 4);
    ringBoth(b);
    expect(b.seats[1].scale).toBe(mate.power + 2);
  });

  it('Grows turns a creature into another after a full turn', () => {
    const b = blankBattle();
    put(b, 'wolf-pup', 'p', 0);
    ringBoth(b);
    expect(b.p[0]?.id).toBe('wolf');
  });

  it('a spell played twice by Double Up resolves twice', () => {
    const b = blankBattle();
    const du = give(b, 0, 'double-up');
    const jab = give(b, 1, 'jab');
    b.seats[0].energy = 2;
    b.seats[1].energy = 1;
    applyInPlace(b, 0, { t: 'play', uid: du.uid });
    applyInPlace(b, 1, { t: 'play', uid: jab.uid, tg: [{ row: 'p', lane: 5 }] });
    expect(b.seats[1].scale).toBe(6);
  });
});
