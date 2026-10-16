// Progress, stop, and time-limit control for long tool runs. A run writes progress.json every few seconds, finishes the
// item in hand when it finds a STOP file or runs out of time, and writes its normal report marked as partial.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RunCtl {
  dir: string;
  /** Call after each finished item. Returns false once the run should stop. */
  tick(done: number, results: unknown): boolean;
  stopped(): boolean;
  finish(report: string, data: unknown, done: number): void;
}

export function runctl(name: string, total: number, minutes: number): RunCtl {
  const dir = join('runs', name);
  mkdirSync(dir, { recursive: true });
  const stopFile = join(dir, 'STOP');
  if (existsSync(stopFile)) rmSync(stopFile);
  const start = Date.now();
  const limit = minutes > 0 ? start + minutes * 60_000 : Infinity;
  let lastWrite = 0;
  let stop = false;
  const write = (done: number, results: unknown, final = false) => {
    const elapsed = (Date.now() - start) / 1000;
    const rate = done / Math.max(elapsed, 0.001);
    const eta = rate > 0 ? (total - done) / rate : null;
    writeFileSync(join(dir, 'progress.json'), JSON.stringify({ name, done, total, elapsed: Math.round(elapsed), eta: eta === null ? null : Math.round(eta), final, partial: final && done < total, results }, null, 1));
  };
  return {
    dir,
    tick(done, results) {
      const now = Date.now();
      if (now - lastWrite > 3000) {
        lastWrite = now;
        write(done, results);
      }
      if (existsSync(stopFile) || now > limit) stop = true;
      return !stop;
    },
    stopped: () => stop,
    finish(report, data, done) {
      write(done, null, true);
      const head = done < total ? `PARTIAL: ${done} of ${total} finished.\n\n` : '';
      writeFileSync(join(dir, 'report.txt'), head + report);
      writeFileSync(join(dir, 'report.json'), JSON.stringify({ partial: done < total, done, total, data }, null, 1));
    },
  };
}
