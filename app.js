import {
  initializeApp,
  startWorkout,
  drawCards,
  doDrawCards,
  initializeDeck,
  updateRoundTitle
} from './scripts/appController.js';
import { getCardDisplayValue, getCardValue } from './scripts/deck.js';

window.initializeApp = initializeApp;
window.startWorkout = startWorkout;
window.drawCards = drawCards;
window.doDrawCards = doDrawCards;
window.initializeDeck = initializeDeck;
window.updateRoundTitle = updateRoundTitle;
window.getCardDisplayValue = getCardDisplayValue;
window.getCardValue = getCardValue;
