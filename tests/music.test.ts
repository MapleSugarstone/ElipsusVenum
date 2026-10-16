import { describe, expect, it } from 'vitest';
import { renderTrack, type TrackId } from '../src/audio/music.ts';
import { STINGERS, TRACKS, normalizeCheck } from './music-helpers.ts';

const RANGE: Record<string, [number, number]> = {
  lead: [45, 90], cold: [45, 96], bell: [48, 100], glass: [55, 104], arp: [48, 96], blip: [60, 100], bass: [28, 58], sub: [24, 52],
  drone: [28, 52], pad: [45, 86], brass: [40, 86], choir: [48, 84], nz: [0, 127],
};

describe('music', () => {
  for (const id of Object.keys(TRACKS) as TrackId[]) {
    it(`${id} stays in range, within the band's limits, and does not loop one section`, () => {
      const secs = renderTrack(id, 600, { seed: 7, intensity: (t) => (Math.sin(t / 40) + 1) / 2 });
      expect(secs.length).toBeGreaterThan(0);
      const seen = new Map<string, number>();
      for (const s of secs) {
        for (const n of s.notes) {
          const [lo, hi] = RANGE[n.v];
          expect(n.n, `${id} ${s.name} ${n.v}`).toBeGreaterThanOrEqual(lo);
          expect(n.n, `${id} ${s.name} ${n.v}`).toBeLessThanOrEqual(hi);
          expect(n.g).toBeLessThanOrEqual(1);
        }
        const sig = JSON.stringify(s.notes.map((n) => [n.v, n.n, Math.round((n.at - s.start) * 100)]));
        seen.set(sig, (seen.get(sig) ?? 0) + 1);
        // The cap keeps a busy section affordable in real time.
        expect(normalizeCheck(s.notes), `${id} ${s.name} has too many notes at once`).toBeLessThanOrEqual(26);
      }
      if (secs.length > 8 && id !== 'gameover') {
        const worst = Math.max(...seen.values());
        expect(worst, `${id} repeats one section ${worst} times`).toBeLessThanOrEqual(Math.max(5, Math.ceil(secs.length * 0.2)));
      }
    });
  }

  it('the game over track ends', () => {
    const secs = renderTrack('gameover', 600, { seed: 1 });
    const total = secs.reduce((a, s) => a + s.secs, 0);
    expect(total).toBeLessThan(120);
  });

  it('every stinger renders', () => {
    for (const [id, gen] of Object.entries(STINGERS)) expect(gen().ev.length, id).toBeGreaterThan(0);
  });
});
