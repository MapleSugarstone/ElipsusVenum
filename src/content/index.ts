import './keywords.ts';
import './shared.ts';
import './shared2.ts';
import './blue.ts';
import './pistachio.ts';
import './chars2.ts';
import './mechanics.ts';
import './foes2.ts';
import './enemies.ts';
import './bosses.ts';
import './act2.ts';
import './act3.ts';
import './items.ts';
import './relics.ts';
import './relics2.ts';
import './relics3.ts';
import './events.ts';
import './events2.ts';
import './events3.ts';
// Last, so it can read every card and ability above.
import './glossary.ts';

export interface CharacterDef {
  id: string;
  name: string;
  relic: string;
  side: string;
  start: string[];
}

export const CHARACTERS: Record<string, CharacterDef> = {
  blue: {
    id: 'blue',
    name: 'Blue',
    relic: 'signet-ring',
    side: 'placeholder',
    start: ['jab', 'jab', 'brace', 'brace', 'weasel', 'leapfrog', 'wolf-pup', 'sparrow', 'throwing-knives', 'kneel'],
  },
  pistachio: {
    id: 'pistachio',
    name: 'Doctor Pistachio',
    relic: 'cracked-controller',
    side: 'placeholder',
    start: ['jab', 'jab', 'brace', 'brace', 'weasel', 'leapfrog', 'gecko', 'minion', 'run-firewall', 'deploy-exploit'],
  },
};
