import { suits, defaultMultipliers, totalRounds } from './constants.js';
import { applyTheme, deriveInitialTheme, resolveTheme } from './theme.js';
import { buildDeck, calculateTotals, createCardElement } from './deck.js';
import {
  bindStateToWindow,
  getState,
  replaceState,
  setDeck,
  setLastDrawn,
  setRoundCompleted,
  setRoundNumber,
  setStarted,
  subscribe,
  suppressNotifications,
  updateConfiguration
} from './workoutState.js';
import {
  deserializeState,
  persistState,
  setInitialSerialized,
  subscribeToPopState
} from './persistence.js';

let configurationListenersInitialized = false;

function populateConfigurationForm(state) {
  const { configuration } = state;
  suits.forEach(suit => {
    const select = document.getElementById(`multiplier-${suit}`);
    if (select) {
      const value = configuration.multipliers[suit] ?? defaultMultipliers[suit];
      select.value = String(value);
    }
  });

  const themeInputs = document.querySelectorAll('input[name="theme"]');
  themeInputs.forEach(input => {
    input.checked = input.value === configuration.theme;
  });

  const endlessToggle = document.getElementById('endless-mode');
  if (endlessToggle) {
    endlessToggle.checked = Boolean(configuration.endless);
  }
}

function showConfigurationScreen() {
  const configurationScreen = document.getElementById('configuration-screen');
  const appContainer = document.getElementById('app');
  if (configurationScreen) {
    configurationScreen.style.display = 'flex';
  }
  if (appContainer) {
    appContainer.style.display = 'none';
  }
}

function showWorkoutScreen() {
  const configurationScreen = document.getElementById('configuration-screen');
  const appContainer = document.getElementById('app');
  if (configurationScreen) {
    configurationScreen.style.display = 'none';
  }
  if (appContainer) {
    appContainer.style.display = 'block';
  }
}

function ensureConfigurationListeners() {
  if (configurationListenersInitialized) {
    return;
  }

  suits.forEach(suit => {
    const select = document.getElementById(`multiplier-${suit}`);
    if (select) {
      select.addEventListener('change', event => {
        const value = Number.parseInt(event.target.value, 10);
        updateConfiguration({
          multipliers: {
            [suit]: Number.isFinite(value) ? value : defaultMultipliers[suit]
          }
        });
      });
    }
  });

  const themeInputs = document.querySelectorAll('input[name="theme"]');
  themeInputs.forEach(input => {
    input.addEventListener('change', event => {
      const selected = event.target.value;
      const theme = applyTheme(selected);
      updateConfiguration({ theme });
    });
  });

  const endlessToggle = document.getElementById('endless-mode');
  if (endlessToggle) {
    endlessToggle.addEventListener('change', event => {
      updateConfiguration({ endless: event.target.checked });
    });
  }

  configurationListenersInitialized = true;
}

function renderTotalsParagraphs(instructionsDiv, totals) {
  const combined = Object.entries(totals)
    .filter(([, reps]) => reps > 0)
    .map(([exercise, reps]) => `${exercise}: ${reps} reps`)
    .join(' | ');

  if (combined) {
    const instruction = document.createElement('p');
    instruction.textContent = combined;
    instructionsDiv.appendChild(instruction);
  }
}

function appendSprintInstruction(instructionsDiv, text) {
  const sprintInstruction = document.createElement('p');
  sprintInstruction.textContent = text;
  instructionsDiv.appendChild(sprintInstruction);
}

function appendNewSetButton(instructionsDiv) {
  const newSetButton = document.createElement('button');
  newSetButton.textContent = 'New Set';
  newSetButton.addEventListener('click', () => {
    window.location.href = `${window.location.pathname}`;
  });
  instructionsDiv.appendChild(newSetButton);
}

export function updateRoundTitle() {
  const roundTitle = document.getElementById('round-title');
  if (!roundTitle) {
    return;
  }

  const state = getState();
  const baseRoundLabel = `Round ${state.roundNumber}`;
  roundTitle.textContent = state.configuration.endless
    ? baseRoundLabel
    : `${baseRoundLabel} of ${totalRounds}`;
}

function renderWorkoutFromState(state) {
  showWorkoutScreen();
  updateRoundTitle();

  const drawnCardsDiv = document.getElementById('drawn-cards');
  const instructionsDiv = document.getElementById('instructions');
  const drawButton = document.getElementById('draw-button');

  if (drawnCardsDiv) {
    drawnCardsDiv.textContent = '';
  }
  if (instructionsDiv) {
    instructionsDiv.textContent = '';
  }

  const cards = state.lastDrawn;
  if (drawnCardsDiv && cards.length > 0) {
    cards.forEach(card => {
      drawnCardsDiv.appendChild(createCardElement(card));
    });
  }

  if (instructionsDiv && cards.length > 0) {
    const totals = calculateTotals(cards, state.configuration);
    renderTotalsParagraphs(instructionsDiv, totals);
  }

  const deckLength = state.deck.length;
  if (instructionsDiv) {
    if (state.configuration.endless) {
      appendSprintInstruction(instructionsDiv, 'Complete a 50 yard sprint.');
    } else if (deckLength === 0 && cards.length > 0) {
      appendSprintInstruction(instructionsDiv, 'Complete 2 sprints of 50 yards each.');
      appendNewSetButton(instructionsDiv);
    } else if (cards.length > 0) {
      appendSprintInstruction(instructionsDiv, 'Complete a 50 yard sprint.');
    }
  }

  if (drawButton) {
    if (!state.configuration.endless && deckLength === 0) {
      drawButton.style.display = 'none';
    } else {
      drawButton.style.display = '';
    }
  }
}

function serializeAndRenderState() {
  const state = getState();
  renderWorkoutFromState(state);
}

export function initializeDeck() {
  const newDeck = buildDeck();
  setDeck(newDeck);
  return newDeck;
}

export function doDrawCards() {
  let { deck } = getState();
  if (deck.length === 0) {
    deck = buildDeck();
    setDeck(deck);
  }

  const state = getState();
  const activeDeck = [...state.deck];
  const configuration = state.configuration;
  const cardCount = configuration.endless
    ? Math.min(4, activeDeck.length)
    : activeDeck.length <= 8
      ? activeDeck.length
      : 4;

  const drawnCards = [];
  for (let i = 0; i < cardCount; i += 1) {
    if (activeDeck.length === 0) {
      break;
    }
    const index = Math.floor(Math.random() * activeDeck.length);
    const [card] = activeDeck.splice(index, 1);
    if (card) {
      drawnCards.push(card);
    }
  }

  setDeck(activeDeck);
  setLastDrawn(drawnCards);

  return drawnCards;
}

export function drawCards() {
  updateRoundTitle();

  suppressNotifications(() => {
    const stateBeforeDraw = getState();
    doDrawCards();
    const newRoundNumber = stateBeforeDraw.roundNumber + 1;
    setRoundCompleted(true);
    setRoundNumber(newRoundNumber);
  });

  serializeAndRenderState();
}

export function startWorkout() {
  const multipliers = { ...defaultMultipliers };
  suits.forEach(suit => {
    const select = document.getElementById(`multiplier-${suit}`);
    if (select) {
      const value = Number.parseInt(select.value, 10);
      multipliers[suit] = Number.isFinite(value) ? value : defaultMultipliers[suit];
    }
  });

  const selectedThemeInput = document.querySelector('input[name="theme"]:checked');
  const themeCandidate = selectedThemeInput ? selectedThemeInput.value : getState().configuration.theme;
  const theme = applyTheme(themeCandidate);

  const endlessToggle = document.getElementById('endless-mode');
  const endless = endlessToggle ? endlessToggle.checked : getState().configuration.endless;

  suppressNotifications(() => {
    updateConfiguration({ multipliers, theme, endless });
    setDeck(buildDeck());
    setRoundNumber(1);
    setRoundCompleted(false);
    setLastDrawn([]);
    setStarted(true);
  });

  populateConfigurationForm(getState());
  renderWorkoutFromState(getState());
}

function handleRestoredState(restored) {
  const params = new URLSearchParams(window.location.search);
  const derivedTheme = deriveInitialTheme(params);
  const theme = resolveTheme(restored.configuration?.theme ?? derivedTheme);

  setInitialSerialized(params.toString());

  replaceState(
    {
      ...restored,
      configuration: {
        multipliers: restored.configuration?.multipliers ?? defaultMultipliers,
        endless: restored.configuration?.endless ?? false,
        theme
      }
    },
    { silent: true }
  );

  applyTheme(getState().configuration.theme);
  populateConfigurationForm(getState());
  ensureConfigurationListeners();

  if (getState().started) {
    renderWorkoutFromState(getState());
  } else {
    showConfigurationScreen();
  }
}

export function initializeApp() {
  bindStateToWindow(window);

  const params = new URLSearchParams(window.location.search);
  const persisted = deserializeState(params);
  const derivedTheme = deriveInitialTheme(params);
  const theme = resolveTheme(persisted.configuration?.theme ?? derivedTheme);

  replaceState(
    {
      ...persisted,
      configuration: {
        multipliers: persisted.configuration?.multipliers ?? defaultMultipliers,
        endless: persisted.configuration?.endless ?? false,
        theme
      }
    },
    { silent: true }
  );

  applyTheme(theme);
  populateConfigurationForm(getState());
  ensureConfigurationListeners();
  setInitialSerialized(params.toString());

  if (getState().started) {
    renderWorkoutFromState(getState());
  } else {
    showConfigurationScreen();
  }

  subscribe(state => {
    persistState(state);
  });

  subscribeToPopState(restored => {
    handleRestoredState(restored);
  });
}
