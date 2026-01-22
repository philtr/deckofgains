export const exercises = {
  hearts: 'Jumping Jacks',
  spades: 'Squats',
  diamonds: 'Pushups',
  clubs: 'Abs'
};

export const suitSymbols = {
  hearts: '♥️',
  spades: '♠️',
  diamonds: '♦️',
  clubs: '♣️'
};

export const suits = ['hearts', 'spades', 'diamonds', 'clubs'];

export const suitCodes = {
  hearts: 'h',
  spades: 's',
  diamonds: 'd',
  clubs: 'c'
};

export const suitLookupByCode = Object.freeze(
  Object.fromEntries(Object.entries(suitCodes).map(([suit, code]) => [code, suit]))
);

export const defaultMultipliers = {
  hearts: 1,
  spades: 1,
  diamonds: 1,
  clubs: 2
};

export const challengeCards = [
  {
    id: 'double',
    name: 'Double Down',
    description: 'Double all reps this round.',
    effect: { type: 'multiplier', value: 2 }
  },
  {
    id: 'boost',
    name: 'Iron Boost',
    description: 'Add 5 reps to every active exercise.',
    effect: { type: 'bonus', value: 5 }
  },
  {
    id: 'sprint',
    name: 'Sprint Surge',
    description: 'Add one extra 50 yard sprint.',
    effect: { type: 'sprint', value: 1 }
  }
];

export const defaultIncludeChallengeCards = false;
export const defaultChallengeCounts = Object.freeze({
  double: 1,
  boost: 1,
  sprint: 1
});

export const defaultTheme = 'casino';

export const supportedThemes = new Set([defaultTheme, 'plain', 'rugged']);

export const totalRounds = 12;

export const defaultAutoDrawIntervalSeconds = 150;
