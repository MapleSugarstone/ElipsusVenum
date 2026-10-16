// Plays many seeded runs with the bots in worker threads and reports encounter difficulty, run depth, and card value.
// Usage: node tools/sim.ts [--runs 100] [--seed 1] [--workers N] [--minutes 20] [--name sim] [--limit 80]
// Progress goes to runs/<name>/progress.json every few seconds. Create runs/<name>/STOP to end early with a partial report.
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { RunStat } from '../src/ai/stats.ts';
import { runctl } from './runctl.ts';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const runs = Number(arg('runs', '100'));
const seed0 = Number(arg('seed', '1'));
const workers = Math.max(1, Math.min(Number(arg('workers', String(Math.max(1, cpus().length - 2)))), runs));
const minutes = Number(arg('minutes', '20'));
const name = arg('name', 'sim');
const limit = Number(arg('limit', '80'));
/** A run that takes longer than this is ended, recorded as an error with its seed, and its worker replaced. */
const runTimeoutMs = Number(arg('timeout', '120')) * 1000;
const ctl = runctl(name, runs, minutes);
const CHARS: [string, string][] = [['blue', 'pistachio'], ['pistachio', 'blue'], ['blue', 'blue'], ['pistachio', 'pistachio']];

const stats: RunStat[] = [];
const errors: string[] = [];
let next = 0;
let active = 0;

function report(): string {
  const n = stats.length;
  if (n === 0) return 'No runs finished.\n';
  const lines: string[] = [];
  const wins = stats.filter((s) => s.result === 'win').length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const depthAll = mean(stats.map((s) => s.depth));
  lines.push(`Runs: ${n}. Wins: ${wins} (${((100 * wins) / n).toFixed(1)}%). Mean depth: ${depthAll.toFixed(1)} of 39.`);
  for (const act of [1, 2, 3]) lines.push(`  Reached act ${act}: ${stats.filter((s) => s.act >= act).length}`);
  const enc = new Map<string, { n: number; won: number; turns: number; candles: number; deaths: number; tier: string }>();
  for (const s of stats) {
    for (const b of s.battles) {
      const keys = b.boss ? [`boss:${b.boss}`] : b.halves.map((h) => `${b.tier}:${h}`);
      for (const k of keys) {
        const e = enc.get(k) ?? { n: 0, won: 0, turns: 0, candles: 0, deaths: 0, tier: b.tier };
        e.n++;
        e.won += b.won ? 1 : 0;
        e.turns += b.turns;
        e.candles += b.candlesLost;
        e.deaths += b.deaths;
        enc.set(k, e);
      }
    }
  }
  lines.push('', 'Encounters (each half counts in every battle it appears in):', '  name                       battles  won%  turns  candles lost  deaths');
  for (const [k, e] of [...enc.entries()].sort((a, b) => (a[1].tier + a[0] < b[1].tier + b[0] ? -1 : 1))) {
    lines.push(`  ${k.padEnd(26)} ${String(e.n).padStart(7)} ${((100 * e.won) / e.n).toFixed(0).padStart(5)} ${(e.turns / e.n).toFixed(1).padStart(6)} ${(e.candles / e.n).toFixed(2).padStart(13)} ${(e.deaths / e.n).toFixed(2).padStart(7)}`);
  }
  const cards = new Map<string, { offered: number; picked: number; plays: number; runsIn: number; depthIn: number }>();
  const card = (id: string) => {
    let c = cards.get(id);
    if (!c) cards.set(id, (c = { offered: 0, picked: 0, plays: 0, runsIn: 0, depthIn: 0 }));
    return c;
  };
  for (const s of stats) {
    for (const o of s.offers) {
      for (const id of o.offered) card(id).offered++;
      if (o.picked) card(o.picked).picked++;
    }
    for (const [id, k] of Object.entries(s.plays)) card(id).plays += k;
    const inDeck = new Set(s.decks.flat().map((x) => x.replace(/\+$/, '')));
    for (const id of inDeck) {
      card(id).runsIn++;
      card(id).depthIn += s.depth;
    }
  }
  lines.push('', 'Cards (lift = mean depth of runs that ended with the card minus the mean of all runs):', '  card                   offered picked  pick%  plays/run  in runs   lift');
  for (const [id, c] of [...cards.entries()].sort((a, b) => b[1].runsIn - a[1].runsIn)) {
    const lift = c.runsIn ? c.depthIn / c.runsIn - depthAll : 0;
    lines.push(`  ${id.padEnd(22)} ${String(c.offered).padStart(7)} ${String(c.picked).padStart(6)} ${(c.offered ? (100 * c.picked) / c.offered : 0).toFixed(0).padStart(6)} ${(c.runsIn ? c.plays / c.runsIn : 0).toFixed(1).padStart(10)} ${String(c.runsIn).padStart(8)} ${lift.toFixed(1).padStart(6)}`);
  }
  if (errors.length) lines.push('', `Errors (${errors.length}):`, ...errors.slice(0, 5));
  return lines.join('\n') + '\n';
}

function summary() {
  const n = stats.length;
  return { finished: n, wins: stats.filter((s) => s.result === 'win').length, meanDepth: n ? stats.reduce((a, s) => a + s.depth, 0) / n : 0, errors: errors.length };
}

function done(): void {
  ctl.finish(report(), { stats, errors }, stats.length);
  console.log(report());
  console.log(`Report written to ${ctl.dir}/report.txt`);
}

let finished = false;
const inFlight = new Map<Worker, { seed: number; at: number }>();

function maybeDone(): void {
  if (!finished && active === 0 && (next >= runs || ctl.stopped())) {
    finished = true;
    setTimeout(done, 50);
  }
}

function spawn(): void {
  const worker = new Worker(new URL('./sim-worker.ts', import.meta.url));
  const feed = () => {
    if (next >= runs || ctl.stopped()) {
      worker.postMessage(null);
      return;
    }
    const i = next++;
    active++;
    inFlight.set(worker, { seed: seed0 + i, at: Date.now() });
    worker.postMessage({ seed: seed0 + i, chars: CHARS[i % CHARS.length], limit });
  };
  worker.on('message', (msg: { started?: number; ok?: boolean; stat?: RunStat; seed?: number; error?: string }) => {
    if (msg.started !== undefined) return;
    active--;
    inFlight.delete(worker);
    if (msg.ok && msg.stat) stats.push(msg.stat);
    else errors.push(`seed ${msg.seed}: ${msg.error}`);
    ctl.tick(stats.length + errors.length, { ...summary(), inFlight: [...inFlight.values()].map((f) => f.seed) });
    feed();
  });
  worker.on('exit', () => {
    inFlight.delete(worker);
    maybeDone();
  });
  feed();
}

for (let w = 0; w < workers; w++) spawn();

const watchdog = setInterval(() => {
  const now = Date.now();
  for (const [worker, job] of inFlight) {
    if (now - job.at < runTimeoutMs) continue;
    errors.push(`seed ${job.seed}: timed out after ${Math.round((now - job.at) / 1000)}s`);
    inFlight.delete(worker);
    active--;
    void worker.terminate();
    if (!ctl.stopped() && next < runs) spawn();
  }
  ctl.tick(stats.length + errors.length, { ...summary(), inFlight: [...inFlight.values()].map((f) => f.seed) });
  maybeDone();
  if (finished) clearInterval(watchdog);
}, 2000);
