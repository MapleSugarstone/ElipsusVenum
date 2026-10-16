import { defAbility, defCard, defRelic } from '../engine/registry.ts';
import type { Ctx } from '../engine/fx.ts';
import { lanesOf } from '../engine/types.ts';
import { ANY_ALLY, ENEMY } from './helpers.ts';

/** Hits a random lane in the seat's half, preferring lanes with an enemy creature. */
function zap(c: Ctx, n: number): void {
  const lanes = lanesOf(c.seat);
  const withFoe = lanes.filter((l) => c.b.e[l]);
  const pool = withFoe.length > 0 ? withFoe : lanes;
  c.hit(pool[c.rand(pool.length)], c.spell(n));
}

defAbility({
  id: 'prog:firewall', text: 'Firewall. End of turn: gain {t} Block. Evoke: gain {e} Block.', p: { t: 2, e: 6 },
  tick(c) {
    c.block(c.p.t);
  },
  evoke(c) {
    c.block(c.p.e);
  },
});
defAbility({
  id: 'prog:exploit', text: 'Exploit. End of turn: hit a lane in your half for {t}. Evoke: hit for {e}.', p: { t: 2, e: 6 },
  tick(c) {
    zap(c, c.p.t);
  },
  evoke(c) {
    zap(c, c.p.e);
  },
});
defAbility({
  id: 'prog:virus', text: 'Virus. End of turn: apply {t} Poison to each enemy creature in your lanes. Evoke: apply {e}.', p: { t: 1, e: 3 },
  tick(c) {
    for (const e of c.enemies(c.seat)) c.status(e, 'poison', c.p.t);
  },
  evoke(c) {
    for (const e of c.enemies(c.seat)) c.status(e, 'poison', c.p.e);
  },
});
defAbility({
  id: 'prog:botnet', text: 'Botnet. End of turn: a random creature of yours gains {t} power. Evoke: summon a Minion.', p: { t: 1 },
  tick(c) {
    const mine = c.allies();
    if (mine.length > 0) c.buff(mine[c.rand(mine.length)], c.p.t, 0);
  },
  evoke(c) {
    const empty = c.emptyLanes();
    if (empty.length > 0) c.summon('minion', empty[c.rand(empty.length)]);
  },
});

defCard({
  id: 'run-firewall', name: 'Run Firewall', pool: 'pistachio', cost: { energy: 1 }, p: { b: 2 }, up: { p: { b: 4 } }, tags: ['program'],
  text: 'Load Firewall. Gain {b} Block.',
  play(c) {
    c.program('prog:firewall');
    c.block(c.p.b);
  },
});
defCard({
  id: 'deploy-exploit', name: 'Deploy Exploit', pool: 'pistachio', cost: { energy: 1 }, up: { cost: { energy: 0 } }, tags: ['program'],
  text: 'Load Exploit.',
  play(c) {
    c.program('prog:exploit');
  },
});
defCard({
  id: 'upload-virus', name: 'Upload Virus', pool: 'pistachio', cost: { energy: 1 }, up: { cost: { energy: 0 } }, tags: ['program'],
  text: 'Load Virus.',
  play(c) {
    c.program('prog:virus');
  },
});
defCard({
  id: 'botnet', name: 'Botnet', pool: 'pistachio', rarity: 'uncommon', cost: { energy: 2 }, up: { cost: { energy: 1 } }, tags: ['program'],
  text: 'Load Botnet.',
  play(c) {
    c.program('prog:botnet');
  },
});
defCard({
  id: 'reboot', name: 'Reboot', pool: 'pistachio', rarity: 'rare', cost: { energy: 2 }, kw: ['Exhaust'], tags: ['program'],
  text: 'Evoke all your Programs, then draw 1 card for each.',
  play(c) {
    c.draw(c.evokeAll());
  },
});
defCard({
  id: 'hack', name: 'Hack', pool: 'pistachio', rarity: 'uncommon', cost: { energy: 2 }, p: { n: 4 }, up: { p: { n: 6 } }, kw: ['Exhaust'],
  tg: [{ ...ENEMY, ok: (b, card) => !!card && b.p[b.e.indexOf(card)] === null }],
  text: 'Take an enemy creature in your lanes with {n} power or less. It moves to your side of its lane, which must be empty.',
  play(c) {
    const t = c.target();
    if (!t || c.powerOf(t) > c.p.n) return;
    const lane = c.laneOf(t);
    if (c.b.p[lane]) return;
    c.b.e[lane] = null;
    t.side = 'p';
    t.seat = c.seat;
    t.st = {};
    c.b.p[lane] = t;
    c.emit({ k: 'hacked', uid: t.uid, lane });
  },
});
defCard({
  id: 'glitch', name: 'Glitch', pool: 'pistachio', cost: { energy: 1 }, tg: [ENEMY], up: { cost: { energy: 0 } },
  text: 'Glitch an enemy creature.',
  play(c) {
    const t = c.target();
    if (!t) return;
    for (const a of t.ab) a.off = true;
    t.st.glitch = 1;
    c.emit({ k: 'status', uid: t.uid, s: 'glitch', v: 1 });
  },
});
defCard({
  id: 'patch-notes', name: 'Patch Notes', pool: 'pistachio', rarity: 'rare', cost: { energy: 1 }, kw: ['Exhaust'], up: { cost: { energy: 0 } },
  text: 'Every number in the text of each card in your hand goes up by 1.',
  play(c) {
    for (const card of c.me.hand) {
      for (const a of card.ab) {
        if (!a.p) continue;
        for (const k of Object.keys(a.p)) a.p[k] += 1;
      }
    }
    c.emit({ k: 'patched', seat: c.seat });
  },
});
defCard({
  id: 'one-up', name: '1-Up', pool: 'pistachio', cost: { energy: 1 }, tg: [ANY_ALLY], up: { cost: { energy: 0 } }, tags: ['support'],
  text: 'A creature in any lane gains Returning.',
  play(c) {
    const t = c.target();
    if (t && !c.has(t, 'Returning')) {
      t.ab.unshift({ a: 'kw:returning' });
      c.emit({ k: 'buff', uid: t.uid, dp: 0, dh: 0 });
    }
  },
});
defCard({ id: 'bug', name: 'Bug', pool: 'curse', rarity: 'special', kw: ['Unplayable'] });
defCard({
  id: 'cheat-code', name: 'Cheat Code', pool: 'pistachio', rarity: 'uncommon', cost: { energy: 0 }, p: { e: 3 }, up: { p: { e: 4 } },
  text: 'Gain {e} energy. Shuffle a Bug into your deck.',
  play(c) {
    c.energy(c.p.e);
    const bug = c.add('bug', 1)[0];
    const hand = c.me.hand;
    const i = hand.indexOf(bug);
    if (i >= 0) {
      hand.splice(i, 1);
      c.me.deck.splice(c.rand(c.me.deck.length + 1), 0, bug);
    }
  },
});
defAbility({
  id: 'pw:monologue', text: 'At the end of your turn: gain {n} Strength.', p: { n: 1 },
  turnEnd(c) {
    c.seatStatus('strength', c.p.n);
  },
});
defCard({
  id: 'evil-monologue', name: 'Evil Monologue', pool: 'pistachio', rarity: 'rare', cost: { energy: 2 }, p: { n: 1 }, up: { p: { n: 2 } }, tags: ['power'],
  text: 'For the rest of the battle, at the end of your turn: gain {n} Strength.',
  play(c) {
    c.addPower('pw:monologue', { n: c.p.n });
  },
});
defCard({
  id: 'level-up', name: 'Level Up', pool: 'pistachio', cost: { energy: 1 }, p: { n: 2 }, up: { p: { n: 3 } }, tg: [ANY_ALLY], tags: ['support'],
  text: 'A creature in any lane gains {n} power and {n} health.',
  play(c) {
    c.buff(c.target(), c.p.n, c.p.n);
  },
});

defCard({ id: 'minion', name: 'Minion', pool: 'pistachio', cost: { energy: 1 }, power: 2, health: 2, tribe: 'Machine' });
defCard({ id: 'lab-drone', name: 'Lab Drone', pool: 'pistachio', cost: { energy: 2 }, power: 2, health: 4, tribe: 'Machine', kw: ['Airborne'] });
defCard({
  id: 'turret', name: 'Turret', pool: 'pistachio', rarity: 'uncommon', cost: { energy: 3 }, power: 2, health: 6, tribe: 'Machine',
  text: 'At the end of your turn: hit the lane to the left of this for 2.',
  turnEnd(c) {
    const lane = c.laneOf();
    if (lane > 0) c.hit(lane - 1, 2);
  },
});
defCard({ id: 'henchbot', name: 'Henchbot', pool: 'pistachio', rarity: 'uncommon', cost: { energy: 4 }, power: 6, health: 8, tribe: 'Machine' });

defRelic({
  id: 'cracked-controller', name: 'Cracked Controller', rarity: 'start', pool: 'pistachio',
  text: 'At the start of each battle: Load Exploit.',
  battleStart(c) {
    c.program('prog:exploit');
  },
});
