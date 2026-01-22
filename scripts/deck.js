import {
  challengeCards,
  defaultChallengeCounts,
  exercises,
  suitSymbols,
  suits,
  defaultMultipliers
} from './constants.js';

const challengeLookup = new Map(challengeCards.map(card => [card.id, card]));

export function buildDeck({ includeChallengeCards = false, challengeCounts } = {}) {
  const cards = [];
  for (const suit of suits) {
    for (let number = 1; number <= 13; number += 1) {
      cards.push({ suit, number });
    }
  }
  if (includeChallengeCards) {
    challengeCards.forEach(card => {
      const count = Number.parseInt(challengeCounts?.[card.id], 10);
      const fallback = defaultChallengeCounts[card.id] ?? 0;
      const copies = Number.isFinite(count) && count >= 0 ? count : fallback;
      for (let i = 0; i < copies; i += 1) {
        cards.push({ type: 'challenge', id: card.id });
      }
    });
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
    if (card?.type === 'challenge') {
      return;
    }
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

export function countStandardCards(cards) {
  if (!Array.isArray(cards)) {
    return 0;
  }
  return cards.filter(card => card?.type !== 'challenge').length;
}

export function applyChallengeEffects(totals, cards) {
  const adjustedTotals = { ...totals };
  let multiplier = 1;
  let bonusPerExercise = 0;
  let extraSprints = 0;
  const notes = [];

  cards.forEach(card => {
    if (card?.type !== 'challenge') {
      return;
    }
    const definition = challengeLookup.get(card.id);
    if (!definition) {
      return;
    }
    notes.push(definition.description);
    const effect = definition.effect ?? {};
    switch (effect.type) {
      case 'multiplier':
        multiplier *= Number(effect.value) || 1;
        break;
      case 'bonus':
        bonusPerExercise += Number(effect.value) || 0;
        break;
      case 'sprint':
        extraSprints += Number(effect.value) || 0;
        break;
      default:
        break;
    }
  });

  if (bonusPerExercise > 0) {
    Object.keys(adjustedTotals).forEach(exercise => {
      if (adjustedTotals[exercise] > 0) {
        adjustedTotals[exercise] += bonusPerExercise;
      }
    });
  }

  if (multiplier !== 1) {
    Object.keys(adjustedTotals).forEach(exercise => {
      adjustedTotals[exercise] *= multiplier;
    });
  }

  return {
    totals: adjustedTotals,
    extraSprints,
    notes
  };
}

export function createCardElement(card) {
  const cardElement = document.createElement('div');
  if (card?.type === 'challenge') {
    const definition = challengeLookup.get(card.id);
    cardElement.className = 'card challenge';
    const title = definition?.name ?? 'Challenge';
    cardElement.innerHTML = `<span class="challenge-title">Challenge</span><span class="challenge-name">${title}</span>`;
    return cardElement;
  }

  cardElement.className = 'card';
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const classes = isRed ? 'red' : '';
  const value = getCardDisplayValue(card.number);
  cardElement.innerHTML = `<span class="${classes}">${value} ${suitSymbols[card.suit]}</span>`;
  return cardElement;
}
