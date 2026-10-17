// Pure game rules: no browser, timers, networking, or presentation dependencies.
export const exercises = {
  hearts: "Jumping Jacks",
  spades: "Squats",
  diamonds: "Pushups",
  clubs: "Abs",
};
export const suits = ["hearts", "spades", "diamonds", "clubs"];
export const defaultMultipliers = {
  hearts: 1,
  spades: 1,
  diamonds: 1,
  clubs: 2,
};
export const totalRounds = 12;

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
      return "A";
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
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

  cards.forEach((card) => {
    const exercise = exercises[card.suit];
    if (!exercise) {
      return;
    }
    const multiplierSource = configuration?.multipliers ?? {};
    const multiplier = Number.isFinite(multiplierSource[card.suit])
      ? multiplierSource[card.suit]
      : (defaultMultipliers[card.suit] ?? 1);
    const baseValue = getCardValue(card.number);
    totals[exercise] += baseValue * multiplier;
  });

  return totals;
}

export function transition(state, command, { random } = {}) {
  switch (command.type) {
    case "CONFIGURE":
      return {
        state: {
          ...state,
          configuration: {
            endless:
              command.configuration?.endless ?? state.configuration.endless,
            multipliers: {
              ...state.configuration?.multipliers,
              ...command.configuration?.multipliers,
            },
          },
        },
        events: [],
      };
    case "START":
    case "RESET":
      return {
        state: {
          configuration: state.configuration,
          deck: buildDeck(),
          roundNumber: 1,
          roundCompleted: false,
          started: command.type === "START",
          lastDrawn: [],
        },
        events: [],
      };
    case "DRAW": {
      if (
        !state.started ||
        (!state.configuration.endless && !state.deck.length)
      ) {
        return { state, events: [] };
      }
      if (typeof random !== "function")
        throw new TypeError("Drawing requires an injected random source");
      const deck = (state.deck.length ? state.deck : buildDeck()).map(
        (card) => ({ ...card }),
      );
      const count = state.configuration.endless
        ? Math.min(4, deck.length)
        : deck.length <= 8
          ? deck.length
          : 4;
      const cards = [];
      for (let i = 0; i < count; i++) {
        const value = random();
        if (!Number.isFinite(value) || value < 0 || value >= 1)
          throw new RangeError("Random values must be in [0, 1)");
        cards.push(...deck.splice(Math.floor(value * deck.length), 1));
      }
      const next = {
        ...state,
        deck,
        lastDrawn: cards,
        roundNumber: state.roundNumber + 1,
        roundCompleted: true,
      };
      const events = [{ type: "HAND_DRAWN", cards }];
      if (!state.configuration.endless && !deck.length)
        events.push({ type: "WORKOUT_COMPLETED" });
      return { state: next, events };
    }
    default:
      throw new TypeError(`Unknown workout command: ${command.type}`);
  }
}

export function selectWorkoutView(state) {
  const activeRound = state.roundCompleted
    ? Math.max(1, state.roundNumber - 1)
    : state.roundNumber;
  const complete =
    state.started && !state.configuration.endless && state.deck.length === 0;
  return {
    started: state.started,
    cards: state.lastDrawn,
    remainingCards: state.deck.length,
    discardedCards: state.started
      ? Math.max(0, 52 - state.deck.length - state.lastDrawn.length)
      : 0,
    totals: calculateTotals(state.lastDrawn, state.configuration),
    roundLabel: state.configuration.endless
      ? `Round ${activeRound}`
      : `Round ${activeRound} of ${totalRounds}`,
    canDraw: state.started && !complete,
    complete,
    instructions:
      complete && state.lastDrawn.length
        ? "Complete 2 sprints of 50 yards each."
        : "",
  };
}

// URL and room adapters share the same card validation at the state boundary.
export function normalizeCards(candidate) {
  return Array.isArray(candidate)
    ? candidate
        .filter(
          (card) =>
            card &&
            suits.includes(card.suit) &&
            Number.isInteger(Number(card.number)) &&
            Number(card.number) >= 1 &&
            Number(card.number) <= 13,
        )
        .map((card) => ({ suit: card.suit, number: Number(card.number) }))
    : [];
}
