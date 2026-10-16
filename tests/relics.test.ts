import { describe, expect, it } from 'vitest';
import { scaleLoss } from '../src/engine/fx.ts';
import { applyGame, createGame, EMPTY_TEETH, legalGame } from '../src/run/game.ts';
import type { Game } from '../src/run/types.ts';
import { blankBattle } from './util.ts';

function atNode(g: Game, node: NonNullable<Game['run']['node']>): Game {
  g.run.screen = 'node';
  g.run.node = node;
  return g;
}

describe('relics and events', () => {
  it('candleOut: a relic can keep the last candle lit, and it breaks doing so', () => {
    const b = blankBattle(1);
    b.seats[0].candles = 1;
    b.seats[0].relics = ['unused-respawn'];
    scaleLoss({ b, ev: [] }, 0, b.seats[0].size, true);
    expect(b.seats[0].alive).toBe(true);
    expect(b.seats[0].candles).toBe(1);
    expect(b.seats[0].relics).not.toContain('unused-respawn');
  });

  it('relic choices: a chest seat takes as many relics as its picks allow, then is done', () => {
    const g = atNode(createGame({ seed: 4, chars: ['blue', 'pistachio'], solo: true }), {
      kind: 'treasure', done: [false, false], relics: [['bent-spoon', 'night-light', 'piggy-bank'], ['metronome']], picks: [2, 1],
    });
    let r = applyGame(g, 0, { t: 'relic', i: 1 });
    expect(r.g.run.seats[0].relics).toContain('night-light');
    expect(r.g.run.node!.done[0]).toBe(false);
    r = applyGame(r.g, 0, { t: 'relic', i: 0 });
    expect(r.g.run.seats[0].relics).toContain('bent-spoon');
    expect(r.g.run.node!.done[0]).toBe(true);
    expect(legalGame(r.g, 0, { t: 'relic', i: 0 })).not.toBeNull();
  });

  it('events: an option that changes nothing for a seat pays that seat teeth, and a secret option needs its condition', () => {
    const g = createGame({ seed: 5, chars: ['blue', 'pistachio'], solo: true });
    for (const s of g.run.seats) s.candles = 3;
    atNode(g, { kind: 'event', done: [false, false], event: { id: 'respawn-point', stage: 0, votes: [null, null], locks: [false, false] } });
    let r = applyGame(g, 0, { t: 'evote', i: 0 });
    r = applyGame(r.g, 1, { t: 'evote', i: 0 });
    r = applyGame(r.g, 0, { t: 'lock' });
    r = applyGame(r.g, 1, { t: 'lock' });
    expect(r.g.run.seats.map((s) => s.teeth)).toEqual([EMPTY_TEETH, EMPTY_TEETH]);

    const grave = atNode(createGame({ seed: 6, chars: ['blue', 'pistachio'], solo: true }), {
      kind: 'event', done: [false, false], event: { id: 'graveyard', stage: 0, votes: [null, null], locks: [false, false] },
    });
    expect(legalGame(grave, 0, { t: 'evote', i: 2 })).not.toBeNull();
    grave.run.seats[1].relics.push('unused-respawn');
    expect(legalGame(grave, 0, { t: 'evote', i: 2 })).toBeNull();
  });
});
