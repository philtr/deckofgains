import { exercises, suitSymbols, suits, defaultMultipliers } from './constants.js';

export function buildDeck() {
  const cards = [];
  for (const suit of suits) {
    for (let number = 1; number <= 13; number += 1) {
      cards.push({ suit, number });
    }
  }
  return cards;
}

export function getCardDisplayValue(number) {
  switch (number) {
    case 1:
      return 'A';
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    default:
      return number;
  }
}

export function getCardValue(number) {
  if (number >= 11) {
    return 10;
  }
  if (number === 1) {
    return 11;
  }
  return number;
}

export function calculateTotals(cards, configuration) {
  const totals = Object.values(exercises).reduce((acc, name) => {
    acc[name] = 0;
    return acc;
  }, {});

  cards.forEach(card => {
    const exercise = exercises[card.suit];
    if (!exercise) {
      return;
    }
    const multiplierSource = configuration?.multipliers ?? {};
    const multiplier = Number.isFinite(multiplierSource[card.suit])
      ? multiplierSource[card.suit]
      : defaultMultipliers[card.suit] ?? 1;
    const baseValue = getCardValue(card.number);
    totals[exercise] += baseValue * multiplier;
  });

  return totals;
}

export function createCardElement(card) {
  const cardElement = document.createElement('div');
  cardElement.className = 'card';
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const classes = isRed ? 'red' : '';
  const value = getCardDisplayValue(card.number);
  cardElement.innerHTML = `<span class="${classes}">${value} ${suitSymbols[card.suit]}</span>`;
  return cardElement;
}
