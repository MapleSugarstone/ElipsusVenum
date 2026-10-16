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
    {
      label: 'Leave it',
      text: 'Each of you gains the Coin Return, a relic.',
      run(r) {
        r.each((_, i) => r.giveRelic(i, 'coin-return'));
        return 'It hums at you as you go. Something rattles in the coin return. It follows you.';
      },
    },
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
    {
      label: 'Play with your own die',
      secret: true,
      text: 'Each of you gains 12 teeth.',
      ok: (r) => r.anyRelic('loaded-die'),
      run(r) {
        r.each((_, i) => r.teeth(i, 12));
        return 'The die comes up the same way every time. The shark pays and leaves without his fin.';
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
    {
      label: 'Return the overdue book',
      secret: true,
      text: 'Each Overdue Library Book breaks. Each of you adds 2 random rare cards to your deck.',
      ok: (r) => r.anyRelic('overdue-book'),
      run(r) {
        r.each((_, i) => {
          r.loseRelic(i, 'overdue-book');
          r.addCard(i, r.randomCard(i, 'rare'));
          r.addCard(i, r.randomCard(i, 'rare'));
        });
        return 'There is no fine. He just wanted it back. He gives you two more to borrow forever.';
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
    {
      label: 'Let it follow you',
      text: 'Each of you gains the Dog Whistle, a relic.',
      run(r) {
        r.each((_, i) => r.giveRelic(i, 'dog-whistle'));
        return 'It follows you at a distance. When you whistle, it brings friends.';
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
    {
      label: 'Bury the Unused Respawn',
      secret: true,
      text: 'Each Unused Respawn breaks. Each of you gains a random rare relic.',
      ok: (r) => r.anyRelic('unused-respawn'),
      run(r) {
        r.each((_, i) => {
          r.loseRelic(i, 'unused-respawn');
          r.relic(i, 'rare');
        });
        return 'You give the respawn back to the people it was for. Something under the dirt says thank you.';
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
    {
      label: 'Tell him how his story ends',
      secret: true,
      text: 'Each of you gains a random boss relic.',
      ok: (r) => r.flagged('heard-story'),
      run(r) {
        r.each((_, i) => r.relic(i, 'boss'));
        return 'You listened to the whole campfire story, so you know the ending he never wrote. He writes it down. It is good.';
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
    {
      label: 'Enter the dog in the show',
      secret: true,
      text: 'Each of you gains 10 teeth and upgrades a random creature.',
      ok: (r) => r.anyRelic('dog-whistle'),
      run(r) {
        r.each((_, i) => {
          r.teeth(i, 10);
          r.upgradeRandom(i, 'creature');
        });
        return 'The dog jumps through every hoop. Some of the hoops were not there before.';
      },
    },
  ],
});

defEvent({
  id: 'lost-and-found', acts: [1, 2, 3], title: 'Lost and Found',
  intro: 'This is the lost and found. Everything in it is something I lost. You can take one thing. Or you can be good.',
  options: [
    {
      label: 'Keep something',
      text: 'Each of you gains a random common relic.',
      run(r) {
        r.each((_, i) => r.relic(i, 'common'));
        return 'Finders keepers. He wrote that rule too.';
      },
    },
    {
      label: 'Turn everything in',
      text: 'Each of you gains the Honest Badge, a relic.',
      run(r) {
        r.each((_, i) => r.giveRelic(i, 'honest-badge'));
        return 'He pins a badge on each of you. He drew it himself. Shopkeepers will believe it.';
      },
    },
  ],
});
