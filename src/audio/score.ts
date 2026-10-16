// Every track and stinger, gathered for the engine. The framework is in score-core.ts.
import type { StingerId, TrackId } from './music.ts';
import type { Section, TrackDef } from './score-core.ts';
import { STINGER_DEFS, TRACK_DEFS } from './tracks.ts';

export * from './score-core.ts';
export const TRACKS: Record<TrackId, TrackDef> = TRACK_DEFS;
export const STINGERS: Record<StingerId, () => Section> = STINGER_DEFS as Record<StingerId, () => Section>;
