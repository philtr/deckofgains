export { exercises, suits, defaultMultipliers, totalRounds } from "./game.mjs";
import { suits } from "./game.mjs";

export const suitSymbols = {
  hearts: "♥️",
  spades: "♠️",
  diamonds: "♦️",
  clubs: "♣️",
};

export const suitCodes = {
  hearts: "h",
  spades: "s",
  diamonds: "d",
  clubs: "c",
};

export const suitLookupByCode = Object.freeze(
  Object.fromEntries(
    Object.entries(suitCodes).map(([suit, code]) => [code, suit]),
  ),
);

export const defaultTheme = "casino";

export const supportedThemes = new Set([defaultTheme, "plain", "rugged"]);

export const defaultAutoDrawIntervalSeconds = 150;

export const presentationModes = ["three", "classic"];
export const defaultPresentation = "three";
export const tabletopThemes = {
  casino: {
    fullscreenBackground: "#0b2b22",
    surface: "#154e3e",
    grain: "#25705a",
    back: "#193c65",
    ink: "#c9ad6d",
    light: "#ffedd1",
    roughness: 0.95,
  },
  plain: {
    fullscreenBackground: "#eeeae4",
    surface: "#e5e1d8",
    grain: "#d4cfc2",
    back: "#49596a",
    ink: "#e6e8eb",
    light: "#ffffff",
    roughness: 1,
  },
  rugged: {
    fullscreenBackground: "#0c1118",
    surface: "#414b56",
    grain: "#0b0e12",
    back: "#111820",
    ink: "#e2e6e8",
    light: "#ffc794",
    roughness: 0.72,
  },
};
