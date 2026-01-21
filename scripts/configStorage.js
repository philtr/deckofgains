import {
  defaultAutoDrawIntervalSeconds,
  defaultMultipliers,
  suits
} from './constants.js';
import { resolveTheme } from './theme.js';

const STORAGE_KEY = 'deckOfGains:configuration';

function normalizeMultipliers(candidate = {}) {
  return suits.reduce((acc, suit) => {
    const value = Number.parseInt(candidate[suit], 10);
    acc[suit] = Number.isFinite(value) ? value : defaultMultipliers[suit];
    return acc;
  }, {});
}

function normalizeAutoDraw(candidate = {}) {
  const enabled = Boolean(candidate?.enabled);
  const intervalCandidate = Number.parseInt(candidate?.intervalSeconds, 10);
  const intervalSeconds = Number.isFinite(intervalCandidate) && intervalCandidate > 0
    ? intervalCandidate
    : defaultAutoDrawIntervalSeconds;

  return { enabled, intervalSeconds };
}

function normalizeConfiguration(candidate = {}) {
  return {
    multipliers: normalizeMultipliers(candidate?.multipliers),
    theme: resolveTheme(candidate?.theme),
    endless: Boolean(candidate?.endless),
    autoDraw: normalizeAutoDraw(candidate?.autoDraw)
  };
}

export function loadStoredConfiguration() {
  if (!window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return normalizeConfiguration(parsed);
  } catch (error) {
    return null;
  }
}

export function storeConfiguration(configuration) {
  if (!window.localStorage) {
    return;
  }

  try {
    const normalized = normalizeConfiguration(configuration);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // Ignore storage write errors (e.g. storage full or blocked).
  }
}
