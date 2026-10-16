import '../src/content/index.ts';
import { CHARACTERS } from '../src/content/index.ts';
import { autoplay } from '../src/ai/bot.ts';
import { createBattle, type SeatSetup } from '../src/engine/battle.ts';
import { HALVES } from '../src/engine/registry.ts';

const seat = (char: string): SeatSetup => {
  const def = CHARACTERS[char];
  return { char, alive: true, candles: 2, deck: def.start.map((id, d) => ({ d, id })), side: def.side, sideCount: 10, relics: [def.relic], items: [null, null, null] };
};

const halves = [...HALVES.values()].filter((h) => h.act === 1);
const n = Number(process.argv[2] ?? 4);
for (const h of halves) {
  let wins = 0;
  let turns = 0;
  let candles = 0;
  let teeth = 0;
  for (let seed = 1; seed <= n; seed++) {
    const b = createBattle({ seed, seats: [seat('blue'), seat('pistachio')], halves: [h.id, h.id], size: Number(process.argv[3] ?? 10) }).b;
    autoplay(b, 4000, { limit: 150 });
    if (b.over === 'win') wins++;
    turns += b.turn;
    candles += b.seats[0].candles + b.seats[1].candles;
    teeth += b.seats[0].teeth + b.seats[1].teeth;
  }
  console.log(`${h.id.padEnd(14)} ${h.tier.padEnd(7)} win ${wins}/${n}  turns ${(turns / n).toFixed(1)}  candles left ${(candles / n).toFixed(1)}  teeth ${(teeth / n).toFixed(1)}`);
}
