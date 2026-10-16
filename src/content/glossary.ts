// Hover help for names that rules text uses but that are not keywords: Programs, terrain, and the cards that other cards
// create. Runs after every other content file, so it can read what they registered.
import { ABILITIES, CARDS, defTerm, GLOSSARY } from '../engine/registry.ts';
import { defLines, fillTemplate, plainText } from '../engine/text.ts';

const sentence = (s: string): string => (/[.:]$/.test(s) ? s : `${s}.`);

for (const a of ABILITIES.values()) {
  const kind = a.id.startsWith('prog:') ? 'A Program.' : a.id.startsWith('terrain:') ? 'Terrain on a lane.' : null;
  if (!kind) continue;
  const full = fillTemplate(a.text, a.p ?? {});
  const dot = full.indexOf('.');
  const name = full.slice(0, dot);
  if (!GLOSSARY.has(name)) defTerm(name, `${kind} ${sentence(full.slice(dot + 1).trim())}`);
}

// Cards that only exist because another card makes them. Their rules show on hover wherever they are named.
for (const def of CARDS.values()) {
  if (def.pool !== 'token' && def.pool !== 'side' && def.pool !== 'curse') continue;
  if (GLOSSARY.has(def.name)) continue;
  const rules = plainText(defLines(def));
  const stats = def.kind === 'creature' ? `A ${def.power} power, ${def.health} health creature.` : 'A spell.';
  defTerm(def.name, rules ? `${stats} ${sentence(rules)}` : stats);
}
if (GLOSSARY.has('Knife')) defTerm('Knives', GLOSSARY.get('Knife')!);
