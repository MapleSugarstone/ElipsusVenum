import type { Ctx } from '../engine/fx.ts';
import type { Hooks, TargetSpec } from '../engine/registry.ts';
import type { CardInst } from '../engine/types.ts';

export const ENEMY: TargetSpec = { row: 'e' };
export const ANY_ENEMY: TargetSpec = { row: 'e', who: 'any' };
export const ALLY: TargetSpec = { row: 'p' };
export const ANY_ALLY: TargetSpec = { row: 'p', who: 'any' };
export const LANE: TargetSpec = { row: 'lane' };
export const ANY_LANE: TargetSpec = { row: 'lane', who: 'any' };
export const EMPTY: TargetSpec = { row: 'p', need: 'empty' };
export const PARTNER_EMPTY: TargetSpec = { row: 'p', who: 'partner', need: 'empty' };
export const ANY_EMPTY: TargetSpec = { row: 'p', who: 'any', need: 'empty' };

/** Hooks for a creature that turns into `into` after a full turn on the board. */
export function grows(into: string): Hooks {
  return {
    turnStart(c: Ctx) {
      const self = c.self;
      if (!self) return;
      self.c.age = (self.c.age ?? 0) + 1;
      if (self.c.age >= 1) c.transform(self, into);
    },
  };
}

export function pray(c: Ctx, n: number): void {
  const v = c.counter('devotion', n);
  if (v >= 10) {
    c.counter('devotion', -10);
    c.me.c.blessed = 1;
    c.emit({ k: 'blessed', seat: c.seat });
    c.energy(3);
  }
}

export function countAllies(c: Ctx, pred: (x: CardInst) => boolean): number {
  return c.allies().filter(pred).length;
}
