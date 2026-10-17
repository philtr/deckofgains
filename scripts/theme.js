import { readUrlState } from "./urlState.js";
import { defaultTheme, supportedThemes, tabletopThemes } from "./constants.js";

export function resolveTheme(themeCandidate) {
  const normalized = (themeCandidate ?? "").toLowerCase();
  return supportedThemes.has(normalized) ? normalized : defaultTheme;
}

export function deriveInitialTheme(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : searchParams == null
        ? readUrlState()
        : new URLSearchParams(searchParams);

  const themeParam = params.get("theme");
  if (themeParam) {
    const normalized = (themeParam ?? "").toLowerCase();
    if (supportedThemes.has(normalized)) {
      return normalized;
    }
  }

  if (params.get("rugged") === "true") {
    return "rugged";
  }

  return defaultTheme;
}

export function applyTheme(themeCandidate) {
  const theme = resolveTheme(themeCandidate);
  document.body.dataset.theme = theme;
  document.body.style.setProperty(
    "--fullscreen-background",
    tabletopThemes[theme].fullscreenBackground,
  );
  return theme;
}

export { tabletopThemes };
