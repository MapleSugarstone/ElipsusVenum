// Replays one sim seed and logs each action before applying it, so a hang leaves the action that caused it on the last line.
// Usage: node tools/debug-seed.ts <seed> <char0> <char1> [limit]
import { appendFileSync, writeFileSync } from 'node:fs';
import '../src/content/index.ts';
import { chooseRunAction } from '../src/ai/runbot.ts';
import { applyGameInPlace, createGame, waitingOn } from '../src/run/game.ts';

const [seedArg, c0 = 'blue', c1 = 'pistachio', limitArg = '120'] = process.argv.slice(2);
const g = createGame({ seed: Number(seedArg), chars: [c0, c1], solo: true });
const log = `runs/debug-${seedArg}.log`;
writeFileSync(log, '');
let n = 0;
let last = Date.now();
const order: number[] = [];
while (!g.run.over && n < 100000) {
  // The sim acts for every waiting seat in turn, so this does the same.
  if (order.length === 0) order.push(...waitingOn(g));
  const seat = order.shift() as 0 | 1 | undefined;
  if (seat === undefined) break;
  if (!waitingOn(g).includes(seat)) continue;
  const t0 = Date.now();
  const a = chooseRunAction(g, seat, { limit: Number(limitArg) });
  const think = Date.now() - t0;
  appendFileSync(log, `${n} seat ${seat} ${g.run.screen} turn ${g.battle?.turn ?? '-'} think ${think}ms ${JSON.stringify(a)}\n`);
  applyGameInPlace(g, seat, a);
  n++;
  if (Date.now() - last > 5000) {
    last = Date.now();
    console.log(`${n} actions, act ${g.run.act} floor ${g.run.floor} ${g.run.screen} turn ${g.battle?.turn}`);
  }
}
console.log(`done: ${g.run.over} after ${n} actions`);
