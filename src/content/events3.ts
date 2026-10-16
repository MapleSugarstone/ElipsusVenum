import { defEvent } from '../run/events.ts';

defEvent({
  id: 'vending-machine', acts: [1, 2, 3], title: 'Vending Machine',
  intro: 'I put a vending machine here. It sells things. I did not decide what.',
  options: [
    {
      label: 'Pay 5 teeth each',
      text: 'Each of you who has 5 teeth pays them and gains a random item.',
      ok: (r) => r.seat(0).teeth >= 5 || r.seat(1).teeth >= 5,
      run(r) {
        r.each((s, i) => {
          if (s.teeth < 5) return;
          r.teeth(i, -5);
          r.item(i);
        });
        return 'Something falls out. It is mostly what you paid for.';
      },
    },
    {
      label: 'Shake it',
      text: 'A coin decides: each of you gains a random item, or a random living player loses a candle.',
      run(r) {
        if (r.rand(2) === 0) {
          r.each((_, i) => r.item(i));
          return 'Everything falls out at once.';
        }
        const alive = r.living();
        if (alive.length) r.candle(alive[r.rand(alive.length)], -1);
        return 'The machine falls on someone.';
      },
    },
    { label: 'Leave it', text: 'Nothing happens.', run: () => 'It hums at you as you go.' },
  ],
});

defEvent({
  id: 'scrapyard', acts: [1, 2], title: 'Scrapyard',
  intro: 'This is where I put the cards I did not finish. Some of them still work.',
  options: [
    {
      label: 'Dig through it',
      text: 'Each of you turns 2 random cards into random cards of the same rarity.',
      run(r) {
        r.each((_, i) => {
          r.transformRandom(i);
          r.transformRandom(i);
        });
        return 'You come out holding different things than you went in with.';
      },
    },
    {
      label: 'Sell the scrap',
      text: 'Each of you gains 5 teeth.',
      run(r) {
        r.each((_, i) => r.teeth(i, 5));
        return 'The scrap buyer is also me.';
      },
    },
  ],
});

defEvent({
  id: 'wishing-well', acts: [1, 2, 3], title: 'Wishing Well',
  intro: 'A wishing well. You throw teeth in and it grants wishes. Small ones.',
  options: [
    {
      label: 'Throw in 4 teeth each',
      text: 'Each of you who has 4 teeth pays them and upgrades 2 random cards.',
      ok: (r) => r.seat(0).teeth >= 4 || r.seat(1).teeth >= 4,
      run(r) {
        r.each((s, i) => {
          if (s.teeth < 4) return;
          r.teeth(i, -4);
          r.upgradeRandom(i);
          r.upgradeRandom(i);
        });
        return 'The well says thank you. You did not know it could talk.';
      },
    },
    {
      label: 'Climb down',
      text: 'Each of you gains a random relic. A random living player loses a candle.',
      run(r) {
        r.each((_, i) => r.relic(i, 'uncommon'));
        const alive = r.living();
        if (alive.length) r.candle(alive[r.rand(alive.length)], -1);
        return 'There was a lot of stuff at the bottom. There was also a bottom.';
      },
    },
  ],
});

defEvent({
  id: 'card-shark', acts: [2, 3], title: 'Card Shark',
  intro: 'This shark plays cards. He is very good. I made him too good.',
  options: [
    {
      label: 'Play a hand',
      text: 'You fight an elite. It pays like one.',
      run(r) {
        r.fight(r.run.act === 2 ? ['gang', 'thieves'] : ['erasers', 'hexes'], 'elite');
        return 'He deals. Everyone at the table stands up.';
      },
    },
    {
      label: 'Bet 6 teeth each',
      text: 'Each of you who has 6 teeth bets them. A coin decides: each bettor wins 6 more, or loses them.',
      ok: (r) => r.seat(0).teeth >= 6 || r.seat(1).teeth >= 6,
      run(r) {
        const win = r.rand(2) === 0;
        r.each((s, i) => {
          if (s.teeth >= 6) r.teeth(i, win ? 6 : -6);
        });
        return win ? 'The shark pays up and looks at the floor.' : 'The shark smiles with all of them.';
      },
    },
  ],
});

defEvent({
  id: 'library', acts: [1, 2, 3], title: 'Library',
  intro: 'I wrote all of these books. They are about cards. Some are about me.',
  options: [
    {
      label: 'Read the rare section',
      text: 'Each of you adds a random rare card to your deck.',
      run(r) {
        r.each((_, i) => r.addCard(i, r.randomCard(i, 'rare')));
        return 'You learn something nobody should have written down.';
      },
    },
    {
      label: 'Nap in the reading chair',
      text: 'Each living player relights a candle.',
      run(r) {
        r.each((_, i) => r.candle(i, 1));
        return 'Nobody shushes you. There is nobody else here.';
      },
    },
  ],
});

defEvent({
  id: 'beta-test', acts: [2, 3], title: 'Beta Test',
  intro: 'I am testing a new feature. You are the testers. You did not sign anything, but you are.',
  options: [
    {
      label: 'Try the new feature',
      text: 'Each of you adds a random uncommon card to your deck, already upgraded.',
      run(r) {
        r.each((_, i) => r.addCard(i, r.randomCard(i, 'uncommon'), true));
        return 'It works. That surprises everyone, mostly me.';
      },
    },
    {
      label: 'Report a bug',
      text: 'Each of you adds a Bug to your deck and gains 10 teeth.',
      run(r) {
        r.each((_, i) => {
          r.addCard(i, 'bug');
          r.teeth(i, 10);
        });
        return 'Thank you for your report. I will not fix it.';
      },
    },
  ],
});

defEvent({
  id: 'stray-dog', acts: [1], title: 'A Stray Dog',
  intro: 'A dog. I did not put a dog here. It is not in the files.',
  options: [
    {
      label: 'Adopt it',
      text: 'Each of you adds a Wolf Pup to your deck.',
      run(r) {
        r.each((_, i) => r.addCard(i, 'wolf-pup'));
        return 'It was a wolf. That is fine. That is still a dog, mostly.';
      },
    },
    {
      label: 'Pet it',
      text: 'Each of you upgrades a random creature.',
      run(r) {
        r.each((_, i) => r.upgradeRandom(i, 'creature'));
        return 'Your creatures watch this and try harder.';
      },
    },
  ],
});

defEvent({
  id: 'graveyard', acts: [2, 3], title: 'Graveyard', weight: 6,
  intro: 'This is where I put the players who did not make it. It is pretty empty. Please do not make it less empty.',
  options: [
    {
      label: 'Pay your respects',
      text: 'A dead player comes back with 1 candle. If no one is dead, each of you relights a candle.',
      run(r) {
        const dead = ([0, 1] as const).filter((i) => !r.seat(i).alive);
        if (dead.length) {
          for (const i of dead) r.revive(i);
          return 'Someone climbs back out and brushes themselves off.';
        }
        r.each((_, i) => r.candle(i, 1));
        return 'It is quiet. You feel a little warmer.';
      },
    },
    {
      label: 'Dig up the plots',
      text: 'Each of you adds Raise the Dead to your deck.',
      run(r) {
        r.each((_, i) => r.addCard(i, 'raise-the-dead'));
        return 'The plots were full after all.';
      },
    },
  ],
});

defEvent({
  id: 'save-point', acts: [1, 2, 3], title: 'Save Point',
  intro: 'A save point. It does not save. I only drew the glowing part.',
  options: [
    {
      label: 'Save your progress',
      text: 'Each of you upgrades a random spell.',
      run(r) {
        r.each((_, i) => r.upgradeRandom(i, 'spell'));
        return 'Nothing saves. Your spells feel saved anyway.';
      },
    },
    {
      label: 'Load an old save',
      text: 'Each of you removes a random card from your deck. Bugs go first.',
      run(r) {
        r.each((_, i) => r.removeRandom(i));
        return 'Some of what you had is gone. It was probably the bad part.';
      },
    },
  ],
});

defEvent({
  id: 'dev-room', acts: [3], title: 'The Dev Room',
  intro: 'You found my dev room. Please do not touch the files. Especially that file.',
  options: [
    {
      label: 'Edit the files',
      text: 'Each of you turns 2 random cards into random cards of the same rarity, then upgrades a random card.',
      run(r) {
        r.each((_, i) => {
          r.transformRandom(i);
          r.transformRandom(i);
          r.upgradeRandom(i);
        });
        return 'You changed the files. He pretends he did that on purpose.';
      },
    },
    {
      label: 'Delete a file',
      text: 'Each of you removes 2 random cards from your deck. Bugs go first.',
      run(r) {
        r.each((_, i) => {
          r.removeRandom(i);
          r.removeRandom(i);
        });
        return 'Something important is gone. The game still runs. Mostly.';
      },
    },
  ],
});

defEvent({
  id: 'circus', acts: [2], title: 'Traveling Circus',
  intro: 'The circus is in town. I am also the circus.',
  options: [
    {
      label: 'Join the act',
      text: 'Each of you adds a Show-Off to your deck.',
      run(r) {
        r.each((_, i) => r.addCard(i, 'show-off'));
        return 'You are a natural. Everyone claps, which is also me.';
      },
    },
    {
      label: 'Watch the show',
      text: 'Each of you gains 6 teeth.',
      run(r) {
        r.each((_, i) => r.teeth(i, 6));
        return 'They pay you to watch. It is that kind of circus.';
      },
    },
  ],
});
