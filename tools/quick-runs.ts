import '../src/content/index.ts';
import { autoplayRun } from '../src/ai/runbot.ts';
import { createGame } from '../src/run/game.ts';

const n = Number(process.argv[2] ?? 4);
const limit = Number(process.argv[3] ?? 80);
for (let seed = 1; seed <= n; seed++) {
  const g = createGame({ seed, chars: ['blue', 'pistachio'], solo: true });
  const t0 = process.hrtime.bigint();
  const actions = autoplayRun(g, 300000, { limit });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const r = g.run;
  console.log(
    `seed ${seed}: ${r.over} act ${r.act} floor ${r.floor} battles ${r.battles} actions ${actions} ` +
      `candles ${r.seats.map((s) => s.candles).join('/')} teeth ${r.seats.map((s) => s.teeth).join('/')} ` +
      `decks ${r.seats.map((s) => s.deck.length).join('/')} ${ms.toFixed(0)}ms`,
  );
}
