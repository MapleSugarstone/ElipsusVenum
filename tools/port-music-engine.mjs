// Copies the chiptune engine from the skill's reference into src/audio/music.ts with this game's tracks and stingers.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('C:/Users/Krazv/.claude/skills/chiptune-game-music/reference/music.ts', 'utf8');
const swap = (s, from, to) => {
  if (!s.includes(from)) throw new Error(`missing: ${from.slice(0, 60)}`);
  return s.replace(from, to);
};
let out = src;
out = swap(out, "import { audioContext, audioMaster, isMuted, onAudioReady, setDroneHook } from './audio';", "import { audioContext, audioMaster, isMuted, onAudioReady } from './audio.ts';");
out = swap(out, "import { Rng, STINGERS, TRACKS, hash, vary, wrong } from './score';\nimport type { Ctx, Ev, Section, TrackDef, Voice } from './score';", "import { Rng, STINGERS, TRACKS, hash, vary, wrong } from './score.ts';\nimport type { Ctx, Ev, Section, TrackDef, Voice } from './score.ts';");
const trackStart = out.indexOf('export type TrackId =');
const trackEnd = out.indexOf('/** A scheduled note');
out = out.slice(0, trackStart) + `export type TrackId =
  | 'title' | 'map1' | 'map2' | 'map3' | 'battle' | 'elite' | 'boss_tutorial' | 'boss_copycat' | 'boss_ybf'
  | 'rest' | 'shop' | 'event' | 'gameover' | 'victory';
export type StingerId = 'win' | 'lose' | 'candle' | 'coin' | 'relic' | 'blessed';

` + out.slice(trackEnd);
const regionStart = out.indexOf('const REGION: Record<string, TrackId> = {');
const regionEnd = out.indexOf('export const music = {');
out = out.slice(0, regionStart) + out.slice(regionEnd);
out = swap(out, "makePlayer(ac, kit, 'splash', audioMaster() ?? kit.bus, false)", "makePlayer(ac, kit, 'title', audioMaster() ?? kit.bus, false)");
out = swap(out, '// Music engine: a lookahead scheduler over the generators in score.ts, voiced like a small console sound chip.', '// Music engine: a lookahead scheduler over the generators in score.ts, voiced like a small console sound chip.\n// Ported from the chiptune skill reference. The tracks and stingers are this game\'s own.');
out = swap(out, `  constructor(readonly id: TrackId, private seed: number, private env: { int(): number; spells(): number[][] }) {
    this.def = TRACKS[id];`, `  readonly id: TrackId;
  private seed: number;
  private env: { int(): number; spells(): number[][] };
  constructor(id: TrackId, seed: number, env: { int(): number; spells(): number[][] }) {
    this.id = id;
    this.seed = seed;
    this.env = env;
    this.def = TRACKS[id];`);
writeFileSync('src/audio/music.ts', out);
console.log('engine written', out.split('\n').length, 'lines');
