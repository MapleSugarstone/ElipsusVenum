import { applyInPlace, costOf, legal, needsDraw, sacValue } from '../engine/battle.ts';
import { powerOf } from '../engine/fx.ts';
import { card as cardDef, ITEMS, type TargetSpec } from '../engine/registry.ts';
import { LANES, SEATS, lanesOf, type Battle, type BattleAction, type Seat, type SlotRef } from '../engine/types.ts';

function slotsFor(seat: Seat, spec: TargetSpec): SlotRef[] {
  const out: SlotRef[] = [];
  const lanes = spec.who === 'any' ? [...Array(LANES).keys()] : spec.who === 'partner' ? lanesOf(seat === 0 ? 1 : 0) : lanesOf(seat);
  for (const lane of lanes) {
    if (spec.row === 'lane') out.push({ row: 'p', lane });
    else out.push({ row: spec.row, lane });
  }
  return out;
}

function targetCombos(seat: Seat, specs: TargetSpec[]): SlotRef[][] {
  let combos: SlotRef[][] = [[]];
  for (const spec of specs) {
    const next: SlotRef[][] = [];
    for (const combo of combos) for (const ref of slotsFor(seat, spec)) next.push([...combo, ref]);
    combos = next;
    if (combos.length > 400) break;
  }
  return combos;
}

function sacOptions(b: Battle, seat: Seat, blood: number): number[][] {
  if (blood <= 0) return [[]];
  const mine = lanesOf(seat).filter((l) => b.p[l]);
  const out: number[][] = [];
  for (let mask = 1; mask < 1 << mine.length; mask++) {
    const pick = mine.filter((_, i) => mask & (1 << i));
    const vals = pick.map((l) => sacValue(b.p[l]!));
    const total = vals.reduce((a, v) => a + v, 0);
    if (total >= blood && total - Math.min(...vals) < blood) out.push(pick);
  }
  return out;
}

/** Every legal action for a seat, except ringing the bell. */
export function candidates(b: Battle, seat: Seat): BattleAction[] {
  const s = b.seats[seat];
  const out: BattleAction[] = [];
  const push = (a: BattleAction) => {
    if (!legal(b, seat, a)) out.push(a);
  };
  if (!s.alive) {
    push({ t: 'ghost', kind: 'bone' });
    for (const lane of lanesOf(seat === 0 ? 1 : 0)) if (b.e[lane]) push({ t: 'ghost', kind: 'mark', tg: { row: 'e', lane } });
    return out;
  }
  if (s.rung) return out;
  if (needsDraw(b, seat)) {
    push({ t: 'draw', from: 'main' });
    push({ t: 'draw', from: 'side' });
    return out;
  }
  for (const c of s.hand) {
    const def = cardDef(c.id);
    const cost = costOf(b, seat, c);
    if (s.energy < cost.energy || s.bones < cost.bones) continue;
    const sacs = sacOptions(b, seat, cost.blood);
    const combos = targetCombos(seat, def.tg);
    if (def.kind === 'creature') {
      for (const lane of lanesOf(seat)) {
        for (const sac of sacs) {
          if (b.p[lane] && !sac.includes(lane)) continue;
          for (const tg of combos) push({ t: 'play', uid: c.uid, lane, sac, tg });
        }
      }
    } else {
      for (const sac of sacs) for (const tg of combos) push({ t: 'play', uid: c.uid, sac, tg });
    }
  }
  s.items.forEach((id, slot) => {
    if (!id) return;
    const def = ITEMS.get(id);
    if (!def) return;
    for (const tg of targetCombos(seat, def.tg)) push({ t: 'item', slot, tg });
  });
  return out;
}

/** Scores a position for the players as a team. Higher is better. */
export function evaluate(b: Battle): number {
  if (b.over === 'win') return 1e6 + b.seats.reduce((a, s) => a + s.teeth, 0);
  if (b.over === 'loss') return -1e6;
  let score = 0;
  for (const seat of SEATS) {
    const s = b.seats[seat];
    if (!s.alive) {
      score -= 4000;
      continue;
    }
    if (s.won) {
      score += 3000;
      continue;
    }
    score += s.scale * 40 + s.candles * 500 + s.teeth * 2;
    score += Math.min(s.hand.length, 8) * 6 + s.bones * 2;
    for (const lane of lanesOf(seat)) {
      const mine = b.p[lane];
      const foe = b.e[lane];
      const queued = b.q[lane];
      if (mine) score += powerOf(b, mine) * 9 + mine.health * 5;
      if (foe) score -= powerOf(b, foe) * 9 + foe.health * 4;
      if (queued) score -= powerOf(b, queued) * 5 + queued.health * 2;
      if (foe && !mine) score -= powerOf(b, foe) * 12;
    }
    score += s.programs.length * 15 + s.powers.length * 20;
    score += (s.st.strength ?? 0) * 15 + (s.st.dexterity ?? 0) * 10 + (s.c.devotion ?? 0) * 3;
  }
  return score;
}

/** Plays the bell for every seat that has not rung, then scores the position after the enemy turn. */
function rollout(b: Battle): number {
  const sim = structuredClone(b);
  for (const seat of SEATS) {
    const s = sim.seats[seat];
    if (sim.over || !s.alive || s.rung) continue;
    if (needsDraw(sim, seat)) applyInPlace(sim, seat, { t: 'draw', from: s.deck.length + s.discard.length > 0 ? 'main' : 'side' });
    if (!legal(sim, seat, { t: 'ring' })) applyInPlace(sim, seat, { t: 'ring' });
  }
  return evaluate(sim);
}

/**
 * Main deck or side deck, chosen from what the bot can see. Simulating the draw would reveal the top card, so this reads
 * only the hand, the board, and how many of the cards left in the deck are creatures.
 */
function drawFrom(b: Battle, seat: Seat): 'main' | 'side' {
  const s = b.seats[seat];
  const mainLeft = s.deck.length + s.discard.length;
  if (s.side.length === 0) return 'main';
  if (mainLeft === 0) return 'side';
  const onBoard = lanesOf(seat).filter((l) => b.p[l]).length;
  const handCreatures = s.hand.filter((c) => cardDef(c.id).kind === 'creature');
  const bloodNeeded = Math.min(...handCreatures.map((c) => c.cost.blood ?? 0), 99);
  const hungry = handCreatures.length > 0 && bloodNeeded > onBoard;
  const pool = [...s.deck, ...s.discard];
  const creatureShare = pool.filter((c) => cardDef(c.id).kind === 'creature').length / pool.length;
  if (hungry) return 'side';
  if (handCreatures.length === 0 && onBoard === 0 && creatureShare < 0.5) return 'side';
  return 'main';
}

export interface BotOptions {
  /** Upper bound on candidates scored per step, to keep slow positions bounded. */
  limit?: number;
}

/** One-step lookahead: the action whose resulting position scores best after the coming combat, or the bell. */
export function chooseAction(b: Battle, seat: Seat, opts: BotOptions = {}): BattleAction {
  const s = b.seats[seat];
  if (!s.alive) {
    const opts2 = candidates(b, seat);
    if (opts2.length === 0) return { t: 'ghost', kind: 'bone' };
    const marks = opts2.filter((a) => a.t === 'ghost' && a.kind === 'mark');
    return marks[0] ?? opts2[0];
  }
  const list = candidates(b, seat);
  const limit = opts.limit ?? 600;
  if (needsDraw(b, seat)) return { t: 'draw', from: drawFrom(b, seat) };
  const base = rollout(b);
  let best: BattleAction = { t: 'ring' };
  let bestScore = base + 1;
  for (const a of list.slice(0, limit)) {
    const sim = structuredClone(b);
    applyInPlace(sim, seat, a);
    const score = rollout(sim);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

/** Plays a battle to the end with the bot on both seats. Returns the number of actions taken. */
export function autoplay(b: Battle, maxActions = 4000, opts: BotOptions = {}): number {
  let n = 0;
  while (!b.over && n < maxActions) {
    let acted = false;
    for (const seat of SEATS) {
      const s = b.seats[seat];
      if (b.over) break;
      if (!s.alive) {
        if (!s.ghost && b.seats[seat === 0 ? 1 : 0].alive) {
          const a = chooseAction(b, seat, opts);
          if (!legal(b, seat, a)) {
            applyInPlace(b, seat, a);
            n++;
          }
        }
        continue;
      }
      if (s.rung) continue;
      const a = chooseAction(b, seat, opts);
      const err = legal(b, seat, a);
      if (err) throw new Error(`bot chose an illegal action (${err}): ${JSON.stringify(a)}`);
      applyInPlace(b, seat, a);
      n++;
      acted = true;
    }
    if (!acted && !b.over) {
      const waiting = SEATS.filter((x) => b.seats[x].alive && !b.seats[x].rung);
      if (waiting.length === 0) throw new Error('battle stalled with every bell rung');
    }
  }
  return n;
}
