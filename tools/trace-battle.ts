import '../src/content/index.ts';
import { CHARACTERS } from '../src/content/index.ts';
import { chooseAction } from '../src/ai/bot.ts';
import { applyInPlace, createBattle, legal, type SeatSetup } from '../src/engine/battle.ts';
import { powerOf } from '../src/engine/fx.ts';
import { card } from '../src/engine/registry.ts';
import type { Battle, BattleAction, CardInst } from '../src/engine/types.ts';

const seat = (char: string): SeatSetup => {
  const def = CHARACTERS[char];
  return { char, alive: true, candles: 2, deck: def.start.map((id, d) => ({ d, id })), side: def.side, sideCount: 10, relics: [def.relic], items: [null, null, null] };
};
const halves = (process.argv[2] ?? 'grubs,goblins').split(',') as [string, string];
const seed = Number(process.argv[3] ?? 1);
const b = createBattle({ seed, seats: [seat('blue'), seat('pistachio')], halves }).b;

const short = (c: CardInst | null) => (c ? `${card(c.id).name.slice(0, 7)} ${powerOf(b, c)}/${c.health}` : '.');
function show(b: Battle) {
  console.log(`  queue | ${b.q.map(short).map((x) => x.padEnd(12)).join('|')}`);
  console.log(`  enemy | ${b.e.map(short).map((x) => x.padEnd(12)).join('|')}`);
  console.log(`  mine  | ${b.p.map(short).map((x) => x.padEnd(12)).join('|')}`);
  console.log(`  scale ${b.seats.map((s) => `${s.scale}/${s.size} c${s.candles} e${s.energy} b${s.bones} blk${s.block} hand${s.hand.length} deck${s.deck.length}${s.won ? ' WON' : ''}${s.alive ? '' : ' DEAD'}`).join('   ')}`);
}
const describe = (a: BattleAction, s: 0 | 1) => {
  if (a.t !== 'play') return a.t + (a.t === 'draw' ? ` ${a.from}` : '');
  const c = b.seats[s].hand.find((x) => x.uid === a.uid);
  return `play ${c ? card(c.id).name : a.uid}${a.lane !== undefined ? ` lane ${a.lane}` : ''}${a.sac?.length ? ` sac ${a.sac}` : ''}${a.tg?.length ? ` tg ${a.tg.map((t) => t.row + t.lane)}` : ''}`;
};
let lastTurn = 0;
let guard = 0;
while (!b.over && guard++ < 2000) {
  if (b.turn !== lastTurn) {
    console.log(`turn ${b.turn}`);
    show(b);
    lastTurn = b.turn;
  }
  for (const s of [0, 1] as const) {
    if (b.over || !b.seats[s].alive || b.seats[s].rung) continue;
    const a = chooseAction(b, s, { limit: 200 });
    if (legal(b, s, a)) throw new Error('illegal');
    console.log(`  seat ${s}: ${describe(a, s)}`);
    applyInPlace(b, s, a);
  }
}
show(b);
console.log(`result ${b.over} after ${b.turn} turns`);
