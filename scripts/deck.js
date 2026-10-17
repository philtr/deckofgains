import { suitSymbols } from "./constants.js";
import { getCardDisplayValue } from "./game.mjs";
export {
  buildDeck,
  calculateTotals,
  getCardDisplayValue,
  getCardValue,
} from "./game.mjs";

export function createCardElement(card) {
  const cardElement = document.createElement("div");
  cardElement.className = "card";
  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const classes = isRed ? "red" : "";
  const value = getCardDisplayValue(card.number);
  cardElement.innerHTML = `<span class="${classes}">${value}&nbsp;${suitSymbols[card.suit]}</span>`;
  return cardElement;
}
