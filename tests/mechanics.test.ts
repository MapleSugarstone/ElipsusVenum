import { describe, expect, it } from 'vitest';
import { applyBattle, applyInPlace, legal } from '../src/engine/battle.ts';
import { makeInst, powerOf } from '../src/engine/fx.ts';
import { blankBattle, give, put } from './util.ts';

describe('mechanics', () => {
  it('terrain: a Pit damages the next enemy that enters its lane, then fills in', () => {
    const b = blankBattle(1);
    b.seats[0].energy = 3;
    const pit = give(b, 0, 'pitfall');
    applyInPlace(b, 0, { t: 'play', uid: pit.uid, tg: [{ row: 'p', lane: 1 }] });
    expect(b.terrain?.[1]?.a).toBe('terrain:pit');
    const foe = makeInst(b, 'brute', 0, 'e');
    b.q[1] = foe;
    applyInPlace(b, 0, { t: 'ring' });
    applyInPlace(b, 1, { t: 'ring' });
    expect(foe.health).toBe(foe.maxHealth - 6);
    expect(b.terrain?.[1]).toBeNull();
  });

  it('choices: a pending choice blocks other actions until the seat picks', () => {
    const b = blankBattle(2);
    b.seats[0].energy = 3;
    const wanted = makeInst(b, 'wolf', 0, 'p');
    b.seats[0].deck = [makeInst(b, 'jab', 0, 'p'), wanted, makeInst(b, 'brace', 0, 'p')];
    const card = give(b, 0, 'rummage');
    applyInPlace(b, 0, { t: 'play', uid: card.uid });
    expect(b.choice?.seat).toBe(0);
    expect(legal(b, 0, { t: 'ring' })).toBe('make your choice first');
    expect(legal(b, 1, { t: 'ring' })).toBeNull();
    const i = b.choice!.options.findIndex((o) => o.uid === wanted.uid);
    const r = applyBattle(b, 0, { t: 'choose', i });
    expect(r.b.choice).toBeNull();
    expect(r.b.seats[0].hand.some((x) => x.uid === wanted.uid)).toBe(true);
    expect(r.b.seats[0].deck.some((x) => x.uid === wanted.uid)).toBe(false);
  });

  it('combos: Flurry hits once for each spell played this turn, counting itself', () => {
    const b = blankBattle(3);
    b.seats[0].energy = 6;
    const foe = put(b, 'brute', 'e', 2);
    const start = foe.health;
    for (const id of ['brace', 'brace']) applyInPlace(b, 0, { t: 'play', uid: give(b, 0, id).uid });
    applyInPlace(b, 0, { t: 'play', uid: give(b, 0, 'flurry').uid, tg: [{ row: 'p', lane: 2 }] });
    expect(start - foe.health).toBe(3 * 2);
  });

  it('next turn: Wind Up hits its lane at the start of the next turn and not before', () => {
    const b = blankBattle(4);
    b.seats[0].energy = 3;
    const foe = put(b, 'orc', 'e', 0);
    foe.health = foe.maxHealth = 20;
    const start = foe.health;
    applyInPlace(b, 0, { t: 'play', uid: give(b, 0, 'wind-up').uid, tg: [{ row: 'p', lane: 0 }] });
    expect(foe.health).toBe(start);
    applyInPlace(b, 0, { t: 'ring' });
    applyInPlace(b, 1, { t: 'ring' });
    expect(foe.health).toBeLessThanOrEqual(start - 8);
    expect(b.seats[0].later).toEqual([]);
  });

  it('bonds: damage to one bonded creature passes half to the other', () => {
    const b = blankBattle(5);
    b.seats[0].energy = 3;
    const mine = put(b, 'rook', 'p', 1);
    const theirs = put(b, 'rook', 'p', 6);
    applyInPlace(b, 0, { t: 'play', uid: give(b, 0, 'blood-brothers').uid, tg: [{ row: 'p', lane: 1 }, { row: 'p', lane: 6 }] });
    const a0 = mine.health, b0 = theirs.health;
    const foe = put(b, 'brute', 'e', 1);
    foe.power = 9;
    applyInPlace(b, 0, { t: 'ring' });
    applyInPlace(b, 1, { t: 'ring' });
    expect(a0 - mine.health).toBe(5);
    expect(b0 - theirs.health).toBe(4);
    expect(powerOf(b, mine)).toBeGreaterThanOrEqual(0);
  });
});
