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

export const defaultTheme = 'casino';

export const supportedThemes = new Set([defaultTheme, 'rugged']);

export const totalRounds = 12;
