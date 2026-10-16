import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../src/content/index.ts';
import { CHARACTERS } from '../src/content/index.ts';
import { ABILITIES, CARDS, GLOSSARY, HALVES, ITEMS, RELICS } from '../src/engine/registry.ts';
import { defLines, plainText } from '../src/engine/text.ts';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('content', () => {
  it('every placeholder in rules text has a number', () => {
    for (const def of CARDS.values()) {
      for (const up of [false, true]) {
        const text = plainText(defLines(def, up));
        expect(text, `${def.id}${up ? '+' : ''}`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('every keyword has a glossary entry', () => {
    for (const a of ABILITIES.values()) if (a.kw) expect(GLOSSARY.has(a.kw), a.kw).toBe(true);
  });

  it('every encounter places cards that exist', () => {
    for (const half of HALVES.values()) {
      for (const list of [half.front ?? [], ...half.turns, ...(half.loop ?? [])]) {
        for (const pl of list) {
          expect(CARDS.has(pl.id), `${half.id}: ${pl.id}`).toBe(true);
          if (pl.lane !== undefined) expect(pl.lane >= 0 && pl.lane < 4, `${half.id} lane`).toBe(true);
        }
      }
    }
  });

  it('starting decks and relics exist', () => {
    for (const ch of Object.values(CHARACTERS)) {
      for (const id of ch.start) expect(CARDS.has(id), id).toBe(true);
      expect(RELICS.has(ch.relic), ch.relic).toBe(true);
      expect(CARDS.has(ch.side)).toBe(true);
    }
  });

  it('creatures have health and spells have none', () => {
    for (const def of CARDS.values()) {
      if (def.kind === 'creature') expect(def.health, def.id).toBeGreaterThan(0);
      else expect(def.health, def.id).toBe(0);
    }
  });

  it('rules text follows the house style', () => {
    const texts = [
      ...[...ABILITIES.values()].map((a) => [a.id, a.text] as const),
      ...[...ITEMS.values()].map((i) => [i.id, i.text] as const),
      ...[...GLOSSARY.entries()],
    ];
    for (const [id, text] of texts) {
      if (!text) continue;
      expect(text, id).not.toMatch(/[–—;]/);
      expect(text, id).toMatch(/[.:]$/);
      expect(text, id).not.toMatch(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b (damage|Block|energy|bones?|cards?|teeth|power|health)/);
    }
  });

  it('rules and content code never use nondeterministic or inexact math', () => {
    const banned = /Math\.random|Date\.now|new Date|performance\.now|Math\.(pow|exp|log|sin|cos|tan|atan2|sqrt|cbrt|hypot)\b|[\w)\]]\s*\*\*/;
    for (const f of [...files('src/engine'), ...files('src/content'), ...files('src/run')]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(banned);
    }
  });

  it('card names are unique', () => {
    const seen = new Map<string, string>();
    for (const def of CARDS.values()) {
      expect(seen.has(def.name), `${def.name}: ${def.id} and ${seen.get(def.name)}`).toBe(false);
      seen.set(def.name, def.id);
    }
  });
});
