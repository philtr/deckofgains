import {
  suits,
  defaultMultipliers,
  suitCodes,
  suitLookupByCode,
  defaultAutoDrawIntervalMinutes
} from './constants.js';
import { resolveTheme } from './theme.js';

const CARD_SEPARATOR = '.';
const MULTIPLIER_SEPARATOR = '.';
const MULTIPLIER_PAIR_SEPARATOR = '-';

let lastSerialized = null;

function encodeSuit(suit) {
  return suitCodes[suit] ?? suit;
}

function decodeSuit(token) {
  if (!token) {
    return null;
  }
  if (suitLookupByCode[token]) {
    return suitLookupByCode[token];
  }
  if (suits.includes(token)) {
    return token;
  }
  return null;
}

function encodeCard(card) {
  if (!card || !card.suit) {
    return null;
  }
  if (!suits.includes(card.suit)) {
    return null;
  }
  return `${encodeSuit(card.suit)}-${card.number}`;
}

function decodeCard(token) {
  if (!token) {
    return null;
  }
  const [rawSuit, rawNumber] = token.split('-');
  const number = Number.parseInt(rawNumber, 10);
  const suit = decodeSuit(rawSuit);
  if (!suit || !Number.isFinite(number)) {
    return null;
  }
  return { suit, number };
}

function encodeCardList(cards) {
  if (!cards || cards.length === 0) {
    return '';
  }
  return cards
    .map(encodeCard)
    .filter(Boolean)
    .join(CARD_SEPARATOR);
}

function decodeCardList(serialized) {
  if (serialized == null) {
    return [];
  }
  if (serialized === '') {
    return [];
  }
  return serialized
    .split(CARD_SEPARATOR)
    .map(decodeCard)
    .filter(Boolean);
}

function encodeMultipliers(multipliers = {}) {
  return suits
    .map(suit => {
      const value = Number.parseInt(multipliers[suit], 10);
      const fallback = defaultMultipliers[suit];
      const numeric = Number.isFinite(value) ? value : fallback;
      return `${encodeSuit(suit)}${MULTIPLIER_PAIR_SEPARATOR}${numeric}`;
    })
    .join(MULTIPLIER_SEPARATOR);
}

function decodeMultipliers(serialized) {
  if (!serialized) {
    return null;
  }

  return serialized.split(MULTIPLIER_SEPARATOR).reduce((acc, part) => {
    const [rawSuit, rawValue] = part.split(MULTIPLIER_PAIR_SEPARATOR);
    const suit = decodeSuit(rawSuit);
    if (!suit) {
      return acc;
    }
    const numeric = Number.parseInt(rawValue, 10);
    if (Number.isFinite(numeric)) {
      acc[suit] = numeric;
    }
    return acc;
  }, {});
}

export function serializeState(state) {
  const params = new URLSearchParams();
  const theme = resolveTheme(state?.configuration?.theme);
  if (theme) {
    params.set('theme', theme);
  }
  if (state?.configuration?.endless) {
    params.set('endless', '1');
  }

  if (state?.configuration?.autoDraw?.enabled) {
    params.set('auto', '1');
  }

  const autoInterval = Number.parseFloat(state?.configuration?.autoDraw?.intervalMinutes);
  if (Number.isFinite(autoInterval) && autoInterval > 0) {
    params.set('autoInterval', String(autoInterval));
  }

  const multipliers = encodeMultipliers(state?.configuration?.multipliers ?? defaultMultipliers);
  params.set('multipliers', multipliers);

  if (state?.started) {
    params.set('started', '1');
    params.set('round', String(state.roundNumber ?? 1));
    params.set('completed', state.roundCompleted ? '1' : '0');
    params.set('deck', encodeCardList(state.deck));
    params.set('draw', encodeCardList(state.lastDrawn));
  }

  return params;
}

export function deserializeState(searchParams) {
  const params = searchParams instanceof URLSearchParams
    ? searchParams
    : new URLSearchParams(searchParams ?? '');

  const configuration = {
    theme: params.get('theme'),
    endless: params.get('endless') === '1',
    multipliers: decodeMultipliers(params.get('multipliers')) ?? defaultMultipliers,
    autoDraw: {
      enabled: params.get('auto') === '1',
      intervalMinutes: (() => {
        const numeric = Number.parseFloat(params.get('autoInterval'));
        return Number.isFinite(numeric) && numeric > 0 ? numeric : defaultAutoDrawIntervalMinutes;
      })()
    }
  };

  const started = params.get('started') === '1';
  const round = Number.parseInt(params.get('round'), 10);
  const roundNumber = Number.isFinite(round) && round > 0 ? round : 1;
  const roundCompleted = params.get('completed') === '1';
  const deck = decodeCardList(params.get('deck'));
  const lastDrawn = decodeCardList(params.get('draw'));

  return {
    configuration,
    started,
    roundNumber,
    roundCompleted,
    deck,
    lastDrawn
  };
}

export function persistState(state) {
  const params = serializeState(state);
  const search = params.toString();
  if (search === lastSerialized && search === window.location.search.slice(1)) {
    return;
  }

  const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
  history.pushState(null, '', url);
  lastSerialized = search;
}

export function setInitialSerialized(value) {
  lastSerialized = value ?? null;
}

export function subscribeToPopState(callback) {
  window.addEventListener('popstate', () => {
    const restored = deserializeState(new URLSearchParams(window.location.search));
    callback(restored);
  });
}
