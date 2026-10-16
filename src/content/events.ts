import { defEvent } from '../run/events.ts';
import { card as cardDef } from '../engine/registry.ts';

defEvent({
  id: 'unfinished-bridge', acts: [1, 2, 3], title: 'Unfinished Bridge',
  intro: 'This is a bridge. I have not drawn the middle yet. Just walk across the part where it would be.',
  options: [
    {
      label: 'Walk across',
      text: 'Each of you gains 8 teeth. A random living player loses a candle.',
      run(r) {
        r.each((_, i) => r.teeth(i, 8));
        const alive = r.living();
        if (alive.length) r.candle(alive[r.rand(alive.length)], -1);
        return 'It held. Mostly.';
      },
    },
    {
      label: 'Wait for him to finish it',
      text: 'Each of you upgrades a random card.',
      run(r) {
        r.each((_, i) => r.upgradeRandom(i));
        return 'He finished it. It looks worse, but you had time to practice.';
      },
    },
  ],
});

defEvent({
  id: 'free-sample', acts: [1, 2], title: 'Free Sample',
  intro: 'Every good game has a free sample table. I read that somewhere. Take one each.',
  options: [
    {
      label: 'Take one',
      text: 'Each of you adds a random uncommon card to your deck.',
      run(r) {
        r.each((_, i) => r.addCard(i, r.randomCard(i, 'uncommon')));
        return 'One each. Very polite.';
      },
    },
    {
      label: 'Take a handful',
      text: 'Each of you adds 2 random common cards and a Bug to your deck.',
      run(r) {
        r.each((_, i) => {
          r.addCard(i, r.randomCard(i, 'common'));
          r.addCard(i, r.randomCard(i, 'common'));
          r.addCard(i, 'bug');
        });
        return 'Some of the samples were not finished.';
      },
    },
  ],
});

defEvent({
  id: 'shrine', acts: [1, 2, 3], title: 'A Shrine',
  intro: 'A shrine. To whoever you like. I did not want to pick.',
  options: [
    {
      label: 'Leave an offering',
      text: 'Each of you pays 6 teeth if you can and adds a random rare card to your deck.',
      ok: (r) => r.seat(0).teeth >= 6 || r.seat(1).teeth >= 6,
      run(r) {
        r.each((s, i) => {
          if (s.teeth < 6) return;
          r.teeth(i, -6);
          r.addCard(i, r.randomCard(i, 'rare'));
        });
        return 'Something answered. It might have been the King. Blue is sure it was.';
      },
    },
    {
      label: 'Pray quietly',
      text: 'Each living player relights a candle, up to 2.',
      run(r) {
        r.each((s, i) => {
          if (s.alive && s.candles < 2) r.candle(i, 1);
        });
        return 'The wicks catch.';
      },
    },
  ],
});

defEvent({
  id: 'suspicious-chest', acts: [1, 2, 3], title: 'Suspicious Chest',
  intro: 'A treasure chest. Totally normal. It definitely has treasure in it and not teeth.',
  options: [
    {
      label: 'Open it',
      text: 'You fight the Mimic Hoard, a boss. It pays like an elite fight.',
      run(r) {
        r.fightBoss('mimic-hoard');
        return 'It was not a chest. None of them were chests.';
      },
    },
    {
      label: 'Kick it and run',
      text: 'Each of you gains 4 teeth.',
      run(r) {
        r.each((_, i) => r.teeth(i, 4));
        return 'It whimpers. Some teeth fall out.';
      },
    },
  ],
});

defEvent({
  id: 'respawn-point', acts: [1, 2, 3], title: 'Respawn Point', weight: 4,
  intro: 'I forgot to take this out. It was for testing. Please do not touch it.',
  options: [
    {
      label: 'Touch it',
      text: 'A dead player comes back with 1 candle. If nobody is dead, each living player relights a candle.',
      run(r) {
        let revived = false;
        r.each((s, i) => {
          if (!s.alive) revived = r.revive(i) || revived;
        });
        if (!revived) r.each((s, i) => s.alive && r.candle(i, 1));
        return revived ? 'Someone flickers back in. Doctor Pistachio says that is exactly how it works.' : 'It hums. Your candles burn brighter.';
      },
    },
    {
      label: 'Leave it alone',
      text: 'Nothing happens.',
      run() {
        return 'He looks relieved.';
      },
    },
  ],
});

defEvent({
  id: 'house-rule', acts: [1, 2, 3], title: 'New House Rule',
  intro: 'I have a new rule. Everyone gets something. No, wait, I mean everyone gets something different.',
  options: [
    {
      label: 'Accept the rule',
      text: 'Each of you gains a random item.',
      run(r) {
        r.each((_, i) => r.item(i));
        return 'He writes it on a napkin.';
      },
    },
    {
      label: 'Argue about it',
      text: 'Each of you gains 5 teeth.',
      run(r) {
        r.each((_, i) => r.teeth(i, 5));
        return 'He gives up and pays you to stop.';
      },
    },
  ],
});

defEvent({
  id: 'training-dummy', acts: [1, 2], title: 'Training Dummy',
  intro: 'This is the tutorial. You can hit it. It does not hit back. That was on purpose.',
  options: [
    {
      label: 'Practice with creatures',
      text: 'Each of you upgrades a random creature.',
      run(r) {
        r.each((_, i) => r.upgradeRandom(i, 'creature'));
        return 'The dummy loses an arm. He draws a new one on.';
      },
    },
    {
      label: 'Practice spells',
      text: 'Each of you upgrades a random spell.',
      run(r) {
        r.each((_, i) => r.upgradeRandom(i, 'spell'));
        return 'The dummy catches fire. He says that is fine.';
      },
    },
  ],
});

defEvent({
  id: 'the-pit', acts: [1, 2, 3], title: 'The Pit',
  intro: 'A pit. You can throw things in. I do not know where they go. I did not make the bottom.',
  options: [
    {
      label: 'Throw in your worst card',
      text: 'Each of you removes a Bug if you have one, otherwise a random starting Jab or Brace.',
      run(r) {
        r.each((s, i) => {
          const bug = s.deck.find((c) => cardDef(c.id).pool === 'curse');
          const basic = s.deck.find((c) => c.id === 'jab' || c.id === 'brace');
          const gone = bug ?? basic;
          if (gone) r.removeCard(i, gone.d);
        });
        return 'You hear them land eventually.';
      },
    },
    {
      label: 'Throw in teeth',
      text: 'Each of you loses up to 3 teeth and gains a random item.',
      run(r) {
        r.each((s, i) => {
          r.teeth(i, -Math.min(3, s.teeth));
          r.item(i);
        });
        return 'Something throws an item back out.';
      },
    },
  ],
});
