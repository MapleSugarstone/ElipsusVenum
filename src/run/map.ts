import { randInt, type Rng } from '../engine/rng.ts';
import type { MapNode, MapState, NodeKind } from './types.ts';

export const MAP_ROWS = 12;
export const MAP_COLS = 7;
const PATHS = 6;

const WEIGHTS: [NodeKind, number][] = [
  ['battle', 40], ['event', 20], ['elite', 9], ['rest', 10], ['merchant', 6],
  ['cards', 7], ['mycologist', 2], ['stones', 3], ['woodcarver', 3],
];
const NO_REPEAT = new Set<NodeKind>(['elite', 'rest', 'merchant', 'mycologist', 'stones', 'woodcarver']);

function rollKind(rng: Rng, row: number, parents: NodeKind[]): NodeKind {
  const allowed = WEIGHTS.filter(([k]) => {
    if ((k === 'elite' || k === 'rest') && row < 4) return false;
    if (k === 'rest' && row === MAP_ROWS - 2) return false;
    if (NO_REPEAT.has(k) && parents.includes(k)) return false;
    return true;
  });
  const total = allowed.reduce((a, [, w]) => a + w, 0);
  let roll = randInt(rng, total);
  for (const [k, w] of allowed) {
    if (roll < w) return k;
    roll -= w;
  }
  return 'battle';
}

/** Branching map: paths climb from the bottom row to the boss without crossing. */
export function generateMap(rng: Rng, act: number): MapState {
  const key = (r: number, c: number) => r * MAP_COLS + c;
  const present = new Set<number>();
  const edges = new Set<string>();
  const edge = (r: number, c: number, c2: number) => `${r},${c},${c2}`;
  let firstStart = -1;
  for (let p = 0; p < PATHS; p++) {
    let col = randInt(rng, MAP_COLS);
    if (p === 1) while (col === firstStart) col = randInt(rng, MAP_COLS);
    if (p === 0) firstStart = col;
    for (let row = 0; row < MAP_ROWS; row++) {
      present.add(key(row, col));
      if (row === MAP_ROWS - 1) break;
      const options = [col - 1, col, col + 1].filter((n) => {
        if (n < 0 || n >= MAP_COLS) return false;
        if (n === col + 1 && edges.has(edge(row, col + 1, col))) return false;
        if (n === col - 1 && edges.has(edge(row, col - 1, col))) return false;
        return true;
      });
      const next = options[randInt(rng, options.length)];
      edges.add(edge(row, col, next));
      col = next;
    }
  }
  const sorted = [...present].sort((a, b) => a - b);
  const idOf = new Map<number, number>();
  const nodes: MapNode[] = sorted.map((k, id) => {
    idOf.set(k, id);
    return { id, row: Math.floor(k / MAP_COLS), col: k % MAP_COLS, kind: 'battle', next: [] };
  });
  for (const e of edges) {
    const [r, c, c2] = e.split(',').map(Number);
    const from = nodes[idOf.get(key(r, c))!];
    const to = idOf.get(key(r + 1, c2))!;
    if (!from.next.includes(to)) from.next.push(to);
  }
  const boss: MapNode = { id: nodes.length, row: MAP_ROWS, col: Math.floor(MAP_COLS / 2), kind: 'boss', next: [] };
  for (const n of nodes) {
    n.next.sort((a, b) => a - b);
    if (n.row === MAP_ROWS - 1) n.next = [boss.id];
  }
  nodes.push(boss);
  const parents = new Map<number, number[]>();
  for (const n of nodes) for (const t of n.next) parents.set(t, [...(parents.get(t) ?? []), n.id]);
  for (const n of nodes) {
    if (n.kind === 'boss') continue;
    if (n.row === 0) n.kind = 'battle';
    else if (n.row === MAP_ROWS - 1) n.kind = 'rest';
    else if (n.row === Math.floor(MAP_ROWS / 2)) n.kind = 'treasure';
    else n.kind = rollKind(rng, n.row, (parents.get(n.id) ?? []).map((p) => nodes[p].kind));
  }
  return { act, rows: MAP_ROWS, nodes };
}

export function startNodes(map: MapState): number[] {
  return map.nodes.filter((n) => n.row === 0).map((n) => n.id);
}

export function reachable(map: MapState, at: number | null): number[] {
  if (at === null) return startNodes(map);
  return map.nodes[at]?.next ?? [];
}
