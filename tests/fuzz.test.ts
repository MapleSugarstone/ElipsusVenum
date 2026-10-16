import { describe, expect, it } from 'vitest';
import '../src/content/index.ts';
import { candidates } from '../src/ai/bot.ts';
import { applyInPlace, legal } from '../src/engine/battle.ts';
import { CARDS, HALVES } from '../src/engine/registry.ts';
import { makeInst } from '../src/engine/fx.ts';
import { seedRng, randInt } from '../src/engine/rng.ts';
import type { Seat } from '../src/engine/types.ts';
import { starterBattle } from './util.ts';

describe('fuzz', () => {
  it('random legal play never makes one action run away', () => {
    const halves = [...HALVES.values()].filter((h) => h.tier !== 'boss').map((h) => h.id);
    const pool = [...CARDS.values()].filter((c) => c.pool !== 'enemy' && c.pool !== 'curse').map((c) => c.id);
    for (let seed = 1; seed <= 12; seed++) {
      const rng = seedRng(seed * 977);
      const b = starterBattle(seed, [halves[seed % halves.length], halves[(seed * 3) % halves.length]]);
      // Stuff both hands with random cards so rare interactions come up.
      for (const seat of [0, 1] as Seat[]) while (b.seats[seat].hand.length < 9) b.seats[seat].hand.push(makeInst(b, pool[randInt(rng, pool.length)], seat, 'p'));
      for (let step = 0; step < 400 && !b.over; step++) {
        const seat = (step % 2) as Seat;
        const s = b.seats[seat];
        if (!s.alive) continue;
        const options = candidates(b, seat);
        const a = options.length && randInt(rng, 5) > 0 ? options[randInt(rng, options.length)] : { t: 'ring' as const };
        if (legal(b, seat, a)) continue;
        const ev = applyInPlace(b, seat, a);
        expect(ev.length, `seed ${seed} step ${step} ${JSON.stringify(a)}`).toBeLessThan(3000);
        for (const x of b.seats) {
          expect(x.hand.length).toBeLessThanOrEqual(10);
          expect(Number.isFinite(x.scale)).toBe(true);
        }
      }
    }
  });
});
