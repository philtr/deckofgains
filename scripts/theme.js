import { defaultTheme, supportedThemes } from './constants.js';

export function resolveTheme(themeCandidate) {
  const normalized = (themeCandidate ?? '').toLowerCase();
  return supportedThemes.has(normalized) ? normalized : defaultTheme;
}

export function deriveInitialTheme(searchParams) {
  const params = searchParams instanceof URLSearchParams
    ? searchParams
    : new URLSearchParams(searchParams ?? window.location.search);

  const themeParam = params.get('theme');
  if (themeParam) {
    const normalized = (themeParam ?? '').toLowerCase();
    if (supportedThemes.has(normalized)) {
      return normalized;
    }
  }

  if (params.get('rugged') === 'true') {
    return 'rugged';
  }

  return defaultTheme;
}

export function applyTheme(themeCandidate) {
  const theme = resolveTheme(themeCandidate);
  document.body.dataset.theme = theme;
  return theme;
}
