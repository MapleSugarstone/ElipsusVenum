/** Lines Your Best Friend says at the table. He is proud of his world, then unsure, then he moves on. */
export const DEALER = {
  battle: [
    'These are some enemies. I made them myself.',
    'Okay. Fight these. They are balanced, I think.',
    'I gave these ones more health this time. Or less. One of those.',
    'This fight has a theme. I forgot what it was.',
    'Watch out, this one is hard. Or it is the easy one. It is one of the fights.',
    'You two again. Good. I made more enemies.',
  ],
  elite: [
    'This is a hard one. I made it hard on purpose this time.',
    'An elite. That means it is better. I read that.',
    'Be careful. I put extra numbers on this one.',
  ],
  win: [
    'Fine. You win that one. The next one is harder.',
    'Huh. I thought that would last longer.',
    'Okay. That was supposed to happen. Probably.',
  ],
  candle: [
    'Oh, a candle went out. That is a rule. I think I made that rule.',
    'One candle down. Do not worry, I have more candles. You do not.',
  ],
  dead: [
    'Ah. One of you is out. You can still play. Sort of. As a ghost. I added ghosts.',
  ],
  coin: [
    'You two cannot agree. I will flip a coin. I made the coin too.',
    'Coin flip. Heads is that one. Tails is the other one.',
  ],
  map: [
    'Pick a path. They all go to the same place eventually. I think.',
    'Here is the map. I drew it.',
    'Choose together. Or do not. I have a coin.',
  ],
};

export function dealerLine(kind: keyof typeof DEALER, n: number): string {
  const list = DEALER[kind];
  return list[Math.abs(n) % list.length];
}
