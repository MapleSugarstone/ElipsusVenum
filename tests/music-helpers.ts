import type { Note } from '../src/audio/music.ts';
export { STINGERS, TRACKS } from '../src/audio/score.ts';

/** The most notes sounding at one instant within a section. */
export function normalizeCheck(notes: Note[]): number {
  const edges: [number, number][] = [];
  for (const n of notes) {
    edges.push([n.at, 1]);
    edges.push([n.at + n.dur, -1]);
  }
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let max = 0;
  for (const [, d] of edges) {
    cur += d;
    max = Math.max(max, cur);
  }
  return max;
}
