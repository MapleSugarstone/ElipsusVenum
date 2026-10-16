import { describe, expect, it } from 'vitest';
import '../src/content/index.ts';
import { autoplayRun } from '../src/ai/runbot.ts';
import { digest } from '../src/engine/digest.ts';
import { applyGame, applyGameInPlace, createGame, legalGame } from '../src/run/game.ts';
import { generateMap, reachable } from '../src/run/map.ts';
import { seedRng } from '../src/engine/rng.ts';

describe('map', () => {
  it('every node reaches the boss and paths never cross', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const map = generateMap(seedRng(seed), 1);
      const boss = map.nodes.find((n) => n.kind === 'boss')!;
      for (const n of map.nodes) {
        if (n.kind === 'boss') continue;
        expect(n.next.length, `seed ${seed} node ${n.id}`).toBeGreaterThan(0);
        for (const t of n.next) expect(map.nodes[t].row).toBe(n.row + 1);
      }
      const edges = map.nodes.flatMap((n) => n.next.map((t) => [n.row, n.col, map.nodes[t].col] as const)).filter(([r]) => r < map.rows - 1);
      for (const [r, c, c2] of edges) {
        if (c2 === c + 1) expect(edges.some(([r2, x, y]) => r2 === r && x === c + 1 && y === c), `crossing at seed ${seed}`).toBe(false);
      }
      expect(boss.row).toBe(map.rows);
    }
  });
});

describe('voting', () => {
  it('two different locked votes flip a coin and enter one of them', () => {
    let g = createGame({ seed: 5, chars: ['blue', 'pistachio'], solo: false });
    const starts = reachable(g.run.map, null);
    const a = starts[0];
    const b = starts[starts.length - 1];
    g = applyGame(g, 0, { t: 'vote', node: a }).g;
    g = applyGame(g, 1, { t: 'vote', node: b }).g;
    g = applyGame(g, 0, { t: 'lock' }).g;
    expect(g.run.screen).toBe('map');
    const r = applyGame(g, 1, { t: 'lock' });
    expect([a, b]).toContain(r.g.run.at);
    if (a !== b) expect(r.ev.some((e) => e.k === 'coin')).toBe(true);
  });

  it('a seat cannot vote for an unreachable node', () => {
    const g = createGame({ seed: 5, chars: ['blue', 'pistachio'], solo: false });
    const far = g.run.map.nodes.find((n) => n.row === 3)!;
    expect(legalGame(g, 0, { t: 'vote', node: far.id })).toBe('you cannot reach that node');
  });
});

describe('runs', () => {
  it('the bots play whole runs to an ending', () => {
    for (let seed = 1; seed <= 2; seed++) {
      const g = createGame({ seed, chars: ['blue', 'pistachio'], solo: true });
      autoplayRun(g, 200000, { limit: 60 });
      expect(g.run.over).not.toBeNull();
    }
  }, 300_000);

  it('a run replays to the same digest', () => {
    const a = createGame({ seed: 9, chars: ['pistachio', 'blue'], solo: true });
    const b = createGame({ seed: 9, chars: ['pistachio', 'blue'], solo: true });
    autoplayRun(a, 400, { limit: 40 });
    autoplayRun(b, 400, { limit: 40 });
    expect(digest(a)).toBe(digest(b));
  });

  it('debug ops start a battle and place cards', () => {
    const g = createGame({ seed: 2, chars: ['blue', 'pistachio'], solo: true, debug: true });
    applyGameInPlace(g, 0, { t: 'debug', d: { op: 'battle', halves: ['grubs', 'bats'] } });
    expect(g.run.screen).toBe('battle');
    applyGameInPlace(g, 0, { t: 'debug', d: { op: 'place', id: 'bear', row: 'p', lane: 2 } });
    expect(g.battle!.p[2]?.id).toBe('bear');
  });
});
