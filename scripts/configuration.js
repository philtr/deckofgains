import {
  defaultAutoDrawIntervalSeconds,
  defaultMultipliers,
  defaultTheme,
  suits,
} from "./constants.js";
import { resolveTheme } from "./theme.js";

const DEFAULT_AUTO_DRAW = Object.freeze({
  enabled: false,
  intervalSeconds: defaultAutoDrawIntervalSeconds,
});

function coerceIntervalSeconds(value, { isMinutes = false } = {}) {
  if (value == null) {
    return null;
  }

  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const seconds = isMinutes ? numeric * 60 : numeric;
  return Math.round(seconds);
}

export function normalizeMultipliers(
  candidate = {},
  fallback = defaultMultipliers,
) {
  return suits.reduce((acc, suit) => {
    const value = Number.parseInt(candidate[suit], 10);
    const fallbackValue = Number.parseInt(fallback?.[suit], 10);
    acc[suit] = Number.isFinite(value)
      ? value
      : Number.isFinite(fallbackValue)
        ? fallbackValue
        : defaultMultipliers[suit];
    return acc;
  }, {});
}

export function normalizeAutoDraw(
  candidate = {},
  fallback = DEFAULT_AUTO_DRAW,
) {
  const enabled =
    candidate?.enabled !== undefined
      ? Boolean(candidate.enabled)
      : Boolean(fallback?.enabled);
  const intervalSeconds =
    [
      coerceIntervalSeconds(candidate?.intervalSeconds),
      coerceIntervalSeconds(candidate?.intervalMinutes, { isMinutes: true }),
      coerceIntervalSeconds(fallback?.intervalSeconds),
      coerceIntervalSeconds(fallback?.intervalMinutes, { isMinutes: true }),
    ].find(
      (value) =>
        typeof value === "number" && Number.isFinite(value) && value > 0,
    ) ?? defaultAutoDrawIntervalSeconds;

  return {
    enabled,
    intervalSeconds,
  };
}

export function normalizeConfiguration(candidate = {}, fallback = {}) {
  return {
    multipliers: normalizeMultipliers(
      candidate?.multipliers,
      fallback?.multipliers,
    ),
    theme: resolveTheme(candidate?.theme ?? fallback?.theme ?? defaultTheme),
    endless:
      candidate?.endless !== undefined
        ? Boolean(candidate.endless)
        : Boolean(fallback?.endless),
    autoDraw: normalizeAutoDraw(candidate?.autoDraw, fallback?.autoDraw),
  };
}

export function mergeConfiguration(base = {}, partial = {}) {
  return normalizeConfiguration(
    {
      ...base,
      ...partial,
      multipliers: {
        ...(base?.multipliers ?? {}),
        ...(partial?.multipliers ?? {}),
      },
      autoDraw: {
        ...(base?.autoDraw ?? {}),
        ...(partial?.autoDraw ?? {}),
      },
    },
    base,
  );
}

export function serializeConfiguration(configuration) {
  return JSON.stringify(normalizeConfiguration(configuration));
}
