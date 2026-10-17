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
    surface: "#154e3e",
    grain: "#25705a",
    back: "#193c65",
    ink: "#c9ad6d",
    light: "#ffedd1",
    roughness: 0.95,
  },
  plain: {
    surface: "#e5e1d8",
    grain: "#d4cfc2",
    back: "#49596a",
    ink: "#e6e8eb",
    light: "#ffffff",
    roughness: 1,
  },
  rugged: {
    surface: "#59402e",
    grain: "#0f0d0a",
    back: "#30231d",
    ink: "#bc9365",
    light: "#ffc17d",
    roughness: 1,
  },
};
