import {
  defaultMultipliers,
  defaultTheme,
  defaultAutoDrawIntervalMinutes
} from './constants.js';

const state = {
  configuration: {
    multipliers: { ...defaultMultipliers },
    theme: defaultTheme,
    endless: false,
    autoDraw: {
      enabled: false,
      intervalMinutes: defaultAutoDrawIntervalMinutes
    }
  },
  deck: [],
  roundNumber: 1,
  roundCompleted: false,
  started: false,
  lastDrawn: []
};

const listeners = new Set();
let suppressionDepth = 0;
let pendingNotification = false;

function cloneCard(card) {
  return { suit: card.suit, number: Number(card.number) };
}

function cloneDeck(deck) {
  return Array.isArray(deck) ? deck.map(cloneCard) : [];
}

function normalizeMultipliers(candidate = {}) {
  return Object.keys(defaultMultipliers).reduce((acc, suit) => {
    const value = Number.parseInt(candidate[suit], 10);
    acc[suit] = Number.isFinite(value) ? value : defaultMultipliers[suit];
    return acc;
  }, {});
}

function sanitizeAutoDraw(partial = {}) {
  const previous = state.configuration.autoDraw ?? {
    enabled: false,
    intervalMinutes: defaultAutoDrawIntervalMinutes
  };

  const enabled = partial.enabled !== undefined ? Boolean(partial.enabled) : Boolean(previous.enabled);
  const rawInterval =
    partial.intervalMinutes !== undefined
      ? partial.intervalMinutes
      : previous.intervalMinutes ?? defaultAutoDrawIntervalMinutes;
  const numeric = Number.parseFloat(rawInterval);
  const intervalMinutes = Number.isFinite(numeric) && numeric > 0 ? numeric : defaultAutoDrawIntervalMinutes;

  return {
    enabled,
    intervalMinutes
  };
}

function sanitizeConfiguration(partial = {}) {
  const multipliers = partial.multipliers
    ? normalizeMultipliers({ ...state.configuration.multipliers, ...partial.multipliers })
    : { ...state.configuration.multipliers };

  const theme = partial.theme !== undefined ? partial.theme : state.configuration.theme;
  const endless = partial.endless !== undefined ? Boolean(partial.endless) : state.configuration.endless;
  const autoDraw =
    partial.autoDraw !== undefined
      ? sanitizeAutoDraw({ ...state.configuration.autoDraw, ...partial.autoDraw })
      : sanitizeAutoDraw(state.configuration.autoDraw);

  return {
    multipliers,
    theme: theme ?? defaultTheme,
    endless,
    autoDraw
  };
}

function notify() {
  if (suppressionDepth > 0) {
    pendingNotification = true;
    return;
  }

  const snapshot = getState();
  listeners.forEach(listener => listener(snapshot));
}

function flushPendingNotification() {
  if (pendingNotification && suppressionDepth === 0) {
    pendingNotification = false;
    const snapshot = getState();
    listeners.forEach(listener => listener(snapshot));
  }
}

export function suppressNotifications(callback) {
  suppressionDepth += 1;
  try {
    callback();
  } finally {
    suppressionDepth -= 1;
    flushPendingNotification();
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState() {
  return {
    configuration: {
      multipliers: { ...state.configuration.multipliers },
      theme: state.configuration.theme,
      endless: state.configuration.endless,
      autoDraw: { ...state.configuration.autoDraw }
    },
    deck: cloneDeck(state.deck),
    roundNumber: state.roundNumber,
    roundCompleted: state.roundCompleted,
    started: state.started,
    lastDrawn: cloneDeck(state.lastDrawn)
  };
}

export function updateConfiguration(partial) {
  state.configuration = sanitizeConfiguration(partial);
  notify();
}

export function setDeck(deck) {
  state.deck = cloneDeck(deck);
  notify();
}

export function setRoundNumber(value) {
  const numeric = Number.parseInt(value, 10);
  state.roundNumber = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  notify();
}

export function setRoundCompleted(value) {
  state.roundCompleted = Boolean(value);
  notify();
}

export function setStarted(value) {
  state.started = Boolean(value);
  notify();
}

export function setLastDrawn(cards) {
  state.lastDrawn = cloneDeck(cards);
  notify();
}

export function replaceState(snapshot, { silent = false } = {}) {
  const apply = () => {
    state.configuration = sanitizeConfiguration(snapshot?.configuration ?? {});
    state.deck = cloneDeck(snapshot?.deck);
    const round = Number.parseInt(snapshot?.roundNumber, 10);
    state.roundNumber = Number.isFinite(round) && round > 0 ? round : 1;
    state.roundCompleted = Boolean(snapshot?.roundCompleted);
    state.started = Boolean(snapshot?.started);
    state.lastDrawn = cloneDeck(snapshot?.lastDrawn);
  };

  if (silent) {
    suppressionDepth += 1;
    try {
      apply();
      pendingNotification = false;
    } finally {
      suppressionDepth -= 1;
    }
    return;
  }

  apply();
  notify();
}

export function bindStateToWindow(target = window) {
  const descriptorOptions = { configurable: true, enumerable: true };

  Object.defineProperties(target, {
    configuration: {
      ...descriptorOptions,
      get() {
        return state.configuration;
      },
      set(value) {
        if (value && typeof value === 'object') {
          updateConfiguration(value);
        }
      }
    },
    deck: {
      ...descriptorOptions,
      get() {
        return state.deck;
      },
      set(value) {
        setDeck(value);
      }
    },
    roundNumber: {
      ...descriptorOptions,
      get() {
        return state.roundNumber;
      },
      set(value) {
        setRoundNumber(value);
      }
    },
    roundCompleted: {
      ...descriptorOptions,
      get() {
        return state.roundCompleted;
      },
      set(value) {
        setRoundCompleted(value);
      }
    }
  });
}
