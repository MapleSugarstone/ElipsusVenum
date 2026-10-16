import { defEvent } from '../run/events.ts';
import { card as cardDef } from '../engine/registry.ts';

defEvent({
  id: 'tutorial-sign', acts: [1], title: 'A Helpful Sign',
  intro: 'I put up a sign that explains the rules. Some of it is right.',
  options: [
    {
      label: 'Read it carefully',
      text: 'Each of you upgrades a random card.',
      run(r) {
        r.each((_, i) => r.upgradeRandom(i));
        return 'You learn a few things. Not the things on the sign.';
      },
    },
    {
      label: 'Ignore it',
      text: 'Each of you gains 4 teeth.',
      run(r) {
        r.each((_, i) => r.teeth(i, 4));
        return 'He looks hurt, then hands you some teeth to make it up to you.';
      },
    },
  ],
});

defEvent({
  id: 'merchant-break', acts: [2], title: 'Merchant on Break',
  intro: 'The merchant is on break. I did not make a second merchant. You can probably just take things.',
  options: [
    {
      label: 'Take something small',
      text: 'Each of you gains a random item.',
      run(r) {
        r.each((_, i) => r.item(i));
        return 'Nobody notices.';
      },
    },
    {
      label: 'Leave teeth and take something nice',
      text: 'Each of you who has 6 teeth pays them and gains a random relic.',
      ok: (r) => r.seat(0).teeth >= 6 || r.seat(1).teeth >= 6,
      run(r) {
        r.each((s, i) => {
          if (s.teeth < 6) return;
          r.teeth(i, -6);
          r.relic(i, 'uncommon');
        });
        return 'You leave the teeth on the counter in a neat row.';
      },
    },
  ],
});

defEvent({
  id: 'mirror', acts: [2, 3], title: 'A Mirror',
  intro: 'A magic mirror. It copies things. I copied it from somewhere.',
  options: [
    {
      label: 'Hold up a card',
      text: 'Each of you adds a copy of a random card from your deck.',
      run(r) {
        r.each((s, i) => {
          const pool = s.deck.filter((c) => cardDef(c.id).pool !== 'curse');
          if (pool.length) {
            const pick = pool[r.rand(pool.length)];
            r.addCard(i, pick.id, !!pick.up);
          }
        });
        return 'The copies come out warm.';
      },
    },
    {
      label: 'Smash it',
      text: 'Each of you gains 5 teeth and a Bug.',
      run(r) {
        r.each((_, i) => {
          r.teeth(i, 5);
          r.addCard(i, 'bug');
        });
        return 'Seven years of bad luck. He says that is not a rule here. He is not sure.';
      },
    },
  ],
});

defEvent({
  id: 'unfinished-room', acts: [3], title: 'The Unfinished Room',
  intro: 'This room has no floor yet. I was going to add one. You can still go through.',
  options: [
    {
      label: 'Step through',
      text: 'Each of you removes a random Jab or Brace and loses 3 teeth.',
      run(r) {
        r.each((s, i) => {
          const basic = s.deck.filter((c) => c.id === 'jab' || c.id === 'brace');
          if (basic.length) r.removeCard(i, basic[r.rand(basic.length)].d);
          r.teeth(i, -Math.min(3, s.teeth));
        });
        return 'Some things fall through. You do not.';
      },
    },
    {
      label: 'Walk around',
      text: 'Each of you upgrades a random creature.',
      run(r) {
        r.each((_, i) => r.upgradeRandom(i, 'creature'));
        return 'It takes a while. You practice on the way.';
      },
    },
  ],
});

defEvent({
  id: 'present', acts: [3], title: 'A Present',
  intro: 'I got you two a present. I wrapped it myself. Do not shake it.',
  options: [
    {
      label: 'Open it',
      text: 'Each of you adds a random rare card and a Bug to your deck.',
      run(r) {
        r.each((_, i) => {
          r.addCard(i, r.randomCard(i, 'rare'));
          r.addCard(i, 'bug');
        });
        return 'It was two presents. One of them was a bug. He says that was on purpose.';
      },
    },
    {
      label: 'Say thank you and keep it closed',
      text: 'Each living player relights a candle, up to 2.',
      run(r) {
        r.each((s, i) => {
          if (s.alive && s.candles < 2) r.candle(i, 1);
        });
        return 'He is so happy you liked it.';
      },
    },
  ],
});

defEvent({
  id: 'campfire-story', acts: [1, 2], title: 'Campfire Story',
  intro: 'Sit down. I wrote a story about this world. It is long. It gets good later.',
  options: [
    {
      label: 'Listen to the whole thing',
      text: 'Each of you gives a random creature in your deck 4 health for the rest of the run.',
      run(r) {
        r.each((s) => {
          const pool = s.deck.filter((c) => cardDef(c.id).kind === 'creature');
          if (!pool.length) return;
          const pick = pool[r.rand(pool.length)];
          pick.dh = (pick.dh ?? 0) + 4;
        });
        return 'It does get good later. Your creatures sit closer to the fire.';
      },
    },
    {
      label: 'Fall asleep',
      text: 'Each living player relights a candle, up to 2.',
      run(r) {
        r.each((s, i) => {
          if (s.alive && s.candles < 2) r.candle(i, 1);
        });
        return 'You wake up rested. He is still talking.';
      },
    },
  ],
});
