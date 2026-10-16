// Builds src/audio/score.ts from the framework half of the skill's reference score (types, generator, key helpers,
// variation) and this game's tracks in src/audio/tracks.ts.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('C:/Users/Krazv/.claude/skills/chiptune-game-music/reference/score.ts', 'utf8');
const lines = src.split('\n');
const cut = lines.findIndex((l) => l.startsWith('// Leitmotifs. Degrees are 0-based scale steps'));
if (cut < 0) throw new Error('could not find the end of the framework');
let framework = lines.slice(0, cut).join('\n');
framework = framework.replace("// The score of Rote: leitmotifs as scale-degree figures, and every track as a small seeded generator.", '// The score framework: section types, a seeded generator, keys and figures, and automatic variation.\n// Ported from the chiptune skill reference. The tracks themselves live in tracks.ts.');
framework = framework.replace("import type { StingerId, TrackId } from './music';\n", '');
framework = framework.replace('  constructor(public beats: number, public bar = 4, public bpm = 90) {}', `  beats: number;
  bar: number;
  bpm: number;
  constructor(beats: number, bar = 4, bpm = 90) {
    this.beats = beats;
    this.bar = bar;
    this.bpm = bpm;
  }`);
// The tracks import the framework, so the framework lives in its own module to keep the imports acyclic.
writeFileSync('src/audio/score-core.ts', framework + '\n');
writeFileSync('src/audio/score.ts', `// Every track and stinger, gathered for the engine. The framework is in score-core.ts.
import type { StingerId, TrackId } from './music.ts';
import type { Section, TrackDef } from './score-core.ts';
import { STINGER_DEFS, TRACK_DEFS } from './tracks.ts';

export * from './score-core.ts';
export const TRACKS: Record<TrackId, TrackDef> = TRACK_DEFS;
export const STINGERS: Record<StingerId, () => Section> = STINGER_DEFS as Record<StingerId, () => Section>;
`);
console.log('score framework written');
