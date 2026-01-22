import {
  suits,
  defaultMultipliers,
  suitCodes,
  suitLookupByCode,
  defaultAutoDrawIntervalSeconds
} from './constants.js';
import { resolveTheme } from './theme.js';

const CARD_SEPARATOR = '.';
const MULTIPLIER_SEPARATOR = '.';
const MULTIPLIER_PAIR_SEPARATOR = '-';
const ROOM_PARAM = 'room';

let lastSerialized = null;

function normalizeRoomCode(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function resolveRoomCode(params) {
  const searchParams = params instanceof URLSearchParams
    ? params
    : new URLSearchParams(params ?? '');
  return normalizeRoomCode(searchParams.get(ROOM_PARAM));
}

function resolveRoomCodeFromLocation() {
  return resolveRoomCode(new URLSearchParams(window.location.search));
}

function formatMinutesFromSeconds(seconds) {
  if (!Number.isFinite(seconds)) {
    return null;
  }

  const minutes = seconds / 60;
  const rounded = Math.round(minutes * 100) / 100;
  return Number(rounded.toFixed(2)).toString();
}

function resolveIntervalSecondsFromParams(params) {
  const secondsParam = params.get('autoIntervalSeconds');
  if (secondsParam !== null) {
    const parsedSeconds = Number.parseInt(secondsParam, 10);
    if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
      return parsedSeconds;
    }
  }

  const legacyParam = params.get('autoInterval');
  if (legacyParam !== null) {
    const numeric = Number.parseFloat(legacyParam);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.max(1, Math.round(numeric * 60));
    }
  }

  return defaultAutoDrawIntervalSeconds;
}

function resolveRemainingSecondsFromParams(params) {
  const remainingParam = params.get('autoRemainingSeconds');
  if (remainingParam === null) {
    return null;
  }
  const parsed = Number.parseInt(remainingParam, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

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
  if (number < 1 || number > 13) {
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

export function serializeState(state, { autoDrawRemainingSeconds, roomCode } = {}) {
  const params = new URLSearchParams();
  const resolvedRoom = normalizeRoomCode(roomCode);
  if (resolvedRoom) {
    params.set(ROOM_PARAM, resolvedRoom);
  }
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

  const remainingSeconds = Number.parseInt(autoDrawRemainingSeconds, 10);
  if (
    state?.started &&
    state?.configuration?.autoDraw?.enabled &&
    Number.isFinite(remainingSeconds) &&
    remainingSeconds > 0
  ) {
    params.set('autoRemainingSeconds', String(remainingSeconds));
  }

  const autoIntervalSeconds = Number.parseInt(state?.configuration?.autoDraw?.intervalSeconds, 10);
  if (Number.isFinite(autoIntervalSeconds) && autoIntervalSeconds > 0) {
    params.set('autoIntervalSeconds', String(autoIntervalSeconds));
    const minutesValue = formatMinutesFromSeconds(autoIntervalSeconds);
    if (minutesValue) {
      params.set('autoInterval', minutesValue);
    }
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

  const autoDrawRemainingSeconds = resolveRemainingSecondsFromParams(params);
  const configuration = {
    theme: params.get('theme'),
    endless: params.get('endless') === '1',
    multipliers: decodeMultipliers(params.get('multipliers')) ?? defaultMultipliers,
    autoDraw: {
      enabled: params.get('auto') === '1',
      intervalSeconds: resolveIntervalSecondsFromParams(params)
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
    lastDrawn,
    autoDrawRemainingSeconds
  };
}

export function persistState(state) {
  const params = serializeState(state, { roomCode: resolveRoomCodeFromLocation() });
  const search = params.toString();
  if (search === lastSerialized && search === window.location.search.slice(1)) {
    return;
  }

  const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
  history.pushState(null, '', url);
  lastSerialized = search;
}

export function replaceStateWithAutoDrawRemaining(state, remainingSeconds) {
  const params = serializeState(state, {
    autoDrawRemainingSeconds: remainingSeconds,
    roomCode: resolveRoomCodeFromLocation()
  });
  const search = params.toString();
  if (search === window.location.search.slice(1)) {
    return;
  }
  const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
  history.replaceState(null, '', url);
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
