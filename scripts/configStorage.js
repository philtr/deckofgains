import { normalizeConfiguration } from './configuration.js';

const STORAGE_KEY = 'deckOfGains:configuration';

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
