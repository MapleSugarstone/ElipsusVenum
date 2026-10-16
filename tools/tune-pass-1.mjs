// One balance pass from the wave2 sim. Each replacement must match exactly once, or the script stops.
import { readFileSync, writeFileSync } from 'node:fs';

const edits = {
  'src/content/enemies.ts': [
    ["loop: [[P('grub')], [], []] });", "loop: [[P('grub')], []] });"],
    ["loop: [[P('goblin')], [], []] });\ndefHalf({ id: 'slimes'", "loop: [[P('goblin')], []] });\ndefHalf({ id: 'slimes'"],
    ["loop: [[P('slime')], [], [], []] });", "loop: [[P('slime')], [], []] });"],
    ["loop: [[P('rat'), P('rat')], [], [], []] });", "loop: [[P('rat'), P('rat')], [], []] });"],
  ],
  'src/content/act2.ts': [
    ["id: 'orc', name: 'Orc', power: 6, health: 8 });", "id: 'orc', name: 'Orc', power: 4, health: 8 });"],
    ["id: 'goblin-again', name: 'Goblin (Again)', power: 4, health: 6 });", "id: 'goblin-again', name: 'Goblin (Again)', power: 4, health: 4 });"],
    ["id: 'golem', name: 'Golem', power: 4, health: 14, kw: [['Armor', 2]] });", "id: 'golem', name: 'Golem', power: 2, health: 12, kw: [['Armor', 1]] });"],
    ["id: 'mirror-knight', name: 'Mirror Knight', power: 6, health: 12, kw: ['Shield', ['Thorns', 2]] });", "id: 'mirror-knight', name: 'Mirror Knight', power: 4, health: 10, kw: ['Shield', ['Thorns', 2]] });"],
    ["id: 'the-copycat', name: 'The Copycat', power: 4, health: 24, kw: ['Shield'],", "id: 'the-copycat', name: 'The Copycat', power: 4, health: 20, kw: ['Shield'],"],
    ["    if (c.b.turn % 2 !== 0) return;", "    if (c.b.turn % 3 !== 0) return;"],
    ["id: 'rule:copycat', text: 'House rule: every other turn, each half gets an enemy copy of its strongest creature in the queue.',", "id: 'rule:copycat', text: 'House rule: every third turn, each half gets an enemy copy of its strongest creature in the queue.',"],
  ],
  'src/content/act3.ts': [
    ["id: 'chimera', name: 'Chimera', power: 6, health: 14, kw: ['Triple Strike'] });", "id: 'chimera', name: 'Chimera', power: 4, health: 12, kw: ['Triple Strike'] });"],
    ["id: 'lich', name: 'Lich', power: 2, health: 14, kw: [['Leader', 4]] });", "id: 'lich', name: 'Lich', power: 2, health: 12, kw: [['Leader', 2]] });"],
    ["id: 'unfinished-monster', name: 'Unfinished Monster', power: 8, health: 8 });", "id: 'unfinished-monster', name: 'Unfinished Monster', power: 6, health: 8 });"],
  ],
};

for (const [file, pairs] of Object.entries(edits)) {
  let src = readFileSync(file, 'utf8');
  for (const [from, to] of pairs) {
    const count = src.split(from).length - 1;
    if (count !== 1) throw new Error(`${file}: expected one match, found ${count}: ${from.slice(0, 60)}`);
    src = src.replace(from, to);
  }
  writeFileSync(file, src);
}
console.log('tune pass 1 applied');
