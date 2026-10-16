import { parentPort } from 'node:worker_threads';
import '../src/content/index.ts';
import { playRunStats } from '../src/ai/stats.ts';

parentPort!.on('message', (job: { seed: number; chars: [string, string]; limit: number } | null) => {
  if (!job) {
    process.exit(0);
  }
  parentPort!.postMessage({ started: job.seed });
  try {
    const stat = playRunStats(job.seed, job.chars, { limit: job.limit });
    parentPort!.postMessage({ ok: true, stat });
  } catch (err) {
    parentPort!.postMessage({ ok: false, seed: job.seed, error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err) });
  }
});
